import { expect, test, type Page } from '@playwright/test';
import { LabSimulation } from '../../src/app/LabSimulation';
import type { RuntimeSnapshot } from '../../src/types/domain';
import type { createProductRuntimeApi } from '../../src/product/app/browser-api-runtime';

type ApiWindow = Window & { PendulumLab: ReturnType<typeof createProductRuntimeApi>['api'] };
const snapshot = (page: Page): Promise<RuntimeSnapshot> =>
  page.evaluate(() => (window as unknown as ApiWindow).PendulumLab.state.snapshot());
async function open(page: Page, system: string) {
  await page.goto(`/next.html#/lab/${system}`);
  await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'ready');
  await page.locator('#product-browser-api > summary').click();
  await page.getByRole('button', { name: '스크립트 API 활성화', exact: true }).click();
  await expect(page.locator('#product-browser-api')).toHaveAttribute('data-browser-api-status', 'ready');
  await page.locator('#legacy-playback > summary').click();
}

test.describe('S28 measured physics and actual native playback accounting', () => {
  for (const system of ['double', 'compound-double', 'triple']) {
    test(`${system}: measures actual steps, retains requested budget, runs60x4 and resets metrics`, async ({
      page
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await open(page, system);
      const diagnostics = page.locator('#playback-diagnostics');
      await expect(diagnostics).toHaveAttribute('data-physics-ms', '0');
      const before = await snapshot(page);
      const native = new LabSimulation({
        system: before.systemType,
        parameters: before.parameters,
        initialState: before.state,
        gamma: before.damping,
        method: before.method,
        dt: before.dt,
        tolerance: before.tolerance
      });
      native.step();
      await page.getByRole('button', { name: '한 단계', exact: true }).click();
      await expect.poll(async () => (await snapshot(page)).simTime).toBe(before.simTime + before.dt);
      expect((await snapshot(page)).state).toEqual(Array.from(native.stateView()));
      const stepCompute = Number(await diagnostics.getAttribute('data-physics-ms'));
      expect(Number.isFinite(stepCompute) && stepCompute >= 0).toBe(true);
      const previousQualityClasses = await page.evaluate(() =>
        [...document.body.classList].filter((name) => name.startsWith('quality-')).sort()
      );
      await page.locator('#native-display > summary').click();
      const display = page.locator('#native-display');
      await expect(display).toHaveAttribute('data-display-state', 'ready');
      await expect(display).toHaveAttribute('data-physics-ms', String(stepCompute));
      await expect(display).toHaveAttribute('data-current-step', '1');
      await expect(display).toHaveAttribute('data-previous-step', '0');
      await expect(display).toHaveAttribute('data-interpolation-available', 'true');
      await expect(display).toHaveAttribute('data-auto-quality-samples', '0');
      const manualFrames = Number(await display.getAttribute('data-render-frames'));
      await page.getByLabel('표시 품질', { exact: true }).selectOption('cinematic');
      await expect
        .poll(async () => Number(await display.getAttribute('data-render-frames')))
        .toBeGreaterThan(manualFrames);
      await expect(display).toHaveAttribute('data-auto-quality-samples', '0');
      await page.locator('#playback-timing').selectOption('deterministic');
      await page.locator('#playback-budget').fill('60');
      await page.locator('#playback-budget').press('Tab');
      await page.locator('#playback-speed').fill('4');
      await page.locator('#playback-speed').press('Tab');
      await expect(diagnostics).toHaveAttribute('data-requested-steps', '60');
      await page.getByRole('button', { name: '실행 계속', exact: true }).click();
      await expect.poll(async () => (await snapshot(page)).simTime).toBeGreaterThan(before.simTime + before.dt);
      await page.getByRole('button', { name: '일시정지', exact: true }).click();
      await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'paused');
      const compute = Number(await diagnostics.getAttribute('data-physics-ms'));
      const effective = Number(await diagnostics.getAttribute('data-effective-steps'));
      expect(Number.isFinite(compute) && compute >= 0).toBe(true);
      expect(Number.isSafeInteger(effective) && effective >= 1 && effective <= 60).toBe(true);
      expect((await snapshot(page)).stepsPerFrame).toBe(effective);
      await expect(page.locator('#playback-budget')).toHaveValue('60');
      for (const metric of ['data-render-ms', 'data-side-plot-ms']) {
        const value = Number(await display.getAttribute(metric));
        expect(Number.isFinite(value) && value >= 0).toBe(true);
      }
      expect(['supported', 'unsupported']).toContain(await display.getAttribute('data-longtask-support'));
      await page.getByRole('button', { name: '처음으로', exact: true }).click();
      await expect(diagnostics).toHaveAttribute('data-physics-ms', '0');
      await expect(display).toHaveAttribute('data-physics-ms', '0');
      await expect(display).toHaveAttribute('data-current-step', '0');
      expect((await snapshot(page)).state).toEqual(before.state);
      await page.locator('#native-display > summary').click();
      await expect(display).toHaveAttribute('data-display-state', 'suspended');
      const closedFrames = await display.getAttribute('data-render-frames');
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      );
      expect(await display.getAttribute('data-render-frames')).toBe(closedFrames);
      expect(
        await page.evaluate(() => [...document.body.classList].filter((name) => name.startsWith('quality-')).sort())
      ).toEqual(previousQualityClasses);
      expect(errors).toEqual([]);
      test.info().annotations.push({
        type: 's28-actual-playback-timing',
        description: JSON.stringify({
          system,
          stepCompute,
          compute,
          requested: 60,
          effective,
          pageErrors: errors.length
        })
      });
    });
  }

  test('rejected core interval retains its full native timing debt and physical state', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page, 'double');
    const before = await snapshot(page);
    const rejected = await page.evaluate(
      (base) =>
        (window as unknown as ApiWindow).PendulumLab.state.applyPatch({
          parameters: { ...base.parameters, m1: 0.001, m2: 0.001, l1: 0.001, l2: 0.001, g: 1000 },
          state: [1, 2, 10000, -10000],
          damping: 10,
          method: 'hmidpoint',
          tolerance: 1e-15,
          dt: 0.05,
          stepsPerFrame: 6
        }),
      before
    );
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(page.locator('.lab-workspace')).toHaveAttribute('data-lab-status', 'error');
    expect((await snapshot(page)).state).toEqual(rejected.state);
    const diagnostics = page.locator('#playback-diagnostics');
    await expect(diagnostics).toHaveAttribute('data-timing-debt-seconds', '0.25');
    const compute = Number(await diagnostics.getAttribute('data-physics-ms'));
    expect(Number.isFinite(compute) && compute >= 0).toBe(true);
    expect(errors).toEqual([]);
    test.info().annotations.push({
      type: 's28-rejected-playback-timing',
      description: JSON.stringify({ compute, actualSteps: 0, debtSeconds: 0.25, pageErrors: errors.length })
    });
  });
});
