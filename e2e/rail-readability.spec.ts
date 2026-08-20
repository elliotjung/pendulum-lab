import { expect, test } from '@playwright/test';

test('desktop rail uses five top-level menus with click-open detail panels', async ({ page, browserName }) => {
  // This test drives many open/close/hover cycles; on software-rendered WebKit
  // each cycle is slow enough to approach the 30s budget under full-suite load.
  // Triple the budget there (the behavior is correct, just slow) — the same
  // software-render allowance the tour walkthrough documents.
  test.slow(browserName === 'webkit', 'many rail cycles are slow on software-rendered WebKit');
  // Hover open/close is a fine-pointer flow; the compact bottom-bar rail has
  // its own dedicated spec below (sheet opens above the bar, closes on pick).
  test.skip((page.viewportSize()?.width ?? 1280) <= 560, 'compact rail is covered by the mobile spec');
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await expect(page.locator('.rail-menu-button')).toHaveCount(5);
  await expect(page.locator('.rail-section.open')).toHaveCount(0);
  await page.locator('.rail-menu-button[data-rail-section-button="sim"]').click();
  await expect(page.locator('.rail-section.open[data-rail-section="sim"]')).toBeVisible();
  await expect(page.locator('#rail-panel-sim .tab[data-tab="lab"] .tab-label')).toHaveText('Lab');

  await page.locator('.rail-menu-button[data-rail-section-button="chaos"]').click();
  await expect(page.locator('.rail-section.open[data-rail-section="chaos"]')).toBeVisible();
  await expect(page.locator('#rail-panel-chaos .tab[data-tab="ftle"] .tab-label')).toHaveText('FTLE');

  for (const sectionName of ['chaos', 'check', 'govern']) {
    const section = page.locator(`.rail-section[data-rail-section="${sectionName}"]`);
    const button = section.locator('.rail-menu-button');
    if (!(await section.evaluate((element) => element.classList.contains('open')))) await button.click();
    await expect(section).toHaveClass(/open/);
    const geometry = await section.evaluate((element) => {
      const trigger = element.querySelector<HTMLElement>('.rail-menu-button')?.getBoundingClientRect();
      const panel = element.querySelector<HTMLElement>('.rail-submenu')?.getBoundingClientRect();
      return trigger && panel
        ? {
            gap: panel.left - trigger.right,
            triggerCenter: trigger.top + trigger.height / 2,
            panelTop: panel.top,
            panelBottom: panel.bottom
          }
        : null;
    });
    expect(geometry).toBeTruthy();
    expect(geometry!.gap).toBeGreaterThanOrEqual(0);
    expect(geometry!.gap).toBeLessThanOrEqual(18);
    expect(geometry!.triggerCenter).toBeGreaterThanOrEqual(geometry!.panelTop + 8);
    expect(geometry!.triggerCenter).toBeLessThanOrEqual(geometry!.panelBottom - 8);
  }

  await page.locator('.rail-menu-button[data-rail-section-button="chaos"]').click();
  await expect(page.locator('.rail-section.open[data-rail-section="chaos"]')).toBeVisible();

  const chaosPanelBox = await page.locator('#rail-panel-chaos').boundingBox();
  expect(chaosPanelBox).toBeTruthy();
  await page.mouse.move(chaosPanelBox!.x + 20, chaosPanelBox!.y + 20);
  await expect(page.locator('.rail-section.open[data-rail-section="chaos"]')).toBeVisible();
  await page.mouse.move(420, 180);
  await expect(page.locator('.rail-section.open')).toHaveCount(0);

  await page.locator('.rail-menu-button[data-rail-section-button="chaos"]').click();
  await expect(page.locator('.rail-section.open[data-rail-section="chaos"]')).toBeVisible();
  await page.mouse.click(420, 180);
  await expect(page.locator('.rail-section.open')).toHaveCount(0);

  await page.locator('.rail-menu-button[data-rail-section-button="chaos"]').click();
  await expect(page.locator('.rail-section.open[data-rail-section="chaos"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.rail-section.open')).toHaveCount(0);

  await page.locator('.rail-menu-button[data-rail-section-button="chaos"]').click();
  await page.locator('#rail-panel-chaos .tab[data-tab="rqa"]').click();
  await expect(page.locator('#tab-rqa')).toHaveClass(/active/);
  await expect(page.locator('.rail-section.open[data-rail-section="chaos"]')).toBeVisible();
  await page.mouse.move(420, 180);
  await expect(page.locator('.rail-section.open')).toHaveCount(0);
});

test('mobile rail keeps five top-level menus and opens detail panel above it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  await expect(page.locator('.rail-menu-button')).toHaveCount(5);
  await page.locator('.rail-menu-button[data-rail-section-button="analysis"]').click();
  await expect(page.locator('.rail-section.open[data-rail-section="analysis"]')).toBeVisible();
  await expect(page.locator('#rail-panel-analysis .tab[data-tab="sweep"] .tab-label')).toHaveText('Sweep');

  const railBox = await page.locator('.rail').boundingBox();
  const panelBox = await page.locator('#rail-panel-analysis').boundingBox();
  const railTop = railBox?.y ?? 0;
  const panelBottom = (panelBox?.y ?? 0) + (panelBox?.height ?? 0);
  expect(railBox?.height ?? 0).toBeLessThan(95);
  expect(panelBottom).toBeLessThanOrEqual(railTop + 2);
});
