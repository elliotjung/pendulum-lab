import { expect, test } from '@playwright/test';

type LabDiagnostics = {
  time: number;
  physicsMsPerFrame: number;
  renderMsPerFrame: number;
  trailPoints: number;
  qualityMode: string;
  dprCap: number;
  sidePlotBackend: string;
  pendingUiTasks: number;
};

test('lab performance diagnostics stay healthy during a short run', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernLab?: unknown }).__modernLab));
  await page.waitForTimeout(3500);

  const diag = await page.evaluate(() =>
    (window as unknown as { __modernLab: { diagnostics(): LabDiagnostics } }).__modernLab.diagnostics()
  );
  expect(diag.time).toBeGreaterThan(0.05);
  expect(diag.physicsMsPerFrame).toBeLessThan(40);
  expect(diag.renderMsPerFrame).toBeLessThan(40);
  expect(diag.trailPoints).toBeGreaterThan(5);
  expect(['performance', 'balanced', 'cinematic']).toContain(diag.qualityMode);
  expect(diag.dprCap).toBeGreaterThanOrEqual(1);
  expect(diag.dprCap).toBeLessThanOrEqual(2);
  expect(['offscreen', 'main']).toContain(diag.sidePlotBackend);
  expect(diag.pendingUiTasks).toBeLessThanOrEqual(1);

  const nonBlankPixels = await page.evaluate(() => {
    const canvas = document.getElementById('main') as HTMLCanvasElement | null;
    if (!canvas) return 0;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    const { width, height } = canvas;
    const sample = ctx.getImageData(0, 0, Math.min(width, 240), Math.min(height, 160)).data;
    let count = 0;
    for (let i = 0; i < sample.length; i += 4) {
      if (sample[i] || sample[i + 1] || sample[i + 2]) count += 1;
    }
    return count;
  });
  expect(nonBlankPixels).toBeGreaterThan(100);
  await expect(page.locator('#dQuality')).toContainText(/performance|balanced|cinematic/);
  expect(pageErrors).toEqual([]);
});

test('lab heap usage does not grow unbounded when heap metrics are available', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernLab?: unknown }).__modernLab));
  await page.waitForTimeout(1000);

  const before = await usedHeap(page);
  test.skip(before === null, 'performance.memory is not available in this browser');

  await page.waitForTimeout(5000);
  const after = await usedHeap(page);
  expect(after).not.toBeNull();
  expect(after! - before!).toBeLessThan(24 * 1024 * 1024);
});

async function usedHeap(page: import('@playwright/test').Page): Promise<number | null> {
  return page.evaluate(() => {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
    return typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null;
  });
}
