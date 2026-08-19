import { expect, test } from '@playwright/test';

/**
 * The header panel toggle collapses every tab's right control panel, persists
 * across reloads, and is reversible from the "\" keyboard shortcut.
 */
test('side-panel toggle collapses, persists, and restores', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  const labControls = page.locator('#tab-lab .controls');
  await expect(labControls).toBeVisible();

  await page.locator('#panelToggle').click();
  await expect(labControls).toBeHidden();

  // The class lives on <body>, so it applies on other tabs too.
  await page.locator('.rail-menu-button[data-rail-section-button="sim"]').click();
  await page.locator('.tab[data-tab="compare"]').first().click();
  const compareControls = page.locator('#tab-compare .controls');
  await expect(compareControls).toBeHidden();

  // TabRouting persists the selected Compare tab in the URL.  After a reload,
  // Lab's controls are therefore hidden because Lab is inactive—not because
  // the side panel failed to reopen.  Assert against the restored active tab.
  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await expect(page.locator('#tab-compare')).toHaveClass(/active/);
  await expect(compareControls).toBeHidden();

  await page.keyboard.press('\\');
  await expect(page.locator('body')).not.toHaveClass(/panel-collapsed/);
  await expect(compareControls).toBeVisible();

  // Returning to Lab also exposes its controls, proving the global panel
  // state restores every workspace rather than only the active tab.
  await page.locator('.rail-menu-button[data-rail-section-button="sim"]').click();
  await page.locator('.tab[data-tab="lab"]').first().click();
  await expect(labControls).toBeVisible();
});

test('side-panel and accordion arrows do not restart the live lab simulation', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernLab?: unknown }).__modernLab));
  await page.waitForTimeout(250);

  const beforePanelToggle = await page.evaluate(
    () => (window as any).__modernLab.diagnostics() as { time: number; trailPoints: number }
  );
  await page.locator('#panelToggle').click();
  await page.waitForTimeout(180);
  const afterPanelToggle = await page.evaluate(
    () => (window as any).__modernLab.diagnostics() as { time: number; trailPoints: number }
  );
  expect(afterPanelToggle.time).toBeGreaterThan(beforePanelToggle.time);
  expect(afterPanelToggle.trailPoints).toBeGreaterThanOrEqual(beforePanelToggle.trailPoints);

  await page.locator('#panelToggle').click();
  await expect(page.locator('#tab-lab .controls')).toBeVisible();
  await page.waitForTimeout(120);

  const firstSummary = page.locator('#tab-lab .controls details.acc > summary').first();
  const beforeAccordionToggle = await page.evaluate(
    () => (window as any).__modernLab.diagnostics() as { time: number; trailPoints: number }
  );
  await firstSummary.click();
  await page.waitForTimeout(180);
  const afterAccordionToggle = await page.evaluate(
    () => (window as any).__modernLab.diagnostics() as { time: number; trailPoints: number }
  );
  expect(afterAccordionToggle.time).toBeGreaterThan(beforeAccordionToggle.time);
  expect(afterAccordionToggle.trailPoints).toBeGreaterThanOrEqual(beforeAccordionToggle.trailPoints);
});
