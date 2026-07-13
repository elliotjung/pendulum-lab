/**
 * **Restarted Arnoldi** — a few dominant (largest-modulus) eigenpairs of a
 * *large, general (non-symmetric)* linear operator reached only through a
 * matrix–vector product `apply(x) = Ax`. This is the non-symmetric counterpart
 * of {@link restartedLanczos} (symmetric) and the matrix-free scale-up of
 * `eigenvaluesGeneral` (which needs the dense matrix): the natural tool for the
 * spectra that are non-symmetric by nature — Floquet **monodromy** matrices and
 * the Perron–Frobenius / Ulam **transfer operator** at a resolution too large to
 * store densely.
 *
 * An m-step Arnoldi factorisation A V_m = V_m H_m + β v_{m+1} e_mᵀ (modified
 * Gram–Schmidt with reorthogonalisation) reduces A to a small upper-Hessenberg
 * H_m whose eigenvalues — the **Ritz values** — approximate the dominant
 * spectrum of A; they are obtained from the trusted dense solver
 * `eigenvaluesGeneral`. For each Ritz value θ the Ritz vector y of H_m is found
 * by one step of (complex) **inverse iteration**, giving both the standard
 * Arnoldi residual estimate ‖A x − θ x‖ ≈ β·|e_mᵀ y| (no extra mat–vec) and the
 * Ritz vector x = V_m y. When the wanted residuals exceed the tolerance the
 * method **explicitly restarts** from the (real) sum of the wanted Ritz vectors
 * — a polynomial filter toward the dominant invariant subspace — repeating until
 * convergence. Deterministic (fixed start vector).
 *
 * Self-validation: the dominant Ritz values match `eigenvaluesGeneral` on dense
 * non-symmetric matrices (real and complex spectra), and the returned Ritz
 * vectors satisfy ‖A x − θ x‖ ≈ 0. Scope: the *dominant* part of the spectrum
 * (largest modulus); interior eigenvalues need a shift-and-invert operator (the
 * caller supplies it as `apply`). Sparse unitary Floquet scale-up is provided by
 * `complexUnitaryFloquetArnoldiSchurSpectrum`; a fully locked thick-restart
 * Schur implementation for crowded non-unitary/interior spectra remains the
 * next numerical frontier.
 */
import { complexAbs, type Complex } from './complexEig';
import { eigenvaluesGeneral } from './eigenGeneral';

export type RealLinearOperator = (vector: readonly number[]) => number[];

export interface ArnoldiOptions {
  /** Operator dimension n (≥ 2). */
  dimension: number;
  /** Number of wanted (largest-modulus) eigenpairs k (≥ 1). Default 4. */
  numEigenvalues?: number;
  /** Krylov subspace size m per cycle (> k). Default min(n, max(2k+20, 30)). */
  krylovDim?: number;
  /** Maximum explicit restarts. Default 100. */
  maxRestarts?: number;
  /** Residual tolerance β·|eₘᵀy|. Default 1e-8. */
  tolerance?: number;
  /** Start vector (length n). Default a fixed deterministic pattern. */
  seed?: readonly number[];
}

export interface ArnoldiEigenpair {
  /** Ritz value θ (eigenvalue estimate). */
  value: Complex;
  /** Arnoldi residual estimate ‖A x − θ x‖ ≈ β·|eₘᵀy|. */
  residual: number;
  /** Ritz vector x = V_m y (complex), length n. */
  vector: { re: number[]; im: number[] };
}

export interface ArnoldiResult {
  /** The k wanted eigenpairs, ordered by descending modulus. */
  eigenpairs: ArnoldiEigenpair[];
  /** True iff every wanted residual is below the tolerance. */
  converged: boolean;
  /** Explicit restart cycles performed. */
  restarts: number;
  /** Total operator applications (mat–vec products). */
  matVecs: number;
}

// --- minimal complex linear algebra (small dense systems) ------------------

type Cx = { re: number; im: number };
const cx = (re = 0, im = 0): Cx => ({ re, im });
const cSub = (a: Cx, b: Cx): Cx => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cAbs = (a: Cx): number => Math.hypot(a.re, a.im);
function cDiv(a: Cx, b: Cx): Cx {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

/** Solve the complex m×m system M z = rhs by Gaussian elimination with partial pivoting. */
function complexSolve(m: Cx[][], rhs: Cx[], size: number): Cx[] {
  const a = m.map((row) => row.slice());
  const b = rhs.slice();
  for (let col = 0; col < size; col += 1) {
    let piv = col;
    let best = cAbs(a[col]![col]!);
    for (let r = col + 1; r < size; r += 1) {
      const mag = cAbs(a[r]![col]!);
      if (mag > best) {
        best = mag;
        piv = r;
      }
    }
    if (piv !== col) {
      const tmp = a[piv]!;
      a[piv] = a[col]!;
      a[col] = tmp;
      const tb = b[piv]!;
      b[piv] = b[col]!;
      b[col] = tb;
    }
    const pivot = a[col]![col]!;
    for (let r = col + 1; r < size; r += 1) {
      const factor = cDiv(a[r]![col]!, pivot);
      for (let c = col; c < size; c += 1) a[r]![c] = cSub(a[r]![c]!, cMul(factor, a[col]![c]!));
      b[r] = cSub(b[r]!, cMul(factor, b[col]!));
    }
  }
  const z = new Array<Cx>(size).fill(cx());
  for (let i = size - 1; i >= 0; i -= 1) {
    let s = b[i]!;
    for (let c = i + 1; c < size; c += 1) s = cSub(s, cMul(a[i]![c]!, z[c]!));
    z[i] = cDiv(s, a[i]![i]!);
  }
  return z;
}

/**
 * Eigenvector of the small real Hessenberg H for eigenvalue θ, via two steps of
 * inverse iteration with a slightly shifted (so non-singular) system. Returns a
 * unit complex vector of length `size`.
 */
function ritzEigenvector(h: number[][], theta: Complex, size: number): Cx[] {
  const eps = 1e-9 * (1 + cAbs(theta));
  const shift = cx(theta.re + eps, theta.im + eps);
  const m: Cx[][] = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) => cx((h[i]![j] ?? 0) - (i === j ? shift.re : 0), i === j ? -shift.im : 0))
  );
  let y: Cx[] = Array.from({ length: size }, (_, i) => cx(Math.sin(i + 1) + 0.5, Math.cos(i * 0.7)));
  for (let iter = 0; iter < 2; iter += 1) {
    const z = complexSolve(m, y, size);
    let norm = 0;
    for (const zi of z) norm += zi.re * zi.re + zi.im * zi.im;
    norm = Math.sqrt(norm);
    if (!(norm > 0)) break;
    y = z.map((zi) => cx(zi.re / norm, zi.im / norm));
  }
  return y;
}

// --- real vector helpers ---------------------------------------------------

function dot(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}
const norm2 = (a: readonly number[]): number => Math.sqrt(dot(a, a));

function defaultSeed(n: number): number[] {
  const v = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) v[i] = Math.sin(0.6 * i + 1) + 0.3 * Math.cos(0.29 * i);
  return v;
}

/**
 * Dominant eigenpairs of a general matrix-free operator by explicitly-restarted
 * Arnoldi. See the module overview for the algorithm and scope.
 */
export function restartedArnoldi(apply: RealLinearOperator, options: ArnoldiOptions): ArnoldiResult {
  const n = Math.trunc(options.dimension);
  if (!(n >= 2)) throw new Error('restartedArnoldi: dimension must be an integer ≥ 2.');
  const k = Math.max(1, Math.trunc(options.numEigenvalues ?? 4));
  if (k >= n) throw new Error('restartedArnoldi: numEigenvalues must be < dimension.');
  const m = Math.max(k + 1, Math.min(n, Math.trunc(options.krylovDim ?? Math.max(2 * k + 20, 30))));
  const maxRestarts = Math.max(1, Math.trunc(options.maxRestarts ?? 100));
  const tol = options.tolerance ?? 1e-8;

  let seed = options.seed ? Array.from(options.seed) : defaultSeed(n);
  if (seed.length !== n) throw new Error('restartedArnoldi: seed length must equal dimension.');
  if (!(norm2(seed) > 0)) seed = defaultSeed(n);

  const matVec = (x: readonly number[]): number[] => {
    const y = apply(x);
    if (y.length !== n) throw new Error('restartedArnoldi: operator returned wrong-length vector.');
    return y;
  };

  let matVecs = 0;
  let best: ArnoldiEigenpair[] = [];
  let converged = false;
  let restart = 0;

  for (; restart < maxRestarts; restart += 1) {
    // --- m-step Arnoldi factorisation ------------------------------------
    const v: number[][] = [seed.map((x) => x / norm2(seed))];
    const h: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
    let beta = 0;
    let steps = 0;
    for (let j = 0; j < m; j += 1) {
      const w = matVec(v[j]!);
      matVecs += 1;
      for (let pass = 0; pass < 2; pass += 1) {
        for (let i = 0; i <= j; i += 1) {
          const c = dot(v[i]!, w);
          h[i]![j] = (h[i]![j] ?? 0) + c;
          for (let t = 0; t < n; t += 1) w[t] = (w[t] ?? 0) - c * (v[i]![t] ?? 0);
        }
      }
      beta = norm2(w);
      steps = j + 1;
      if (beta <= 1e-13 || j === m - 1) break;
      h[j + 1]![j] = beta;
      v.push(w.map((x) => x / beta));
    }

    // --- Ritz values of the square Hessenberg H_steps --------------------
    const hSquare = h.slice(0, steps).map((row) => row.slice(0, steps));
    const ritzValues = eigenvaluesGeneral(hSquare);
    const order = ritzValues
      .map((value, idx) => ({ value, idx }))
      .sort((p, q) => complexAbs(q.value) - complexAbs(p.value));
    const wantCount = Math.min(k, steps);

    const pairs: ArnoldiEigenpair[] = [];
    const restartReal = new Array<number>(steps).fill(0);
    for (let w = 0; w < wantCount; w += 1) {
      const theta = order[w]!.value;
      const y = ritzEigenvector(hSquare, theta, steps);
      const residual = (steps < m ? 0 : beta) * cAbs(y[steps - 1] ?? cx());
      // Ritz vector x = V y (length n, complex).
      const re = new Array<number>(n).fill(0);
      const im = new Array<number>(n).fill(0);
      for (let j = 0; j < steps; j += 1) {
        const yj = y[j] ?? cx();
        const vj = v[j]!;
        for (let t = 0; t < n; t += 1) {
          re[t] = (re[t] ?? 0) + yj.re * (vj[t] ?? 0);
          im[t] = (im[t] ?? 0) + yj.im * (vj[t] ?? 0);
        }
        restartReal[j] = (restartReal[j] ?? 0) + yj.re; // bias next start toward wanted subspace
      }
      pairs.push({ value: theta, residual, vector: { re, im } });
    }
    best = pairs;
    converged = pairs.every((p) => p.residual <= tol);
    if (converged || steps < m) break; // converged, or a happy breakdown gave an invariant subspace

    // --- explicit restart: real combination of the wanted Ritz vectors --
    const next = new Array<number>(n).fill(0);
    for (let j = 0; j < steps; j += 1) {
      const vj = v[j]!;
      const c = restartReal[j] ?? 0;
      for (let t = 0; t < n; t += 1) next[t] = (next[t] ?? 0) + c * (vj[t] ?? 0);
    }
    if (!(norm2(next) > 0)) break;
    seed = next;
  }

  return { eigenpairs: best, converged, restarts: restart + 1, matVecs };
}
