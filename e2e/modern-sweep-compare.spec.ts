import { expect, test } from '@playwright/test';
import { openModernTab } from './shell';

function canvasSum(id: string): number {
  const c = document.getElementById(id) as HTMLCanvasElement | null;
  if (!c) return -1;
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 277) s = (s + d[i]!) % 2147483647;
  return s;
}

test('modern Sweep tab paints a chaos map and exports', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'sweep', '#tab-sweep');

  // Small/fast sweep for the test.
  await page.evaluate(() => {
    (document.getElementById('sweepRes') as HTMLInputElement).value = '24';
    (document.getElementById('sweepT') as HTMLInputElement).value = '5';
  });
  await page.evaluate(() => document.getElementById('sweepStart')?.click());
  await page.waitForFunction(
    () => (document.getElementById('sweepStatus')?.textContent ?? '').includes('done'),
    undefined,
    { timeout: 30000 }
  );

  // The chaos map canvas is non-blank.
  expect(await page.evaluate(canvasSum, 'sweepCanvas')).toBeGreaterThan(0);

  // CSV export downloads.
  const dl = page.waitForEvent('download');
  await page.evaluate(() => document.getElementById('sweepExportCSV')?.click());
  expect((await dl).suggestedFilename()).toContain('.csv');
});

test('modern Compare tab overlays integrators and benchmarks', async ({ page }) => {
  await page.goto('/');
  await openModernTab(page, 'compare', '#tab-compare');

  await page.evaluate(() => document.getElementById('cmpStart')?.click());
  const a = await page.evaluate(canvasSum, 'cmpCanvas');
  await page.waitForTimeout(500);
  const b = await page.evaluate(canvasSum, 'cmpCanvas');
  expect(a).toBeGreaterThanOrEqual(0);
  expect(b).not.toBe(a); // animating

  // Benchmark fills the per-method fields.
  await page.evaluate(() => document.getElementById('cmpBenchBtn')?.click());
  await page.waitForFunction(
    () => (document.getElementById('bRK4')?.textContent ?? '').includes('steps/ms'),
    undefined,
    { timeout: 20000 }
  );
  await expect(page.locator('#bEuler')).toContainText('steps/ms');

  await page.evaluate(() => document.getElementById('cmpStop')?.click());
});
