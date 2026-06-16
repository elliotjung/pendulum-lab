/**
 * Visual regression tests — chromium-only to avoid cross-browser font/rendering
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
  // Navigate to the lab tab
  const labBtn = page.locator('.rail-menu-button[data-rail-section-button="lab"]').first();
  if (await labBtn.isVisible()) await labBtn.click();
  await page.waitForTimeout(300);
  await expect(page.locator('#content-right')).toHaveScreenshot('lab-controls.png', {
    mask: [page.locator('canvas')]
  });
});

test('research tab cards render correctly', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  // Navigate to the research section
  await page.locator('.rail-menu-button[data-rail-section-button="govern"]').click();
  await page.locator('#rail-panel-govern .tab[data-tab="research"]').click();
  await expect(page.locator('#researchExperimentCard')).toBeVisible();
  await expect(page.locator('#researchExperimentCard')).toHaveScreenshot('research-experiment-card.png', {
    mask: [page.locator('canvas')]
  });
});
