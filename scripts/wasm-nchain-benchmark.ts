/**
 * Interleaved oracle/candidate benchmark for the ABI-2 N-chain WASM SIMD tape.
 * Direct baseline run: npx tsx scripts/wasm-nchain-benchmark.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { buildNChainJacobianTape } from '../src/runtime/gpuNChainVariational';
import { buildNChainJacobianTapeWasm, wasmNChainAvailable } from '../src/runtime/wasmNChain';
import type { ChainParameters } from '../src/physics/nPendulum';

export interface NChainTapeWorkload {
  links: number;
  damping: number;
  dt: number;
  steps: number;
  rounds: number;
}

export interface NChainTapeCandidateResult {
  backend: 'wasm-simd';
  tape: Float64Array;
}

export type NChainTapeCandidate = (
  parameters: ChainParameters,
  state: Float64Array,
  damping: number,
  settings: { dt: number; renormEvery: number; forwardTransient: number; window: number }
) => Promise<NChainTapeCandidateResult>;

export interface NChainTapeBenchmarkCase {
  workload: NChainTapeWorkload;
  tapeValues: number;
  cpuTimesMs: number[];
  cpuMedianMs: number;
  cpuTapeValuesPerSecond: number;
  candidateBackend: 'wasm-simd' | 'not-built';
  candidateTimesMs?: number[];
  candidateMedianMs?: number;
  candidateTapeValuesPerSecond?: number;
  speedup?: number;
  maxAbsError?: number;
}

export interface NChainTapeBenchmarkReport {
  schemaVersion: 'wasm-nchain-benchmark/v1';
  generatedAt: string;
  node: string;
  platform: string;
  interleaved: true;
  cases: NChainTapeBenchmarkCase[];
  decision: string;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function maximumAbsoluteError(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let maximum = 0;
  for (let i = 0; i < a.length; i += 1) maximum = Math.max(maximum, Math.abs(Number(a[i]) - Number(b[i])));
  return maximum;
}

function fixture(links: number): { parameters: ChainParameters; state: Float64Array } {
  return {
    parameters: {
      masses: Array.from({ length: links }, (_, i) => 0.8 + i * 0.07),
      lengths: Array.from({ length: links }, (_, i) => 0.72 + i * 0.04),
      g: 9.81
    },
    state: Float64Array.from([
      ...Array.from({ length: links }, (_, i) => 0.45 - i * 0.11),
      ...Array.from({ length: links }, (_, i) => -0.05 + i * 0.017)
    ])
  };
}

export async function benchmarkNChainTapeCase(
  workload: NChainTapeWorkload,
  candidate?: NChainTapeCandidate
): Promise<NChainTapeBenchmarkCase> {
  const { parameters, state } = fixture(workload.links);
  const settings = { dt: workload.dt, renormEvery: 1, forwardTransient: 0, window: workload.steps };
  const cpuTimesMs: number[] = [];
  const candidateTimesMs: number[] = [];
  let oracle: Float64Array<ArrayBufferLike> = new Float64Array(0);
  let maxAbsError = 0;

  // Warm each lane before the interleaved rounds.
  buildNChainJacobianTape(parameters, state, workload.damping, settings);
  if (candidate) await candidate(parameters, state, workload.damping, settings);

  for (let round = 0; round < workload.rounds; round += 1) {
    const cpuStarted = performance.now();
    oracle = buildNChainJacobianTape(parameters, state, workload.damping, settings);
    cpuTimesMs.push(performance.now() - cpuStarted);
    if (candidate) {
      const candidateStarted = performance.now();
      const result = await candidate(parameters, state, workload.damping, settings);
      candidateTimesMs.push(performance.now() - candidateStarted);
      maxAbsError = Math.max(maxAbsError, maximumAbsoluteError(oracle, result.tape));
    }
  }

  const cpuMedianMs = median(cpuTimesMs);
  const tapeValues = oracle.length;
  const base: NChainTapeBenchmarkCase = {
    workload,
    tapeValues,
    cpuTimesMs,
    cpuMedianMs,
    cpuTapeValuesPerSecond: cpuMedianMs > 0 ? tapeValues / (cpuMedianMs / 1000) : 0,
    candidateBackend: candidate ? 'wasm-simd' : 'not-built'
  };
  if (!candidate) return base;
  const candidateMedianMs = median(candidateTimesMs);
  return {
    ...base,
    candidateTimesMs,
    candidateMedianMs,
    candidateTapeValuesPerSecond: candidateMedianMs > 0 ? tapeValues / (candidateMedianMs / 1000) : 0,
    speedup: candidateMedianMs > 0 ? cpuMedianMs / candidateMedianMs : 0,
    maxAbsError
  };
}

export async function runNChainTapeBenchmark(candidate?: NChainTapeCandidate): Promise<NChainTapeBenchmarkReport> {
  const workloads: NChainTapeWorkload[] = [2, 4, 8].map((links) => ({
    links,
    damping: 0.01,
    dt: 0.002,
    steps: 6,
    rounds: 5
  }));
  const cases: NChainTapeBenchmarkCase[] = [];
  for (const workload of workloads) cases.push(await benchmarkNChainTapeCase(workload, candidate));
  return {
    schemaVersion: 'wasm-nchain-benchmark/v1',
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    interleaved: true,
    cases,
    decision: candidate
      ? 'Candidate timings are diagnostic; promotion also requires ADR 0002 numerical and cross-engine gates.'
      : 'No WASM SIMD candidate is built. These are CPU f64 oracle baselines, not acceleration results.'
  };
}

async function main(): Promise<void> {
  const available = await wasmNChainAvailable();
  const candidate: NChainTapeCandidate | undefined = available
    ? async (parameters, state, damping, settings) => {
        const result = await buildNChainJacobianTapeWasm(parameters, state, damping, settings);
        if (result.backend !== 'wasm-simd')
          throw new Error(`WASM N-chain candidate unexpectedly fell back: ${result.caveat}`);
        return { backend: result.backend, tape: result.tape };
      }
    : undefined;
  const report = await runNChainTapeBenchmark(candidate);
  await mkdir('reports', { recursive: true });
  await writeFile('reports/wasm-nchain-baseline.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  for (const entry of report.cases) {
    console.log(
      `N=${entry.workload.links}: CPU median ${entry.cpuMedianMs.toFixed(2)} ms, ${(entry.cpuTapeValuesPerSecond / 1e6).toFixed(2)}M tape values/s`
    );
  }
  console.log(`reports/wasm-nchain-baseline.json written; candidateBackend=${available ? 'wasm-simd' : 'not-built'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
