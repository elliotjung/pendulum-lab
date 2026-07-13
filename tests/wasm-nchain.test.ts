import { describe, expect, it } from 'vitest';
import { buildNChainJacobianTape } from '../src/runtime/gpuNChainVariational';
import {
  buildNChainJacobianTapeWasm,
  wasmNChainAvailable,
  wasmSimdSupported,
  type WasmNChainTapeSettings
} from '../src/runtime/wasmNChain';
import type { ChainParameters } from '../src/physics/nPendulum';

const SETTINGS: WasmNChainTapeSettings = { dt: 0.0015, renormEvery: 1, forwardTransient: 0, window: 2 };

function fixture(links: number): { parameters: ChainParameters; state: Float64Array } {
  return {
    parameters: {
      masses: Array.from({ length: links }, (_, index) => 0.75 + index * 0.09),
      lengths: Array.from({ length: links }, (_, index) => 0.68 + index * 0.06),
      g: 9.81
    },
    state: Float64Array.from([
      ...Array.from({ length: links }, (_, index) => 0.42 - index * 0.13),
      ...Array.from({ length: links }, (_, index) => -0.06 + index * 0.021)
    ])
  };
}

function maximumAbsoluteError(left: ArrayLike<number>, right: ArrayLike<number>): number {
  let maximum = 0;
  for (let index = 0; index < left.length; index += 1) maximum = Math.max(maximum, Math.abs(Number(left[index]) - Number(right[index])));
  return maximum;
}

describe('N-chain WASM SIMD candidate', () => {
  it('passes the explicit SIMD feature probe and versioned kernel load in Node', async () => {
    expect(wasmSimdSupported()).toBe(true);
    expect(await wasmNChainAvailable()).toBe(true);
  });

  for (const links of [1, 2, 3, 4, 8]) {
    it(`matches the f64 central-difference tape oracle for N=${links}`, async () => {
      const { parameters, state } = fixture(links);
      for (const damping of [0, 0.025]) {
        const oracle = buildNChainJacobianTape(parameters, state, damping, SETTINGS);
        const candidate = await buildNChainJacobianTapeWasm(parameters, state, damping, SETTINGS);
        expect(candidate.backend).toBe('wasm-simd');
        expect(candidate.abiVersion).toBe(2);
        expect(candidate.promoted).toBe(false);
        expect(candidate.tape).toHaveLength(oracle.length);
        expect(maximumAbsoluteError(candidate.tape, oracle)).toBeLessThan(2e-8);
      }
    });
  }

  it('keeps agreement for an ill-conditioned but valid chain configuration', async () => {
    const parameters: ChainParameters = {
      masses: [0.08, 0.4, 1.7],
      lengths: [0.07, 0.55, 2.2],
      g: 9.81
    };
    const state = Float64Array.from([0.001, 0.00102, 0.00097, 0.7, -0.4, 0.2]);
    const oracle = buildNChainJacobianTape(parameters, state, 0.015, SETTINGS);
    const candidate = await buildNChainJacobianTapeWasm(parameters, state, 0.015, SETTINGS);
    expect(candidate.backend).toBe('wasm-simd');
    expect(maximumAbsoluteError(candidate.tape, oracle)).toBeLessThan(5e-7);
  });

  it('falls back to the exact CPU tape when explicitly forced', async () => {
    const { parameters, state } = fixture(3);
    const oracle = buildNChainJacobianTape(parameters, state, 0.01, SETTINGS);
    const result = await buildNChainJacobianTapeWasm(parameters, state, 0.01, { ...SETTINGS, forceCpu: true });
    expect(result.backend).toBe('cpu');
    expect(result.tape).toEqual(oracle);
  });

  it('rejects states outside the ABI-2 N<=8 contract', async () => {
    const { parameters } = fixture(8);
    await expect(buildNChainJacobianTapeWasm(parameters, new Float64Array(15), 0, SETTINGS)).rejects.toThrow(/does not match/);
    const tooMany = fixture(9);
    await expect(buildNChainJacobianTapeWasm(tooMany.parameters, tooMany.state, 0, SETTINGS)).rejects.toThrow(/limited to 8/);
  });
});
