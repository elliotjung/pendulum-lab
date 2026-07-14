/**
 * Property-based invariant tests (fast-check).
 *
 * The fixed-fixture suites pin exact numbers for known scenarios; these
 * properties assert the *structural* invariants of the physics core over
 * hundreds of randomized states and parameter sets:
 *
 *  - the double-pendulum mass matrix is symmetric positive definite, with its
 *    determinant matching the closed form m2·l1²·l2²·(m1 + m2·sin²Δ);
 *  - the canonical (θ,ω) ↔ (q,p) transform is a bijection (round-trips);
 *  - the analytic Hamiltonian gradient agrees with central finite differences;
 *  - undamped RK4 keeps short-horizon energy drift bounded from ANY sampled
 *    initial condition, not just the fixture ones;
 *  - the canonical implicit midpoint step is time-reversible and its step map
 *    is symplectic (JᵀΩJ = Ω) at randomized points, with long-run energy
 *    oscillating (no secular drift);
 *  - StateStore snapshots survive the strict JSON import round-trip for
 *    arbitrary valid sessions.
 *
 * The generator seed is pinned so CI is deterministic; bump SEED deliberately
 * to explore a fresh region of the input space.
 */
import { describe, expect, test } from 'vitest';
import * as fc from 'fast-check';
import {
  canonicalHamiltonian,
  doubleMassMatrix,
  hamiltonianGradient,
  implicitMidpointCanonical,
  momentumToOmega,
  omegaToMomentum
} from '../src/physics/canonical';
import { energyDouble } from '../src/physics/energy';
import { rhsDouble } from '../src/physics/double';
import { integratorRegistry, rk4Step } from '../src/physics/integrators';
import { rotateSphericalChainState } from '../src/physics/conservedQuantities';
import { sphericalChainEnergy, type SphericalChainParams } from '../src/physics/sphericalChain';
import type { PendulumParameters } from '../src/types/domain';
import type { IntegratorId } from '../src/types/domain';
import { StateStore } from '../src/state/StateStore';
import { parseStrictJsonImport } from '../src/validation/importSchema';

const SEED = 0x5eed;

const parametersArb: fc.Arbitrary<PendulumParameters> = fc.record({
  m1: fc.double({ min: 0.2, max: 5, noNaN: true }),
  m2: fc.double({ min: 0.2, max: 5, noNaN: true }),
  l1: fc.double({ min: 0.2, max: 5, noNaN: true }),
  l2: fc.double({ min: 0.2, max: 5, noNaN: true }),
  g: fc.double({ min: 1, max: 25, noNaN: true })
});

const angleArb = fc.double({ min: -Math.PI, max: Math.PI, noNaN: true });
const omegaArb = fc.double({ min: -2, max: 2, noNaN: true });

const thetaOmegaArb = fc.tuple(angleArb, angleArb, omegaArb, omegaArb);

/** Characteristic energy scale used to normalize drift (|E₀| can be ≈ 0). */
function energyScale(p: PendulumParameters): number {
  return (p.m1 + p.m2) * p.g * (p.l1 + p.l2);
}

describe('property: double-pendulum mass matrix', () => {
  test('is symmetric positive definite with the closed-form determinant', () => {
    fc.assert(
      fc.property(parametersArb, angleArb, angleArb, (p, q1, q2) => {
        const m = doubleMassMatrix(q1, q2, p);
        // Leading principal minors > 0 ⇔ SPD for a symmetric 2×2 matrix.
        expect(m.m11).toBeGreaterThan(0);
        expect(m.det).toBeGreaterThan(0);
        expect(m.m22).toBeGreaterThan(0);
        const sinDelta = Math.sin(q1 - q2);
        const closedForm = p.m2 * p.l1 * p.l1 * p.l2 * p.l2 * (p.m1 + p.m2 * sinDelta * sinDelta);
        expect(Math.abs(m.det - closedForm)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(closedForm)));
      }),
      { seed: SEED, numRuns: 300 }
    );
  });
});

describe('property: canonical transform', () => {
  test('(θ,ω) → (q,p) → (θ,ω) round-trips', () => {
    fc.assert(
      fc.property(parametersArb, thetaOmegaArb, (p, [t1, t2, w1, w2]) => {
        const thetaOmega = new Float64Array([t1, t2, w1, w2]);
        const back = momentumToOmega(omegaToMomentum(thetaOmega, p), p);
        const scale = Math.max(1, Math.abs(w1), Math.abs(w2));
        for (let i = 0; i < 4; i += 1) {
          expect(Math.abs(back[i]! - thetaOmega[i]!)).toBeLessThanOrEqual(1e-9 * scale);
        }
      }),
      { seed: SEED, numRuns: 300 }
    );
  });

  test('analytic Hamiltonian gradient matches central finite differences', () => {
    fc.assert(
      fc.property(parametersArb, thetaOmegaArb, (p, [t1, t2, w1, w2]) => {
        const canonical = omegaToMomentum(new Float64Array([t1, t2, w1, w2]), p);
        const grad = hamiltonianGradient(canonical, p);
        const scale = Math.max(1, energyScale(p));
        for (let i = 0; i < 4; i += 1) {
          const h = 1e-6 * Math.max(1, Math.abs(canonical[i]!));
          const plus = Float64Array.from(canonical);
          const minus = Float64Array.from(canonical);
          plus[i] = plus[i]! + h;
          minus[i] = minus[i]! - h;
          const fd = (canonicalHamiltonian(plus, p).total - canonicalHamiltonian(minus, p).total) / (2 * h);
          expect(Math.abs(grad[i]! - fd)).toBeLessThanOrEqual(1e-4 * scale);
        }
      }),
      { seed: SEED, numRuns: 60 }
    );
  });
});

describe('property: energy conservation', () => {
  test('undamped RK4 keeps short-horizon drift bounded from random states', () => {
    fc.assert(
      fc.property(parametersArb, thetaOmegaArb, (p, [t1, t2, w1, w2]) => {
        const state = new Float64Array([t1, t2, w1, w2]);
        const out = new Float64Array(4);
        const rhs = (s: Float64Array, o: Float64Array): void => {
          rhsDouble(s, p, 0, o);
        };
        const initial = energyDouble(state, p).total;
        for (let i = 0; i < 500; i += 1) {
          rk4Step(state, 1e-3, rhs, out);
          state.set(out);
        }
        const drift = Math.abs(energyDouble(state, p).total - initial) / energyScale(p);
        expect(drift).toBeLessThan(1e-6);
      }),
      { seed: SEED, numRuns: 25, endOnFailure: true }
    );
  });

  test('canonical implicit midpoint shows no secular energy drift over 1500 steps', () => {
    // The plain fixed-point iteration inside implicitMidpointCanonical
    // contracts at rate ~ dt·L (L ≈ g/l), so dt and the solver budget are
    // chosen to keep it convergent across the whole sampled parameter box.
    fc.assert(
      fc.property(parametersArb, thetaOmegaArb, (p, [t1, t2, w1, w2]) => {
        let canonical = omegaToMomentum(new Float64Array([t1, t2, w1, w2]), p);
        const initial = canonicalHamiltonian(canonical, p).total;
        let maxDeviation = 0;
        for (let i = 0; i < 1500; i += 1) {
          const result = implicitMidpointCanonical(canonical, 2e-3, p, 0, 1e-11, 50);
          expect(result.stats.converged).toBe(true);
          canonical = result.state;
          if (i % 100 === 99) {
            const deviation = Math.abs(canonicalHamiltonian(canonical, p).total - initial);
            maxDeviation = Math.max(maxDeviation, deviation);
          }
        }
        expect(maxDeviation / energyScale(p)).toBeLessThan(5e-3);
      }),
      { seed: SEED, numRuns: 8, endOnFailure: true }
    );
  });
});

describe('property: physical dissipation and rotational symmetry', () => {
  const dampedParametersArb = fc.record({
    m1: fc.double({ min: 0.5, max: 2, noNaN: true }),
    m2: fc.double({ min: 0.5, max: 2, noNaN: true }),
    l1: fc.double({ min: 0.6, max: 2, noNaN: true }),
    l2: fc.double({ min: 0.6, max: 2, noNaN: true }),
    g: fc.double({ min: 5, max: 15, noNaN: true })
  });
  const moderateStateArb = fc.tuple(
    fc.double({ min: -2.5, max: 2.5, noNaN: true }),
    fc.double({ min: -2.5, max: 2.5, noNaN: true }),
    fc.double({ min: -1.5, max: 1.5, noNaN: true }),
    fc.double({ min: -1.5, max: 1.5, noNaN: true })
  );

  test('viscously damped RK4 trajectories have non-increasing mechanical energy', () => {
    fc.assert(
      fc.property(
        dampedParametersArb,
        moderateStateArb,
        fc.double({ min: 0.02, max: 0.5, noNaN: true }),
        fc.double({ min: 1e-5, max: 4e-4, noNaN: true }),
        (p, initial, damping, dt) => {
          const state = Float64Array.from(initial);
          const out = new Float64Array(4);
          const rhs = (s: Float64Array, o: Float64Array): void => {
            rhsDouble(s, p, damping, o);
          };
          const scale = energyScale(p);
          let previous = energyDouble(state, p).total;
          for (let i = 0; i < 250; i += 1) {
            rk4Step(state, dt, rhs, out);
            state.set(out);
            const current = energyDouble(state, p).total;
            // RK4 round-off can move the last few ulps even though dE/dt <= 0.
            expect(current).toBeLessThanOrEqual(previous + 2e-11 * scale);
            previous = current;
          }
        }
      ),
      { seed: SEED, numRuns: 80, endOnFailure: true }
    );
  });

  test('spherical-chain energy is invariant under arbitrary rotations about the gravity axis', () => {
    const sphericalStateArb = fc.tuple(
      fc.double({ min: 0.2, max: Math.PI - 0.2, noNaN: true }),
      fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
      fc.double({ min: 0.2, max: Math.PI - 0.2, noNaN: true }),
      fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
      fc.double({ min: -1.5, max: 1.5, noNaN: true }),
      fc.double({ min: -1.5, max: 1.5, noNaN: true }),
      fc.double({ min: -1.5, max: 1.5, noNaN: true }),
      fc.double({ min: -1.5, max: 1.5, noNaN: true })
    );
    const sphericalParametersArb: fc.Arbitrary<SphericalChainParams> = fc.record({
      masses: fc.tuple(fc.double({ min: 0.4, max: 3, noNaN: true }), fc.double({ min: 0.4, max: 3, noNaN: true })),
      lengths: fc.tuple(fc.double({ min: 0.4, max: 2.5, noNaN: true }), fc.double({ min: 0.4, max: 2.5, noNaN: true })),
      g: fc.double({ min: 1, max: 20, noNaN: true }),
      damping: fc.constant(0)
    });

    fc.assert(
      fc.property(
        sphericalParametersArb,
        sphericalStateArb,
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        (params, state, angle) => {
          const before = sphericalChainEnergy(state, params).total;
          const rotated = rotateSphericalChainState(state, 2, [0, 1, 0], angle);
          const after = sphericalChainEnergy(rotated, params).total;
          const scale = Math.max(1, Math.abs(before), Math.abs(after));
          expect(Math.abs(after - before)).toBeLessThanOrEqual(2e-10 * scale);
        }
      ),
      { seed: SEED, numRuns: 200, endOnFailure: true }
    );
  });
});

describe('property: symplectic structure of the implicit midpoint step', () => {
  test('one step forward then one step backward returns to the start', () => {
    fc.assert(
      fc.property(parametersArb, thetaOmegaArb, (p, [t1, t2, w1, w2]) => {
        const canonical = omegaToMomentum(new Float64Array([t1, t2, w1, w2]), p);
        const forward = implicitMidpointCanonical(canonical, 1e-3, p, 0, 1e-12, 50);
        const back = implicitMidpointCanonical(forward.state, -1e-3, p, 0, 1e-12, 50);
        expect(forward.stats.converged).toBe(true);
        expect(back.stats.converged).toBe(true);
        const scale = Math.max(1, ...Array.from(canonical, Math.abs));
        for (let i = 0; i < 4; i += 1) {
          expect(Math.abs(back.state[i]! - canonical[i]!)).toBeLessThanOrEqual(1e-7 * scale);
        }
      }),
      { seed: SEED, numRuns: 25, endOnFailure: true }
    );
  });

  test('the step map Jacobian satisfies JᵀΩJ = Ω (symplecticity)', () => {
    // Ω is the canonical symplectic form for ordering (q1, q2, p1, p2).
    const omegaForm = [
      [0, 0, 1, 0],
      [0, 0, 0, 1],
      [-1, 0, 0, 0],
      [0, -1, 0, 0]
    ];
    fc.assert(
      fc.property(parametersArb, thetaOmegaArb, (p, [t1, t2, w1, w2]) => {
        const canonical = omegaToMomentum(new Float64Array([t1, t2, w1, w2]), p);
        const dt = 1e-3;
        // Central finite-difference Jacobian of the one-step map.
        const jacobian: number[][] = [[], [], [], []];
        for (let j = 0; j < 4; j += 1) {
          const h = 1e-6 * Math.max(1, Math.abs(canonical[j]!));
          const plus = Float64Array.from(canonical);
          const minus = Float64Array.from(canonical);
          plus[j] = plus[j]! + h;
          minus[j] = minus[j]! - h;
          const mapPlus = implicitMidpointCanonical(plus, dt, p, 0, 1e-13, 60).state;
          const mapMinus = implicitMidpointCanonical(minus, dt, p, 0, 1e-13, 60).state;
          for (let i = 0; i < 4; i += 1) {
            jacobian[i]![j] = (mapPlus[i]! - mapMinus[i]!) / (2 * h);
          }
        }
        // JᵀΩJ must reproduce Ω.
        for (let a = 0; a < 4; a += 1) {
          for (let b = 0; b < 4; b += 1) {
            let acc = 0;
            for (let i = 0; i < 4; i += 1) {
              for (let k = 0; k < 4; k += 1) {
                acc += jacobian[i]![a]! * omegaForm[i]![k]! * jacobian[k]![b]!;
              }
            }
            expect(Math.abs(acc - omegaForm[a]![b]!)).toBeLessThanOrEqual(1e-4);
          }
        }
      }),
      { seed: SEED, numRuns: 15, endOnFailure: true }
    );
  });
});

describe('property: session import/export round-trip', () => {
  const methodPool = Object.keys(integratorRegistry) as IntegratorId[];
  const stateValueArb = fc.double({ min: -50, max: 50, noNaN: true });

  test('StateStore snapshots survive strict JSON import for arbitrary sessions', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...methodPool),
        fc.tuple(stateValueArb, stateValueArb, stateValueArb, stateValueArb),
        fc.double({ min: 1e-5, max: 0.1, noNaN: true }),
        fc.double({ min: 0, max: 1e4, noNaN: true }),
        fc.option(fc.integer({ min: 0, max: 2 ** 31 - 1 }), { nil: null }),
        (method, state, dt, simTime, seed) => {
          // JSON has no negative zero (JSON.stringify(-0) === '0'), so
          // normalize -0 inputs — the round-trip property is about *values*.
          const normalized = state.map((v) => (v === 0 ? 0 : v));
          const store = new StateStore({
            systemType: 'double',
            method,
            mode: 'research',
            dt,
            state: normalized,
            simTime: simTime === 0 ? 0 : simTime,
            seed
          });
          const snapshot = store.snapshot();
          const parsed = parseStrictJsonImport(JSON.stringify(snapshot));
          expect(parsed.ok).toBe(true);
          expect(parsed.value?.state).toEqual(snapshot.state);
          expect(parsed.value?.method).toBe(snapshot.method);
          expect(parsed.value?.dt).toBe(dt);
          expect(parsed.value?.simTime).toBe(simTime);
          expect(parsed.value?.seed).toBe(seed);
        }
      ),
      { seed: SEED, numRuns: 150 }
    );
  });

  test('structurally mutated JSON sessions never crash the strict sanitizer', () => {
    const validSession = {
      schemaVersion: 'pendulum-session/v10-ts',
      systemType: 'double',
      method: 'rk4',
      mode: 'research',
      dt: 0.003,
      tolerance: 1e-7,
      stepsPerFrame: 6,
      damping: 0,
      parameters: { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 },
      state: [0.1, 0.2, 0, 0],
      simTime: 0,
      seed: 123,
      hash: 'property-fuzz'
    };
    const mutationArb = fc.record({
      topLevel: fc.dictionary(fc.string({ maxLength: 24 }), fc.jsonValue(), { maxKeys: 12 }),
      parameters: fc.jsonValue(),
      state: fc.jsonValue()
    });

    fc.assert(
      fc.property(mutationArb, ({ topLevel, parameters, state }) => {
        const candidate = { ...validSession, ...topLevel, parameters, state };
        const encoded = JSON.stringify(candidate);
        expect(() => parseStrictJsonImport(encoded)).not.toThrow();
      }),
      { seed: SEED, numRuns: 1000, endOnFailure: true }
    );
  });

  test('arbitrary JSON text never escapes as an uncaught parser exception', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2000 }), (text) => {
        expect(() => parseStrictJsonImport(text)).not.toThrow();
      }),
      { seed: SEED, numRuns: 1000, endOnFailure: true }
    );
  });
});
