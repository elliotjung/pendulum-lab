import { expect, test } from '@playwright/test';

/**
 * The header panel toggle collapses every tab's right control panel (giving the
 * canvas the full width), persists across reloads, and is reversible from the
 * "\" keyboard shortcut.
 */
test('side-panel toggle collapses, persists, and restores', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  const labControls = page.locator('#tab-lab .controls');
  await expect(labControls).toBeVisible();

  // Collapse from the header button: the panel hides on the lab tab…
  await page.locator('#panelToggle').click();
  await expect(labControls).toBeHidden();

  // …and on other tabs too (the class lives on <body>). The compare tab lives
  // in the Simulate submenu, so open that section first (menus auto-close).
  await page.locator('.rail-menu-button[data-rail-section-button="sim"]').click();
  await page.locator('.tab[data-tab="compare"]').first().click();
  await expect(page.locator('#tab-compare .controls')).toBeHidden();

  // The preference survives a reload.
  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await expect(page.locator('#tab-lab .controls')).toBeHidden();

  // The "\" shortcut restores it.
  await page.keyboard.press('\\');
  await expect(page.locator('#tab-lab .controls')).toBeVisible();
});
