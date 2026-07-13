import { describe, expect, it } from 'vitest';
import {
  coveringTransitionMatrix1D,
  perronEigenvalue,
  subshiftEntropy,
  topologicalEntropy1D
} from '../src/chaos/topologicalEntropy';

const PHI = (1 + Math.sqrt(5)) / 2; // golden ratio, root of λ² = λ + 1

describe('Perron eigenvalue (spectral radius via power iteration)', () => {
  it('returns N for the full N-shift (all-ones N×N matrix)', () => {
    for (const n of [2, 3, 5]) {
      const a = Array.from({ length: n }, () => new Array<number>(n).fill(1));
      const r = perronEigenvalue(a);
      expect(r.converged).toBe(true);
      expect(r.spectralRadius).toBeCloseTo(n, 10);
    }
  });

  it('matches the golden ratio for the golden-mean transition matrix', () => {
    const r = perronEigenvalue([
      [1, 1],
      [1, 0]
    ]);
    expect(r.spectralRadius).toBeCloseTo(PHI, 10);
    // dominant eigenvector ratio v₀/v₁ → φ as well (A v = φ v ⇒ v₀ = φ v₁)
    expect((r.eigenvector[0] ?? 0) / (r.eigenvector[1] ?? 1)).toBeCloseTo(PHI, 8);
  });

  it('returns spectral radius 1 for a cyclic permutation matrix (h = 0)', () => {
    const r = perronEigenvalue([
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 0]
    ]);
    expect(r.spectralRadius).toBeCloseTo(1, 10);
  });

  it('handles a non-symmetric primitive matrix with a known root (√6)', () => {
    // [[0,2],[3,0]] has eigenvalues ±√6 ⇒ spectral radius √6.
    const r = perronEigenvalue([
      [0, 2],
      [3, 0]
    ]);
    expect(r.spectralRadius).toBeCloseTo(Math.sqrt(6), 8);
  });

  it('rejects malformed or negative matrices', () => {
    expect(() => perronEigenvalue([])).toThrow(/non-empty/);
    expect(() => perronEigenvalue([[1, 1], [1]])).toThrow(/square/);
    expect(() =>
      perronEigenvalue([
        [-1, 0],
        [0, 1]
      ])
    ).toThrow(/non-negative/);
  });
});

describe('subshift topological entropy vs closed forms', () => {
  it('full 2-shift → log 2 (exact)', () => {
    const r = subshiftEntropy([
      [1, 1],
      [1, 1]
    ]);
    expect(r.entropy).toBeCloseTo(Math.LN2, 10);
  });

  it('golden-mean shift (forbid "11") → log φ', () => {
    const r = subshiftEntropy([
      [1, 1],
      [1, 0]
    ]);
    expect(r.entropy).toBeCloseTo(Math.log(PHI), 9);
  });

  it('full k-shift → log k', () => {
    for (const k of [2, 3, 4, 7]) {
      const a = Array.from({ length: k }, () => new Array<number>(k).fill(1));
      expect(subshiftEntropy(a).entropy).toBeCloseTo(Math.log(k), 10);
    }
  });

  it('a single self-loop and a pure 2-cycle are non-chaotic (h = 0)', () => {
    expect(subshiftEntropy([[1]]).entropy).toBeCloseTo(0, 10);
    expect(
      subshiftEntropy([
        [0, 1],
        [1, 0]
      ]).entropy
    ).toBeCloseTo(0, 10);
  });

  it('reproduces the doubling map (log 2) from its exact covering matrix', () => {
    // x ↦ 2x mod 1 is discontinuous at the box edges, so the covering matrix is
    // supplied directly (N = 4): box i ↦ {0,1} or {2,3}.
    const a = [
      [1, 1, 0, 0],
      [0, 0, 1, 1],
      [1, 1, 0, 0],
      [0, 0, 1, 1]
    ];
    expect(subshiftEntropy(a).entropy).toBeCloseTo(Math.LN2, 10);
  });
});

describe('topological entropy of the full tent map (covering / Markov partition)', () => {
  const tent = (x: number): number => 1 - Math.abs(2 * x - 1); // peak 1 at x = ½

  it('→ log 2 on dyadic Markov partitions', () => {
    for (const boxes of [2, 4, 8, 16]) {
      const r = topologicalEntropy1D(tent, [0, 1], boxes, 64);
      expect(r.entropy).toBeCloseTo(Math.LN2, 9);
    }
  });

  it('covers exactly two adjacent boxes per box (full-branched, N = 4)', () => {
    const a = coveringTransitionMatrix1D(tent, [0, 1], 4, 128);
    expect(a.length).toBe(4);
    for (let i = 0; i < 4; i += 1) {
      const degree = a[i]!.reduce((s, v) => s + v, 0);
      expect(degree).toBe(2);
    }
    // structure: box0→{0,1}, box1→{2,3}, box2→{2,3}, box3→{0,1}
    expect(a[0]).toEqual([1, 1, 0, 0]);
    expect(a[1]).toEqual([0, 0, 1, 1]);
    expect(a[2]).toEqual([0, 0, 1, 1]);
    expect(a[3]).toEqual([1, 1, 0, 0]);
  });

  it('rejects invalid arguments', () => {
    expect(() => coveringTransitionMatrix1D(tent, [0, 1], 1)).toThrow(/boxes/);
    expect(() => coveringTransitionMatrix1D(tent, [0, 1], 4, 0)).toThrow(/samplesPerBox/);
    expect(() => coveringTransitionMatrix1D(tent, [1, 0], 4)).toThrow(/b > a/);
  });
});
