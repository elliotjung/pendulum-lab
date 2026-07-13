import { describe, expect, test } from 'vitest';
import {
  rhsMagneticPendulum,
  magneticPendulumEnergy,
  magneticPendulumBasinGrid,
  nearestMagnetIndex,
  magneticPendulumSettle,
  THREE_MAGNET_PRESET,
  type MagneticPendulumParameters
} from '../src/physics/magneticPendulum';
import { rk4Step } from '../src/physics/integrators';

/**
 * Magnetic pendulum over N magnets. Pinned against the closed-form force law, an
 * exact invariant (motion on a symmetry axis stays on it), the symmetric
 * equilibrium of the three-magnet configuration, strict energy dissipation, and
 * the settling kernel that classifies which magnet the bob lands on.
 */

describe('magnetic pendulum — force law and invariants', () => {
  test('RHS matches the closed-form inverse-cube attraction', () => {
    const params: MagneticPendulumParameters = {
      magnets: [{ x: 0, y: 0, strength: 2 }],
      restoring: 1,
      damping: 0,
      height: 0.4
    };
    const out = new Float64Array(4);
    rhsMagneticPendulum(Float64Array.of(0.5, 0.3, 0, 0), params, out);
    expect(out[0]).toBeCloseTo(0, 12);
    expect(out[1]).toBeCloseTo(0, 12);
    // r² = 0.25+0.09+0.16 = 0.5, r³ = 0.35355.
    expect(out[2]).toBeCloseTo(-3.32843, 4);
    expect(out[3]).toBeCloseTo(-1.99706, 4);
  });

  test('a magnet on the x-axis keeps y ≡ 0 motion on the axis', () => {
    const params: MagneticPendulumParameters = {
      magnets: [{ x: 0, y: 0, strength: 1 }],
      restoring: 1,
      damping: 0.2,
      height: 0.3
    };
    const state = Float64Array.of(1, 0, 0, 0);
    const out = new Float64Array(4);
    let maxAbsY = 0;
    for (let k = 0; k < 5000; k += 1) {
      rk4Step(state, 1e-3, (s, o) => rhsMagneticPendulum(s, params, o), out);
      state.set(out);
      maxAbsY = Math.max(maxAbsY, Math.abs(state[1]!));
    }
    expect(maxAbsY).toBeLessThan(1e-12);
  });

  test('the three-magnet origin is a (symmetric) equilibrium', () => {
    const out = new Float64Array(4);
    rhsMagneticPendulum(Float64Array.of(0, 0, 0, 0), THREE_MAGNET_PRESET, out);
    expect(out[2]).toBeCloseTo(0, 10);
    expect(out[3]).toBeCloseTo(0, 10);
  });
});

describe('magnetic pendulum — energy and settling', () => {
  test('drag strictly dissipates energy', () => {
    const state = Float64Array.of(0.5, 0.5, 0, 0);
    const e0 = magneticPendulumEnergy(state, THREE_MAGNET_PRESET).total;
    const out = new Float64Array(4);
    for (let k = 0; k < 8000; k += 1) {
      rk4Step(state, 1e-3, (s, o) => rhsMagneticPendulum(s, THREE_MAGNET_PRESET, o), out);
      state.set(out);
    }
    expect(magneticPendulumEnergy(state, THREE_MAGNET_PRESET).total).toBeLessThan(e0);
  });

  test('nearestMagnetIndex picks the closest magnet', () => {
    expect(nearestMagnetIndex(0, 0.9, THREE_MAGNET_PRESET)).toBe(0);
    const m1 = THREE_MAGNET_PRESET.magnets[1]!;
    expect(nearestMagnetIndex(m1.x * 0.95, m1.y * 0.95, THREE_MAGNET_PRESET)).toBe(1);
  });

  test('released at a magnet, the bob settles on that magnet', () => {
    for (let target = 0; target < THREE_MAGNET_PRESET.magnets.length; target += 1) {
      const m = THREE_MAGNET_PRESET.magnets[target]!;
      const result = magneticPendulumSettle(THREE_MAGNET_PRESET, m.x, m.y, { dt: 4e-3, maxSteps: 40000 });
      expect(result.converged).toBe(true);
      expect(result.magnet).toBe(target);
    }
  });
});

describe('magnetic pendulum basin-grid adapter', () => {
  test('returns deterministic labels plus an explicit convergence mask', () => {
    const options = { n: 4, xRange: [-1, 1] as const, yRange: [-1, 1] as const, dt: 0.006, maxSteps: 4000 };
    const a = magneticPendulumBasinGrid(THREE_MAGNET_PRESET, options);
    const b = magneticPendulumBasinGrid(THREE_MAGNET_PRESET, options);
    expect(a).toMatchObject({ width: 4, height: 4 });
    expect(Array.from(a.labels)).toEqual(Array.from(b.labels));
    expect(Array.from(a.converged)).toEqual(Array.from(b.converged));
    expect(Array.from(a.labels).every((label) => label >= 0 && label < 3)).toBe(true);
    expect(a.convergedFraction).toBeGreaterThanOrEqual(0);
    expect(a.convergedFraction).toBeLessThanOrEqual(1);
    expect(a.meanSteps).toBeGreaterThan(0);
  });
});
