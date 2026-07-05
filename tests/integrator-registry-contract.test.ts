import { describe, expect, test } from 'vitest';
import type { IntegratorId } from '../src/types/domain';
import {
  eulerStep,
  gaussLegendre4Step,
  implicitMidpointStep,
  integratorRegistry,
  leapfrogStep,
  rk2Step,
  rk4Step,
  step,
  symplecticEulerStep,
  yoshida4Step
} from '../src/physics/integrators';
import type { Derivative } from '../src/physics/types';

/**
 * Behavior contract for the integrator registry - the survivor classes the
 * mutation ladder flags: dispatch equivalence, damping-support semantics,
 * recommended dt ranges, unknown-id fail-closed, and metadata immutability.
 */

const rhs: Derivative = (state, out) => {
  // Damped oscillator: dx = v, dv = -x - 0.1 v (asymmetric enough to catch swaps).
  out[0] = Number(state[1] ?? 0);
  out[1] = -Number(state[0] ?? 0) - 0.1 * Number(state[1] ?? 0);
};
const state0 = () => new Float64Array([0.7, -0.3]);

describe('registry metadata', () => {
  const ids = Object.keys(integratorRegistry) as IntegratorId[];

  test('covers exactly the 14 shipped integrators with self-consistent entries', () => {
    expect(ids.sort()).toEqual([
      'bdf2', 'dopri5', 'euler', 'gauss2', 'gbs', 'hmidpoint', 'leapfrog',
      'rk2', 'rk4', 'rkf45', 'symplectic', 'tsit5', 'verlet', 'yoshida4'
    ].sort());
    for (const id of ids) {
      const meta = integratorRegistry[id];
      expect(meta.id).toBe(id);
      expect(meta.name.length).toBeGreaterThan(3);
      expect(meta.stabilityNotes.length).toBeGreaterThan(0);
      if (typeof meta.order === 'number') {
        expect(Number.isInteger(meta.order)).toBe(true);
        expect(meta.order).toBeGreaterThanOrEqual(1);
        expect(meta.order).toBeLessThanOrEqual(5);
      } else {
        expect(['adaptive', 'implicit']).toContain(meta.order);
      }
    }
  });

  test('recommended dt ranges are positive, ordered windows', () => {
    for (const id of ids) {
      const [min, max] = integratorRegistry[id].recommendedDt;
      expect(min).toBeGreaterThan(0);
      expect(max).toBeGreaterThan(min);
      expect(max).toBeLessThanOrEqual(0.05);
    }
  });

  test('damping-support semantics: symplectic-family methods are diagnostic-only under damping', () => {
    for (const id of ids) {
      const meta = integratorRegistry[id];
      expect(['supported', 'diagnostic-only']).toContain(meta.dampingSupport);
      // A method claiming any symplectic structure cannot claim full damping
      // support: dissipation breaks the symplectic form.
      if (meta.symplectic !== 'no') expect(meta.dampingSupport).toBe('diagnostic-only');
    }
    expect(integratorRegistry.rk4.dampingSupport).toBe('supported');
    expect(integratorRegistry.leapfrog.dampingSupport).toBe('diagnostic-only');
    expect(integratorRegistry.euler.order).toBe(1);
    expect(integratorRegistry.rk4.order).toBe(4);
    expect(integratorRegistry.dopri5.order).toBe(5);
  });

  test('metadata is immutable (frozen registry, frozen against key injection)', () => {
    expect(Object.isFrozen(integratorRegistry)).toBe(true);
    expect(() => {
      (integratorRegistry as Record<string, unknown>).rogue = { id: 'rogue' };
    }).toThrow();
    expect((integratorRegistry as Record<string, unknown>).rogue).toBeUndefined();
  });
});

describe('step() dispatch', () => {
  const directSteppers: Partial<Record<IntegratorId, (s: Float64Array, dt: number, f: Derivative, o: Float64Array) => Float64Array>> = {
    euler: (s, dt, f, o) => eulerStep(s, dt, f, o),
    rk2: (s, dt, f, o) => rk2Step(s, dt, f, o),
    rk4: (s, dt, f, o) => rk4Step(s, dt, f, o),
    leapfrog: (s, dt, f, o) => leapfrogStep(s, dt, f, o),
    verlet: (s, dt, f, o) => leapfrogStep(s, dt, f, o), // documented alias
    symplectic: (s, dt, f, o) => symplecticEulerStep(s, dt, f, o),
    yoshida4: (s, dt, f, o) => yoshida4Step(s, dt, f, o),
    hmidpoint: (s, dt, f, o) => implicitMidpointStep(s, dt, f, o),
    gauss2: (s, dt, f, o) => gaussLegendre4Step(s, dt, f, o)
  };

  test('dispatches every direct-mapped id to exactly its stepper (bitwise equality)', () => {
    for (const [id, direct] of Object.entries(directSteppers) as [IntegratorId, NonNullable<typeof directSteppers[IntegratorId]>][]) {
      const viaRegistry = new Float64Array(2);
      const viaDirect = new Float64Array(2);
      step(id, state0(), 0.01, rhs, viaRegistry);
      direct(state0(), 0.01, rhs, viaDirect);
      expect(Array.from(viaRegistry), id).toEqual(Array.from(viaDirect));
      // The step must actually move the state (mutants that skip the update die here).
      expect(viaRegistry[0]).not.toBe(state0()[0]);
    }
  });

  test('distinct methods produce distinct results at coarse dt (no silent aliasing)', () => {
    const results = new Map<string, string>();
    for (const id of ['euler', 'rk2', 'rk4', 'symplectic', 'yoshida4'] as IntegratorId[]) {
      const out = new Float64Array(2);
      step(id, state0(), 0.2, rhs, out);
      results.set(id, Array.from(out).map((v) => v.toPrecision(15)).join(','));
    }
    expect(new Set(results.values()).size).toBe(results.size);
  });

  test('adaptive/implicit ids run through the dispatcher and stay near the RK4 baseline', () => {
    const baseline = new Float64Array(2);
    step('rk4', state0(), 0.01, rhs, baseline);
    for (const id of ['rkf45', 'dopri5', 'tsit5', 'gbs', 'bdf2'] as IntegratorId[]) {
      const out = new Float64Array(2);
      step(id, state0(), 0.01, rhs, out);
      expect(Math.abs(out[0]! - baseline[0]!), id).toBeLessThan(1e-4);
      expect(Math.abs(out[1]! - baseline[1]!), id).toBeLessThan(1e-4);
    }
  });

  test('unknown integrator ids fail closed to the RK4 baseline, never a cheaper method', () => {
    // The pinned fail-closed contract (see integrators.test.ts): ids outside
    // the registry degrade to the RK4 baseline bitwise - a mutant redirecting
    // the default branch to euler/rk2/leapfrog dies on the exact comparison.
    const baseline = new Float64Array(2);
    rk4Step(state0(), 0.05, rhs, baseline);
    for (const bogus of ['definitely-not-a-method', '', 'EULER'] as unknown as IntegratorId[]) {
      const out = new Float64Array(2);
      step(bogus, state0(), 0.05, rhs, out);
      expect(Array.from(out)).toEqual(Array.from(baseline));
    }
    const eulerOut = new Float64Array(2);
    eulerStep(state0(), 0.05, rhs, eulerOut);
    expect(Array.from(baseline)).not.toEqual(Array.from(eulerOut));
  });
});
