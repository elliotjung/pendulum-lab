import { describe, expect, test } from 'vitest';
import {
  eulerStep,
  leapfrogStep,
  symplecticEulerStep,
  yoshida4Step,
  yoshida6Step,
  yoshida8Step,
  rkf45Step,
  gaussLegendre4Step,
  gaussLegendre6Step,
  rk4Step
} from '../src/physics/integrators';
import {
  dormandPrince54Step,
  adaptiveStep,
  integrateAdaptive,
  richardsonStep
} from '../src/physics/adaptive';

type Stepper = (state: Float64Array, dt: number, rhs: (s: Float64Array, o: Float64Array) => void, out: Float64Array) => Float64Array;

// Harmonic oscillator y = [x, v], x' = v, v' = -x. Exact: x = cos t, v = -sin t.
function oscillator(state: Float64Array, out: Float64Array): void {
  out[0] = state[1] ?? 0;
  out[1] = -(state[0] ?? 0);
}

function integrate(stepper: Stepper, dt: number, T: number): Float64Array {
  const steps = Math.round(T / dt);
  const state = new Float64Array([1, 0]);
  const out = new Float64Array(2);
  for (let i = 0; i < steps; i += 1) {
    stepper(state, dt, oscillator, out);
    state.set(out);
  }
  return state;
}

function globalError(stepper: Stepper, dt: number, T: number): number {
  const y = integrate(stepper, dt, T);
  return Math.hypot((y[0] ?? 0) - Math.cos(T), (y[1] ?? 0) + Math.sin(T));
}

// Empirical convergence order from two step sizes: log2(err(dt)/err(dt/2)).
function empiricalOrder(stepper: Stepper, dt: number, T: number): number {
  const e1 = globalError(stepper, dt, T);
  const e2 = globalError(stepper, dt / 2, T);
  return Math.log2(e1 / e2);
}

function energy(state: Float64Array): number {
  return 0.5 * ((state[0] ?? 0) ** 2 + (state[1] ?? 0) ** 2);
}

describe('symplectic integrators are properly implemented (no longer RK4 fallbacks)', () => {
  test('semi-implicit Euler keeps energy bounded where explicit Euler blows up', () => {
    const dt = 0.05;
    const T = 200; // ~32 periods
    const state = new Float64Array([1, 0]);
    const out = new Float64Array(2);
    let maxSymp = 0;
    for (let i = 0; i < Math.round(T / dt); i += 1) {
      symplecticEulerStep(state, dt, oscillator, out);
      state.set(out);
      maxSymp = Math.max(maxSymp, Math.abs(energy(state) - 0.5));
    }
    const euler = integrate(eulerStep, dt, T);
    // Symplectic Euler bounded near 0.5; explicit Euler energy grows far past it.
    expect(maxSymp).toBeLessThan(0.05);
    expect(energy(euler)).toBeGreaterThan(2);
  });

  test('leapfrog is second order', () => {
    expect(empiricalOrder(leapfrogStep, 0.05, 4)).toBeGreaterThan(1.8);
  });

  test('Yoshida 4 is fourth order and beats leapfrog', () => {
    expect(empiricalOrder(yoshida4Step, 0.05, 4)).toBeGreaterThan(3.7);
    expect(globalError(yoshida4Step, 0.02, 4)).toBeLessThan(globalError(leapfrogStep, 0.02, 4));
  });

  test('Yoshida 6/8 triple-jump compositions reach their designed orders', () => {
    // Coarser probes keep the eighth-order error above floating-point roundoff.
    expect(empiricalOrder(yoshida6Step, 0.2, 4)).toBeGreaterThan(5.5);
    expect(empiricalOrder(yoshida8Step, 0.35, 4.2)).toBeGreaterThan(7.2);
    expect(globalError(yoshida8Step, 0.2, 4)).toBeLessThan(globalError(yoshida6Step, 0.2, 4));
  });
});

describe('Gauss-Legendre implicit collocation', () => {
  test('2-stage method achieves order 4', () => {
    expect(empiricalOrder(gaussLegendre4Step, 0.1, 4)).toBeGreaterThan(3.7);
  });

  test('3-stage method achieves order 6', () => {
    // Larger dt so the error stays above roundoff for the ratio measurement.
    expect(empiricalOrder(gaussLegendre6Step, 0.25, 4)).toBeGreaterThan(5.5);
  });

  test('Gauss-Legendre 4 conserves oscillator energy over many periods', () => {
    const dt = 0.1;
    const T = 200;
    const state = new Float64Array([1, 0]);
    const out = new Float64Array(2);
    let maxDev = 0;
    for (let i = 0; i < Math.round(T / dt); i += 1) {
      gaussLegendre4Step(state, dt, oscillator, out);
      state.set(out);
      maxDev = Math.max(maxDev, Math.abs(energy(state) - 0.5));
    }
    expect(maxDev).toBeLessThan(1e-6);
  });
});

describe('embedded / adaptive solvers', () => {
  test('RKF45 reports an error estimate that shrinks at ~5th order', () => {
    const stateA = new Float64Array([1, 0]);
    const stateB = new Float64Array([1, 0]);
    const out = new Float64Array(2);
    const errA = { value: 0 };
    const errB = { value: 0 };
    rkf45Step(stateA, 0.1, oscillator, out, { previousError: errA });
    rkf45Step(stateB, 0.05, oscillator, out, { previousError: errB });
    // Halving dt should reduce the local error estimate by roughly 2^6 (one step).
    expect(errA.value / errB.value).toBeGreaterThan(20);
  });

  test('Dormand-Prince 5(4) single step matches RK4 closely and provides error', () => {
    const state = new Float64Array([1, 0]);
    const { y, error } = dormandPrince54Step(state, 0.05, oscillator);
    const rk = new Float64Array(2);
    rk4Step(state, 0.05, oscillator, rk);
    expect(Math.abs((y[0] ?? 0) - (rk[0] ?? 0))).toBeLessThan(1e-6);
    expect(error).toBeGreaterThan(0);
    expect(error).toBeLessThan(1e-4);
  });

  test('adaptiveStep accepts an easy step and rejects an over-large one', () => {
    const state = new Float64Array([1, 0]);
    const easy = adaptiveStep(state, 1e-3, oscillator, { absTol: 1e-6, relTol: 1e-6 });
    expect(easy.accepted).toBe(true);
    const hard = adaptiveStep(state, 1.5, oscillator, { absTol: 1e-10, relTol: 1e-10 });
    expect(hard.accepted).toBe(false);
    expect(hard.nextDt).toBeLessThan(hard.dt);
  });

  test('integrateAdaptive reaches the target time accurately', () => {
    const T = 10;
    const { y, accepted, rejected } = integrateAdaptive(new Float64Array([1, 0]), T, oscillator, {
      absTol: 1e-9,
      relTol: 1e-9
    });
    expect(accepted).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThanOrEqual(0);
    expect(Math.hypot((y[0] ?? 0) - Math.cos(T), (y[1] ?? 0) + Math.sin(T))).toBeLessThan(1e-5);
  });
});

describe('Richardson extrapolation', () => {
  test('lifts RK2 toward an order-3 local estimate', () => {
    const baseOrder = 2;
    const state = new Float64Array([1, 0]);
    const dt = 0.1;
    const plain = new Float64Array(2);
    // Reference: RK2 one full step.
    const rk2 = (s: Float64Array, d: number, r: (a: Float64Array, b: Float64Array) => void, o: Float64Array) => {
      const k1 = new Float64Array(2);
      const k2 = new Float64Array(2);
      const tmp = new Float64Array(2);
      r(s, k1);
      tmp[0] = (s[0] ?? 0) + 0.5 * d * (k1[0] ?? 0);
      tmp[1] = (s[1] ?? 0) + 0.5 * d * (k1[1] ?? 0);
      r(tmp, k2);
      o[0] = (s[0] ?? 0) + d * (k2[0] ?? 0);
      o[1] = (s[1] ?? 0) + d * (k2[1] ?? 0);
      return o;
    };
    rk2(state, dt, oscillator, plain);
    const { y, error } = richardsonStep(rk2, baseOrder, state, dt, oscillator);
    const exactX = Math.cos(dt);
    const plainErr = Math.abs((plain[0] ?? 0) - exactX);
    const richErr = Math.abs((y[0] ?? 0) - exactX);
    expect(richErr).toBeLessThan(plainErr);
    expect(error).toBeGreaterThan(0);
  });
});
