import { expect, test } from '@playwright/test';
import { openModernTab } from './shell';

test('long-run: simulation stays healthy and the performance budget panel reports', async ({ page }) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  // Let the live simulation run for a sustained window (soak slice).
  await page.waitForTimeout(8000);
  expect(pageErrors).toEqual([]);

  // The shell is still alive and animating after the soak.
  const alive = await page.evaluate(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  expect(alive).toBe(true);

  await openModernTab(page, 'research', '#researchPerfCard');
  await page.locator('#rwPerfRefresh').click();
  await expect(page.locator('#rwPerfBudget table')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#rwPerfBudget')).toContainText('frame rate');
  await expect(page.locator('#rwPerfBudget')).toContainText('js heap');
  await expect(page.locator('#rwPerfBudget')).toContainText('IndexedDB quota');
  // Core CPU budgets must hold after the soak (heap budget is informational on CI).
  const rows = await page.locator('#rwPerfBudget table tr').allTextContents();
  const frameRow = rows.find((row) => row.includes('physics per frame'));
  expect(frameRow).toBeTruthy();
  expect(frameRow).toContain('OK');
  expect(pageErrors).toEqual([]);
});
