import { describe, expect, it } from 'vitest';
import { dynamicModeDecomposition, extendedDmd } from '../src/research/dmd';
import { complexAbs, type Complex } from '../src/research/complexEig';
import { rk4Step } from '../src/physics/integrators';
import { rhsDouble } from '../src/physics/double';
import type { StateVector } from '../src/physics/types';

const c = (re: number, im = 0): Complex => ({ re, im });

function matchesSet(recovered: Complex[], expected: Complex[], tol: number): boolean {
  if (recovered.length !== expected.length) return false;
  const used = new Array<boolean>(recovered.length).fill(false);
  for (const e of expected) {
    let found = -1;
    for (let i = 0; i < recovered.length; i += 1) {
      if (!used[i] && complexAbs({ re: recovered[i]!.re - e.re, im: recovered[i]!.im - e.im }) < tol) {
        found = i;
        break;
      }
    }
    if (found < 0) return false;
    used[found] = true;
  }
  return true;
}

function trajectory(
  drift: (s: StateVector, o: StateVector) => StateVector,
  x0: number[],
  dt: number,
  steps: number
): number[][] {
  const snaps: number[][] = [];
  let s = Float64Array.from(x0) as unknown as StateVector;
  const next = new Float64Array(x0.length) as unknown as StateVector;
  for (let i = 0; i < steps; i += 1) {
    snaps.push(Array.from(s));
    rk4Step(s, dt, drift, next);
    s = Float64Array.from(next) as unknown as StateVector;
  }
  return snaps;
}

describe('DMD — linear-system spectra are recovered exactly', () => {
  it('harmonic oscillator gives purely imaginary μ = ±ω i', () => {
    const w = 2;
    const snaps = trajectory(
      (s, o) => {
        o[0] = s[1]!;
        o[1] = -w * w * s[0]!;
        return o;
      },
      [1, 0],
      0.01,
      300
    );
    const r = dynamicModeDecomposition(snaps, 0.01);
    expect(matchesSet(r.continuousEigenvalues, [c(0, w), c(0, -w)], 1e-6)).toBe(true);
    expect(Math.max(...r.growthRates.map(Math.abs))).toBeLessThan(1e-6);
    expect(r.oneStepError).toBeLessThan(1e-10);
  });

  it('damped oscillator gives μ = -ζω ± iω√(1-ζ²)', () => {
    const w = 2;
    const zeta = 0.1;
    const wd = w * Math.sqrt(1 - zeta * zeta);
    const snaps = trajectory(
      (s, o) => {
        o[0] = s[1]!;
        o[1] = -2 * zeta * w * s[1]! - w * w * s[0]!;
        return o;
      },
      [1, 0],
      0.01,
      300
    );
    const r = dynamicModeDecomposition(snaps, 0.01);
    expect(matchesSet(r.continuousEigenvalues, [c(-zeta * w, wd), c(-zeta * w, -wd)], 1e-4)).toBe(true);
    expect(r.oneStepError).toBeLessThan(1e-10);
  });
});

describe('DMD cross-validates the engine: double-pendulum normal modes from data', () => {
  it('recovers ω² = (2 ± √2)·g/l as purely imaginary continuous eigenvalues', () => {
    const g = 9.81;
    const l = 1;
    const params = { m1: 1, m2: 1, l1: l, l2: l, g };
    // Small-amplitude (≈ linear) conservative motion about the downward equilibrium.
    const snaps = trajectory((s, o) => rhsDouble(s, params, 0, o), [0.01, 0, 0, 0], 0.005, 600);
    const r = dynamicModeDecomposition(snaps, 0.005);
    const wPlus = Math.sqrt(((2 + Math.SQRT2) * g) / l);
    const wMinus = Math.sqrt(((2 - Math.SQRT2) * g) / l);
    expect(matchesSet(r.continuousEigenvalues, [c(0, wPlus), c(0, -wPlus), c(0, wMinus), c(0, -wMinus)], 1e-2)).toBe(
      true
    );
    // Conservative ⇒ growth rates ≈ 0.
    expect(Math.max(...r.growthRates.map(Math.abs))).toBeLessThan(1e-3);
  });
});

describe('EDMD — Koopman spectrum on a polynomial dictionary', () => {
  it('recovers the integer-combination spectrum of a linear flow', () => {
    // ẋ = L x, L = [[-0.1, 1],[-1, -0.1]] ⇒ eig(L) = -0.1 ± i.
    // Degree-2 dictionary is Koopman-invariant ⇒ EDMD eigenvalues are
    // {0, μ1, μ2, 2μ1, μ1+μ2, 2μ2} = {0, -0.2, -0.1±i, -0.2±2i}.
    // The one-step operator is machine-exact (oneStepError ~1e-15); the
    // eigenvalue extraction is limited to ~2e-5 by Faddeev–LeVerrier
    // conditioning at n=6 (the documented scope of complexEig).
    const L = [-0.1, 1, -1, -0.1];
    const snaps = trajectory(
      (s, o) => {
        o[0] = L[0]! * s[0]! + L[1]! * s[1]!;
        o[1] = L[2]! * s[0]! + L[3]! * s[1]!;
        return o;
      },
      [1.5, 0.5],
      0.02,
      500
    );
    const r = extendedDmd(snaps, 0.02, { polynomialDegree: 2 });
    expect(r.terms.map((t) => t.name)).toEqual(['1', 'x0', 'x1', 'x0^2', 'x0 x1', 'x1^2']);
    expect(
      matchesSet(r.continuousEigenvalues, [c(0, 0), c(-0.2, 0), c(-0.1, 1), c(-0.1, -1), c(-0.2, 2), c(-0.2, -2)], 1e-4)
    ).toBe(true);
    expect(r.oneStepError).toBeLessThan(1e-9);
  });
});

describe('SVD-truncated DMD — dominant modes from rank-deficient data', () => {
  it('recovers the 2 dynamic eigenvalues from a 5-observable rank-2 embedding', () => {
    // True 2D linear flow ż = L z (eig -0.05 ± i), observed through a fixed
    // full-column-rank 5×2 lift x = C z ⇒ 5-dim snapshots of rank 2.
    const L = [-0.05, 1, -1, -0.05];
    const C = [1, 0, 0, 1, 0.5, -0.3, -0.2, 0.7, 0.4, 0.4];
    const dt = 0.02;
    let z = Float64Array.from([1, 0.3]) as unknown as StateVector;
    const nz = new Float64Array(2) as unknown as StateVector;
    const snaps: number[][] = [];
    for (let t = 0; t < 400; t += 1) {
      const obs = new Array<number>(5).fill(0);
      for (let i = 0; i < 5; i += 1) obs[i] = C[i * 2]! * z[0]! + C[i * 2 + 1]! * z[1]!;
      snaps.push(obs);
      rk4Step(
        z,
        dt,
        (a, o) => {
          o[0] = L[0]! * a[0]! + L[1]! * a[1]!;
          o[1] = L[2]! * a[0]! + L[3]! * a[1]!;
          return o;
        },
        nz
      );
      z = Float64Array.from(nz) as unknown as StateVector;
    }

    // The normal-equations operator is singular here (rank-2 data in 5-D).
    expect(() => dynamicModeDecomposition(snaps, dt)).toThrow(/positive-definite/);

    // SVD-truncated DMD recovers the dominant spectrum.
    const r = dynamicModeDecomposition(snaps, dt, { rank: 2 });
    expect(r.rank).toBe(2);
    expect(r.dimension).toBe(2);
    expect(matchesSet(r.continuousEigenvalues, [c(-0.05, 1), c(-0.05, -1)], 1e-6)).toBe(true);
    expect(r.oneStepError).toBeLessThan(1e-9);
  });

  it('agrees with the plain operator on full-rank data when rank = n', () => {
    const w = 2;
    const snaps = trajectory(
      (s, o) => {
        o[0] = s[1]!;
        o[1] = -w * w * s[0]!;
        return o;
      },
      [1, 0],
      0.01,
      200
    );
    const trunc = dynamicModeDecomposition(snaps, 0.01, { rank: 2 });
    expect(matchesSet(trunc.continuousEigenvalues, [c(0, w), c(0, -w)], 1e-6)).toBe(true);
  });

  it('rejects a non-positive or non-integer rank', () => {
    const snaps = [
      [1, 0],
      [0.9, 0.1],
      [0.8, 0.2]
    ];
    expect(() => dynamicModeDecomposition(snaps, 0.1, { rank: 0 })).toThrow(/positive integer/);
    expect(() => dynamicModeDecomposition(snaps, 0.1, { rank: 1.5 })).toThrow(/positive integer/);
  });
});

describe('DMD input validation', () => {
  it('rejects fewer than two snapshots and non-rectangular input', () => {
    expect(() => dynamicModeDecomposition([[1, 2]], 0.1)).toThrow(/at least two/);
    expect(() => dynamicModeDecomposition([[1, 2], [3]], 0.1)).toThrow(/rectangular/);
  });

  it('reports a rank-deficient snapshot covariance instead of fabricating an operator', () => {
    // All snapshots collinear ⇒ X₁X₁ᵀ is singular.
    const snaps = [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4]
    ];
    expect(() => dynamicModeDecomposition(snaps, 0.1)).toThrow(/positive-definite/);
  });
});
