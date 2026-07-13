import { expect, test } from '@playwright/test';

test.use({
  channel: (process.env.WEBGPU_BROWSER_CHANNEL || 'chrome') as 'chrome',
  launchOptions: {
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UnsafeWebGPU']
  }
});

test('real WebGPU ensemble reduction matches the CPU oracle', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebGPU hardware validation is Chromium-only.');
  await page.goto('/');
  const result = await page.evaluate(async () => {
    if (!(navigator as unknown as { gpu?: unknown }).gpu) {
      throw new Error('navigator.gpu unavailable; this runner is not a WebGPU hardware CI target.');
    }
    const modulePath = '/src/runtime/gpuEnsemble.ts';
    const mod = (await import(/* @vite-ignore */ modulePath)) as typeof import('../src/runtime/gpuEnsemble');
    const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
    const initial = mod.ensembleGrid(5, [-1.1, 1.1]);
    const gpu = await mod.runDoublePendulumEnsemble(params, initial, { steps: 80, dt: 0.01 });
    const cpu = await mod.runDoublePendulumEnsemble(params, initial, { steps: 80, dt: 0.01, forceCpu: true });
    const gpuStats = await mod.webgpuEnsembleStatistics(gpu.states);
    if (!gpuStats) throw new Error('GPU-side reduction returned null.');
    const cpuStats = mod.ensembleStatistics(cpu.states);
    const comparison = mod.compareEnsembleStatistics(gpuStats, cpuStats, {
      mean: 4e-4,
      variance: 3e-3,
      covariance: 3e-3,
      rmsSpread: 3e-3,
      flipFraction: 0
    });
    return {
      backend: gpu.backend,
      comparison,
      rmsSpreadGpu: gpuStats.rmsSpread,
      rmsSpreadCpu: cpuStats.rmsSpread
    };
  });
  expect(result.backend).toBe('webgpu');
  expect(result.comparison.passed).toBe(true);
  expect(Math.abs(result.rmsSpreadGpu - result.rmsSpreadCpu)).toBeLessThanOrEqual(
    result.comparison.tolerances.rmsSpread
  );
});

test('real WebGPU full-spectrum Lyapunov candidate passes CPU oracle promotion gate', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebGPU hardware validation is Chromium-only.');
  await page.goto('/');
  const result = await page.evaluate(async () => {
    if (!(navigator as unknown as { gpu?: unknown }).gpu) {
      throw new Error('navigator.gpu unavailable; this runner is not a WebGPU hardware CI target.');
    }
    const modulePath = '/src/runtime/gpuLyapunov.ts';
    const mod = (await import(/* @vite-ignore */ modulePath)) as typeof import('../src/runtime/gpuLyapunov');
    const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
    const promotion = await mod.promotedDoublePendulumLyapunovSpectrum(params, [1.2, 0.7, 0.12, -0.04], {
      dt: 0.01,
      steps: 320,
      renormEvery: 8,
      transientSteps: 40,
      seed: 0x1234,
      tolerances: { spectrum: 0.1, aggregate: 0.12 }
    });
    return {
      backend: promotion.backend,
      passed: promotion.comparison?.passed ?? false,
      metrics: promotion.comparison?.metrics ?? null,
      spectrum: promotion.result.spectrum,
      cpuSpectrum: promotion.cpuOracle.spectrum,
      caveat: promotion.caveat
    };
  });
  expect(result.backend).toBe('webgpu');
  expect(result.passed).toBe(true);
  expect(result.metrics).not.toBeNull();
  expect(result.spectrum.length).toBe(4);
  expect(result.cpuSpectrum.length).toBe(4);
});

test('real WebGPU CLV and variational-FTLE candidates pass CPU oracle promotion gates', async ({
  page,
  browserName
}) => {
  test.skip(browserName !== 'chromium', 'WebGPU hardware validation is Chromium-only.');
  await page.goto('/');
  const result = await page.evaluate(async () => {
    if (!(navigator as unknown as { gpu?: unknown }).gpu) {
      throw new Error('navigator.gpu unavailable; this runner is not a WebGPU hardware CI target.');
    }
    const modulePath = '/src/runtime/gpuChaosPromotion.ts';
    const mod = (await import(/* @vite-ignore */ modulePath)) as typeof import('../src/runtime/gpuChaosPromotion');
    const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
    const clv = await mod.promotedDoublePendulumClv(params, [1.2, 0.7, 0.12, -0.04], {
      dt: 0.01,
      renormEvery: 4,
      forwardTransient: 4,
      window: 10,
      backwardTransient: 2,
      seed: 0x1234,
      tolerances: { exponents: 0.2, angle: 0.4 }
    });
    const ftle = await mod.promotedDoublePendulumVariationalFtleField(params, {
      n: 4,
      range: [-1.1, 1.1],
      totalTime: 0.16,
      dt: 0.04,
      tolerances: { field: 0.12, aggregate: 0.08 }
    });
    return {
      clvBackend: clv.backend,
      clvPassed: clv.comparison?.passed ?? false,
      clvMetrics: clv.comparison?.metrics ?? null,
      clvExponents: clv.result.exponents,
      ftleBackend: ftle.backend,
      ftlePassed: ftle.comparison?.passed ?? false,
      ftleMetrics: ftle.comparison?.metrics ?? null,
      ftleShape: [ftle.field.width, ftle.field.height],
      ftleRange: [ftle.field.min, ftle.field.max]
    };
  });
  expect(result.clvBackend).toBe('webgpu');
  expect(result.clvPassed).toBe(true);
  expect(result.clvMetrics).not.toBeNull();
  expect(result.clvExponents.length).toBe(4);
  expect(result.ftleBackend).toBe('webgpu');
  expect(result.ftlePassed).toBe(true);
  expect(result.ftleMetrics).not.toBeNull();
  expect(result.ftleShape).toEqual([4, 4]);
  expect(Number.isFinite(result.ftleRange[0])).toBe(true);
  expect(Number.isFinite(result.ftleRange[1])).toBe(true);
});

test('real WebGPU N-chain tiled STM/QR pipeline passes its f64 oracle gate', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebGPU hardware validation is Chromium-only.');
  await page.goto('/');
  const result = await page.evaluate(async () => {
    if (!(navigator as unknown as { gpu?: unknown }).gpu) {
      throw new Error('navigator.gpu unavailable; this runner is not a WebGPU hardware CI target.');
    }
    const modulePath = '/src/runtime/gpuNChainVariational.ts';
    const mod = (await import(/* @vite-ignore */ modulePath)) as typeof import('../src/runtime/gpuNChainVariational');
    const promotion = await mod.promotedNChainVariational(
      { masses: [1, 0.9, 0.8], lengths: [1, 0.85, 0.7], g: 9.81 },
      [1.2, 0.7, -0.45, 0.12, -0.08, 0.05],
      {
        dt: 0.006,
        renormEvery: 3,
        forwardTransient: 3,
        window: 8,
        backwardTransient: 2,
        clvTolerances: { exponents: 0.2, angle: 0.4 },
        ftleTolerance: 0.16
      },
      0.01
    );
    return {
      backend: promotion.backend,
      passed: promotion.comparison?.passed ?? false,
      clvPassed: promotion.comparison?.clv.passed ?? false,
      ftleAbsDiff: promotion.comparison?.ftleAbsDiff ?? null,
      ftleTolerance: promotion.comparison?.ftleTolerance ?? null,
      dimension: promotion.result.dimension,
      method: promotion.result.method
    };
  });
  expect(result.backend).toBe('webgpu');
  expect(result.passed).toBe(true);
  expect(result.clvPassed).toBe(true);
  expect(result.ftleAbsDiff).not.toBeNull();
  expect(result.ftleAbsDiff!).toBeLessThanOrEqual(result.ftleTolerance!);
  expect(result.dimension).toBe(6);
  expect(result.method).toBe('piecewise-jacobian-rk2-stm-qr');
});
