import { expect, test } from '@playwright/test';
import { waitForModernShell } from './shell';

test('custom selects stay anchored, keyboard accessible, and synchronized with native values', async ({ page }) => {
  // Cold Vite compilation of the large modular workspace can take longer than
  // the default test budget before this deliberately thorough interaction runs.
  test.slow();
  await page.goto('/');
  await waitForModernShell(page);

  const native = page.locator('#timeMode');
  const host = native.locator('..');
  const button = host.locator('.custom-select-button');
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('role', 'combobox');
  await button.click();
  const buttonId = await button.getAttribute('id');
  const listboxId = await button.getAttribute('aria-controls');
  expect(buttonId).toBeTruthy();
  expect(listboxId).toBeTruthy();
  const listbox = page.locator(`#${listboxId}`);
  await expect(listbox).toBeVisible();
  await expect(page.locator('#contextTooltip')).toBeHidden();
  await expect(listbox.locator('[role="option"]')).toHaveCount(2);

  const geometry = await page.evaluate(
    ({ buttonId, menuId }) => {
      const trigger = document.getElementById(buttonId)?.getBoundingClientRect();
      const menu = document.getElementById(menuId)?.getBoundingClientRect();
      if (!trigger || !menu) return null;
      return {
        horizontalDelta: Math.abs(trigger.left - menu.left),
        belowGap: Math.abs(menu.top - trigger.bottom),
        aboveGap: Math.abs(trigger.top - menu.bottom)
      };
    },
    { buttonId: buttonId!, menuId: listboxId! }
  );
  expect(geometry).toBeTruthy();
  expect(geometry!.horizontalDelta).toBeLessThanOrEqual(9);
  expect(Math.min(geometry!.belowGap, geometry!.aboveGap)).toBeLessThanOrEqual(7);

  await listbox.getByRole('option', { name: 'Deterministic replay' }).click();
  await expect(native).toHaveValue('deterministic');
  await expect(button.locator('.custom-select-value')).toHaveText('Deterministic replay');
  await expect(listbox).toBeHidden();
  await expect(button).toBeFocused();

  await button.press('ArrowDown');
  await expect(listbox).toBeVisible();
  await button.press('End');
  await expect(button).toHaveAttribute('aria-activedescendant', /option-1$/);
  await button.press('Enter');
  await expect(native).toHaveValue('wall-clock');

  await page.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>('#timeMode');
    if (select) select.value = 'deterministic';
  });
  await expect(button.locator('.custom-select-value')).toHaveText('Deterministic replay');
  await page.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>('#timeMode');
    if (select) select.selectedIndex = 1;
  });
  await expect(button.locator('.custom-select-value')).toHaveText('Real-time fixed-dt');

  await button.evaluate((element) => element.remove());
  await expect(native).toBeAttached();
  await expect(native.locator('..').locator('.custom-select-button')).toBeVisible();

  await page.evaluate(() => {
    const select = document.createElement('select');
    select.id = 'dynamicSelectFixture';
    select.setAttribute('aria-label', 'Dynamic mode');
    select.append(new Option('Calm', 'calm'), new Option('Driven', 'driven'));
    document.querySelector('#tab-lab .controls')?.append(select);
  });
  const dynamicSelect = page.locator('#dynamicSelectFixture');
  await expect(dynamicSelect).toBeAttached();
  await expect(dynamicSelect.locator('..').locator('.custom-select-button')).toBeVisible();
});

test('graphs expose collision-aware contextual help and surfaces use calm entrance motion', async ({ page }) => {
  await page.goto('/');
  await waitForModernShell(page);

  const energy = page.locator('#energy');
  await energy.scrollIntoViewIfNeeded();
  // The shared tooltip deliberately closes on scroll. Let the browser finish
  // the automatic scroll performed to reach this lower chart before hovering.
  await page.waitForTimeout(80);
  await energy.hover();
  const tooltip = page.locator('#contextTooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('Relative energy drift');
  // Playwright and browsers may finish an automatic scroll immediately after
  // pointerover. The still-hovered chart should retain and re-anchor its help.
  await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
  await expect(tooltip).toBeVisible();
  const tooltipBox = await tooltip.boundingBox();
  const viewport = page.viewportSize();
  expect(tooltipBox).toBeTruthy();
  expect(tooltipBox!.x).toBeGreaterThanOrEqual(0);
  expect(tooltipBox!.y).toBeGreaterThanOrEqual(0);
  expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(viewport!.width);
  expect(tooltipBox!.y + tooltipBox!.height).toBeLessThanOrEqual(viewport!.height);
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();

  await page.locator('#audiencePreferencesToggle').click();
  const audienceButton = page.locator('#audienceMode').locator('..').locator('.custom-select-button');
  await audienceButton.hover();
  await expect(audienceButton).toHaveAttribute('aria-describedby', /audienceModeHint.*contextTooltip/);
  await page.locator('header h1').hover();
  await expect(audienceButton).toHaveAttribute('aria-describedby', 'audienceModeHint');
  await page.locator('#audiencePreferencesToggle').click();

  await page.locator('#panelToggle').click();
  await page.locator('#panelToggle').click();
  await expect(page.locator('#tab-lab .controls')).toBeVisible();
  await expect
    .poll(() => page.locator('#tab-lab .controls').evaluate((element) => getComputedStyle(element).transitionProperty))
    .toContain('transform');
  await expect(page.locator('body')).not.toHaveClass(/panel-transitioning/);

  await page.locator('#trustDrawerToggle').click();
  const drawer = page.locator('#trustDrawer');
  await expect(drawer).toBeVisible();
  await expect
    .poll(() => drawer.evaluate((element) => getComputedStyle(element).animationName))
    .toContain('surface-arrive-right');
});
