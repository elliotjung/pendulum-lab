import { expect, test } from '@playwright/test';

/**
 * Left-rail submenu auto-close: after clicking a submenu entry, moving the
 * pointer off the menu must close it so the simulator is visible again.
 */
test('rail submenu closes when the pointer leaves after selecting a tab', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  // Open the Analysis section and click a submenu tab.
  const button = page.locator('.rail-menu-button[data-rail-section-button="analysis"]');
  await button.click();
  const section = page.locator('.rail-section[data-rail-section="analysis"]');
  await expect(section).toHaveClass(/open/);
  await page.locator('#rail-panel-analysis .tab[data-tab="lyap"]').click();
  if ((page.viewportSize()?.width ?? 1280) <= 560) {
    // Compact rail: selecting an entry closes the sheet immediately so the
    // simulator is visible again (Shell closes sections on tab click there).
    await expect(section).not.toHaveClass(/open/);
    await expect(page.locator('#tab-lyap')).toHaveClass(/active/);
    return;
  }
  await expect(section).toHaveClass(/open/); // selecting keeps it open while hovered

  // Move the pointer away from the rail entirely (over the main content).
  await page.mouse.move(640, 400);
  await page.waitForTimeout(300);
  await expect(section).not.toHaveClass(/open/);

  // The lyap tab stays active even though the menu closed.
  await expect(page.locator('#tab-lyap')).toHaveClass(/active/);
});

test('rail submenu also closes on pointer-leave without a click', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await page.locator('.rail-menu-button[data-rail-section-button="chaos"]').click();
  const section = page.locator('.rail-section[data-rail-section="chaos"]');
  await expect(section).toHaveClass(/open/);

  await page.mouse.move(640, 400);
  await page.waitForTimeout(300);
  await expect(section).not.toHaveClass(/open/);
});

test('moving from the button into the submenu across the gap keeps it open', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  const button = page.locator('.rail-menu-button[data-rail-section-button="analysis"]');
  await button.click();
  const section = page.locator('.rail-section[data-rail-section="analysis"]');
  await expect(section).toHaveClass(/open/);

  // Hover the button, then move into the submenu (crossing the 10px gap).
  await button.hover();
  const submenu = page.locator('#rail-panel-analysis');
  const box = await submenu.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 12, { steps: 12 });
  await page.waitForTimeout(300);
  await expect(section).toHaveClass(/open/);
});
