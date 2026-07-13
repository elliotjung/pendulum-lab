import { describe, expect, it } from 'vitest';
import { balanceMatrix, eigenvaluesGeneral, francisEigenvalues, hessenbergReduce } from '../src/research/eigenGeneral';
import { matrixEigenvalues, type Complex } from '../src/research/complexEig';
import { jacobiEigenSymmetric } from '../src/research/svd';

// ---- helpers -------------------------------------------------------------

/** Greedy nearest-neighbour matching distance between two complex spectra. */
function spectraMaxDistance(a: readonly Complex[], b: readonly Complex[]): number {
  expect(a.length).toBe(b.length);
  const used = new Array<boolean>(b.length).fill(false);
  let worst = 0;
  for (const za of a) {
    let bestIdx = -1;
    let bestD = Infinity;
    for (let j = 0; j < b.length; j += 1) {
      if (used[j]) continue;
      const zb = b[j]!;
      const d = Math.hypot(za.re - zb.re, za.im - zb.im);
      if (d < bestD) {
        bestD = d;
        bestIdx = j;
      }
    }
    used[bestIdx] = true;
    worst = Math.max(worst, bestD);
  }
  return worst;
}

const flatten = (m: number[][]): number[] => m.flat();

/** Determinant via LU with partial pivoting (independent reference). */
function luDeterminant(input: number[][]): number {
  const n = input.length;
  const a = input.map((r) => r.slice());
  let det = 1;
  for (let col = 0; col < n; col += 1) {
    let piv = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(a[r]![col]!) > Math.abs(a[piv]![col]!)) piv = r;
    if (a[piv]![col] === 0) return 0;
    if (piv !== col) {
      const tmp = a[piv]!;
      a[piv] = a[col]!;
      a[col] = tmp;
      det = -det;
    }
    det *= a[col]![col]!;
    for (let r = col + 1; r < n; r += 1) {
      const f = a[r]![col]! / a[col]![col]!;
      for (let c = col; c < n; c += 1) a[r]![c] = a[r]![c]! - f * a[col]![c]!;
    }
  }
  return det;
}

function seededMatrix(n: number, seed: number): number[][] {
  // mulberry32 PRNG → reproducible entries in [-1, 1].
  let s = seed >>> 0;
  const rand = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: n }, () => Array.from({ length: n }, () => 2 * rand() - 1));
}

// ---- tests ---------------------------------------------------------------

describe('eigenvaluesGeneral — closed-form spectra', () => {
  it('diagonal matrix → the diagonal entries', () => {
    const m = [
      [3, 0, 0],
      [0, -1.5, 0],
      [0, 0, 7]
    ];
    const ev = eigenvaluesGeneral(m);
    const target: Complex[] = [
      { re: 3, im: 0 },
      { re: -1.5, im: 0 },
      { re: 7, im: 0 }
    ];
    expect(spectraMaxDistance(ev, target)).toBeLessThan(1e-12);
  });

  it('upper-triangular matrix → the diagonal entries', () => {
    const m = [
      [2, 5, -1, 9],
      [0, -3, 4, 2],
      [0, 0, 6, 7],
      [0, 0, 0, 1]
    ];
    const ev = eigenvaluesGeneral(m);
    const target: Complex[] = [2, -3, 6, 1].map((re) => ({ re, im: 0 }));
    expect(spectraMaxDistance(ev, target)).toBeLessThan(1e-10);
  });

  it('2×2 rotation block → e^{±iθ}', () => {
    const theta = 0.7;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const ev = eigenvaluesGeneral([
      [c, -s],
      [s, c]
    ]);
    const target: Complex[] = [
      { re: c, im: s },
      { re: c, im: -s }
    ];
    expect(spectraMaxDistance(ev, target)).toBeLessThan(1e-13);
  });

  it('circulant matrix → its DFT spectrum λ_k = Σ_j c_j ω^{jk} (complex)', () => {
    for (const n of [5, 6]) {
      const c = Array.from({ length: n }, (_, j) => Math.cos(0.9 * j) - 0.3 * j); // arbitrary first row
      // C[i][j] = c[(j - i) mod n]
      const m = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => c[(((j - i) % n) + n) % n]!));
      const target: Complex[] = [];
      for (let k = 0; k < n; k += 1) {
        let re = 0;
        let im = 0;
        for (let j = 0; j < n; j += 1) {
          const ang = (2 * Math.PI * j * k) / n;
          re += c[j]! * Math.cos(ang);
          im += c[j]! * Math.sin(ang);
        }
        target.push({ re, im });
      }
      const ev = eigenvaluesGeneral(m);
      expect(spectraMaxDistance(ev, target)).toBeLessThan(1e-9);
    }
  });

  it('companion-form matrix → the roots of its polynomial (real + complex)', () => {
    // roots {2, -3, 1±2i}; build the real monic polynomial, then the companion.
    const roots: Complex[] = [
      { re: 2, im: 0 },
      { re: -3, im: 0 },
      { re: 1, im: 2 },
      { re: 1, im: -2 }
    ];
    // p(x) = Π (x − root): accumulate complex coefficients (imag parts cancel).
    let poly: Complex[] = [{ re: 1, im: 0 }]; // constant 1, ascending powers
    for (const root of roots) {
      const next: Complex[] = Array.from({ length: poly.length + 1 }, () => ({ re: 0, im: 0 }));
      for (let i = 0; i < poly.length; i += 1) {
        // multiply by (x − root)
        next[i + 1] = { re: next[i + 1]!.re + poly[i]!.re, im: next[i + 1]!.im + poly[i]!.im };
        next[i] = {
          re: next[i]!.re - (poly[i]!.re * root.re - poly[i]!.im * root.im),
          im: next[i]!.im - (poly[i]!.re * root.im + poly[i]!.im * root.re)
        };
      }
      poly = next;
    }
    const n = roots.length;
    const a = poly.map((z) => z.re); // a[0..n] ascending, a[n] = 1
    // Companion (lower form): last column = −a[0..n-1], subdiagonal ones.
    const m = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let i = 1; i < n; i += 1) m[i]![i - 1] = 1;
    for (let i = 0; i < n; i += 1) m[i]![n - 1] = -a[i]!;
    const ev = eigenvaluesGeneral(m);
    expect(spectraMaxDistance(ev, roots)).toBeLessThan(1e-8);
  });
});

describe('eigenvaluesGeneral — cross-checks against independent solvers', () => {
  it('agrees with complexEig (Faddeev–LeVerrier) on random small matrices', () => {
    for (const n of [3, 4, 5, 6]) {
      for (const seed of [1, 2, 3]) {
        const m = seededMatrix(n, seed * 100 + n);
        const ours = eigenvaluesGeneral(m);
        const ref = matrixEigenvalues(flatten(m), n);
        expect(spectraMaxDistance(ours, ref)).toBeLessThan(1e-6);
      }
    }
  });

  it('agrees with the symmetric Jacobi solver on a symmetric matrix (real spectrum)', () => {
    const n = 5;
    const base = seededMatrix(n, 4242);
    const sym = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (base[i]![j]! + base[j]![i]!) / 2)
    );
    const ours = eigenvaluesGeneral(sym);
    for (const z of ours) expect(Math.abs(z.im)).toBeLessThan(1e-9); // real spectrum
    const ref: Complex[] = jacobiEigenSymmetric(flatten(sym), n).values.map((re) => ({ re, im: 0 }));
    expect(spectraMaxDistance(ours, ref)).toBeLessThan(1e-9);
  });

  it('satisfies the trace and determinant invariants on larger random matrices', () => {
    for (const n of [8, 10, 15]) {
      const m = seededMatrix(n, 7 * n + 11);
      const ev = eigenvaluesGeneral(m);
      let sumRe = 0;
      let sumIm = 0;
      let prod: Complex = { re: 1, im: 0 };
      let trace = 0;
      for (let i = 0; i < n; i += 1) trace += m[i]![i]!;
      for (const z of ev) {
        sumRe += z.re;
        sumIm += z.im;
        prod = { re: prod.re * z.re - prod.im * z.im, im: prod.re * z.im + prod.im * z.re };
      }
      expect(sumRe).toBeCloseTo(trace, 8); // Σλ = tr A
      expect(sumIm).toBeCloseTo(0, 8); // imaginary parts cancel
      expect(prod.im).toBeCloseTo(0, 6);
      expect(prod.re).toBeCloseTo(luDeterminant(m), 6); // Πλ = det A
    }
  });
});

describe('building blocks: balance and Hessenberg preserve the spectrum', () => {
  it('Hessenberg reduction yields upper-Hessenberg form and keeps the eigenvalues', () => {
    const n = 6;
    const m = seededMatrix(n, 9090);
    const h = hessenbergReduce(m);
    // upper Hessenberg: entries below the first subdiagonal vanish
    for (let i = 0; i < n; i += 1) for (let j = 0; j < i - 1; j += 1) expect(Math.abs(h[i]![j]!)).toBeLessThan(1e-12);
    const evH = francisEigenvalues(h);
    const evRef = matrixEigenvalues(flatten(m), n);
    expect(spectraMaxDistance(evH, evRef)).toBeLessThan(1e-6);
  });

  it('balancing is a similarity (eigenvalues unchanged) and tames a badly-scaled matrix', () => {
    const m = [
      [1, 1e6, 0],
      [1e-6, 2, 1e6],
      [0, 1e-6, 3]
    ];
    const balanced = balanceMatrix(m);
    const evBalanced = eigenvaluesGeneral(m, { balance: true });
    const evRaw = eigenvaluesGeneral(m, { balance: false });
    expect(spectraMaxDistance(evBalanced, evRaw)).toBeLessThan(1e-6);
    // balancing equalises row/col norms → off-diagonals no longer span 12 orders
    let maxAbs = 0;
    let minAbsNonzero = Infinity;
    for (let i = 0; i < 3; i += 1)
      for (let j = 0; j < 3; j += 1) {
        const v = Math.abs(balanced[i]![j]!);
        if (i !== j && v > 0) {
          maxAbs = Math.max(maxAbs, v);
          minAbsNonzero = Math.min(minAbsNonzero, v);
        }
      }
    expect(maxAbs / minAbsNonzero).toBeLessThan(1e6); // was 1e12 before balancing
  });
});

describe('eigenvaluesGeneral — guards', () => {
  it('rejects non-square / empty input', () => {
    expect(() => eigenvaluesGeneral([])).toThrow(/non-empty/);
    expect(() => eigenvaluesGeneral([[1, 2], [3]])).toThrow(/square/);
  });

  it('handles the 1×1 case', () => {
    expect(eigenvaluesGeneral([[42]])[0]!.re).toBeCloseTo(42, 12);
  });
});
