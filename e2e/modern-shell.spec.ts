import { expect, test } from '@playwright/test';

/**
 * Stage-4: the modern shell owns tab navigation. Clicking the rail tabs must
 * activate the right panel and aria state (the legacy switchTab handlers have
 * been replaced).
 */
test('modern shell owns tab navigation', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  // Switch through several tabs via the real rail buttons.
  for (const tab of ['compare', 'bifurc', 'phase3d', 'validate', 'lab']) {
    await page.evaluate(
      (t) => (document.querySelector(`.tab[data-tab="${t}"]`) as HTMLButtonElement | null)?.click(),
      tab
    );
    await expect(page.locator(`#tab-${tab}`)).toHaveClass(/active/);
    const selected = await page.evaluate(
      (t) => (document.querySelector(`.tab[data-tab="${t}"]`) as HTMLElement | null)?.getAttribute('aria-selected'),
      tab
    );
    expect(selected).toBe('true');
    // Exactly one panel is active at a time.
    const activeCount = await page.evaluate(() => document.querySelectorAll('.tabpanel.active').length);
    expect(activeCount).toBe(1);
  }

  // Ended on the lab tab: its panel is the active one.
  await expect(page.locator('#tab-lab')).toHaveClass(/active/);
  const labSelected = await page.evaluate(() =>
    (document.querySelector('.tab[data-tab="lab"]') as HTMLElement | null)?.getAttribute('aria-selected')
  );
  expect(labSelected).toBe('true');
});
