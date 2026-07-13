import { expect, test } from '@playwright/test';
import { openModernTab, waitForModernShell } from './shell';

test('share experiment hash restores setup, integrator, initial conditions, and tab', async ({ page }) => {
  await page.goto('/');
  await waitForModernShell(page);
  await page.getByTestId('control-sysType').selectOption('triple');
  const setHiddenControl = async (testId: string, value: string): Promise<void> => {
    await page.getByTestId(testId).evaluate((element, next) => {
      (element as HTMLInputElement | HTMLSelectElement).value = next;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  };
  await setHiddenControl('control-method', 'yoshida4');
  await setHiddenControl('control-dt', '0.0015');
  await setHiddenControl('control-gamma', '0.04');
  await setHiddenControl('control-th1', '1.1');
  await setHiddenControl('control-th2', '-0.4');
  await setHiddenControl('control-th3', '0.2');
  await openModernTab(page, 'validate', '#tab-validate');
  await page.getByTestId('share-experiment').click();
  const hash = await page.evaluate(() => location.hash);
  expect(hash).toMatch(/^#experiment=/);

  await page.goto(`/${hash}`);
  await waitForModernShell(page);
  await expect(page.getByTestId('control-sysType')).toHaveValue('triple');
  await expect(page.getByTestId('control-method')).toHaveValue('yoshida4');
  await expect(page.getByTestId('control-dt')).toHaveValue('0.0015');
  await expect(page.getByTestId('control-gamma')).toHaveValue('0.04');
  expect(Number(await page.getByTestId('control-th2').inputValue())).toBeCloseTo(-0.4, 3);
  await expect(page.locator('#tab-validate')).toHaveClass(/active/);
});

test('? opens an accessible shortcut guide and Escape closes it', async ({ page }) => {
  await page.goto('/');
  await waitForModernShell(page);
  await page.keyboard.press('?');
  const dialog = page.getByTestId('shortcut-help-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('open', '');
  await expect(dialog.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
  await expect(dialog.getByText('Open this shortcut guide')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('Korean locale extends to stable navigation, Lab controls, and Trust Inspector labels', async ({ page }) => {
  await page.goto('/');
  await waitForModernShell(page);
  await page.locator('#navLocale').selectOption('ko');
  await expect(page.getByTestId('nav-section-sim')).toContainText('탐색');
  await expect(page.getByTestId('nav-tab-lab')).toContainText('실험실');
  await expect(page.locator('label[for="method"]')).toHaveText('적분기');
  await expect(page.getByTestId('trust-inspector-toggle')).toContainText('신뢰 및 진단');
  await page.getByTestId('trust-inspector-toggle').click();
  await expect(page.getByTestId('trust-tab-validation')).toHaveText('검증');
  await expect(page.locator('#trustDrawer')).toBeVisible();
  await page.locator('#trustDrawerClose').click();
  await openModernTab(page, 'research', '#researchWorkbench');
  await expect(page.getByTestId('nav-tab-architecture')).toContainText('구조');
});

test('Trust Inspector stays inside a narrow viewport and remains scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/');
  await waitForModernShell(page);
  await page.getByTestId('trust-inspector-toggle').click();
  const geometry = await page.locator('#trustDrawer').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const body = element.querySelector<HTMLElement>('.trust-drawer-body');
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, overflowY: body ? getComputedStyle(body).overflowY : '' };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(390);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(700);
  expect(['auto', 'scroll']).toContain(geometry.overflowY);
});

test('system light preference changes the major page and rail surfaces', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await waitForModernShell(page);
  const colors = await page.evaluate(() => ({
    scheme: getComputedStyle(document.documentElement).colorScheme,
    body: getComputedStyle(document.body).color,
    rail: getComputedStyle(document.querySelector('.rail')!).backgroundColor
  }));
  expect(colors.scheme).toContain('light');
  expect(colors.body).toBe('rgb(24, 46, 68)');
  expect(colors.rail).toMatch(/rgba?\(248, 251, 255/);
});

test('Validation tab exposes committed energy-drift curves and accessible legend', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'validate', '#tab-validate');
  await expect(page.locator('#energyBenchmarkCanvas')).toBeVisible();
  await expect(page.locator('#energyBenchmarkStatus')).toContainText('14 committed');
  await expect(page.locator('#energyBenchmarkLegend li')).toHaveCount(14);
  await expect(page.locator('#energyBenchmarkLegend')).toContainText('Yoshida 4');
});
