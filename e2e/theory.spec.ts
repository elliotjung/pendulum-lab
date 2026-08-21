import { expect, test } from '@playwright/test';

test('Theory deep link runs the bounded Euler-Lagrange/Hamiltonian comparison', async ({ page }) => {
  await page.goto('/?audience=student&tab=theory');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await expect(page.locator('#tab-theory')).toHaveClass(/active/);
  await expect(page.locator('#theoryTitle')).toHaveText('Double-pendulum theory');
  await page.locator('#theoryCompareRun').click();

  await expect(page.locator('#theoryCompareStatus')).toHaveAttribute('data-verdict', 'agreement');
  await expect(page.locator('#theoryCompareAngles')).not.toHaveText('—');
  await expect(page.locator('#theoryComparePolicy')).toContainText('shared-fixed-rk4');
  await expect(page.locator('#theoryCompareStatus')).toContainText('short-horizon');
});
