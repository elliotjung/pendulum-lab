import { expect, test } from '@playwright/test';
import { openModernTab } from './shell';

test('app opens with no console errors and the workbench renders without horizontal overflow', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await page.waitForTimeout(1200);

  // Open the Research Workbench and the 3D Lab — the two new heavy surfaces.
  await openModernTab(page, 'research', '#researchWorkbench');
  await openModernTab(page, 'lab3d', '#lab3dRopeCard');
  await openModernTab(page, 'research', '#researchWorkbench');
  await page.waitForTimeout(400);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  // The Research Workbench introduces no horizontal page overflow.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(2);
});
