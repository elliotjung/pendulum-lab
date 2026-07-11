import { describe, expect, it } from 'vitest';
import { runDoublePendulumEnsembleWasm, wasmEnsembleAvailable } from '../src/runtime/wasmEnsemble';
import { energyDouble, rhsDouble } from '../src/physics/double';
import { rk4Step } from '../src/physics/integrators';
import type { PendulumParameters } from '../src/types/domain';

/**
 * Acceleration contract for the WASM ensemble lane, mirroring the philosophy
 * of the GPU contract: the accelerated path must agree with the JS f64 oracle
 * (here at round-off level, since both sides are f64 with the same
 * floating-point grouping; only libm sin/cos differ by <=1 ulp), and the API
 * must fall back to the identical JS loop when the kernel is unavailable.
 */

const PARAMS: PendulumParameters = { m1: 1, m2: 0.8, l1: 1.1, l2: 0.9, g: 9.81 };

function jsOracle(initial: Float64Array, damping: number, steps: number, dt: number): Float64Array {
  const n = initial.length / 4;
  const result = Float64Array.from(initial);
  const state = new Float64Array(4);
  const out = new Float64Array(4);
  const rhs = (s: Float64Array, o: Float64Array): void => {
    rhsDouble(s, PARAMS, damping, o);
  };
  for (let i = 0; i < n; i += 1) {
    state.set(result.subarray(i * 4, i * 4 + 4));
    for (let k = 0; k < steps; k += 1) {
      rk4Step(state, dt, rhs, out);
      state.set(out);
    }
    result.set(state, i * 4);
  }
  return result;
}

function makeEnsemble(n: number): Float64Array {
  const states = new Float64Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    states[i * 4] = 0.3 + 0.001 * i;
    states[i * 4 + 1] = -0.2 + 0.002 * i;
    states[i * 4 + 2] = 0.05;
    states[i * 4 + 3] = -0.04;
  }
  return states;
}

describe('WASM ensemble lane', () => {
  it('loads the committed kernel in Node', async () => {
    expect(await wasmEnsembleAvailable()).toBe(true);
  });

  it('matches the JS f64 oracle at round-off level over a short horizon', async () => {
    const initial = makeEnsemble(16);
    const damping = 0.02;
    const steps = 200;
    const dt = 1e-3;
    const wasm = await runDoublePendulumEnsembleWasm(PARAMS, damping, initial, { steps, dt });
    expect(wasm.backend).toBe('wasm');
    const oracle = jsOracle(initial, damping, steps, dt);
    for (let i = 0; i < initial.length; i += 1) {
      expect(Math.abs(wasm.states[i]! - oracle[i]!)).toBeLessThan(1e-10);
    }
  });

  it('conserves energy without damping (undamped RK4, per member)', async () => {
    const initial = makeEnsemble(8);
    const result = await runDoublePendulumEnsembleWasm(PARAMS, 0, initial, { steps: 500, dt: 1e-3 });
    for (let i = 0; i < 8; i += 1) {
      const before = energyDouble(initial.subarray(i * 4, i * 4 + 4), PARAMS).total;
      const after = energyDouble(result.states.subarray(i * 4, i * 4 + 4), PARAMS).total;
      expect(Math.abs(after - before)).toBeLessThan(1e-6 * Math.max(1, Math.abs(before)));
    }
  });

  it('reuses its memory block across calls (no per-call growth)', async () => {
    const initial = makeEnsemble(32);
    const first = await runDoublePendulumEnsembleWasm(PARAMS, 0, initial, { steps: 10, dt: 1e-3 });
    const second = await runDoublePendulumEnsembleWasm(PARAMS, 0, initial, { steps: 10, dt: 1e-3 });
    expect(first.backend).toBe('wasm');
    expect(second.backend).toBe('wasm');
    for (let i = 0; i < initial.length; i += 1) {
      expect(second.states[i]).toBe(first.states[i]);
    }
  });

  it('falls back to the identical JS loop when forced', async () => {
    const initial = makeEnsemble(4);
    const forced = await runDoublePendulumEnsembleWasm(PARAMS, 0.05, initial, { steps: 50, dt: 2e-3, forceCpu: true });
    expect(forced.backend).toBe('cpu');
    const oracle = jsOracle(initial, 0.05, 50, 2e-3);
    for (let i = 0; i < initial.length; i += 1) {
      expect(forced.states[i]).toBe(oracle[i]);
    }
  });

  it('rejects a state buffer that is not packed in quadruples', async () => {
    await expect(runDoublePendulumEnsembleWasm(PARAMS, 0, new Float64Array(5), { steps: 1, dt: 1e-3 })).rejects.toThrow(
      /multiple of 4/
    );
  });
});
