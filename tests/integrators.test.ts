import { describe, expect, test } from 'vitest';
import { eulerStep, integratorRegistry, rk2Step, rk4Step, step } from '../src/physics/integrators';
import type { IntegratorId } from '../src/types/domain';

function oscillator(state: Float64Array, out: Float64Array): void {
  out[0] = state[1] ?? 0;
  out[1] = -(state[0] ?? 0);
}

function integrate(stepper: typeof rk4Step, dt: number, steps: number): Float64Array {
  const state = new Float64Array([1, 0]);
  const out = new Float64Array(2);
  for (let i = 0; i < steps; i += 1) {
    stepper(state, dt, oscillator, out);
    state.set(out);
  }
  return state;
}

describe('integrators', () => {
  test('RK4 is substantially more accurate than Euler on a harmonic oscillator', () => {
    const dt = 0.01;
    const steps = Math.round((2 * Math.PI) / dt);
    const elapsed = dt * steps;
    const euler = integrate(eulerStep, dt, steps);
    const rk4 = integrate(rk4Step, dt, steps);
    const exact0 = Math.cos(elapsed);
    const exact1 = -Math.sin(elapsed);
    const eulerError = Math.hypot((euler[0] ?? 0) - exact0, (euler[1] ?? 0) - exact1);
    const rk4Error = Math.hypot((rk4[0] ?? 0) - exact0, (rk4[1] ?? 0) - exact1);
    expect(rk4Error).toBeLessThan(eulerError / 100);
  });

  test('RK2 converges between Euler and RK4 for a smooth oscillator', () => {
    const dt = 0.02;
    const steps = Math.round(1 / dt);
    const euler = integrate(eulerStep, dt, steps);
    const rk2 = integrate(rk2Step, dt, steps);
    const rk4 = integrate(rk4Step, dt, steps);
    const exact0 = Math.cos(1);
    const exact1 = -Math.sin(1);
    const eulerError = Math.hypot((euler[0] ?? 0) - exact0, (euler[1] ?? 0) - exact1);
    const rk2Error = Math.hypot((rk2[0] ?? 0) - exact0, (rk2[1] ?? 0) - exact1);
    const rk4Error = Math.hypot((rk4[0] ?? 0) - exact0, (rk4[1] ?? 0) - exact1);
    expect(rk2Error).toBeLessThan(eulerError);
    expect(rk4Error).toBeLessThan(rk2Error);
  });

  test('verlet remains a legacy alias for leapfrog', () => {
    const source = new Float64Array([0.2, -0.1, 0.01, -0.02]);
    const verlet = new Float64Array(4);
    const leapfrog = new Float64Array(4);
    const rhs = (state: Float64Array, out: Float64Array): void => {
      out[0] = state[2] ?? 0;
      out[1] = state[3] ?? 0;
      out[2] = -(state[0] ?? 0);
      out[3] = -(state[1] ?? 0);
    };
    step('verlet', source, 0.01, rhs, verlet);
    step('leapfrog', source, 0.01, rhs, leapfrog);
    expect(Array.from(verlet)).toEqual(Array.from(leapfrog));
  });

  test('every registered integrator is a callable public method with coherent metadata', () => {
    const methods = Object.keys(integratorRegistry) as IntegratorId[];
    expect(methods).toEqual([
      'euler',
      'rk2',
      'rk4',
      'verlet',
      'leapfrog',
      'symplectic',
      'yoshida4',
      'hmidpoint',
      'gauss2',
      'rkf45',
      'dopri5',
      'gbs',
      'bdf2'
    ]);

    for (const method of methods) {
      const meta = integratorRegistry[method];
      expect(meta.id).toBe(method);
      expect(meta.name.length).toBeGreaterThan(2);
      expect(meta.stabilityNotes.length).toBeGreaterThan(0);
      expect(meta.recommendedDt[0]).toBeGreaterThan(0);
      expect(meta.recommendedDt[1]).toBeGreaterThan(meta.recommendedDt[0]);

      const state = new Float64Array([0.25, -0.4]);
      const before = Array.from(state);
      const out = new Float64Array(2);
      const previousError = { value: NaN };
      step(method, state, 1e-3, oscillator, out, { previousError, tolerance: 1e-12 });
      expect(Array.from(state)).toEqual(before);
      expect(Number.isFinite(out[0])).toBe(true);
      expect(Number.isFinite(out[1])).toBe(true);
      expect(Math.hypot(out[0]!, out[1]!)).toBeGreaterThan(0);
    }
  });

  test('unknown legacy method ids fail closed to the RK4 baseline', () => {
    const state = new Float64Array([0.25, -0.4]);
    const fallback = new Float64Array(2);
    const rk4 = new Float64Array(2);
    step('not-a-method' as IntegratorId, state, 0.01, oscillator, fallback);
    rk4Step(state, 0.01, oscillator, rk4);
    expect(Array.from(fallback)).toEqual(Array.from(rk4));
  });
});
