import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const url = process.env.WEBGPU_VALIDATION_URL ?? 'http://127.0.0.1:5173/';
const channel = process.env.WEBGPU_BROWSER_CHANNEL ?? 'chrome';

type Status = 'pass' | 'fail';

interface AdapterMetadata {
  name?: string;
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
  features?: string[];
  limits?: Record<string, number>;
}

interface ComparisonMetrics {
  passed?: boolean;
  maxMeanAbsDiff?: number;
  maxVarianceAbsDiff?: number;
  maxCovarianceAbsDiff?: number;
  rmsSpreadAbsDiff?: number;
  flipFractionAbsDiff?: number;
  metrics?: Record<string, number | boolean>;
}

interface EnsembleHorizonRow {
  steps: number;
  backend: string;
  n: number;
  gpuElapsedMs: number;
  cpuElapsedMs: number;
  reductionComparison: ComparisonMetrics | null;
  integrationDriftComparison: ComparisonMetrics | null;
}

interface SpectrumHorizonRow {
  steps: number;
  backend: string;
  elapsedMs: number | null;
  comparison: ComparisonMetrics | null;
  spectrum: number[];
  cpuSpectrum: number[];
}

interface GpuBenchmarkLadderReport {
  schemaVersion: 'pendulum-gpu-benchmark-ladder/v2';
  generatedAt: string;
  channel: string;
  url: string;
  status: Status;
  adapter: AdapterMetadata | null;
  ensemble: {
    horizons: EnsembleHorizonRow[];
    allReductionComparisonsPassed: boolean;
    maxIntegrationMeanDrift: number;
    maxIntegrationCovarianceDrift: number;
    caveat: string;
  };
  lyapunovSpectrum: {
    horizons: SpectrumHorizonRow[];
    allPromotionComparisonsPassed: boolean;
    maxAdjacentSpectrumShift: number;
    caveat: string;
  };
  clv: {
    backend: string;
    comparison: ComparisonMetrics | null;
    exponents: number[];
    cpuExponents: number[];
    caveat: string;
  } | null;
  variationalFtleField: {
    backend: string;
    comparison: ComparisonMetrics | null;
    width: number;
    height: number;
    min: number;
    max: number;
    caveat: string;
  } | null;
  nChainVariational: {
    backend: string;
    comparison: {
      passed: boolean;
      clv: ComparisonMetrics;
      ftleAbsDiff: number;
      ftleTolerance: number;
    } | null;
    links: number;
    dimension: number;
    ftle: number;
    cpuFtle: number;
    elapsedMs: number | null;
    method: string;
    caveat: string;
  } | null;
  error?: string;
}

async function isReachable(target: string): Promise<boolean> {
  try {
    const response = await fetch(target);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(target: string, timeoutMs = 45_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isReachable(target)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for dev server at ${target}`);
}

async function ensureServer(): Promise<ChildProcess | null> {
  if (await isReachable(url)) return null;
  const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
  const args =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npm run dev -- --host 127.0.0.1 --port 5173']
      : ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'];
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: 'ignore',
    windowsHide: true
  });
  await waitForServer(url);
  return child;
}

function stopServer(child: ChildProcess | null): void {
  if (!child || child.killed) return;
  child.kill();
}

function maxAbsDiff(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  let max = Math.abs(a.length - b.length);
  for (let i = 0; i < n; i += 1) max = Math.max(max, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  return max;
}

function n(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function fmt(value: unknown, digits = 3): string {
  const numeric = n(value);
  return numeric === null ? 'n/a' : numeric.toExponential(digits);
}

function markdown(report: GpuBenchmarkLadderReport): string {
  const adapter = report.adapter;
  const lines = [
    '# GPU Benchmark Ladder',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Status: **${report.status}**`,
    '',
    `Browser channel: \`${report.channel}\``,
    '',
    '## Adapter',
    '',
    '| Field | Value |',
    '|---|---|',
    `| name | ${adapter?.name ?? 'n/a'} |`,
    `| vendor | ${adapter?.vendor ?? 'n/a'} |`,
    `| architecture | ${adapter?.architecture ?? 'n/a'} |`,
    `| device | ${adapter?.device ?? 'n/a'} |`,
    `| description | ${adapter?.description ?? 'n/a'} |`,
    `| features | ${(adapter?.features ?? []).join(', ') || 'n/a'} |`,
    '',
    '## Ensemble f32/f64 Horizon Drift',
    '',
    '| steps | backend | n | GPU ms | CPU ms | reduction pass | reduction mean diff | f32/f64 mean drift | f32/f64 covariance drift |',
    '|---:|---|---:|---:|---:|---:|---:|---:|---:|',
    ...report.ensemble.horizons.map(
      (row) =>
        `| ${row.steps} | ${row.backend} | ${row.n} | ${(row.gpuElapsedMs ?? 0).toFixed(2)} | ${(row.cpuElapsedMs ?? 0).toFixed(2)} | ${String(row.reductionComparison?.passed ?? false)} | ${fmt(row.reductionComparison?.maxMeanAbsDiff)} | ${fmt(row.integrationDriftComparison?.maxMeanAbsDiff)} | ${fmt(row.integrationDriftComparison?.maxCovarianceAbsDiff)} |`
    ),
    '',
    `Max f32/f64 mean drift: \`${fmt(report.ensemble.maxIntegrationMeanDrift)}\``,
    '',
    `Max f32/f64 covariance drift: \`${fmt(report.ensemble.maxIntegrationCovarianceDrift)}\``,
    '',
    `Caveat: ${report.ensemble.caveat}`,
    '',
    '## Full-Spectrum Horizon Sensitivity',
    '',
    '| steps | backend | GPU ms | pass | spectrum max diff | sum diff | KY diff |',
    '|---:|---|---:|---:|---:|---:|---:|',
    ...report.lyapunovSpectrum.horizons.map(
      (row) =>
        `| ${row.steps} | ${row.backend} | ${row.elapsedMs === null ? 'n/a' : row.elapsedMs.toFixed(2)} | ${String(row.comparison?.passed ?? false)} | ${fmt(row.comparison?.metrics?.spectrumMaxAbsDiff)} | ${fmt(row.comparison?.metrics?.sumAbsDiff)} | ${fmt(row.comparison?.metrics?.kaplanYorkeAbsDiff)} |`
    ),
    '',
    `Max adjacent spectrum shift: \`${fmt(report.lyapunovSpectrum.maxAdjacentSpectrumShift)}\``,
    '',
    `Caveat: ${report.lyapunovSpectrum.caveat}`,
    '',
    '## CLV Promotion',
    '',
    '| Metric | Value |',
    '|---|---:|',
    `| backend | ${report.clv?.backend ?? 'n/a'} |`,
    `| pass | ${String(report.clv?.comparison?.passed ?? false)} |`,
    `| exponent max abs diff | ${fmt(report.clv?.comparison?.metrics?.exponentMaxAbsDiff)} |`,
    `| mean angle abs diff | ${fmt(report.clv?.comparison?.metrics?.meanAngleAbsDiff)} |`,
    `| min angle abs diff | ${fmt(report.clv?.comparison?.metrics?.minAngleAbsDiff)} |`,
    '',
    '## Variational-FTLE Promotion',
    '',
    '| Metric | Value |',
    '|---|---:|',
    `| backend | ${report.variationalFtleField?.backend ?? 'n/a'} |`,
    `| pass | ${String(report.variationalFtleField?.comparison?.passed ?? false)} |`,
    `| shape | ${report.variationalFtleField ? `${report.variationalFtleField.width}x${report.variationalFtleField.height}` : 'n/a'} |`,
    `| field max abs diff | ${fmt(report.variationalFtleField?.comparison?.metrics?.fieldMaxAbsDiff)} |`,
    `| field mean abs diff | ${fmt(report.variationalFtleField?.comparison?.metrics?.fieldMeanAbsDiff)} |`,
    '',
    '## N-chain Tiled STM/QR Promotion',
    '',
    '| Metric | Value |',
    '|---|---:|',
    `| backend | ${report.nChainVariational?.backend ?? 'n/a'} |`,
    `| pass | ${String(report.nChainVariational?.comparison?.passed ?? false)} |`,
    `| links / dimension | ${report.nChainVariational ? `${report.nChainVariational.links} / ${report.nChainVariational.dimension}` : 'n/a'} |`,
    `| CLV exponent max abs diff | ${fmt(report.nChainVariational?.comparison?.clv.metrics?.exponentMaxAbsDiff)} |`,
    `| FTLE abs diff | ${fmt(report.nChainVariational?.comparison?.ftleAbsDiff)} |`,
    `| GPU ms | ${report.nChainVariational?.elapsedMs?.toFixed(2) ?? 'n/a'} |`,
    `| method | ${report.nChainVariational?.method ?? 'n/a'} |`,
    '',
    report.status === 'pass'
      ? 'The hardware ladder validates GPU-side reductions and promoted chaos diagnostics against CPU f64 oracles while recording horizon drift separately.'
      : `Failure: ${report.error ?? 'comparison failed'}`,
    ''
  ];
  return `${lines.join('\n')}\n`;
}

const generatedAt = new Date().toISOString();
let server: ChildProcess | null = null;
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
let report: GpuBenchmarkLadderReport;

try {
  server = await ensureServer();
  browser = await chromium.launch({
    channel,
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UnsafeWebGPU']
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const payload = await page.evaluate(async () => {
    type GpuAdapterLike = {
      features?: Set<string>;
      limits?: Record<string, number>;
      info?: Record<string, string>;
      requestAdapterInfo?: () => Promise<Record<string, string>>;
    };
    const gpuApi = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<GpuAdapterLike | null> } }).gpu;
    if (!gpuApi) throw new Error('navigator.gpu unavailable; this runner is not a WebGPU hardware target.');
    const adapter = await gpuApi.requestAdapter();
    if (!adapter) throw new Error('navigator.gpu.requestAdapter() returned null.');
    const adapterInfo = adapter.info ?? (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : {});
    const adapterMetadata = {
      name: adapterInfo.name,
      vendor: adapterInfo.vendor,
      architecture: adapterInfo.architecture,
      device: adapterInfo.device,
      description: adapterInfo.description,
      features: Array.from(adapter.features ?? []).sort(),
      limits: Object.fromEntries(Object.entries(adapter.limits ?? {}).filter(([, value]) => typeof value === 'number'))
    };

    const ensembleModulePath = '/src/runtime/gpuEnsemble.ts';
    const spectrumModulePath = '/src/runtime/gpuLyapunov.ts';
    const chaosModulePath = '/src/runtime/gpuChaosPromotion.ts';
    const nChainModulePath = '/src/runtime/gpuNChainVariational.ts';
    const ensembleMod = (await import(
      /* @vite-ignore */ ensembleModulePath
    )) as typeof import('../src/runtime/gpuEnsemble');
    const spectrumMod = (await import(
      /* @vite-ignore */ spectrumModulePath
    )) as typeof import('../src/runtime/gpuLyapunov');
    const chaosMod = (await import(
      /* @vite-ignore */ chaosModulePath
    )) as typeof import('../src/runtime/gpuChaosPromotion');
    const nChainMod = (await import(
      /* @vite-ignore */ nChainModulePath
    )) as typeof import('../src/runtime/gpuNChainVariational');
    const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
    const initial = ensembleMod.ensembleGrid(5, [-1.2, 1.2]);
    const ensembleHorizons = [];
    for (const steps of [40, 80, 160]) {
      const gpuRun = await ensembleMod.runDoublePendulumEnsemble(params, initial, { steps, dt: 0.01 });
      const cpuRun = await ensembleMod.runDoublePendulumEnsemble(params, initial, { steps, dt: 0.01, forceCpu: true });
      const gpuReductionOnCpuStates = await ensembleMod.webgpuEnsembleStatistics(cpuRun.states);
      if (!gpuReductionOnCpuStates) throw new Error(`GPU-side reduction returned null at steps=${steps}.`);
      const gpuReductionOnGpuStates = await ensembleMod.webgpuEnsembleStatistics(gpuRun.states);
      if (!gpuReductionOnGpuStates)
        throw new Error(`GPU-side reduction of GPU states returned null at steps=${steps}.`);
      const cpuStats = ensembleMod.ensembleStatistics(cpuRun.states);
      ensembleHorizons.push({
        steps,
        backend: gpuRun.backend,
        n: gpuRun.n,
        gpuElapsedMs: gpuRun.elapsedMs,
        cpuElapsedMs: cpuRun.elapsedMs,
        reductionComparison: ensembleMod.compareEnsembleStatistics(gpuReductionOnCpuStates, cpuStats, {
          mean: 4e-4,
          variance: 3e-3,
          covariance: 3e-3,
          rmsSpread: 3e-3,
          flipFraction: 0
        }),
        integrationDriftComparison: ensembleMod.compareEnsembleStatistics(gpuReductionOnGpuStates, cpuStats, {
          mean: 5e-3,
          variance: 2e-2,
          covariance: 2e-2,
          rmsSpread: 2e-2,
          flipFraction: 0
        })
      });
    }

    const spectrumHorizons = [];
    for (const steps of [160, 320]) {
      const promotion = await spectrumMod.promotedDoublePendulumLyapunovSpectrum(params, [1.2, 0.7, 0.12, -0.04], {
        dt: 0.01,
        steps,
        renormEvery: 8,
        transientSteps: 40,
        seed: 0x1234,
        tolerances: { spectrum: 0.14, aggregate: 0.16 }
      });
      spectrumHorizons.push({
        steps,
        backend: promotion.backend,
        elapsedMs: promotion.gpuCandidate?.elapsedMs ?? null,
        comparison: promotion.comparison,
        spectrum: promotion.result.spectrum,
        cpuSpectrum: promotion.cpuOracle.spectrum
      });
    }

    const clv = await chaosMod.promotedDoublePendulumClv(params, [1.2, 0.7, 0.12, -0.04], {
      dt: 0.01,
      renormEvery: 4,
      forwardTransient: 4,
      window: 10,
      backwardTransient: 2,
      seed: 0x1234,
      tolerances: { exponents: 0.2, angle: 0.4 }
    });
    const variationalFtleField = await chaosMod.promotedDoublePendulumVariationalFtleField(params, {
      n: 4,
      range: [-1.1, 1.1],
      totalTime: 0.16,
      dt: 0.04,
      tolerances: { field: 0.12, aggregate: 0.08 }
    });
    const nChainVariational = await nChainMod.promotedNChainVariational(
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
      adapter: adapterMetadata,
      ensembleHorizons,
      spectrumHorizons,
      clv: {
        backend: clv.backend,
        comparison: clv.comparison,
        exponents: clv.result.exponents,
        cpuExponents: clv.cpuOracle.exponents,
        caveat: clv.caveat
      },
      variationalFtleField: {
        backend: variationalFtleField.backend,
        comparison: variationalFtleField.comparison,
        width: variationalFtleField.field.width,
        height: variationalFtleField.field.height,
        min: variationalFtleField.field.min,
        max: variationalFtleField.field.max,
        caveat: variationalFtleField.caveat
      },
      nChainVariational: {
        backend: nChainVariational.backend,
        comparison: nChainVariational.comparison,
        links: nChainVariational.result.links,
        dimension: nChainVariational.result.dimension,
        ftle: nChainVariational.result.variationalFtle,
        cpuFtle: nChainVariational.cpuOracle.variationalFtle,
        elapsedMs: nChainVariational.gpuCandidate?.elapsedMs ?? null,
        method: nChainVariational.result.method,
        caveat: nChainVariational.caveat
      }
    };
  });
  const ensembleHorizons = payload.ensembleHorizons as EnsembleHorizonRow[];
  const spectrumHorizons = payload.spectrumHorizons as SpectrumHorizonRow[];
  const maxIntegrationMeanDrift = Math.max(
    ...ensembleHorizons.map((row) => row.integrationDriftComparison?.maxMeanAbsDiff ?? Infinity)
  );
  const maxIntegrationCovarianceDrift = Math.max(
    ...ensembleHorizons.map((row) => row.integrationDriftComparison?.maxCovarianceAbsDiff ?? Infinity)
  );
  let maxAdjacentSpectrumShift = 0;
  for (let i = 1; i < spectrumHorizons.length; i += 1) {
    maxAdjacentSpectrumShift = Math.max(
      maxAdjacentSpectrumShift,
      maxAbsDiff(spectrumHorizons[i - 1]!.spectrum, spectrumHorizons[i]!.spectrum)
    );
  }
  const allReductionComparisonsPassed = ensembleHorizons.every((row) => row.reductionComparison?.passed === true);
  const allSpectrumPromotionsPassed = spectrumHorizons.every(
    (row) => row.backend === 'webgpu' && row.comparison?.passed === true
  );
  const clv = payload.clv as GpuBenchmarkLadderReport['clv'];
  const variationalFtleField = payload.variationalFtleField as GpuBenchmarkLadderReport['variationalFtleField'];
  const nChainVariational = payload.nChainVariational as GpuBenchmarkLadderReport['nChainVariational'];
  const status: Status =
    allReductionComparisonsPassed &&
    allSpectrumPromotionsPassed &&
    clv?.backend === 'webgpu' &&
    clv.comparison?.passed === true &&
    variationalFtleField?.backend === 'webgpu' &&
    variationalFtleField.comparison?.passed === true &&
    nChainVariational?.backend === 'webgpu' &&
    nChainVariational.comparison?.passed === true
      ? 'pass'
      : 'fail';
  report = {
    schemaVersion: 'pendulum-gpu-benchmark-ladder/v2',
    generatedAt,
    channel,
    url,
    status,
    adapter: payload.adapter as AdapterMetadata,
    ensemble: {
      horizons: ensembleHorizons,
      allReductionComparisonsPassed,
      maxIntegrationMeanDrift,
      maxIntegrationCovarianceDrift,
      caveat:
        'Reduction comparisons use identical CPU f64 states to isolate GPU-side reduction correctness; f32/f64 integration drift is recorded separately because chaotic trajectories diverge with horizon.'
    },
    lyapunovSpectrum: {
      horizons: spectrumHorizons,
      allPromotionComparisonsPassed: allSpectrumPromotionsPassed,
      maxAdjacentSpectrumShift,
      caveat:
        'Full-spectrum rows are promoted only after same-run CPU f64 oracle comparison; adjacent-horizon shift is a convergence/stability diagnostic, not a pass/fail tolerance.'
    },
    clv,
    variationalFtleField,
    nChainVariational
  };
} catch (error) {
  report = {
    schemaVersion: 'pendulum-gpu-benchmark-ladder/v2',
    generatedAt,
    channel,
    url,
    status: 'fail',
    adapter: null,
    ensemble: {
      horizons: [],
      allReductionComparisonsPassed: false,
      maxIntegrationMeanDrift: Infinity,
      maxIntegrationCovarianceDrift: Infinity,
      caveat: 'No ladder rows were produced.'
    },
    lyapunovSpectrum: {
      horizons: [],
      allPromotionComparisonsPassed: false,
      maxAdjacentSpectrumShift: Infinity,
      caveat: 'No ladder rows were produced.'
    },
    clv: null,
    variationalFtleField: null,
    nChainVariational: null,
    error: error instanceof Error ? error.message : String(error)
  };
} finally {
  await browser?.close().catch(() => undefined);
  stopServer(server);
}

await mkdir('reports', { recursive: true });
await writeFile('reports/gpu-benchmark-ladder.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const md = markdown(report);
await writeFile('reports/gpu-benchmark-ladder.md', md, 'utf8');
console.log(md);
if (report.status !== 'pass') process.exitCode = 1;
