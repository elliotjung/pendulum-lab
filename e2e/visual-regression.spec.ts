/**
 * Visual regression tests are chromium-only to avoid cross-browser font/rendering
 * differences. Canvas elements are masked because their pixel content is
 * simulation-state-dependent and not deterministic across runs.
 *
 * Generate initial golden snapshots with:
 *   npx playwright test e2e/visual-regression.spec.ts --update-snapshots --project=chromium
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

// The app now follows the OS light/dark preference. Pin the original dark
// presentation so a runner's desktop preference cannot invalidate every
// baseline before any component pixels are compared. Keep the project device
// settings intact so mobile-chrome snapshots exercise the real mobile layout.
test.use({ colorScheme: 'dark' });

/**
 * A native <details> property update queues its `toggle` event.  Capturing
 * immediately after assigning `.open` can therefore race an app listener or
 * the browser's next layout, particularly in the tall mobile control panel.
 *
 * We deliberately do not widen the image tolerance: first pin every
 * accordion, then require the full state vector and panel geometry to remain
 * unchanged for several animation frames.  A late UI mutation now fails the
 * readiness condition instead of silently producing an alternate baseline.
 */
async function pinLabControlAccordions(page: Page, controls: Locator): Promise<void> {
  const accordions = controls.locator('details.acc');
  const count = await accordions.count();
  expect(count).toBeGreaterThanOrEqual(3);

  const expectedOpenStates = Array.from({ length: count }, (_value, index) => index < 2);
  await accordions.evaluateAll((details, expected) => {
    details.forEach((detail, index) => {
      (detail as HTMLDetailsElement).open = expected[index] === true;
    });
  }, expectedOpenStates);

  await expect
    .poll(async () => accordions.evaluateAll((details) => details.map((detail) => (detail as HTMLDetailsElement).open)))
    .toEqual(expectedOpenStates);

  await page.waitForFunction(
    async (expected) => {
      await document.fonts.ready;
      const panel = document.querySelector<HTMLElement>('#tab-lab .controls[role="region"]');
      if (!panel) return false;

      const signature = () => {
        const details = Array.from(panel.querySelectorAll<HTMLDetailsElement>('details.acc'));
        const openStates = details.map((detail) => detail.open);
        if (openStates.length !== expected.length || openStates.some((open, index) => open !== expected[index]))
          return null;
        const rect = panel.getBoundingClientRect();
        return [
          openStates.join(','),
          rect.width.toFixed(3),
          rect.height.toFixed(3),
          panel.clientWidth,
          panel.clientHeight,
          panel.scrollWidth,
          panel.scrollHeight
        ].join('|');
      };

      const initial = signature();
      if (!initial) return false;
      for (let frame = 0; frame < 8; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (signature() !== initial) return false;
      }
      return true;
    },
    expectedOpenStates,
    { timeout: 5_000 }
  );
}

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
  await pinLabControlAccordions(page, controls);
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
