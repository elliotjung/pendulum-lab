import { describe, expect, it } from 'vitest';
import { jacobiEigenSymmetric, thinSvd } from '../src/research/svd';

describe('jacobiEigenSymmetric', () => {
  it('diagonalises a symmetric 2×2 with orthonormal eigenvectors', () => {
    // [[2,1],[1,2]] ⇒ eigenvalues 3, 1.
    const { values, vectors } = jacobiEigenSymmetric([2, 1, 1, 2], 2);
    expect(values[0]).toBeCloseTo(3, 12);
    expect(values[1]).toBeCloseTo(1, 12);
    // Columns orthonormal: VᵀV = I.
    const dot = (p: number, q: number): number =>
      vectors[0 * 2 + p]! * vectors[0 * 2 + q]! + vectors[1 * 2 + p]! * vectors[1 * 2 + q]!;
    expect(dot(0, 0)).toBeCloseTo(1, 12);
    expect(dot(1, 1)).toBeCloseTo(1, 12);
    expect(dot(0, 1)).toBeCloseTo(0, 12);
  });

  it('recovers a 3×3 spectrum and satisfies A v = λ v', () => {
    // Symmetric A = [[4,1,0],[1,3,1],[0,1,2]].
    const n = 3;
    const a = [4, 1, 0, 1, 3, 1, 0, 1, 2];
    const { values, vectors } = jacobiEigenSymmetric(a, n);
    // Trace invariant.
    expect(values.reduce((s, v) => s + v, 0)).toBeCloseTo(9, 10);
    // Eigenpair residual for each column.
    for (let k = 0; k < n; k += 1) {
      let maxRes = 0;
      for (let i = 0; i < n; i += 1) {
        let av = 0;
        for (let j = 0; j < n; j += 1) av += a[i * n + j]! * vectors[j * n + k]!;
        maxRes = Math.max(maxRes, Math.abs(av - values[k]! * vectors[i * n + k]!));
      }
      expect(maxRes).toBeLessThan(1e-10);
    }
  });
});

describe('thinSvd', () => {
  it('factors a 3×2 matrix with known singular values and reconstructs exactly', () => {
    const m = [3, 0, 0, 2, 0, 0]; // rows=3, cols=2
    const s = thinSvd(m, 3, 2);
    expect(s.rank).toBe(2);
    expect(s.singularValues[0]).toBeCloseTo(3, 10);
    expect(s.singularValues[1]).toBeCloseTo(2, 10);
    let maxErr = 0;
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        let v = 0;
        for (let k = 0; k < s.rank; k += 1) v += s.u[i * s.rank + k]! * s.singularValues[k]! * s.v[j * s.rank + k]!;
        maxErr = Math.max(maxErr, Math.abs(v - m[i * 2 + j]!));
      }
    }
    expect(maxErr).toBeLessThan(1e-12);
  });

  it('truncates to maxRank and reconstructs a rank-2 matrix embedded in 5×N', () => {
    const rows = 5;
    const cols = 40;
    const b1 = [1, 0.5, -0.3, 0.2, 0.1];
    const b2 = [0, 1, 0.4, -0.6, 0.3];
    const m = new Array<number>(rows * cols).fill(0);
    for (let t = 0; t < cols; t += 1) {
      const a = Math.cos(0.3 * t);
      const b = Math.sin(0.2 * t + 1);
      for (let i = 0; i < rows; i += 1) m[i * cols + t] = a * b1[i]! + b * b2[i]!;
    }
    const s = thinSvd(m, rows, cols, { maxRank: 2 });
    expect(s.rank).toBe(2);
    // The two retained singular values dominate; reconstruction is exact.
    let maxErr = 0;
    for (let i = 0; i < rows; i += 1) {
      for (let j = 0; j < cols; j += 1) {
        let v = 0;
        for (let k = 0; k < s.rank; k += 1) v += s.u[i * s.rank + k]! * s.singularValues[k]! * s.v[j * s.rank + k]!;
        maxErr = Math.max(maxErr, Math.abs(v - m[i * cols + j]!));
      }
    }
    expect(maxErr).toBeLessThan(1e-10);
  });
});
