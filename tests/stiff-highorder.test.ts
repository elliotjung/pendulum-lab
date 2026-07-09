import { describe, expect, test } from 'vitest';
import { step, eulerStep } from '../src/physics/integrators';
import { bulirschStoerStep } from '../src/physics/adaptive';
import { trBdf2Step } from '../src/physics/stiff';

function oscillator(state: Float64Array, out: Float64Array): void {
  out[0] = state[1] ?? 0;
  out[1] = -(state[0] ?? 0);
}

// Stiff linear decay y' = -lambda y, exact solution y = y0 e^{-lambda t}.
function decay(lambda: number) {
  return (state: Float64Array, out: Float64Array): void => {
    out[0] = -lambda * (state[0] ?? 0);
  };
}

describe('Gragg-Bulirsch-Stoer extrapolation (high-order)', () => {
  test('single macro-step reaches near machine precision where RK4 does not', () => {
    const state = new Float64Array([1, 0]);
    const H = 0.2;
    const gbs = bulirschStoerStep(state, H, oscillator, 6);
    const rk = new Float64Array(2);
    step('rk4', state, H, oscillator, rk);
    const exact0 = Math.cos(H);
    const gbsErr = Math.abs((gbs.y[0] ?? 0) - exact0);
    const rkErr = Math.abs((rk[0] ?? 0) - exact0);
    // GBS is at the round-off floor while RK4 carries a visible truncation error.
    expect(gbsErr).toBeLessThan(1e-12);
    expect(gbsErr).toBeLessThan(rkErr / 1e6);
    expect(Number.isFinite(gbs.error)).toBe(true);
    expect(gbs.error).toBeGreaterThanOrEqual(0);
  });

  test('high extrapolation order: halving the macro-step crushes the error super-linearly', () => {
    // Use kMax = 3 (effective order ~6) and a large step so the truncation error
    // stays well above the round-off floor and the convergence ratio is clean.
    const T = 1.2;
    const errAt = (H: number): number => {
      const y = new Float64Array([1, 0]);
      for (let i = 0; i < Math.round(T / H); i += 1) y.set(bulirschStoerStep(y, H, oscillator, 3).y);
      return Math.hypot((y[0] ?? 0) - Math.cos(T), (y[1] ?? 0) + Math.sin(T));
    };
    const order = Math.log2(errAt(0.4) / errAt(0.2));
    expect(order).toBeGreaterThan(5);
  });

  test('routes through step() as the gbs method', () => {
    const state = new Float64Array([1, 0]);
    const out = new Float64Array(2);
    const err = { value: 0 };
    step('gbs', state, 0.1, oscillator, out, { previousError: err });
    expect(Math.abs((out[0] ?? 0) - Math.cos(0.1))).toBeLessThan(1e-9);
  });
});

describe('Dormand-Prince 5(4) via step()', () => {
  test('dopri5 advances accurately and exports an error estimate', () => {
    const state = new Float64Array([1, 0]);
    const out = new Float64Array(2);
    const err = { value: 0 };
    step('dopri5', state, 0.05, oscillator, out, { previousError: err });
    expect(Math.abs((out[0] ?? 0) - Math.cos(0.05))).toBeLessThan(1e-7);
    expect(err.value).toBeGreaterThan(0);
  });
});

describe('DOP853 high-order reference via step()', () => {
  test('dop853 advances a large oscillator step at near reference accuracy', () => {
    const state = new Float64Array([1, 0]);
    const dop = new Float64Array(2);
    const dp5 = new Float64Array(2);
    const err = { value: 0 };
    step('dop853', state, 0.2, oscillator, dop, { previousError: err });
    step('dopri5', state, 0.2, oscillator, dp5);
    const exact = new Float64Array([Math.cos(0.2), -Math.sin(0.2)]);
    const dopErr = Math.hypot((dop[0] ?? 0) - exact[0]!, (dop[1] ?? 0) - exact[1]!);
    const dp5Err = Math.hypot((dp5[0] ?? 0) - exact[0]!, (dp5[1] ?? 0) - exact[1]!);

    expect(dopErr).toBeLessThan(1e-11);
    expect(dopErr).toBeLessThan(dp5Err / 100);
    expect(err.value).toBeGreaterThan(0);
  });
});

describe('TR-BDF2 stiff solver', () => {
  test('is L-stable: a violently stiff mode decays where explicit Euler explodes', () => {
    const rhs = decay(1000);
    const dt = 0.1; // dt * lambda = 100, far outside any explicit stability region

    const stiffState = new Float64Array([1]);
    const stiffOut = new Float64Array(1);
    for (let i = 0; i < 50; i += 1) {
      trBdf2Step(stiffState, dt, rhs, stiffOut);
      stiffState.set(stiffOut);
      // Each step must contract, never amplify.
      expect(Math.abs(stiffState[0] ?? 1)).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(stiffState[0] ?? 1)).toBeLessThan(1e-3);

    const eulerState = new Float64Array([1]);
    const eulerOut = new Float64Array(1);
    for (let i = 0; i < 50; i += 1) {
      eulerStep(eulerState, dt, rhs, eulerOut);
      eulerState.set(eulerOut);
    }
    expect(Math.abs(eulerState[0] ?? 0)).toBeGreaterThan(1e6);
  });

  test('is second order on a non-stiff decay problem', () => {
    const rhs = decay(1);
    const T = 1;
    const run = (dt: number): number => {
      const state = new Float64Array([1]);
      const out = new Float64Array(1);
      for (let i = 0; i < Math.round(T / dt); i += 1) {
        trBdf2Step(state, dt, rhs, out);
        state.set(out);
      }
      return Math.abs((state[0] ?? 0) - Math.exp(-T));
    };
    const order = Math.log2(run(0.05) / run(0.025));
    expect(order).toBeGreaterThan(1.8);
    expect(order).toBeLessThan(2.4);
  });
});
