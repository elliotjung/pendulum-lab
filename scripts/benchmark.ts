import { chromium, type Browser } from '@playwright/test';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import type { BenchmarkMetrics } from '../src/types/domain';

/**
 * Browser performance benchmark with two honest modes:
 *
 * - `compare`: ORIGINAL_URL and CANDIDATE_URL point at two *different* builds
 *   (e.g. baseline worktree on :4173, PR build on :4174). Samples are taken
 *   interleaved (A/B/A/B…) in one browser process, aggregated as median ± MAD,
 *   and regressions fail the run by default. Sampling the same URL twice is
 *   rejected as an invalid benchmark rather than reported as a comparison.
 * - `profile`: no URLs (or only CANDIDATE_URL) — measures a single build and
 *   emits samples/aggregates with *no* comparison claim. The longitudinal
 *   memory gate (`npm run benchmark:memory`) consumes the candidate aggregate.
 *
 * Env:
 *   ORIGINAL_URL / CANDIDATE_URL        select compare mode (must differ)
 *   BENCHMARK_SAMPLES                   samples per build (default 5, min 3 in compare mode)
 *   BENCHMARK_FAIL_ON_REGRESSION        default '1'; set '0' to demote to warnings
 *   BENCHMARK_MAX_FPS_DROP_FRACTION     default 0.25
 *   BENCHMARK_MAX_PHYSICS_SLOWDOWN_FRACTION  default 0.25 (per simulation step)
 *   BENCHMARK_MAX_MEMORY_GROWTH_BYTES   default 50 MB (absolute)
 *   BENCHMARK_MAX_MEMORY_GROWTH_FRACTION default 0.20 (relative)
 */

const originalUrl = process.env.ORIGINAL_URL ?? null;
const candidateUrl = process.env.CANDIDATE_URL ?? null;
const localDevOrigin = 'http://127.0.0.1:5173';
const failOnRegression = (process.env.BENCHMARK_FAIL_ON_REGRESSION ?? '1') !== '0';
const requestedSamples = Math.max(1, Math.round(numberFromEnv('BENCHMARK_SAMPLES', 5)));
const maxFpsDropFraction = numberFromEnv('BENCHMARK_MAX_FPS_DROP_FRACTION', 0.25);
const maxPhysicsSlowdownFraction = numberFromEnv('BENCHMARK_MAX_PHYSICS_SLOWDOWN_FRACTION', 0.25);
const maxMemoryGrowthBytes = numberFromEnv('BENCHMARK_MAX_MEMORY_GROWTH_BYTES', 50_000_000);
const maxMemoryGrowthFraction = numberFromEnv('BENCHMARK_MAX_MEMORY_GROWTH_FRACTION', 0.2);

type MetricName =
  | 'fps'
  | 'physicsMsPerFrame'
  | 'physicsMsPerStep'
  | 'stepsAdvanced'
  | 'renderMsPerFrame'
  | 'memoryBytes'
  | 'workerLatencyMs'
  | 'longTaskMs';

const METRICS: Array<{
  metric: MetricName;
  direction: 'higher-is-better' | 'lower-is-better';
  threshold: number;
  gated: boolean;
}> = [
  { metric: 'fps', direction: 'higher-is-better', threshold: maxFpsDropFraction, gated: true },
  // A fixed-dt accumulator deliberately performs more steps after a slow paint.
  // Keep frame cost and step count visible, but gate the normalized step cost.
  { metric: 'physicsMsPerFrame', direction: 'lower-is-better', threshold: maxPhysicsSlowdownFraction, gated: false },
  { metric: 'physicsMsPerStep', direction: 'lower-is-better', threshold: maxPhysicsSlowdownFraction, gated: true },
  { metric: 'stepsAdvanced', direction: 'higher-is-better', threshold: maxFpsDropFraction, gated: false },
  { metric: 'renderMsPerFrame', direction: 'lower-is-better', threshold: maxPhysicsSlowdownFraction, gated: true },
  { metric: 'memoryBytes', direction: 'lower-is-better', threshold: maxMemoryGrowthFraction, gated: true },
  { metric: 'workerLatencyMs', direction: 'lower-is-better', threshold: maxPhysicsSlowdownFraction, gated: true },
  { metric: 'longTaskMs', direction: 'lower-is-better', threshold: 0.5, gated: true }
];

interface SampleMetrics extends BenchmarkMetrics {
  physicsMsPerStep: number | null;
  stepsAdvanced: number | null;
  renderMsPerFrame: number | null;
  longTaskMs: number | null;
  sampleIndex: number;
}

interface MetricAggregate {
  metric: MetricName;
  samples: number[];
  median: number | null;
  mad: number | null;
}

interface BenchmarkDelta {
  metric: MetricName;
  original: number | null;
  candidate: number | null;
  delta: number | null;
  relativeDelta: number | null;
  noiseFloor: number | null;
  threshold: number;
  direction: 'higher-is-better' | 'lower-is-better';
  status: 'pass' | 'warn' | 'missing' | 'info';
}

interface BenchmarkComparison {
  originalUrl: string;
  candidateUrl: string;
  samplesPerBuild: number;
  failOnRegression: boolean;
  deltas: BenchmarkDelta[];
  status: 'pass' | 'warn';
}

interface BenchmarkEnvironment {
  commitSha: string | null;
  dirtyWorktree: boolean | null;
  packageVersion: string | null;
  browser: string | null;
  os: string;
  cpu: string;
  gpu: string | null;
  devicePixelRatio: number | null;
  nodeVersion: string;
}

function numberFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function gitInfo(): { commitSha: string | null; dirtyWorktree: boolean | null } {
  try {
    const commitSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const dirtyWorktree = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;
    return { commitSha, dirtyWorktree };
  } catch {
    return { commitSha: null, dirtyWorktree: null };
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Median absolute deviation, scaled to be comparable to a standard deviation. */
function scaledMad(values: number[]): number | null {
  const m = median(values);
  if (m === null) return null;
  const deviations = values.map((v) => Math.abs(v - m));
  const mad = median(deviations);
  return mad === null ? null : 1.4826 * mad;
}

async function reachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(url: string, timeoutMs = 20_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `Timed out waiting for benchmark server at ${url}. Serve the build first (e.g. \`npx vite preview --port <port>\`).`
  );
}

async function ensureLocalProfileServer(url: string): Promise<ChildProcess | null> {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return null;
  }
  if (origin !== localDevOrigin || (await reachable(origin))) return null;
  const viteCli = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', '5173'], {
    stdio: 'ignore',
    shell: false
  });
  await waitForServer(origin);
  return server;
}

async function collectSample(
  browser: Browser,
  url: string,
  label: string,
  sampleIndex: number
): Promise<SampleMetrics> {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      const w = window as Window & { __benchLongTasks?: number[] };
      w.__benchLongTasks = [];
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) w.__benchLongTasks?.push(entry.duration);
        }).observe({ type: 'longtask', buffered: true });
      } catch {
        // longtask observer unsupported — metric stays null
      }
    });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(4_000);
    return await page.evaluate(
      ({ sampleLabel, index }) => {
        const w = window as Window & {
          __modernLab?: {
            diagnostics(): {
              fps: number;
              physicsMsPerFrame: number;
              renderMsPerFrame: number;
              sidePlotMsPerFrame: number;
              stepsAdvanced?: number;
              stepsPerFrame?: number;
            };
          };
          __benchLongTasks?: number[];
        };
        const diag = w.__modernLab ? w.__modernLab.diagnostics() : null;
        const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
        const longTasks = Array.isArray(w.__benchLongTasks) ? w.__benchLongTasks : null;
        const physicsMs = typeof diag?.physicsMsPerFrame === 'number' ? diag.physicsMsPerFrame : null;
        const stepsAdvanced =
          typeof diag?.stepsAdvanced === 'number'
            ? diag.stepsAdvanced
            : typeof diag?.stepsPerFrame === 'number'
              ? diag.stepsPerFrame
              : null;
        return {
          label: sampleLabel,
          url: location.href,
          sampleIndex: index,
          fps: typeof diag?.fps === 'number' ? diag.fps : null,
          physicsMsPerFrame: physicsMs,
          physicsMsPerStep:
            physicsMs !== null && stepsAdvanced !== null && stepsAdvanced > 0 ? physicsMs / stepsAdvanced : null,
          stepsAdvanced,
          renderMsPerFrame: typeof diag?.renderMsPerFrame === 'number' ? diag.renderMsPerFrame : null,
          workerLatencyMs: typeof diag?.sidePlotMsPerFrame === 'number' ? diag.sidePlotMsPerFrame : null,
          memoryBytes: typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null,
          longTaskMs: longTasks ? longTasks.reduce((sum, d) => sum + d, 0) : null
        };
      },
      { sampleLabel: label, index: sampleIndex }
    );
  } finally {
    await page.close();
  }
}

async function readEnvironment(browser: Browser, anyUrl: string): Promise<BenchmarkEnvironment> {
  const { commitSha, dirtyWorktree } = gitInfo();
  let packageVersion: string | null = null;
  try {
    packageVersion = (JSON.parse(await readFile('package.json', 'utf8')) as { version?: string }).version ?? null;
  } catch {
    packageVersion = null;
  }
  let gpu: string | null = null;
  let devicePixelRatio: number | null = null;
  try {
    const page = await browser.newPage();
    await page.goto(anyUrl, { waitUntil: 'domcontentloaded' });
    ({ gpu, devicePixelRatio } = await page.evaluate(() => {
      let renderer: string | null = null;
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        const info = gl?.getExtension('WEBGL_debug_renderer_info');
        if (gl && info) renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
      } catch {
        renderer = null;
      }
      return { gpu: renderer, devicePixelRatio: window.devicePixelRatio || null };
    }));
    await page.close();
  } catch {
    // environment probing is best-effort
  }
  return {
    commitSha,
    dirtyWorktree,
    packageVersion,
    browser: browser.version(),
    os: `${process.platform} ${os.release()}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    gpu,
    devicePixelRatio,
    nodeVersion: process.version
  };
}

function aggregate(samples: SampleMetrics[]): Record<MetricName, MetricAggregate> {
  const out = {} as Record<MetricName, MetricAggregate>;
  for (const { metric } of METRICS) {
    const values = samples
      .map((sample) => sample[metric])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    out[metric] = { metric, samples: values, median: median(values), mad: scaledMad(values) };
  }
  return out;
}

function medianRow(label: string, url: string, agg: Record<MetricName, MetricAggregate>): SampleMetrics {
  return {
    label,
    url,
    sampleIndex: -1,
    fps: agg.fps.median,
    physicsMsPerFrame: agg.physicsMsPerFrame.median,
    physicsMsPerStep: agg.physicsMsPerStep.median,
    stepsAdvanced: agg.stepsAdvanced.median,
    renderMsPerFrame: agg.renderMsPerFrame.median,
    workerLatencyMs: agg.workerLatencyMs.median,
    memoryBytes: agg.memoryBytes.median,
    longTaskMs: agg.longTaskMs.median
  };
}

function compareMetric(
  original: MetricAggregate,
  candidate: MetricAggregate,
  metric: MetricName,
  threshold: number,
  direction: 'higher-is-better' | 'lower-is-better',
  gated: boolean,
  minNoiseFloor = 0
): BenchmarkDelta {
  const a = original.median;
  const b = candidate.median;
  if (a === null || b === null) {
    return {
      metric,
      original: a,
      candidate: b,
      delta: null,
      relativeDelta: null,
      noiseFloor: null,
      threshold,
      direction,
      status: 'missing'
    };
  }
  const delta = b - a;
  const rel = a === 0 ? null : delta / Math.abs(a);
  // MAD collapses to zero when every sample of a quantized timer lands on the
  // same 0.1 ms tick, which would let a sub-resolution delta count as a real
  // regression. The floor keeps the gate honest: a delta below what the
  // instrument can resolve is not evidence.
  const noiseFloor = Math.max((original.mad ?? 0) + (candidate.mad ?? 0), minNoiseFloor);
  const beyondNoise = Math.abs(delta) > noiseFloor;
  let failed: boolean;
  if (metric === 'memoryBytes') {
    // Memory gets both an absolute cap and a relative cap.
    failed = delta > maxMemoryGrowthBytes || (rel !== null && rel > threshold);
  } else if (direction === 'higher-is-better') {
    failed = rel !== null && rel < -threshold;
  } else {
    failed = rel !== null ? rel > threshold : delta > threshold;
  }
  return {
    metric,
    original: a,
    candidate: b,
    delta,
    relativeDelta: rel,
    noiseFloor,
    threshold,
    direction,
    status: gated ? (failed && beyondNoise ? 'warn' : 'pass') : 'info'
  };
}

function compare(
  originalAgg: Record<MetricName, MetricAggregate>,
  candidateAgg: Record<MetricName, MetricAggregate>
): BenchmarkComparison {
  // Chromium coarsens performance.now() to 0.1 ms on non-isolated pages, and
  // the app diagnostics measure single frames, so ms metrics quantize to that
  // tick. Per-step cost divides the same quantized timer by the step count —
  // use the SLOWER build's step count so the floor covers both grids (the
  // fixed-dt accumulator legitimately advances different step counts per
  // build). Long tasks only exist above the 50 ms observer threshold, so one
  // marginal task appearing or vanishing swings the sum by ~50 ms.
  const TIMER_QUANTUM_MS = 0.1;
  const LONG_TASK_QUANTUM_MS = 50;
  const minSteps = Math.max(
    1,
    Math.min(
      originalAgg.stepsAdvanced.median ?? Number.POSITIVE_INFINITY,
      candidateAgg.stepsAdvanced.median ?? Number.POSITIVE_INFINITY
    )
  );
  const minNoiseFloors: Partial<Record<MetricName, number>> = {
    physicsMsPerFrame: TIMER_QUANTUM_MS,
    physicsMsPerStep: Number.isFinite(minSteps) ? TIMER_QUANTUM_MS / minSteps : TIMER_QUANTUM_MS,
    renderMsPerFrame: TIMER_QUANTUM_MS,
    workerLatencyMs: TIMER_QUANTUM_MS,
    longTaskMs: LONG_TASK_QUANTUM_MS
  };
  const deltas = METRICS.map(({ metric, direction, threshold, gated }) =>
    compareMetric(
      originalAgg[metric],
      candidateAgg[metric],
      metric,
      threshold,
      direction,
      gated,
      minNoiseFloors[metric] ?? 0
    )
  );
  return {
    originalUrl: originalUrl!,
    candidateUrl: candidateUrl!,
    samplesPerBuild: requestedSamples,
    failOnRegression,
    deltas,
    status: deltas.some((delta) => delta.status === 'warn') ? 'warn' : 'pass'
  };
}

function formatNumber(value: number | null): string {
  if (value === null) return 'n/a';
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  return value.toPrecision(4);
}

function formatPercent(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(2)}%`;
}

function environmentSection(env: BenchmarkEnvironment): string[] {
  return [
    '## Environment',
    '',
    '| Field | Value |',
    '|---|---|',
    `| commit | ${env.commitSha ?? 'n/a'}${env.dirtyWorktree ? ' (dirty worktree)' : ''} |`,
    `| package version | ${env.packageVersion ?? 'n/a'} |`,
    `| browser | Chromium ${env.browser ?? 'n/a'} |`,
    `| os | ${env.os} |`,
    `| cpu | ${env.cpu} |`,
    `| gpu | ${env.gpu ?? 'n/a'} |`,
    `| devicePixelRatio | ${env.devicePixelRatio ?? 'n/a'} |`,
    `| node | ${env.nodeVersion} |`,
    ''
  ];
}

function rowsTable(rows: SampleMetrics[]): string[] {
  const lines = [
    '| Build | FPS | Physics ms/frame | Physics ms/step | Steps/frame | Render ms | Worker ms | Long-task ms | Memory bytes | URL |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|'
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.label} | ${formatNumber(row.fps)} | ${formatNumber(row.physicsMsPerFrame)} | ${formatNumber(row.physicsMsPerStep)} | ${formatNumber(row.stepsAdvanced)} | ${formatNumber(row.renderMsPerFrame)} | ${formatNumber(row.workerLatencyMs)} | ${formatNumber(row.longTaskMs)} | ${formatNumber(row.memoryBytes)} | ${row.url} |`
    );
  }
  return lines;
}

function compareMarkdown(env: BenchmarkEnvironment, rows: SampleMetrics[], comparison: BenchmarkComparison): string {
  const lines = [
    '# Pendulum Lab Benchmark Report (compare mode)',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    ...environmentSection(env),
    `Interleaved sampling: ${comparison.samplesPerBuild} samples per build in one browser process; medians reported, noise floor = max(MAD(original)+MAD(candidate), measurement resolution: 0.1 ms timer quantum, /steps for per-step cost, 50 ms per long task).`,
    '',
    '## Median per build',
    '',
    ...rowsTable(rows),
    '',
    '## Original vs candidate',
    '',
    `Status: ${comparison.status.toUpperCase()}`,
    '',
    '| Metric | Direction | Original | Candidate | Delta | Relative | Noise floor | Status |',
    '|---|---|---:|---:|---:|---:|---:|---|'
  ];
  for (const delta of comparison.deltas) {
    lines.push(
      `| ${delta.metric} | ${delta.direction} | ${formatNumber(delta.original)} | ${formatNumber(delta.candidate)} | ${formatNumber(delta.delta)} | ${formatPercent(delta.relativeDelta)} | ${formatNumber(delta.noiseFloor)} | ${delta.status} |`
    );
  }
  return `${lines.join('\n')}\n`;
}

function profileMarkdown(env: BenchmarkEnvironment, rows: SampleMetrics[], samples: number): string {
  return `${[
    '# Pendulum Lab Benchmark Report (profile mode)',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    ...environmentSection(env),
    `Single-build profile (${samples} samples, medians below). No original-vs-candidate comparison was performed; set ORIGINAL_URL and CANDIDATE_URL to two different builds for compare mode.`,
    '',
    ...rowsTable(rows)
  ].join('\n')}\n`;
}

async function main(): Promise<void> {
  // Mode + validity resolution. A "comparison" of one URL against itself is a
  // measurement-methodology error, so it is rejected rather than reported.
  const compareMode = originalUrl !== null;
  if (compareMode) {
    if (!candidateUrl) {
      throw new Error(
        'Invalid benchmark: ORIGINAL_URL requires CANDIDATE_URL. To profile one deployed build, set only CANDIDATE_URL.'
      );
    }
    if (originalUrl === candidateUrl) {
      throw new Error(
        `Invalid benchmark: ORIGINAL_URL and CANDIDATE_URL are identical (${originalUrl}). Serve the baseline and candidate builds separately (e.g. git worktree + \`vite preview\` on two ports).`
      );
    }
  }

  const profileUrl = candidateUrl ?? `${localDevOrigin}/`;
  const server = compareMode ? null : await ensureLocalProfileServer(profileUrl);
  const browser = await chromium.launch();
  try {
    await mkdir('reports', { recursive: true });
    if (compareMode) {
      await waitForServer(originalUrl!);
      await waitForServer(candidateUrl!);
      const samplesPerBuild = Math.max(3, requestedSamples);
      const originalSamples: SampleMetrics[] = [];
      const candidateSamples: SampleMetrics[] = [];
      for (let i = 0; i < samplesPerBuild; i += 1) {
        // Alternate visit order to cancel warm-up / thermal drift bias.
        const order: Array<{ url: string; label: string; sink: SampleMetrics[] }> =
          i % 2 === 0
            ? [
                { url: originalUrl!, label: 'original', sink: originalSamples },
                { url: candidateUrl!, label: 'candidate', sink: candidateSamples }
              ]
            : [
                { url: candidateUrl!, label: 'candidate', sink: candidateSamples },
                { url: originalUrl!, label: 'original', sink: originalSamples }
              ];
        for (const entry of order) entry.sink.push(await collectSample(browser, entry.url, entry.label, i));
      }
      const environment = await readEnvironment(browser, candidateUrl!);
      const originalAgg = aggregate(originalSamples);
      const candidateAgg = aggregate(candidateSamples);
      const comparison = compare(originalAgg, candidateAgg);
      const results = [
        medianRow('original', originalUrl!, originalAgg),
        medianRow('candidate', candidateUrl!, candidateAgg)
      ];
      const report = {
        schemaVersion: 2,
        mode: 'compare' as const,
        generatedAt: new Date().toISOString(),
        environment,
        results,
        samples: [...originalSamples, ...candidateSamples],
        aggregates: { original: originalAgg, candidate: candidateAgg },
        comparison
      };
      await writeFile('reports/benchmark-report.json', JSON.stringify(report, null, 2));
      const md = compareMarkdown(environment, results, comparison);
      await writeFile('reports/benchmark-report.md', md);
      console.log(md);
      if (failOnRegression && comparison.status === 'warn') {
        throw new Error('Benchmark regression threshold exceeded; see reports/benchmark-report.md');
      }
      return;
    }

    // Profile mode: one build, no comparison claim.
    await waitForServer(profileUrl);
    const samples: SampleMetrics[] = [];
    for (let i = 0; i < requestedSamples; i += 1)
      samples.push(await collectSample(browser, profileUrl, 'candidate', i));
    const environment = await readEnvironment(browser, profileUrl);
    const agg = aggregate(samples);
    const results = [medianRow('candidate', profileUrl, agg)];
    const report = {
      schemaVersion: 2,
      mode: 'profile' as const,
      generatedAt: new Date().toISOString(),
      environment,
      results,
      samples,
      aggregates: { candidate: agg },
      comparison: null
    };
    await writeFile('reports/benchmark-report.json', JSON.stringify(report, null, 2));
    const md = profileMarkdown(environment, results, requestedSamples);
    await writeFile('reports/benchmark-report.md', md);
    console.log(md);
  } finally {
    await browser.close();
    server?.kill();
  }
}

await main();
