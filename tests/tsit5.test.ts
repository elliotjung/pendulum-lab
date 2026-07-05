import { describe, expect, test } from 'vitest';
import { tsitouras54Step, dormandPrince54Step } from '../src/physics/adaptive';
import { step } from '../src/physics/integrators';
import type { StateVector } from '../src/physics/types';

/**
 * Tsitouras 5(4) — the DifferentialEquations.jl default pair adopted into the
 * integrator registry. The convergence-order check is the transcription
 * guard: any wrong tableau entry collapses the measured order well below 5.
 */

function oscillator(state: Float64Array, out: Float64Array): void {
  out[0] = state[1] ?? 0;
  out[1] = -(state[0] ?? 0);
}

function integrateError(dt: number, T: number): number {
  const steps = Math.round(T / dt);
  let state: StateVector = new Float64Array([1, 0]);
  for (let i = 0; i < steps; i += 1) {
    state = tsitouras54Step(state, dt, oscillator).y;
  }
  return Math.hypot((state[0] ?? 0) - Math.cos(T), (state[1] ?? 0) + Math.sin(T));
}

describe('tsitouras54Step', () => {
  test('converges at 5th order on the harmonic oscillator', () => {
    const e1 = integrateError(0.1, 2);
    const e2 = integrateError(0.05, 2);
    const measured = Math.log2(e1 / e2);
    expect(measured).toBeGreaterThan(4.4);
    expect(measured).toBeLessThan(5.8);
  });

  test('is at least as accurate as Dormand-Prince 5(4) at equal cost on the oscillator', () => {
    // Both are 7-stage FSAL order-5 pairs; Tsit5's re-optimised coefficients
    // give smaller leading error terms — the reason DiffEq.jl made it the
    // default. Same steps, same dt, direct error comparison.
    const T = 2 * Math.PI;
    const dt = 0.1;
    const steps = Math.round(T / dt);
    let ts: StateVector = new Float64Array([1, 0]);
    let dp: StateVector = new Float64Array([1, 0]);
    for (let i = 0; i < steps; i += 1) {
      ts = tsitouras54Step(ts, dt, oscillator).y;
      dp = dormandPrince54Step(dp, dt, oscillator).y;
    }
    const tsError = Math.hypot((ts[0] ?? 0) - 1, ts[1] ?? 0);
    const dpError = Math.hypot((dp[0] ?? 0) - 1, dp[1] ?? 0);
    expect(tsError).toBeLessThan(dpError);
  });

  test('embedded error estimate scales as dt^5 (order-4 embedded pair)', () => {
    const state = new Float64Array([1, 0]);
    const errCoarse = tsitouras54Step(state, 0.2, oscillator).error;
    const errFine = tsitouras54Step(state, 0.1, oscillator).error;
    expect(errCoarse).toBeGreaterThan(0);
    expect(errFine).toBeGreaterThan(0);
    const ratio = errCoarse / errFine;
    // btilde weights are order-5 accurate per step: halving dt divides the
    // estimate by ~2^5 = 32.
    expect(ratio).toBeGreaterThan(16);
    expect(ratio).toBeLessThan(64);
  });

  test('does not mutate the input state and dispatches identically through step()', () => {
    const state = new Float64Array([0.7, -0.3]);
    const before = Array.from(state);
    const direct = tsitouras54Step(state, 0.01, oscillator);
    expect(Array.from(state)).toEqual(before);

    const viaRegistry = new Float64Array(2);
    const previousError = { value: NaN };
    step('tsit5', state, 0.01, oscillator, viaRegistry, { previousError });
    expect(Array.from(viaRegistry)).toEqual(Array.from(direct.y));
    expect(previousError.value).toBe(direct.error);
  });
});
