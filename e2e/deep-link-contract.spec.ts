import { expect, test } from '@playwright/test';
import { waitForModernShell } from './shell';

test.describe.configure({ timeout: 120_000 });

test('Landing parameters restore exact controls and canonicalize velocity aliases', async ({ page }) => {
  await page.goto('/?goal=explore&audience=beginner&lang=en&tab=lab&th1=2.18&th2=2.64&w1=3.1&w2=-2.4&g=9.81', {
    waitUntil: 'domcontentloaded'
  });
  await waitForModernShell(page);

  await expect(page.locator('body')).toHaveAttribute('data-audience-mode', 'beginner');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#th1')).toHaveValue('2.18');
  await expect(page.locator('#th2')).toHaveValue('2.64');
  await expect(page.locator('#iw1')).toHaveValue('3.1');
  await expect(page.locator('#iw2')).toHaveValue('-2.4');
  await expect(page.locator('#g')).toHaveValue('9.81');

  const url = new URL(page.url());
  expect(url.searchParams.get('iw1')).toBe('3.1');
  expect(url.searchParams.get('iw2')).toBe('-2.4');
  expect(url.searchParams.has('w1')).toBe(false);
  expect(url.searchParams.has('w2')).toBe(false);
  expect(url.searchParams.get('goal')).toBe('explore');
});

test('Landing goals choose a safe workspace only when tab is absent', async ({ page }) => {
  await page.goto('/?goal=classroom&audience=student&lang=ko', { waitUntil: 'domcontentloaded' });
  await waitForModernShell(page);
  await expect(page.locator('.tab[data-tab="lyap"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#tab-lyap')).toHaveClass(/active/);

  await page.goto('/?goal=classroom&audience=student&tab=lab', { waitUntil: 'domcontentloaded' });
  await waitForModernShell(page);
  await expect(page.locator('.tab[data-tab="lab"]')).toHaveAttribute('aria-selected', 'true');
});
