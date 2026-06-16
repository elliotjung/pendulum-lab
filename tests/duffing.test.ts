import { describe, expect, test } from 'vitest';
import {
  rhsDuffing,
  energyDuffing,
  duffingPotential,
  duffingDoubleWell,
  DUFFING_CHAOS_PRESET,
  type DuffingParameters
} from '../src/physics/duffing';
import { rk4Step } from '../src/physics/integrators';

/**
 * Duffing oscillator x'' + δx' + αx + βx³ = γcos(ωt). The module is pinned
 * against closed forms: energy conservation in the conservative limit, the
 * small-amplitude linear period, the double-well fixed points and the analytic
 * well geometry (barrier height + curvatures used by the Kramers rate).
 */

function integrate(params: DuffingParameters, state0: number[], dt: number, steps: number): Float64Array {
  const state = Float64Array.from(state0);
  const out = new Float64Array(3);
  for (let k = 0; k < steps; k += 1) {
    rk4Step(state, dt, (s, o) => rhsDuffing(s, params, o), out);
    state.set(out);
  }
  return state;
}

/** First downward zero crossing of x(t), linearly interpolated — a quarter period from rest. */
function quarterCrossing(params: DuffingParameters, state0: number[], dt: number): number {
  const state = Float64Array.from(state0);
  const out = new Float64Array(3);
  let prev = state[0]!;
  let tPrev = 0;
  for (let k = 1; k <= 200000; k += 1) {
    rk4Step(state, dt, (s, o) => rhsDuffing(s, params, o), out);
    state.set(out);
    const cur = state[0]!;
    const t = k * dt;
    if (prev >= 0 && cur < 0) return tPrev + (dt * prev) / (prev - cur);
    prev = cur;
    tPrev = t;
  }
  throw new Error('no zero crossing found');
}

describe('Duffing RHS and energy', () => {
  test('conservative limit (δ=γ=0) conserves E = ½v² + V(x) under RK4', () => {
    const params: DuffingParameters = {
      damping: 0,
      linearStiffness: 1,
      cubicStiffness: 1,
      driveAmplitude: 0,
      driveFrequency: 0.7
    };
    const state0 = [1.0, 0.5, 0];
    const e0 = energyDuffing(Float64Array.from(state0), params).total;
    const state = Float64Array.from(state0);
    const out = new Float64Array(3);
    let maxDrift = 0;
    for (let k = 0; k < 5000; k += 1) {
      rk4Step(state, 1e-3, (s, o) => rhsDuffing(s, params, o), out);
      state.set(out);
      maxDrift = Math.max(maxDrift, Math.abs((energyDuffing(state, params).total - e0) / e0));
    }
    expect(maxDrift).toBeLessThan(1e-6);
  });

  test('small-amplitude linear limit (β=0, α=ω₀²) recovers period 2π/ω₀', () => {
    const omega0 = 1.5;
    const params: DuffingParameters = {
      damping: 0,
      linearStiffness: omega0 * omega0,
      cubicStiffness: 0,
      driveAmplitude: 0,
      driveFrequency: 0
    };
    const tQuarter = quarterCrossing(params, [1e-3, 0, 0], 2e-4);
    expect(tQuarter).toBeCloseTo(Math.PI / 2 / omega0, 3);
  });

  test('double-well equilibria x* = ±√(-α/β) have zero acceleration (δ=γ=0)', () => {
    const params: DuffingParameters = {
      damping: 0,
      linearStiffness: -1,
      cubicStiffness: 1,
      driveAmplitude: 0,
      driveFrequency: 0
    };
    const out = new Float64Array(3);
    for (const xStar of [-1, 1]) {
      rhsDuffing(Float64Array.of(xStar, 0, 0), params, out);
      expect(out[0]).toBeCloseTo(0, 12); // v = 0
      expect(out[1]).toBeCloseTo(0, 12); // v' = 0 at the well bottom
    }
  });

  test('damping (δ>0, γ=0) strictly dissipates energy', () => {
    const params: DuffingParameters = {
      damping: 0.2,
      linearStiffness: 1,
      cubicStiffness: 1,
      driveAmplitude: 0,
      driveFrequency: 0
    };
    const state0 = [1.0, 0, 0];
    const e0 = energyDuffing(Float64Array.from(state0), params).total;
    const end = integrate(params, state0, 1e-3, 4000);
    expect(energyDuffing(end, params).total).toBeLessThan(e0);
  });

  test('Ueda chaotic preset stays bounded over a long run', () => {
    const state = Float64Array.of(0.5, 0, 0);
    const out = new Float64Array(3);
    let maxAbsX = 0;
    for (let k = 0; k < 60000; k += 1) {
      rk4Step(state, 2e-3, (s, o) => rhsDuffing(s, DUFFING_CHAOS_PRESET, o), out);
      state.set(out);
      maxAbsX = Math.max(maxAbsX, Math.abs(state[0]!));
      expect(Number.isFinite(state[0]!)).toBe(true);
    }
    expect(maxAbsX).toBeLessThan(3); // bounded attractor, not divergence
  });
});

describe('duffingPotential / duffingDoubleWell', () => {
  test('potential matches ½αx² + ¼βx⁴', () => {
    const p = { linearStiffness: -1, cubicStiffness: 1 };
    expect(duffingPotential(0, p)).toBeCloseTo(0, 12);
    expect(duffingPotential(1, p)).toBeCloseTo(-0.5 + 0.25, 12);
    expect(duffingPotential(2, p)).toBeCloseTo(-2 + 4, 12);
  });

  test('closed-form well geometry (α=-2, β=0.5)', () => {
    const well = duffingDoubleWell({ linearStiffness: -2, cubicStiffness: 0.5 });
    expect(well.minima[0]).toBeCloseTo(-2, 12);
    expect(well.minima[1]).toBeCloseTo(2, 12);
    expect(well.barrierHeight).toBeCloseTo(2, 12); // α²/(4β) = 4/2
    expect(well.wellFrequency).toBeCloseTo(2, 12); // √(-2α) = √4
    expect(well.barrierFrequency).toBeCloseTo(Math.SQRT2, 12); // √(-α) = √2
    // The barrier height equals V(0) − V(x*) computed from the potential.
    const dv = duffingPotential(0, { linearStiffness: -2, cubicStiffness: 0.5 })
      - duffingPotential(2, { linearStiffness: -2, cubicStiffness: 0.5 });
    expect(well.barrierHeight).toBeCloseTo(dv, 12);
  });

  test('rejects non-bistable parameters', () => {
    expect(() => duffingDoubleWell({ linearStiffness: 1, cubicStiffness: 1 })).toThrow(/double well/);
    expect(() => duffingDoubleWell({ linearStiffness: -1, cubicStiffness: -1 })).toThrow(/double well/);
  });
});
