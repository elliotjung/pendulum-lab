import { expect, test } from '@playwright/test';
import sharp from 'sharp';

async function greenTracePixels(image: Buffer): Promise<number> {
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    if (green > 70 && green > red + 35 && green > blue + 8) count += 1;
  }
  return count;
}

async function chromaticTracePixels(image: Buffer): Promise<number> {
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    if (Math.max(red, green, blue) > 90 && Math.max(red, green, blue) - Math.min(red, green, blue) > 55) count += 1;
  }
  return count;
}

test('mobile Lab keeps essential live controls ahead of the student plot dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?audience=student&tab=lab');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernLab?: unknown }).__modernLab));

  const main = await page.locator('#main').boundingBox();
  const quickControls = await page.locator('#tab-lab .ctrl-sticky').boundingBox();
  const firstPlots = await page.locator('#tab-lab .plots-row').first().boundingBox();
  const studentPlots = await page.locator('#tab-lab .student-angle-plots').boundingBox();

  expect(main).not.toBeNull();
  expect(quickControls).not.toBeNull();
  expect(firstPlots).not.toBeNull();
  expect(studentPlots).not.toBeNull();
  expect(quickControls!.y).toBeGreaterThan(main!.y);
  expect(firstPlots!.y).toBeGreaterThan(quickControls!.y + quickControls!.height - 1);
  expect(studentPlots!.y).toBeGreaterThan(quickControls!.y + quickControls!.height - 1);

  await expect(page.locator('#resetBtn')).toBeVisible();
  await expect(page.locator('#pauseBtn')).toBeVisible();
  await expect(page.locator('#speed')).toBeVisible();
});

test('transferred side-plot canvases keep their worker backend and disclose the page-lifetime lock', async ({
  page
}) => {
  await page.goto('/?audience=student&tab=lab');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernLab?: unknown }).__modernLab));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __modernLab: { diagnostics(): { sidePlotBackend: 'offscreen' | 'main' } };
            }
          ).__modernLab.diagnostics().sidePlotBackend
      )
    )
    .toBe('offscreen');

  const workerControl = page.locator('#useWorker');
  await expect(workerControl).toBeChecked();
  await expect(workerControl).toBeDisabled();
  await expect(workerControl).toHaveAttribute('data-worker-ownership', 'locked');
  await expect(page.locator('.worker-lock-note')).toContainText('locked for this page');

  const before = await page.evaluate(() =>
    (
      window as unknown as {
        __modernLab: { diagnostics(): { time: number; sidePlotBackend: 'offscreen' | 'main' } };
      }
    ).__modernLab.diagnostics()
  );
  await page.waitForTimeout(250);
  const after = await page.evaluate(() =>
    (
      window as unknown as {
        __modernLab: { diagnostics(): { time: number; sidePlotBackend: 'offscreen' | 'main' } };
      }
    ).__modernLab.diagnostics()
  );
  expect(after.time).toBeGreaterThan(before.time);
  expect(after.sidePlotBackend).toBe('offscreen');

  await expect
    .poll(async () => greenTracePixels(await page.locator('#thetaProjection').screenshot({ animations: 'disabled' })))
    .toBeGreaterThan(20);
  await expect
    .poll(async () => chromaticTracePixels(await page.locator('#angleTime').screenshot({ animations: 'disabled' })))
    .toBeGreaterThan(20);
});

test('worker-rendered phase portrait stays visible for a long high-energy rotating trajectory', async ({ page }) => {
  await page.goto('/?audience=student&tab=lab');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernLab?: unknown }).__modernLab));
  await page.locator('[data-preset="whirling"]').click();
  await page.locator('#timeMode').selectOption('deterministic');
  await page.locator('#speed').evaluate((input) => {
    (input as HTMLInputElement).value = '4';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#spf').evaluate((input) => {
    (input as HTMLInputElement).value = '60';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(
    () =>
      (
        window as unknown as {
          __modernLab: { diagnostics(): { time: number } };
        }
      ).__modernLab.diagnostics().time > 30,
    undefined,
    { timeout: 10_000 }
  );
  await expect(page.locator('#phaseLiveSummary')).toContainText('800 phase-trajectory points', { timeout: 10_000 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __modernLab: { diagnostics(): { sidePlotBackend: 'offscreen' | 'main' } };
            }
          ).__modernLab.diagnostics().sidePlotBackend
      )
    )
    .toBe('offscreen');

  const image = await page.locator('#phase').screenshot({ animations: 'disabled' });
  expect(await greenTracePixels(image)).toBeGreaterThan(20);
});
