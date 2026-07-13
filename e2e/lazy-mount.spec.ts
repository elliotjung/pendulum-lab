import { expect, test } from '@playwright/test';
import { openModernTab } from './shell';

test('student startup defers research and mounts one analysis controller on demand', async ({ page }) => {
  await page.goto('/?audience=student');
  await expect(page.locator('body')).toHaveAttribute('data-audience-mode', 'student');
  await expect(page.locator('#researchWorkbench')).toHaveCount(0);

  const startup = await page.evaluate(() => ({
    controllers: Object.keys((window as unknown as { __modernTabs?: object }).__modernTabs ?? {}),
    controls: document.querySelectorAll('button,input,select,textarea').length,
    elements: document.querySelectorAll('*').length
  }));
  expect(startup.controllers).toEqual([]);
  expect(startup.controls).toBeLessThan(250);
  expect(startup.elements).toBeLessThan(1_800);

  await openModernTab(page, 'lyap', '#tab-lyap');
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __modernTabs?: { lyapunov?: unknown } }).__modernTabs?.lyapunov)
  );
  const controllers = await page.evaluate(() =>
    Object.keys((window as unknown as { __modernTabs?: object }).__modernTabs ?? {})
  );
  expect(controllers).toEqual(['lyapunov']);
});

test('programmatic research navigation loads the research workspace then completes navigation', async ({ page }) => {
  await page.goto('/?audience=student');
  await openModernTab(page, 'research', '#researchWorkbench');
  await expect(page.locator('#tab-research')).toHaveClass(/active/);
});
