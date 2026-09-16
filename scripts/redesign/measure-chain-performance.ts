/** S10 local characterization only; no claim about another browser or device. */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { defaultChainConfig, createChainSimulation } from '../../src/product/adapters/physics/chain';
const rows = [];
for (const n of [1, 3, 4, 16, 64, 128]) {
  const config = { ...defaultChainConfig('system:chain', n), duration: 0.1 };
  const started = performance.now();
  const run = createChainSimulation(config);
  const initializationMs = performance.now() - started;
  const times = [];
  for (let i = 0; i < 50; i++) {
    const before = performance.now();
    run.step();
    times.push(performance.now() - before);
  }
  const sorted = [...times].sort((a, b) => a - b);
  rows.push({
    n,
    initializationMs,
    steps: 50,
    medianStepMs: sorted[25],
    maxStepMs: Math.max(...times),
    totalStepMs: times.reduce((a, b) => a + b, 0),
    serializedSampleBytes: Buffer.byteLength(JSON.stringify(run.snapshot())),
    denseWorkspaceFloat64Bytes: 8 * (2 * n * n + 2 * n),
    finalTime: run.snapshot().time,
    finalEnergy: run.snapshot().energy.total
  });
}
const report = {
  schema: 'pendulum-s10-performance/v1',
  timestamp: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  cpu: cpus()[0]?.model,
  method:
    'RK4, 50 steps at dt=0.002 s; existing chain kernel with per-run workspace. Node timing, not browser FPS. Snapshot bytes are JSON size, not heap usage.',
  rows
};
const destination = process.argv[2] ?? 'tmp/S10-performance.json';
writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
