import { expect, test } from '@playwright/test';

test('invalid numeric URL controls stay unapplied and expose key/value/reason diagnostics', async ({ page }) => {
  await page.goto('/app.html?audience=student&th1=2.18&dt=1oops&g=99');
  await expect(page.locator('#th1')).toHaveValue('2.18');
  await expect(page.locator('#dt')).toHaveValue('0.003');
  await expect(page.locator('#g')).toHaveValue('9.81');
  await expect(page.locator('#toast')).toContainText('Ignored URL control values');
  await expect(page.locator('#toast')).toContainText('g="99" (allowed range)');
  await expect(page.locator('#toast')).toContainText('dt="1oops" (number syntax)');
});
