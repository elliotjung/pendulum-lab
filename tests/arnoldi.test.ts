import { describe, expect, it } from 'vitest';
import { restartedArnoldi, type RealLinearOperator } from '../src/research/arnoldi';
import { eigenvaluesGeneral } from '../src/research/eigenGeneral';
import { complexAbs, type Complex } from '../src/research/complexEig';

function applyMatrix(a: number[][], n: number): RealLinearOperator {
  return (x) => {
    const out = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i += 1) {
      let s = 0;
      for (let j = 0; j < n; j += 1) s += (a[i]![j] ?? 0) * (x[j] ?? 0);
      out[i] = s;
    }
    return out;
  };
}

/** ‖A x − θ x‖ for a complex Ritz pair, using the real operator A. */
function complexResidual(apply: RealLinearOperator, theta: Complex, vector: { re: number[]; im: number[] }): number {
  const aRe = apply(vector.re);
  const aIm = apply(vector.im);
  let s = 0;
  for (let i = 0; i < vector.re.length; i += 1) {
    const re = (aRe[i] ?? 0) - (theta.re * (vector.re[i] ?? 0) - theta.im * (vector.im[i] ?? 0));
    const im = (aIm[i] ?? 0) - (theta.re * (vector.im[i] ?? 0) + theta.im * (vector.re[i] ?? 0));
    s += re * re + im * im;
  }
  return Math.sqrt(s);
}

/** Greedy nearest-neighbour match distance between two complex spectra. */
function spectraDistance(a: readonly Complex[], b: readonly Complex[]): number {
  const used = new Array<boolean>(b.length).fill(false);
  let worst = 0;
  for (const za of a) {
    let bestD = Infinity;
    let bestIdx = -1;
    for (let j = 0; j < b.length; j += 1) {
      if (used[j]) continue;
      const d = Math.hypot(za.re - b[j]!.re, za.im - b[j]!.im);
      if (d < bestD) {
        bestD = d;
        bestIdx = j;
      }
    }
    if (bestIdx >= 0) used[bestIdx] = true;
    worst = Math.max(worst, bestD);
  }
  return worst;
}

function topByModulus(values: readonly Complex[], k: number): Complex[] {
  return values
    .slice()
    .sort((p, q) => complexAbs(q) - complexAbs(p))
    .slice(0, k);
}

describe('restarted Arnoldi — non-symmetric spectra', () => {
  it('matches eigenvaluesGeneral on the dominant real spectrum', () => {
    const n = 60;
    const diag = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i += 1) diag[i] = i < 6 ? 15 - 2 * i : 1.5 / (i - 4); // a clear dominant gap
    const a: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? diag[i]! : 0.3 * Math.sin(1.3 * i + 0.7 * j)))
    );
    const apply = applyMatrix(a, n);
    const result = restartedArnoldi(apply, { dimension: n, numEigenvalues: 4, krylovDim: 24, tolerance: 1e-8 });

    expect(result.converged).toBe(true);
    const got = result.eigenpairs.map((p) => p.value);
    const want = topByModulus(eigenvaluesGeneral(a), 4);
    expect(spectraDistance(got, want)).toBeLessThan(1e-6);
    // Every returned Ritz pair is a genuine eigenpair: ‖A x − θ x‖ ≈ 0.
    for (const pair of result.eigenpairs) {
      expect(complexResidual(apply, pair.value, pair.vector)).toBeLessThan(1e-6);
      expect(pair.residual).toBeLessThan(1e-8);
    }
  });

  it('recovers a dominant complex-conjugate pair', () => {
    const n = 40;
    const a: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? -0.5 : 0))
    );
    // A dominant rotation–scaling 2×2 block in the top-left: eigenvalues 2 ± 3i (|λ| = √13).
    a[0]![0] = 2;
    a[0]![1] = 3;
    a[1]![0] = -3;
    a[1]![1] = 2;
    // light non-normal coupling so it is not block-trivial
    for (let i = 2; i < n; i += 1) a[i]![i - 2] = 0.2;
    const apply = applyMatrix(a, n);
    const result = restartedArnoldi(apply, { dimension: n, numEigenvalues: 2, krylovDim: 20, tolerance: 1e-8 });

    expect(result.converged).toBe(true);
    const dominant = result.eigenpairs[0]!.value;
    expect(complexAbs(dominant)).toBeCloseTo(Math.sqrt(13), 5);
    expect(Math.abs(dominant.re)).toBeCloseTo(2, 5);
    expect(Math.abs(dominant.im)).toBeCloseTo(3, 5);
    for (const pair of result.eigenpairs) {
      expect(complexResidual(apply, pair.value, pair.vector)).toBeLessThan(1e-6);
    }
  });

  it('is deterministic for a fixed problem', () => {
    const n = 30;
    const a: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 10 - i * 0.3 : 0.1 * Math.cos(i + 2 * j)))
    );
    const apply = applyMatrix(a, n);
    const r1 = restartedArnoldi(apply, { dimension: n, numEigenvalues: 3, krylovDim: 16 });
    const r2 = restartedArnoldi(apply, { dimension: n, numEigenvalues: 3, krylovDim: 16 });
    expect(r1.eigenpairs.map((p) => p.value)).toEqual(r2.eigenpairs.map((p) => p.value));
  });
});
