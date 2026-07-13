import { expect, test } from '@playwright/test';

test('main trajectory OffscreenCanvas opt-in renders or safely retains Canvas2D', async ({ page, browserName }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/?mainCanvasWorker=1&webglTrail=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean((window as unknown as { __modernLab?: unknown }).__modernLab));

  const first = await page.evaluate(() => {
    const lab = (
      window as unknown as {
        __modernLab: { diagnostics(): { time: number; mainCanvasBackend: 'offscreen' | 'main' } };
      }
    ).__modernLab;
    return lab.diagnostics();
  });
  await page.waitForFunction(
    (time) =>
      (window as unknown as { __modernLab: { diagnostics(): { time: number } } }).__modernLab.diagnostics().time > time,
    first.time
  );

  const backend = await page.evaluate(
    () =>
      (
        window as unknown as {
          __modernLab: { diagnostics(): { mainCanvasBackend: 'offscreen' | 'main' } };
        }
      ).__modernLab.diagnostics().mainCanvasBackend
  );
  if (browserName === 'chromium') expect(backend).toBe('offscreen');
  else expect(['offscreen', 'main']).toContain(backend);
  await expect(page.locator('#main')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('cinematic WebGL2 trail opt-in executes the batched backend in Chromium', async ({ page, browserName }) => {
  test.skip(
    browserName !== 'chromium',
    'WebGL2 promotion probe is Chromium-specific; other engines retain Canvas2D fallback.'
  );
  await page.goto('/?webglTrail=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean((window as unknown as { __modernLab?: unknown }).__modernLab));
  await page.evaluate(() => {
    const select = document.getElementById('qualityMode') as HTMLSelectElement | null;
    if (!select) throw new Error('qualityMode control missing');
    select.value = 'cinematic';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(
    () =>
      (
        window as unknown as {
          __modernLab: { diagnostics(): { mainTrailBackend: 'webgl2' | 'canvas2d' | 'worker' } };
        }
      ).__modernLab.diagnostics().mainTrailBackend === 'webgl2'
  );
  const diagnostics = await page.evaluate(() =>
    (
      window as unknown as {
        __modernLab: { diagnostics(): { mainCanvasBackend: string; mainTrailBackend: string } };
      }
    ).__modernLab.diagnostics()
  );
  expect(diagnostics).toMatchObject({ mainCanvasBackend: 'main', mainTrailBackend: 'webgl2' });
});
