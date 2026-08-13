/**
 * Visual regression tests are chromium-only to avoid cross-browser font/rendering
 * differences. Canvas elements are masked because their pixel content is
 * simulation-state-dependent and not deterministic across runs.
 *
 * Generate initial golden snapshots with:
 *   npx playwright test e2e/visual-regression.spec.ts --update-snapshots --project=chromium
 */
import { expect, test } from '@playwright/test';

// The app now follows the OS light/dark preference. Pin the original dark
// presentation so a runner's desktop preference cannot invalidate every
// baseline before any component pixels are compared. Keep the project device
// settings intact so mobile-chrome snapshots exercise the real mobile layout.
test.use({ colorScheme: 'dark' });

test('rail sidebar renders correctly', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await expect(page.locator('.rail')).toBeVisible();
  await expect(page.locator('.rail')).toHaveScreenshot('rail-sidebar.png');
});

test('lab tab control panel renders correctly', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  const labBtn = page.locator('.rail-menu-button[data-rail-section-button="lab"]').first();
  if (await labBtn.isVisible()) await labBtn.click();
  await page.waitForTimeout(300);
  // The parity layer installs this floating overlay asynchronously. Wait for
  // its completed audit result so it cannot appear midway through capture.
  const integrityBadge = page.locator('#figBadge');
  // Compact layouts intentionally hide the floating badge, but the completed
  // text still provides a renderer-independent readiness signal.
  await integrityBadge.waitFor({ state: 'attached' });
  await expect(integrityBadge).toContainText('DOM/API checks 22/22');
  // Keep fixed global surfaces out of this component crop. Otherwise they
  // move through a tall mobile element screenshot as Playwright scrolls it.
  await page.locator('.rail, #figBadge, #stats').evaluateAll((elements) => {
    elements.forEach((element) => {
      (element as HTMLElement).style.visibility = 'hidden';
    });
  });
  const controls = page.getByRole('region', { name: 'controls' });
  // Pin the declared default accordion state before measuring the full
  // element. Native details layout can otherwise settle between retries.
  await controls.locator('details.acc').evaluateAll((details) => {
    details.forEach((detail, index) => {
      (detail as HTMLDetailsElement).open = index < 2;
    });
  });
  await expect(controls.locator('details.acc').nth(1)).toHaveJSProperty('open', true);
  await expect(controls.locator('details.acc').nth(2)).toHaveJSProperty('open', false);
  await page.waitForTimeout(100);
  await expect(controls).toHaveScreenshot('lab-controls.png', {
    // Runtime diagnostics update every frame. Their stable container remains
    // in layout but was hidden above, avoiding locator-mask scroll side
    // effects while keeping the accordion frame and labels in scope.
    // The mobile panel is a ~4000-CSS-px element captured at dpr 2.75; at
    // device scale its fractional top rounds differently run-to-run and the
    // whole capture ghosts by one device pixel. CSS-pixel scale removes the
    // rounding entirely (and shrinks the baseline bytes).
    scale: 'css',
    // The tall mobile element screenshot can differ at a subpixel scrollbar
    // edge while Playwright scrolls it into view. Keep that tolerance below
    // 0.25% of the captured panel and stricter on desktop.
    maxDiffPixels: testInfo.project.name === 'mobile-chrome' ? 1_200 : 500
  });
});

test('research workbench card renders correctly', async ({ page }) => {
  // Clear persisted research state so the experiment card is deterministic.
  await page.addInitScript(() => {
    window.localStorage.removeItem('pendulum-lab/research-workbench/v1');
  });
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  // #researchExperimentCard is built by installResearchTab into #tab-research
  // (the panel also holds the static Research+ tools). Wait for the lazily-built
  // card to attach, activate the tab via the shell's own switchTo (the exact
  // path a tab click takes — robust against the hover-driven rail accordion),
  // then shoot the card.
  await page.locator('#researchExperimentCard').waitFor({ state: 'attached' });
  await page.evaluate(() => {
    (window as unknown as { __modernShell?: { switchTo(name: string): void } }).__modernShell?.switchTo('research');
  });
  const card = page.locator('#researchExperimentCard');
  await expect(card).toBeVisible();
  await expect(page.locator('#rwExperimentSummary')).toHaveText('0 experiment(s). Save current state to begin.');
  await expect(card).toHaveScreenshot('research-experiment-card.png', {
    mask: [page.locator('canvas')]
  });
});
