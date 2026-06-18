import { expect, test } from '@playwright/test';
import { openModernTab } from './shell';

/**
 * Stage-3: the modern Validation tab takeover. The buttons must drive the tested
 * `src/validation` suites and render results into the existing fields.
 */
test('modern Validation tab runs the suites and renders results', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'validate', '#tab-validate');

  // Run all standard checks: 5 cases, all passing.
  await page.evaluate(() => document.getElementById('runValidation')?.click());
  await page.waitForFunction(() => {
    const rows = document.getElementById('validateResults')?.childElementCount ?? 0;
    return rows >= 5;
  }, undefined, { timeout: 15000 });
  const passed = await page.evaluate(() => Number(document.getElementById('testPassed')?.textContent));
  const failed = await page.evaluate(() => Number(document.getElementById('testFailed')?.textContent));
  expect(passed).toBeGreaterThanOrEqual(5);
  expect(failed).toBe(0);
  await expect(page.locator('#testTime')).toContainText('ms');

  // Convergence: the integrator-order cross-validation renders one row per method.
  await page.evaluate(() => document.getElementById('runConvergence')?.click());
  await page.waitForFunction(() => (document.getElementById('validateResults')?.childElementCount ?? 0) >= 12, undefined, { timeout: 30000 });
  const convergenceRows = await page.evaluate(() => document.getElementById('validateResults')?.childElementCount ?? 0);
  expect(convergenceRows).toBeGreaterThanOrEqual(12);
});
