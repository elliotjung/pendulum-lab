/**
 * Complex eigenvalues of a small, dense, real matrix — the spectral engine
 * behind the Koopman / DMD tooling (`dmd.ts`). A DMD operator is generally
 * non-symmetric with complex-conjugate eigenvalues (oscillatory modes), so the
 * symmetric solvers elsewhere in the codebase do not apply.
 *
 * Rather than a hand-rolled non-symmetric QR iteration (subtle to get bug-free),
 * the eigenvalues are obtained the algebraically transparent way:
 *
 *   1. the characteristic polynomial p(λ) = det(λI − A) via the
 *      **Faddeev–LeVerrier** recursion (exact, only matrix products and traces);
 *   2. all complex roots of p via the **Durand–Kerner (Weierstrass)**
 *      simultaneous iteration.
 *
 * This is exact and well-conditioned for the modest dimensions DMD/EDMD produce
 * (n ≲ 15, distinct eigenvalues). Faddeev–LeVerrier loses precision for large or
 * tightly clustered spectra; that is the documented scope, and every consumer
 * cross-checks the result (trace = Σλ, det = Πλ, characteristic residual).
 */

/** A complex number. */
export interface Complex {
  re: number;
  im: number;
}

const cAdd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a: Complex, b: Complex): Complex => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });

function cDiv(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

/** |z|. */
export const complexAbs = (z: Complex): number => Math.hypot(z.re, z.im);

/** Principal complex logarithm ln z = ln|z| + i·arg z. */
export function complexLog(z: Complex): Complex {
  return { re: Math.log(complexAbs(z)), im: Math.atan2(z.im, z.re) };
}

/**
 * Characteristic polynomial of a real n×n matrix (row-major) by
 * Faddeev–LeVerrier. Returns the monic coefficients `c[k]` = coefficient of λ^k,
 * length n+1 with `c[n] = 1`, so p(λ) = λⁿ + c[n−1]λⁿ⁻¹ + … + c[0].
 */
export function characteristicPolynomial(a: readonly number[], n: number): number[] {
  if (n < 1) throw new Error('characteristicPolynomial: n must be ≥ 1.');
  const coeffs = new Array<number>(n + 1).fill(0);
  coeffs[n] = 1;
  // M starts as the identity.
  let m = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; i += 1) m[i * n + i] = 1;

  for (let k = 1; k <= n; k += 1) {
    // am = A · M
    const am = new Array<number>(n * n).fill(0);
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        let s = 0;
        for (let p = 0; p < n; p += 1) s += (a[i * n + p] ?? 0) * (m[p * n + j] ?? 0);
        am[i * n + j] = s;
      }
    }
    let trace = 0;
    for (let i = 0; i < n; i += 1) trace += am[i * n + i] ?? 0;
    const ck = -trace / k; // coefficient c_k = coefficient of λ^{n-k}
    coeffs[n - k] = ck;
    // M ← A·M + ck·I  (for the next iteration).
    for (let i = 0; i < n; i += 1) am[i * n + i] = (am[i * n + i] ?? 0) + ck;
    m = am;
  }
  return coeffs;
}

/**
 * All complex roots of a monic real polynomial `coeffs[k]` = coefficient of λ^k
 * (so `coeffs[n] = 1`) via the Durand–Kerner simultaneous iteration. Returns n
 * roots (with multiplicity for distinct-root inputs).
 */
export function polynomialRoots(coeffs: readonly number[], maxIterations = 1000, tolerance = 1e-14): Complex[] {
  const n = coeffs.length - 1;
  if (n < 1) return [];
  if (n === 1) return [{ re: -(coeffs[0] ?? 0), im: 0 }]; // λ + c0 = 0 (monic)

  const evalPoly = (z: Complex): Complex => {
    let result: Complex = { re: coeffs[n] ?? 1, im: 0 };
    for (let k = n - 1; k >= 0; k -= 1) result = cAdd(cMul(result, z), { re: coeffs[k] ?? 0, im: 0 });
    return result;
  };

  // Distinct non-real seeds on a spiral (the classic 0.4 + 0.9i powers).
  const seed: Complex = { re: 0.4, im: 0.9 };
  let roots: Complex[] = [];
  let cur: Complex = { re: 1, im: 0 };
  for (let i = 0; i < n; i += 1) {
    cur = cMul(cur, seed);
    roots.push({ re: cur.re, im: cur.im });
  }

  for (let iter = 0; iter < maxIterations; iter += 1) {
    let maxDelta = 0;
    const next = roots.map((zi, i) => {
      let denom: Complex = { re: 1, im: 0 };
      for (let j = 0; j < n; j += 1) {
        if (j !== i) denom = cMul(denom, cSub(zi, roots[j]!));
      }
      const delta = cDiv(evalPoly(zi), denom);
      const mag = complexAbs(delta);
      if (mag > maxDelta) maxDelta = mag;
      return cSub(zi, delta);
    });
    roots = next;
    if (maxDelta < tolerance) break;
  }
  return roots;
}

/**
 * Complex eigenvalues of a real n×n matrix (row-major). n ≤ 2 use the closed
 * form; n ≥ 3 go through Faddeev–LeVerrier + Durand–Kerner.
 */
export function matrixEigenvalues(a: readonly number[], n: number): Complex[] {
  if (n < 1) throw new Error('matrixEigenvalues: n must be ≥ 1.');
  if (n === 1) return [{ re: a[0] ?? 0, im: 0 }];
  if (n === 2) {
    const tr = (a[0] ?? 0) + (a[3] ?? 0);
    const det = (a[0] ?? 0) * (a[3] ?? 0) - (a[1] ?? 0) * (a[2] ?? 0);
    const disc = tr * tr - 4 * det;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      return [
        { re: (tr + s) / 2, im: 0 },
        { re: (tr - s) / 2, im: 0 }
      ];
    }
    const s = Math.sqrt(-disc);
    return [
      { re: tr / 2, im: s / 2 },
      { re: tr / 2, im: -s / 2 }
    ];
  }
  return polynomialRoots(characteristicPolynomial(a, n));
}
