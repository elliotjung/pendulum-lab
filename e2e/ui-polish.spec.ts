import { expect, test, type Page } from '@playwright/test';

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
  // Establish a meaningful time lead before either layout mutation. With the
  // default 1× real-time clock, a reset cannot regain this lead inside the
  // bounded post-action observation window below.
  await page.waitForFunction(
    () =>
      (window as unknown as { __modernLab: { diagnostics(): { time: number } } }).__modernLab.diagnostics().time >= 1,
    undefined,
    { timeout: 10_000 }
  );

  await expectLiveSimulationToContinue(page, () => page.locator('#panelToggle').click());

  await page.locator('#panelToggle').click();
  await expect(page.locator('#tab-lab .controls')).toBeVisible();

  const firstSummary = page.locator('#tab-lab .controls details.acc > summary').first();
  await expectLiveSimulationToContinue(page, () => firstSummary.click());
});

async function expectLiveSimulationToContinue(page: Page, action: () => Promise<void>): Promise<void> {
  const before = await page.evaluate(readLabTime);
  await action();

  // A reset initiated directly by the interaction is observable before the
  // next animation frame. Keep the later observation bounded rather than
  // waiting until time overtakes `before`: a delayed reset must remain
  // visible instead of being allowed to catch up over an arbitrary timeout.
  const immediate = await page.evaluate(readLabTime);
  expect(immediate).toBeGreaterThanOrEqual(before);
  await page.waitForTimeout(350);
  const settled = await page.evaluate(readLabTime);
  expect(settled).toBeGreaterThan(before);
}

function readLabTime(): number {
  return (window as unknown as { __modernLab: { diagnostics(): { time: number } } }).__modernLab.diagnostics().time;
}
