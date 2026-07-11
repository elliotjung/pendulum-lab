/**
 * Honest A/B benchmark of the WASM ensemble kernel against the identical JS
 * f64 loop, interleaved in one process (JS, WASM, JS, WASM, ...) so JIT
 * warm-up and thermal drift hit both sides. Reports medians and the speedup
 * ratio; writes reports/wasm-benchmark.json.
 *
 * Run: npm run benchmark:wasm
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { runDoublePendulumEnsembleWasm, wasmEnsembleAvailable } from '../src/runtime/wasmEnsemble';
import type { PendulumParameters } from '../src/types/domain';

const PARAMS: PendulumParameters = { m1: 1, m2: 0.8, l1: 1.1, l2: 0.9, g: 9.81 };
const DAMPING = 0.01;
const N = 4096;
const STEPS = 400;
const DT = 1e-3;
const ROUNDS = 7;

function makeEnsemble(n: number): Float64Array {
  const states = new Float64Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    states[i * 4] = 0.4 + 0.0001 * i;
    states[i * 4 + 1] = -0.25 + 0.0002 * i;
    states[i * 4 + 2] = 0.02;
    states[i * 4 + 3] = -0.03;
  }
  return states;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

async function main(): Promise<void> {
  if (!(await wasmEnsembleAvailable())) {
    console.error('WASM kernel unavailable; nothing to benchmark.');
    process.exitCode = 1;
    return;
  }
  const initial = makeEnsemble(N);
  const jsTimes: number[] = [];
  const wasmTimes: number[] = [];

  // Warm-up both paths once (JIT tiers, kernel instantiation, memory block).
  await runDoublePendulumEnsembleWasm(PARAMS, DAMPING, initial, { steps: STEPS, dt: DT, forceCpu: true });
  await runDoublePendulumEnsembleWasm(PARAMS, DAMPING, initial, { steps: STEPS, dt: DT });

  for (let round = 0; round < ROUNDS; round += 1) {
    const js = await runDoublePendulumEnsembleWasm(PARAMS, DAMPING, initial, { steps: STEPS, dt: DT, forceCpu: true });
    jsTimes.push(js.elapsedMs);
    const wasm = await runDoublePendulumEnsembleWasm(PARAMS, DAMPING, initial, { steps: STEPS, dt: DT });
    if (wasm.backend !== 'wasm') throw new Error('WASM path unexpectedly fell back mid-benchmark.');
    wasmTimes.push(wasm.elapsedMs);
  }

  const jsMedian = median(jsTimes);
  const wasmMedian = median(wasmTimes);
  const speedup = jsMedian / wasmMedian;
  const stepsPerSecond = (N * STEPS) / (wasmMedian / 1000);

  const report = {
    schemaVersion: 'wasm-benchmark/v1',
    generatedAt: new Date().toISOString(),
    workload: { n: N, steps: STEPS, dt: DT, rounds: ROUNDS, interleaved: true },
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    jsMedianMs: jsMedian,
    wasmMedianMs: wasmMedian,
    speedup,
    wasmTrajectoryStepsPerSecond: stepsPerSecond,
    jsTimesMs: jsTimes,
    wasmTimesMs: wasmTimes
  };

  await mkdir('reports', { recursive: true });
  await writeFile('reports/wasm-benchmark.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(
    `WASM ensemble benchmark (N=${N}, steps=${STEPS}, ${ROUNDS} interleaved rounds):\n` +
      `  JS   median ${jsMedian.toFixed(1)} ms\n` +
      `  WASM median ${wasmMedian.toFixed(1)} ms\n` +
      `  speedup x${speedup.toFixed(2)} (${(stepsPerSecond / 1e6).toFixed(1)}M trajectory-steps/s)\n` +
      `reports/wasm-benchmark.json written`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
