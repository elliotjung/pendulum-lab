import { describe, expect, test } from 'vitest';
import { covariantLyapunovVectors, lyapunovSpectrum } from '../src/chaos/index';
import { rhsDouble } from '../src/physics/double';
import { buildJacobian } from '../src/physics/systemSpec';

/**
 * The decisive CLV correctness test uses a linear system whose covariant vectors
 * are *exactly* its (non-orthogonal) eigenvectors. A plain Gram–Schmidt frame
 * would return orthogonal vectors and get the second direction wrong, so
 * recovering the true non-orthogonal eigenvectors proves the Ginelli backward
 * pass is implemented correctly — not just re-deriving the GS basis.
 *
 *   A = [[0.5, -0.8], [0, -0.3]]
 *   eigenvalue 0.5  → eigenvector [1, 0]
 *   eigenvalue −0.3 → eigenvector [1, 1] (NOT orthogonal to [1, 0])
 */
describe('CLV recovery on a linear system with known eigenvectors', () => {
  const A = [0.5, -0.8, 0, -0.3];
  const rhs = (s: Float64Array, o: Float64Array): void => {
    o[0] = A[0]! * (s[0] ?? 0) + A[1]! * (s[1] ?? 0);
    o[1] = A[2]! * (s[0] ?? 0) + A[3]! * (s[1] ?? 0);
  };
  const jacobian = (_s: Float64Array, jac: Float64Array): void => {
    jac[0] = A[0]!;
    jac[1] = A[1]!;
    jac[2] = A[2]!;
    jac[3] = A[3]!;
  };

  const result = covariantLyapunovVectors(
    [1, 0.5],
    rhs,
    2,
    {
      dt: 0.01,
      renormEvery: 10,
      forwardTransient: 100,
      window: 200,
      backwardTransient: 100
    },
    jacobian
  );

  test('recovers the exponents log-eigenvalues 0.5 and −0.3', () => {
    expect(result.exponents[0]!).toBeCloseTo(0.5, 2);
    expect(result.exponents[1]!).toBeCloseTo(-0.3, 2);
  });

  test('CLV₀ is parallel to [1,0] and CLV₁ to the non-orthogonal [1,1]', () => {
    expect(result.vectors.length).toBeGreaterThan(0);
    const v = result.vectors[Math.floor(result.vectors.length / 2)]!;
    const v0 = [v[0]!, v[1]!];
    const v1 = [v[2]!, v[3]!];
    // CLV₀ ∥ [1,0]: second component ~0.
    expect(Math.abs(v0[0]!)).toBeCloseTo(1, 3);
    expect(Math.abs(v0[1]!)).toBeLessThan(1e-3);
    // CLV₁ ∥ [1,1]/√2: equal-magnitude components — the GS answer [0,1] would fail this.
    expect(Math.abs(v1[0]!)).toBeCloseTo(Math.SQRT1_2, 2);
    expect(Math.abs(v1[1]!)).toBeCloseTo(Math.SQRT1_2, 2);
  });

  test('hyperbolicity angle between expanding and contracting CLVs is π/4', () => {
    expect(result.meanHyperbolicityAngle).toBeCloseTo(Math.PI / 4, 2);
  });
});

describe('CLV on the double pendulum cross-checks the Lyapunov spectrum', () => {
  const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
  const rhs = (s: Float64Array, o: Float64Array): void => {
    rhsDouble(s, params, 0, o);
  };
  const jacobian = buildJacobian({ kind: 'double', ...params });

  test('CLV exponents match lyapunovSpectrum and the spectrum is ≈ {λ,0,0,−λ}', () => {
    const clv = covariantLyapunovVectors(
      [2.0, 2.0, 0, 0],
      rhs,
      4,
      {
        dt: 0.01,
        renormEvery: 10,
        forwardTransient: 300,
        window: 600,
        backwardTransient: 300
      },
      jacobian
    );
    const spec = lyapunovSpectrum(new Float64Array([2.0, 2.0, 0, 0]), rhs, 4, { dt: 0.01, steps: 9000 }, jacobian);

    // Same largest exponent (chaotic, positive) within finite-time scatter.
    expect(clv.exponents[0]!).toBeGreaterThan(0);
    expect(Math.abs(clv.exponents[0]! - spec.spectrum[0]!)).toBeLessThan(0.15);
    // Hamiltonian pairing: λ₁ ≈ −λ₄, sum ≈ 0.
    expect(clv.exponents[0]! + clv.exponents[3]!).toBeCloseTo(0, 1);
    const sum = clv.exponents.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum)).toBeLessThan(0.2);
    // The chaotic double pendulum is (mostly) hyperbolic: expanding/contracting
    // directions stay measurably apart on average.
    expect(clv.minHyperbolicityAngle).toBeGreaterThan(0);
    expect(clv.meanHyperbolicityAngle).toBeGreaterThan(0);
  });
});
