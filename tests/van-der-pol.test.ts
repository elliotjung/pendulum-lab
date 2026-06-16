import { describe, expect, test } from 'vitest';
import {
  rhsVanDerPol,
  energyVanDerPol,
  vanDerPolPeriodEstimate,
  type VanDerPolParameters
} from '../src/physics/vanDerPol';
import { rk4Step } from '../src/physics/integrators';

/**
 * Van der Pol oscillator x'' - μ(1-x²)x' + x = 0. Pinned against its textbook
 * limit-cycle properties: the harmonic (μ=0) limit, the quasi-harmonic
 * amplitude → 2 and period → 2π as μ → 0, and the global attractivity of the
 * single limit cycle (trajectories from inside and outside converge to it).
 */

/** Settle onto the attractor, then measure peak |x| and the mean upward-crossing period. */
function settleAndMeasure(
  mu: number,
  state0: number[],
  dt: number,
  settleSteps: number,
  measureSteps: number
): { amplitude: number; period: number } {
  const params: VanDerPolParameters = { mu };
  const state = Float64Array.from(state0);
  const out = new Float64Array(2);
  for (let k = 0; k < settleSteps; k += 1) {
    rk4Step(state, dt, (s, o) => rhsVanDerPol(s, params, o), out);
    state.set(out);
  }
  let amplitude = 0;
  const crossings: number[] = [];
  let prev = state[0]!;
  for (let k = 1; k <= measureSteps; k += 1) {
    rk4Step(state, dt, (s, o) => rhsVanDerPol(s, params, o), out);
    state.set(out);
    const cur = state[0]!;
    amplitude = Math.max(amplitude, Math.abs(cur));
    if (prev < 0 && cur >= 0) {
      crossings.push((k - cur / (cur - prev)) * dt); // interpolated upward crossing
    }
    prev = cur;
  }
  let period = NaN;
  if (crossings.length >= 2) {
    let sum = 0;
    for (let i = 1; i < crossings.length; i += 1) sum += crossings[i]! - crossings[i - 1]!;
    period = sum / (crossings.length - 1);
  }
  return { amplitude, period };
}

describe('Van der Pol', () => {
  test('μ=0 reduces to the harmonic oscillator (energy conserved, period 2π)', () => {
    const params: VanDerPolParameters = { mu: 0 };
    const state = Float64Array.of(1, 0);
    const out = new Float64Array(2);
    const e0 = energyVanDerPol(state, params).total;
    let maxDrift = 0;
    for (let k = 0; k < 8000; k += 1) {
      rk4Step(state, 1e-3, (s, o) => rhsVanDerPol(s, params, o), out);
      state.set(out);
      maxDrift = Math.max(maxDrift, Math.abs(energyVanDerPol(state, params).total - e0));
    }
    expect(maxDrift).toBeLessThan(1e-8);
  });

  test('small μ: limit-cycle amplitude → 2 and period → 2π', () => {
    const { amplitude, period } = settleAndMeasure(0.05, [2, 0], 1e-3, 30000, 30000);
    expect(amplitude).toBeCloseTo(2, 1); // |error| < 0.05
    expect(period).toBeCloseTo(2 * Math.PI, 1);
    expect(period).toBeCloseTo(vanDerPolPeriodEstimate(0.05), 1);
  });

  test('limit cycle is globally attracting (inside and outside converge)', () => {
    const fromInside = settleAndMeasure(1, [0.1, 0], 1e-3, 40000, 20000);
    const fromOutside = settleAndMeasure(1, [3, 0], 1e-3, 40000, 20000);
    // Both initial conditions land on the same cycle.
    expect(fromInside.amplitude).toBeCloseTo(2, 1);
    expect(fromOutside.amplitude).toBeCloseTo(fromInside.amplitude, 2);
    expect(fromOutside.period).toBeCloseTo(fromInside.period, 1);
  });

  test('period estimate is monotone and continuous across the μ=1 crossover', () => {
    expect(vanDerPolPeriodEstimate(0)).toBeCloseTo(2 * Math.PI, 9);
    expect(vanDerPolPeriodEstimate(10)).toBeCloseTo((3 - 2 * Math.LN2) * 10, 9);
    expect(() => vanDerPolPeriodEstimate(-1)).toThrow();
  });
});
