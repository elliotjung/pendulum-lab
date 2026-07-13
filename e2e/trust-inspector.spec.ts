import { expect, test } from '@playwright/test';

test('Trust Inspector opens from result badges and exposes reproducibility fields', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernTabs?: unknown }).__modernTabs));
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __modernShell?: { switchTo?: unknown } }).__modernShell?.switchTo)
  );

  await page.evaluate(() => {
    (window as unknown as { __modernShell: { switchTo(name: string): void } }).__modernShell.switchTo('validate');
  });
  await page.waitForFunction(() => document.getElementById('tab-validate')?.classList.contains('active'));
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __modernTabs?: { validation?: unknown } }).__modernTabs?.validation)
  );
  await expect(page.locator('#tab-validate')).toBeVisible();
  await page.evaluate(() => document.getElementById('runValidation')?.click());
  await page.waitForFunction(
    () => (document.getElementById('validateResults')?.childElementCount ?? 0) >= 5,
    undefined,
    { timeout: 15000 }
  );

  const badge = page.locator('.rb-badge').first();
  await expect(badge).toBeVisible();
  await badge.click();
  const panel = page.locator('.trust-inspector-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Reproduce');
  await expect(panel).toContainText('Caveat');
  await expect(panel).toContainText('Artifact');

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

  await badge.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.trust-inspector-panel')).toBeVisible();
  await page.locator('.trust-inspector-close').click();
  await expect(page.locator('.trust-inspector-panel')).toHaveCount(0);
});
