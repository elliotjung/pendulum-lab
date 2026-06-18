import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const url = process.env.WEBGPU_VALIDATION_URL ?? 'http://127.0.0.1:5173/';
const channel = process.env.WEBGPU_BROWSER_CHANNEL ?? 'chrome';

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
  const args = process.platform === 'win32'
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

const generatedAt = new Date().toISOString();
let server: ChildProcess | null = null;
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
let status: 'pass' | 'fail' = 'fail';
let payload: Record<string, unknown> = {};

interface WebGpuHardwareReport {
  schemaVersion: 'pendulum-webgpu-hardware-validation/v1';
  generatedAt: string;
  channel: string;
  url: string;
  status: 'pass' | 'fail';
  backend?: string;
  comparison?: {
    passed?: boolean;
    maxMeanAbsDiff?: number;
    maxCovarianceAbsDiff?: number;
    rmsSpreadAbsDiff?: number;
  };
  rmsSpreadGpu?: number;
  rmsSpreadCpu?: number;
  n?: number;
  error?: string;
}

try {
  server = await ensureServer();
  browser = await chromium.launch({
    channel,
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UnsafeWebGPU']
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  payload = await page.evaluate(async () => {
    const gpuApi = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown | null> } }).gpu;
    if (!gpuApi) {
      throw new Error('navigator.gpu unavailable; this runner is not a WebGPU hardware target.');
    }
    const adapter = await gpuApi.requestAdapter();
    if (!adapter) {
      throw new Error('navigator.gpu.requestAdapter() returned null.');
    }
    const modulePath = '/src/runtime/gpuEnsemble.ts';
    const mod = await import(/* @vite-ignore */ modulePath) as typeof import('../src/runtime/gpuEnsemble');
    const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
    const initial = mod.ensembleGrid(5, [-1.1, 1.1]);
    const gpuRun = await mod.runDoublePendulumEnsemble(params, initial, { steps: 80, dt: 0.01 });
    const cpu = await mod.runDoublePendulumEnsemble(params, initial, { steps: 80, dt: 0.01, forceCpu: true });
    const gpuStats = await mod.webgpuEnsembleStatistics(gpuRun.states);
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
      backend: gpuRun.backend,
      comparison,
      rmsSpreadGpu: gpuStats.rmsSpread,
      rmsSpreadCpu: cpuStats.rmsSpread,
      n: gpuStats.n
    };
  });
  status = (payload.backend === 'webgpu' && (payload.comparison as { passed?: boolean } | undefined)?.passed) ? 'pass' : 'fail';
} catch (error) {
  payload = { error: error instanceof Error ? error.message : String(error) };
} finally {
  await browser?.close().catch(() => undefined);
  stopServer(server);
}

await mkdir('reports', { recursive: true });
const report: WebGpuHardwareReport = {
  schemaVersion: 'pendulum-webgpu-hardware-validation/v1',
  generatedAt,
  channel,
  url,
  status,
  ...(payload as Partial<WebGpuHardwareReport>)
};
await writeFile('reports/webgpu-hardware-validation.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const comparison = report.comparison;
const lines = [
  '# WebGPU Hardware Validation',
  '',
  `Generated: ${generatedAt}`,
  '',
  `Status: **${status}**`,
  '',
  `Browser channel: \`${channel}\``,
  '',
  `Backend: \`${String(report.backend ?? 'n/a')}\``,
  '',
  '| Metric | Value |',
  '|---|---:|',
  `| n | ${String(report.n ?? 'n/a')} |`,
  `| rmsSpread GPU | ${typeof report.rmsSpreadGpu === 'number' ? report.rmsSpreadGpu.toPrecision(8) : 'n/a'} |`,
  `| rmsSpread CPU | ${typeof report.rmsSpreadCpu === 'number' ? report.rmsSpreadCpu.toPrecision(8) : 'n/a'} |`,
  `| max mean diff | ${comparison?.maxMeanAbsDiff?.toExponential(3) ?? 'n/a'} |`,
  `| max covariance diff | ${comparison?.maxCovarianceAbsDiff?.toExponential(3) ?? 'n/a'} |`,
  `| rms spread diff | ${comparison?.rmsSpreadAbsDiff?.toExponential(3) ?? 'n/a'} |`,
  '',
  status === 'pass'
    ? 'The on-device WebGPU ensemble reduction matched the CPU f64 oracle within the declared f32 tolerances.'
    : `Failure: ${String(report.error ?? 'comparison failed')}`,
  ''
];
await writeFile('reports/webgpu-hardware-validation.md', lines.join('\n'), 'utf8');
console.log(lines.join('\n'));
if (status !== 'pass') process.exitCode = 1;
