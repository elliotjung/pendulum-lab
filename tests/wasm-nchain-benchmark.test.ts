import { describe, expect, it } from 'vitest';
import {
  benchmarkNChainTapeCase,
  maximumAbsoluteError,
  median,
  type NChainTapeCandidate
} from '../scripts/wasm-nchain-benchmark';
import { buildNChainJacobianTape } from '../src/runtime/gpuNChainVariational';

describe('N-chain WASM SIMD benchmark contract', () => {
  it('computes stable medians and length-safe absolute errors', () => {
    expect(median([8, 1, 4])).toBe(4);
    expect(median([10, 2, 4, 8])).toBe(6);
    expect(maximumAbsoluteError([1, 2], [1.25, 1.5])).toBe(0.5);
    expect(maximumAbsoluteError([1], [1, 2])).toBe(Number.POSITIVE_INFINITY);
  });

  it('labels an oracle-only run as not built', async () => {
    const result = await benchmarkNChainTapeCase({ links: 2, damping: 0, dt: 0.002, steps: 1, rounds: 1 });
    expect(result.candidateBackend).toBe('not-built');
    expect(result.tapeValues).toBe(16);
    expect(result.cpuMedianMs).toBeGreaterThanOrEqual(0);
  });

  it('accepts an ABI-compatible candidate and pins numerical error', async () => {
    const candidate: NChainTapeCandidate = async (parameters, state, damping, settings) => ({
      backend: 'wasm-simd',
      tape: buildNChainJacobianTape(parameters, state, damping, settings)
    });
    const result = await benchmarkNChainTapeCase({ links: 2, damping: 0.01, dt: 0.002, steps: 1, rounds: 1 }, candidate);
    expect(result.candidateBackend).toBe('wasm-simd');
    expect(result.maxAbsError).toBe(0);
    expect(result.candidateTimesMs).toHaveLength(1);
  });
});
