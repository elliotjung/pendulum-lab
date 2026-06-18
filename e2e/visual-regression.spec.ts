/**
 * Visual regression tests are chromium-only to avoid cross-browser font/rendering
 * differences. Canvas elements are masked because their pixel content is
 * simulation-state-dependent and not deterministic across runs.
 *
 * Generate initial golden snapshots with:
 *   npx playwright test e2e/visual-regression.spec.ts --update-snapshots --project=chromium
 */
import { devices, expect, test } from '@playwright/test';

test.use({ ...devices['Desktop Chrome'] });

test('rail sidebar renders correctly', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await expect(page.locator('.rail')).toBeVisible();
  await expect(page.locator('.rail')).toHaveScreenshot('rail-sidebar.png');
});

test('lab tab control panel renders correctly', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  const labBtn = page.locator('.rail-menu-button[data-rail-section-button="lab"]').first();
  if (await labBtn.isVisible()) await labBtn.click();
  await page.waitForTimeout(300);
  await expect(page.getByRole('region', { name: 'controls' })).toHaveScreenshot('lab-controls.png', {
    mask: [page.locator('canvas')],
    maxDiffPixels: 500
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
  await expect(card).toHaveScreenshot('research-experiment-card.png', {
    mask: [page.locator('canvas')]
  });
});
