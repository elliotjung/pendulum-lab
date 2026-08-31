import { expect, test } from '@playwright/test';

test('ensemble result defaults to median and p05-p95 band with individual traces optional', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('workflow-primary-action').click();
  await page.locator('[data-trajectory-stage-button="ensemble"]').click();
  await expect(page.locator('#ensN')).toHaveValue('12');
  await expect(page.getByTestId('ensemble-spaghetti')).not.toBeChecked();
  await expect(page.locator('#ensembleStatisticsPlot')).toBeVisible();
  await expect(page.locator('#ensembleStatisticsSummary')).toContainText('p05', { timeout: 10_000 });
  await expect(page.locator('#ensembleStatisticsSummary')).toContainText('p50');
  await expect(page.locator('#ensembleStatisticsSummary')).toContainText('p95');
  await expect(page.locator('#ensembleStatisticsSummary')).toContainText('valid n=12');
  await expect(page.locator('#ensembleStatisticsSummary')).toContainText('seed 20260826');
  await expect(page.locator('#ensembleStatisticsSummary')).toContainText('symmetric');

  const visibility = await page.evaluate(() => {
    const lab = (
      window as unknown as {
        __modernLab: {
          ensemble: {
            tipPositionsMeters(config: unknown, includeAll: boolean): unknown[];
            statistics(): {
              latest: { p05: number; p50: number; p95: number };
              samples: Array<{ time: number }>;
            };
          };
          readConfig(): { dt: number };
        };
      }
    ).__modernLab;
    return {
      primaryTipCount: lab.ensemble.tipPositionsMeters(lab.readConfig(), false).length,
      spaghettiTipCount: lab.ensemble.tipPositionsMeters(lab.readConfig(), true).length,
      statistics: lab.ensemble.statistics(),
      dt: lab.readConfig().dt
    };
  });
  expect(visibility.primaryTipCount).toBe(1);
  expect(visibility.spaghettiTipCount).toBe(12);
  expect(visibility.statistics.samples.length).toBeGreaterThan(0);
  expect(visibility.statistics.latest.p05).toBeLessThanOrEqual(visibility.statistics.latest.p50);
  expect(visibility.statistics.latest.p50).toBeLessThanOrEqual(visibility.statistics.latest.p95);
  for (let index = 1; index < visibility.statistics.samples.length; index += 1) {
    expect(
      visibility.statistics.samples[index]!.time - visibility.statistics.samples[index - 1]!.time
    ).toBeGreaterThanOrEqual(0.124);
    expect(
      visibility.statistics.samples[index]!.time - visibility.statistics.samples[index - 1]!.time
    ).toBeLessThanOrEqual(0.125 + visibility.dt + 1e-6);
  }
  const samples = visibility.statistics.samples;
  expect(samples.at(-1)!.time - samples[0]!.time).toBeLessThanOrEqual(30);

  await page.getByTestId('ensemble-spaghetti').check();
  await expect(page.getByTestId('ensemble-spaghetti')).toBeChecked();
  await expect(page.locator('#main')).toHaveAttribute('data-ensemble-traces', 'individual');

  await page.locator('#pauseBtn').click();
  const trailBefore = await page.evaluate(() =>
    (
      window as unknown as {
        __modernLab: { mainSurface: { trailPointCount(): number } };
      }
    ).__modernLab.mainSurface.trailPointCount()
  );
  await page.getByTestId('ensemble-spaghetti').uncheck();
  await expect(page.locator('#main')).toHaveAttribute('data-ensemble-traces', 'summary');
  expect(
    await page.evaluate(() =>
      (
        window as unknown as {
          __modernLab: { mainSurface: { trailPointCount(): number } };
        }
      ).__modernLab.mainSurface.trailPointCount()
    )
  ).toBe(trailBefore);
  await page.locator('#navLocale').evaluate((element: HTMLSelectElement) => {
    element.value = 'ko';
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#ensembleStatisticsSummary')).toContainText('유효 n=12');
  await page.locator('[data-trajectory-stage-button="reference"]').click();
  await expect(page.locator('#ensembleStatisticsSummary')).toContainText('앙상블을 실행하면');
});

test('small and non-finite ensembles fail closed in the browser result', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-trajectory-stage-button="ensemble"]').click();
  await page.locator('#ensN').evaluate((element: HTMLInputElement) => {
    element.value = '1';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#ensembleStatisticsSummary')).toContainText('n<3', { timeout: 10_000 });

  await page.locator('[data-trajectory-stage-button="ensemble"]').click();
  await page.locator('#pauseBtn').click();
  await page.evaluate(() => {
    const lab = (
      window as unknown as {
        __modernLab: {
          ensemble: {
            members: Float64Array[];
            sample(time: number, state: ArrayLike<number>, config: unknown): unknown;
          };
          sim: { time: number; stateView(): ArrayLike<number>; config: unknown };
        };
      }
    ).__modernLab;
    lab.ensemble.members[0]![0] = Number.NaN;
    lab.ensemble.sample(lab.sim.time + 1, lab.sim.stateView(), lab.sim.config);
    document.dispatchEvent(new CustomEvent('pendulum:ui-locale-changed'));
  });
  await expect(page.locator('#ensembleStatisticsSummary')).toContainText('excluded 1');
});

test('trace-mode changes preserve an active replay frame', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-trajectory-stage-button="ensemble"]').click();
  const scrubber = page.locator('#scrubber');
  await expect.poll(async () => Number(await scrubber.getAttribute('max'))).toBeGreaterThan(3);
  await scrubber.evaluate((element: HTMLInputElement) => {
    element.value = '0';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#scrubVal')).not.toHaveText('live');
  await expect(page.locator('#main')).toHaveAttribute('data-frame-source', 'replay');
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
  await expect(page.locator('#main')).toHaveAttribute('data-frame-source', 'replay');
  await page.getByTestId('ensemble-spaghetti').check();
  await expect(page.locator('#scrubVal')).not.toHaveText('live');
  await expect(page.locator('#main')).toHaveAttribute('data-frame-source', 'replay');
});

test('triple-pendulum statistics identify the third endpoint', async ({ page }) => {
  await page.goto('/?audience=research&tab=lab&sysType=triple', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-trajectory-stage-button="ensemble"]').click();
  await expect(page.locator('#ensembleStatisticsSummary')).toContainText('Δr₃', { timeout: 10_000 });
  await expect(page.locator('#ensembleStatisticsPlot')).toHaveAttribute('aria-label', /Δr₃/);
});
