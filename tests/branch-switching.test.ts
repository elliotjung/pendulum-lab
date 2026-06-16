import { describe, expect, test } from 'vitest';
import { drivenPeriodicOrbit } from '../src/chaos/floquet';
import {
  drivenPeriodicOrbitN,
  realEigenvector2x2,
  switchPeriodDoubling,
  switchSymmetryBreaking,
  switchTranscriticalBranch
} from '../src/chaos/branchSwitching';
import { continueDrivenPeriodicOrbit } from '../src/chaos/continuation';

/**
 * Period-doubling branch switching on the classic damped driven pendulum
 * (γ = 0.5, ω = 2/3): the oscillating period-1 orbit's real multiplier crosses
 * −1 near A ≈ 1.066 (the literature value for this textbook system), and
 * switching maps to P² along the critical eigenvector lands on the *stable*
 * period-2 orbit — the first step of the Feigenbaum cascade (chaos near 1.08).
 */

const params = (A: number) => ({ g: 1, length: 1, damping: 0.5, driveAmplitude: A, driveFrequency: 2 / 3 });
// Warm start on the oscillating (non-whirling) branch, from a direct-simulation probe.
const GUESS: [number, number] = [-0.2926, 1.9745];

describe('realEigenvector2x2', () => {
  test('recovers eigenvectors of an upper-triangular matrix', () => {
    // M = [[2,1],[0,3]]: eigenvector for 3 is (1,1)/√2, for 2 is (1,0).
    const M = [2, 1, 0, 3];
    const v3 = realEigenvector2x2(M, 3);
    expect(Math.abs(v3[0]) - Math.abs(v3[1])).toBeLessThan(1e-12);
    const v2 = realEigenvector2x2(M, 2);
    expect(Math.abs(v2[1])).toBeLessThan(1e-12);
    expect(Math.hypot(v2[0], v2[1])).toBeCloseTo(1, 12);
  });
});

describe('period-doubling of the driven pendulum', () => {
  test('the oscillating P1 branch crosses mu = -1 between A = 1.065 and 1.07', () => {
    const before = drivenPeriodicOrbit(params(1.065), GUESS, { dt: 0.005, tolerance: 1e-10 });
    const after = drivenPeriodicOrbit(params(1.07), before.orbit, { dt: 0.005, tolerance: 1e-10 });
    expect(before.converged).toBe(true);
    expect(after.converged).toBe(true);
    // Real multiplier on both sides of −1 (the PD crossing).
    const muBefore = Math.min(before.multipliers[0]!.re, before.multipliers[1]!.re);
    const muAfter = Math.min(after.multipliers[0]!.re, after.multipliers[1]!.re);
    expect(before.multipliers.every((m) => Math.abs(m.im) < 1e-9)).toBe(true);
    expect(muBefore).toBeGreaterThan(-1);
    expect(muBefore).toBeLessThan(-0.8); // already close to the crossing
    expect(muAfter).toBeLessThan(-1);
    expect(before.stable).toBe(true);
    expect(after.stable).toBe(false);
  });

  test('switching at A = 1.07 lands on the stable period-2 orbit', () => {
    const p1 = drivenPeriodicOrbit(params(1.07), GUESS, { dt: 0.005, tolerance: 1e-10 });
    expect(p1.converged).toBe(true);
    const sw = switchPeriodDoubling(params(1.07), p1.orbit, { dt: 0.005, tolerance: 1e-10 });

    expect(sw.switched).toBe(true);
    expect(sw.criticalMultiplier.re).toBeLessThan(-1); // just past the PD
    expect(sw.separation).toBeGreaterThan(0.05); // genuinely a different orbit

    const p2 = sw.doubled;
    expect(p2.converged).toBe(true);
    expect(p2.residual).toBeLessThan(1e-9);
    expect(p2.n).toBe(2);
    // Just past onset the doubled orbit is the attractor: stable.
    expect(p2.stable).toBe(true);
    // It is a true 2-cycle: the two strobe points are distinct.
    const [c0, c1] = p2.cycle;
    expect(p2.cycle.length).toBe(2);
    expect(Math.hypot(c0![0] - c1![0], c0![1] - c1![1])).toBeGreaterThan(0.05);
    // And NOT a period-1 orbit: Newton on the single-period map from the P2
    // point falls back to the (unstable) period-1 fixed point, away from it.
    const back = drivenPeriodicOrbitN(params(1.07), p2.orbit, 1, { dt: 0.005, tolerance: 1e-10 });
    expect(back.converged).toBe(true);
    expect(Math.hypot(back.orbit[0] - p2.orbit[0], back.orbit[1] - p2.orbit[1])).toBeGreaterThan(0.05);
    expect(Math.hypot(back.orbit[0] - p1.orbit[0], back.orbit[1] - p1.orbit[1])).toBeLessThan(1e-3);
  });

  test('drivenPeriodicOrbitN with n = 1 reproduces the period-1 solver', () => {
    const a = drivenPeriodicOrbit(params(1.05), GUESS, { dt: 0.005, tolerance: 1e-10 });
    const b = drivenPeriodicOrbitN(params(1.05), GUESS, 1, { dt: 0.005, tolerance: 1e-10 });
    expect(b.converged).toBe(true);
    expect(Math.abs(a.orbit[0] - b.orbit[0])).toBeLessThan(1e-6);
    expect(Math.abs(a.orbit[1] - b.orbit[1])).toBeLessThan(1e-6);
  });
});

/**
 * Symmetry-breaking pitchfork on the same system, but at the *earlier* +1
 * crossing (A ≈ 1.005, before the period-doubling): the symmetric oscillating
 * orbit loses stability via a real multiplier through +1, and two mirror-image
 * asymmetric period-1 orbits branch off, straddling it. This is the +1 case the
 * docs previously listed as future work.
 */
describe('symmetry-breaking pitchfork of the driven pendulum', () => {
  // driveAmplitude is overridden by the continuation / per-A params below.
  const base = { g: 1, length: 1, damping: 0.5, driveAmplitude: 0.7, driveFrequency: 2 / 3 };

  test('follows the two mirror-image asymmetric orbits born at the +1 crossing', () => {
    // Locate the first stability loss by continuing the symmetric branch from low A.
    const cont = continueDrivenPeriodicOrbit(base, {
      parameter: 'driveAmplitude',
      start: 0.7,
      end: 1.06,
      step: 0.005,
      dt: 0.004,
      tolerance: 1e-11
    });
    expect(cont.bifurcation).not.toBeNull();
    expect(cont.bifurcation!.type).toBe('tangent'); // a real +1 crossing
    const aCrit = cont.bifurcation!.parameter;
    expect(aCrit).toBeGreaterThan(1.0);
    expect(aCrit).toBeLessThan(1.05);

    // Re-find the (now unstable) symmetric orbit just past onset, warm-started
    // from the last stable point on the branch.
    const lastStable = cont.branch.filter((p) => p.parameter < aCrit).pop()!;
    const params = { ...base, driveAmplitude: aCrit };
    const sym = drivenPeriodicOrbitN(params, lastStable.orbit, 1, { dt: 0.004, tolerance: 1e-11 });
    expect(sym.converged).toBe(true);
    expect(sym.stable).toBe(false); // it has just lost stability

    const result = switchSymmetryBreaking(params, sym.orbit, { dt: 0.004, tolerance: 1e-11 });

    expect(result.switched).toBe(true);
    expect(result.criticalMultiplier.re).toBeGreaterThan(1); // just past +1
    expect(Math.abs(result.criticalMultiplier.im)).toBeLessThan(1e-9); // real

    // Two genuinely distinct, stable period-1 orbits.
    const [a, b] = result.branches;
    expect(a.converged).toBe(true);
    expect(b.converged).toBe(true);
    expect(a.residual).toBeLessThan(1e-9);
    expect(b.residual).toBeLessThan(1e-9);
    expect(a.n).toBe(1);
    expect(b.n).toBe(1);
    expect(a.stable).toBe(true);
    expect(b.stable).toBe(true);
    expect(result.separation).toBeGreaterThan(0.05);

    // Both branches differ from the symmetric orbit…
    expect(Math.hypot(a.orbit[0] - sym.orbit[0], a.orbit[1] - sym.orbit[1])).toBeGreaterThan(0.02);
    expect(Math.hypot(b.orbit[0] - sym.orbit[0], b.orbit[1] - sym.orbit[1])).toBeGreaterThan(0.02);

    // …and the pitchfork signature holds: their midpoint is the symmetric orbit.
    expect(result.pitchforkResidual).toBeLessThan(0.02);
    expect(Math.hypot(result.midpoint[0] - sym.orbit[0], result.midpoint[1] - sym.orbit[1])).toBeLessThan(0.02);

    // Deterministic ordering by θ.
    expect(a.orbit[0]).toBeLessThanOrEqual(b.orbit[0]);
  });

  test('reports switched=false (no false positive) on a stable symmetric orbit', () => {
    // Well below onset the symmetric orbit is stable: there is no pitchfork pair.
    const params = { ...base, driveAmplitude: 0.9 };
    const sym = drivenPeriodicOrbitN(params, [0, 0], 1, { dt: 0.004, tolerance: 1e-11 });
    expect(sym.stable).toBe(true);
    const result = switchSymmetryBreaking(params, sym.orbit, { dt: 0.004, tolerance: 1e-11 });
    expect(result.switched).toBe(false);
  });
});

describe('generic transcritical branch switching', () => {
  test('switches from x = 0 onto x = lambda in the normal form x(lambda - x) = 0', () => {
    const result = switchTranscriticalBranch(
      {
        dimension: 1,
        residual: (state, lambda, out) => {
          out[0] = state[0]! * (lambda - state[0]!);
        },
        jacobian: (state, lambda, out) => {
          out[0] = lambda - 2 * state[0]!;
        }
      },
      { state: [0], parameter: 0 },
      {
        parameterStep: 0.2,
        branchTangent: [1],
        referenceBranch: () => [0],
        tolerance: 1e-12
      }
    );
    expect(result.converged).toBe(true);
    expect(result.switched).toBe(true);
    expect(result.state[0]!).toBeCloseTo(0.2, 12);
    expect(result.separation).toBeGreaterThan(0.19);
  });

  test('reports switched=false when Newton falls back onto the reference branch', () => {
    const result = switchTranscriticalBranch(
      {
        dimension: 1,
        residual: (state, lambda, out) => {
          out[0] = state[0]! * (lambda - state[0]!);
        },
        jacobian: (state, lambda, out) => {
          out[0] = lambda - 2 * state[0]!;
        }
      },
      { state: [0], parameter: 0 },
      {
        parameterStep: 0.2,
        branchTangent: [0],
        referenceBranch: () => [0],
        tolerance: 1e-12
      }
    );
    expect(result.converged).toBe(true);
    expect(result.switched).toBe(false);
    expect(result.state[0]!).toBeCloseTo(0, 12);
  });
});
