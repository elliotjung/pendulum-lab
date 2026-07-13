import { expect, test } from '@playwright/test';
import { openModernTab } from './shell';

/**
 * The research-grade chaos-diagnostics tabs (0–1 test, covariant Lyapunov
 * vectors, flip basins). Each must open, compute via the chaos worker / fallback,
 * fill its result fields and draw its canvas non-blank.
 */

/** Sum a sparse sample of a canvas's pixels to assert it was drawn (non-blank). */
async function canvasInk(page: import('@playwright/test').Page, id: string): Promise<number> {
  return page.evaluate((cid) => {
    const c = document.getElementById(cid) as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 311) sum += d[i]!;
    return sum;
  }, id);
}

test('0–1 test tab computes K and draws the translation path', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'zeroone', '#tab-zeroone');

  await page.evaluate(() => document.getElementById('zeroOneStart')?.click());
  await page.waitForFunction(() => (document.getElementById('zeroOneK')?.textContent ?? '—') !== '—', undefined, {
    timeout: 30000
  });

  const k = await page.evaluate(() => Number.parseFloat(document.getElementById('zeroOneK')?.textContent ?? ''));
  expect(Number.isFinite(k)).toBe(true);
  expect(k).toBeGreaterThan(0.4); // chaotic default → K near 1
  expect(await canvasInk(page, 'zeroOneCanvas')).toBeGreaterThan(0);
  await expect(page.locator('#zeroOneStatus')).toContainText(/done|K=/);
});

test('CLV tab computes exponents + hyperbolicity and renders', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'clv', '#tab-clv');

  await page.evaluate(() => document.getElementById('clvStart')?.click());
  await page.waitForFunction(() => (document.getElementById('clvLambda1')?.textContent ?? '—') !== '—', undefined, {
    timeout: 30000
  });

  const l1 = await page.evaluate(() => Number.parseFloat(document.getElementById('clvLambda1')?.textContent ?? ''));
  const hyp = await page.evaluate(() => document.getElementById('clvHypMean')?.textContent ?? '');
  expect(Number.isFinite(l1)).toBe(true);
  expect(l1).toBeGreaterThan(0);
  expect(hyp).not.toBe('—');
  expect(await canvasInk(page, 'clvCanvas')).toBeGreaterThan(0);
  await expect(page.locator('#clvStatus')).toContainText(/done|λ₁/);
});

test('RQA tab computes measures and draws the recurrence plot', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'rqa', '#tab-rqa');

  await page.evaluate(() => document.getElementById('rqaStart')?.click());
  await page.waitForFunction(() => (document.getElementById('rqaDET')?.textContent ?? '—') !== '—', undefined, {
    timeout: 30000
  });

  const det = await page.evaluate(() => Number.parseFloat(document.getElementById('rqaDET')?.textContent ?? ''));
  const lmax = await page.evaluate(() => document.getElementById('rqaLmax')?.textContent ?? '');
  expect(Number.isFinite(det)).toBe(true);
  expect(det).toBeGreaterThan(0);
  expect(lmax).not.toBe('—');
  expect(await canvasInk(page, 'rqaCanvas')).toBeGreaterThan(0);
  await expect(page.locator('#rqaStatus')).toContainText(/done|DET=/);
});

test('FTLE tab computes the field range and draws the heatmap', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'ftle', '#tab-ftle');

  // Small resolution for a fast e2e run.
  await page.evaluate(() => {
    const r = document.getElementById('ftleRes') as HTMLInputElement | null;
    if (r) r.value = '30';
  });
  await page.evaluate(() => document.getElementById('ftleStart')?.click());
  await page.waitForFunction(() => (document.getElementById('ftleMax')?.textContent ?? '—') !== '—', undefined, {
    timeout: 30000
  });

  const max = await page.evaluate(() => Number.parseFloat(document.getElementById('ftleMax')?.textContent ?? ''));
  expect(Number.isFinite(max)).toBe(true);
  expect(await canvasInk(page, 'ftleCanvas')).toBeGreaterThan(0);
  await expect(page.locator('#ftleStatus')).toContainText(/done|σ_T/);
});

test('flip-basin tab computes entropy + dimension and draws the basin', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'basin', '#tab-basin');

  // Use a small resolution for a fast e2e run.
  await page.evaluate(() => {
    const r = document.getElementById('basinRes') as HTMLInputElement | null;
    if (r) r.value = '40';
  });
  await page.evaluate(() => document.getElementById('basinStart')?.click());
  await page.waitForFunction(() => (document.getElementById('basinDim')?.textContent ?? '—') !== '—', undefined, {
    timeout: 30000
  });

  const dim = await page.evaluate(() => Number.parseFloat(document.getElementById('basinDim')?.textContent ?? ''));
  expect(Number.isFinite(dim)).toBe(true);
  expect(dim).toBeGreaterThan(1.0);
  expect(await canvasInk(page, 'basinCanvas')).toBeGreaterThan(0);
  await expect(page.locator('#basinStatus')).toContainText(/done|Sb=/);
});
