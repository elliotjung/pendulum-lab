import { expect, type Page } from '@playwright/test';

type ModernShell = {
  switchTo(name: string): void;
};

export async function waitForModernShell(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
}

export async function openModernTab(page: Page, tab: string, visibleSelector?: string): Promise<void> {
  await waitForModernShell(page);
  await page.evaluate((name) => {
    const shell = (window as unknown as { __modernShell?: ModernShell }).__modernShell;
    if (!shell?.switchTo) throw new Error('Modern shell switchTo API is unavailable');
    shell.switchTo(name);
  }, tab);
  if (visibleSelector) await expect(page.locator(visibleSelector)).toBeVisible();
}
