import type { Derivative, Jacobian, StateVector } from '../physics/types';
import { rk4Step } from '../physics/integrators';
import { makeVariationalRhs, seedTangentFrame } from './variational';

/**
 * Covariant Lyapunov vectors (CLVs) via the Ginelli algorithm
 * (Ginelli, Poggi, Turchi, Chaté, Livi & Politi, PRL 2007).
 *
 * The Gram–Schmidt vectors used by the Lyapunov spectrum are *orthogonal* by
 * construction, so they are not the physical perturbation directions — only
 * their growth rates are meaningful. The covariant Lyapunov vectors are the true
 * Oseledets directions: they are covariant with the dynamics (the linearized
 * flow maps the CLV at one time onto the CLV at the next), generally
 * non-orthogonal, and norm-independent. They are what "the stable/unstable
 * directions" actually means, and the angles between the expanding and
 * contracting CLVs measure the degree of hyperbolicity (vanishing angles =
 * homoclinic tangencies = non-hyperbolic dynamics).
 *
 * Method:
 *  1. Forward transient: evolve an orthonormal frame under the variational flow
 *     with periodic QR so it aligns with the backward Lyapunov (GS) basis.
 *  2. Forward window: keep evolving, storing each orthonormal frame Qₘ and the
 *     upper-triangular factor Rₘ from QR (which satisfies Flow·Q_{m-1}=Qₘ Rₘ).
 *  3. Backward pass: a covariant vector's coefficients cₘ in the Qₘ basis obey
 *     c_{m} = R_{m+1}⁻¹ c_{m+1} (renormalized). Iterating this recursion backward
 *     from a generic upper-triangular seed converges (after a backward transient)
 *     onto the CLV coefficients, and the CLV is Vₘ = Qₘ cₘ.
 */

export interface ClvSettings {
  dt: number;
  renormEvery: number;
  forwardTransient: number;
  window: number;
  backwardTransient: number;
  seed: number;
}

export interface ClvResult {
  /** Lyapunov exponents from the QR diagonal, in Gram–Schmidt (descending) order. */
  exponents: number[];
  /** Analysis times (relative to the start of the window). */
  times: number[];
  /**
   * CLVs at each analysis time, aligned with `times`. Entry `t` has length k*n;
   * `vectors[t].subarray(j*n, (j+1)*n)` is the unit covariant vector j (same
   * ordering as `exponents`).
   */
  vectors: Float64Array[];
  /** Minimum angle (radians) between an expanding and a contracting CLV, per analysis time. */
  hyperbolicityAngles: number[];
  /** Mean of `hyperbolicityAngles`. */
  meanHyperbolicityAngle: number;
  /** Minimum of `hyperbolicityAngles` (≈0 signals tangencies / non-hyperbolicity). */
  minHyperbolicityAngle: number;
  settings: ClvSettings & { count: number };
}

const DEFAULTS: ClvSettings = {
  dt: 0.01,
  renormEvery: 10,
  forwardTransient: 200,
  window: 400,
  backwardTransient: 200,
  seed: 0x51a1
};

function resolve(partial: Partial<ClvSettings>): ClvSettings {
  return {
    dt: partial.dt ?? DEFAULTS.dt,
    renormEvery: partial.renormEvery ?? DEFAULTS.renormEvery,
    forwardTransient: partial.forwardTransient ?? DEFAULTS.forwardTransient,
    window: partial.window ?? DEFAULTS.window,
    backwardTransient: partial.backwardTransient ?? DEFAULTS.backwardTransient,
    seed: partial.seed ?? DEFAULTS.seed
  };
}

/**
 * Modified Gram–Schmidt QR of the k tangent vectors (stored as subarray views of
 * length n). The vectors are replaced by the orthonormal Q in place; the
 * upper-triangular R (k×k, row-major) such that originalFrame = Q·R is returned.
 */
function qrDecompose(vectors: readonly StateVector[], n: number, k: number): Float64Array {
  const R = new Float64Array(k * k);
  for (let i = 0; i < k; i += 1) {
    const vi = vectors[i]!;
    for (let j = 0; j < i; j += 1) {
      const qj = vectors[j]!;
      let dot = 0;
      for (let r = 0; r < n; r += 1) dot += (vi[r] ?? 0) * (qj[r] ?? 0);
      R[j * k + i] = dot;
      for (let r = 0; r < n; r += 1) vi[r] = (vi[r] ?? 0) - dot * (qj[r] ?? 0);
    }
    let norm = 0;
    for (let r = 0; r < n; r += 1) norm += (vi[r] ?? 0) ** 2;
    norm = Math.sqrt(norm);
    R[i * k + i] = norm;
    const inv = norm > 0 ? 1 / norm : 0;
    for (let r = 0; r < n; r += 1) vi[r] = (vi[r] ?? 0) * inv;
  }
  return R;
}

/** Solve R·X = C for X, R upper-triangular (k×k row-major), C and X k×k row-major (columns are RHS). */
function solveUpperTriangular(R: Float64Array, C: Float64Array, k: number): Float64Array {
  const X = new Float64Array(k * k);
  for (let col = 0; col < k; col += 1) {
    for (let i = k - 1; i >= 0; i -= 1) {
      let acc = C[i * k + col] ?? 0;
      for (let j = i + 1; j < k; j += 1) acc -= (R[i * k + j] ?? 0) * (X[j * k + col] ?? 0);
      const diag = R[i * k + i] ?? 0;
      X[i * k + col] = diag !== 0 ? acc / diag : 0;
    }
  }
  return X;
}

/** Normalize each column of a k×k row-major matrix to unit Euclidean length, in place. */
function normalizeColumns(M: Float64Array, k: number): void {
  for (let col = 0; col < k; col += 1) {
    let norm = 0;
    for (let r = 0; r < k; r += 1) norm += (M[r * k + col] ?? 0) ** 2;
    norm = Math.sqrt(norm);
    const inv = norm > 0 ? 1 / norm : 0;
    for (let r = 0; r < k; r += 1) M[r * k + col] = (M[r * k + col] ?? 0) * inv;
  }
}

/** Minimum angle (radians) between any expanding CLV and any contracting CLV at one time. */
function minExpandingContractingAngle(vectors: Float64Array, n: number, k: number, exponents: readonly number[], tol: number): number {
  let minAngle = Math.PI / 2;
  let found = false;
  for (let i = 0; i < k; i += 1) {
    if ((exponents[i] ?? 0) <= tol) continue;
    const vi = vectors.subarray(i * n, (i + 1) * n);
    for (let j = 0; j < k; j += 1) {
      if ((exponents[j] ?? 0) >= -tol) continue;
      const vj = vectors.subarray(j * n, (j + 1) * n);
      let dot = 0;
      for (let r = 0; r < n; r += 1) dot += (vi[r] ?? 0) * (vj[r] ?? 0);
      const angle = Math.acos(Math.min(1, Math.max(0, Math.abs(dot))));
      if (angle < minAngle) minAngle = angle;
      found = true;
    }
  }
  return found ? minAngle : Number.NaN;
}

/**
 * Compute covariant Lyapunov vectors of a flow along a trajectory. Returns the
 * CLVs sampled across an analysis window, the Lyapunov exponents recovered from
 * the QR diagonals (a built-in cross-check against `lyapunovSpectrum`), and a
 * hyperbolicity measure (the minimum angle between expanding and contracting
 * covariant directions).
 */
export function covariantLyapunovVectors(
  state0: ArrayLike<number>,
  rhs: Derivative,
  count: number,
  options: Partial<ClvSettings> = {},
  jacobian?: Jacobian
): ClvResult {
  const settings = resolve(options);
  const n = state0.length;
  const k = Math.min(count, n);
  const varRhs = makeVariationalRhs(rhs, n, k, jacobian);
  const intervalTime = settings.renormEvery * settings.dt;

  const aug = new Float64Array(n * (k + 1));
  const augOut = new Float64Array(aug.length);
  for (let i = 0; i < n; i += 1) aug[i] = Number(state0[i] ?? 0);
  seedTangentFrame(aug, n, k, settings.seed);
  const views: StateVector[] = [];
  for (let j = 0; j < k; j += 1) views.push(aug.subarray(n + j * n, n + (j + 1) * n));

  const evolveInterval = (): void => {
    for (let s = 0; s < settings.renormEvery; s += 1) {
      rk4Step(aug, settings.dt, varRhs, augOut);
      aug.set(augOut);
    }
  };
  const copyFrame = (): Float64Array => {
    const frame = new Float64Array(k * n);
    for (let j = 0; j < k; j += 1) frame.set(views[j]!, j * n);
    return frame;
  };

  // (1) Forward transient: align Q with the backward-Lyapunov (GS) basis.
  for (let t = 0; t < settings.forwardTransient; t += 1) {
    evolveInterval();
    qrDecompose(views, n, k);
  }

  // (2) Forward window: store frames Q₀…Q_window and factors R₁…R_window.
  const frames: Float64Array[] = [copyFrame()];
  const rFactors: Float64Array[] = [];
  const expSum = new Array<number>(k).fill(0);
  for (let m = 1; m <= settings.window; m += 1) {
    evolveInterval();
    const R = qrDecompose(views, n, k);
    rFactors.push(R); // rFactors[m-1] = R_m, the factor mapping frame m-1 → m
    frames.push(copyFrame());
    for (let j = 0; j < k; j += 1) expSum[j] = (expSum[j] ?? 0) + Math.log(R[j * k + j] ?? 1);
  }
  const exponents = expSum.map((value) => value / (settings.window * intervalTime));
  const zeroTol = 1e-6 + 0.05 * Math.max(...exponents.map((e) => Math.abs(e)), 0);

  // (3) Backward pass: c_m = R_{m+1}⁻¹ c_{m+1}, renormalized, from a generic seed.
  let coeffs: Float64Array = new Float64Array(k * k);
  for (let i = 0; i < k; i += 1) coeffs[i * k + i] = 1; // upper-triangular identity seed
  normalizeColumns(coeffs, k);

  const analysisMax = Math.max(0, settings.window - settings.backwardTransient);
  const records: { time: number; vectors: Float64Array }[] = [];
  for (let m = settings.window - 1; m >= 0; m -= 1) {
    coeffs = solveUpperTriangular(rFactors[m]!, coeffs, k); // R_{m+1} = rFactors[m]
    normalizeColumns(coeffs, k);
    if (m <= analysisMax) {
      // CLV_j = Q_m · c_j  (combine orthonormal frame columns by the coefficients).
      const Qm = frames[m]!;
      const vectors = new Float64Array(k * n);
      for (let j = 0; j < k; j += 1) {
        const out = vectors.subarray(j * n, (j + 1) * n);
        for (let i = 0; i < k; i += 1) {
          const ci = coeffs[i * k + j] ?? 0;
          const qi = Qm.subarray(i * n, (i + 1) * n);
          for (let r = 0; r < n; r += 1) out[r] = (out[r] ?? 0) + ci * (qi[r] ?? 0);
        }
        let norm = 0;
        for (let r = 0; r < n; r += 1) norm += (out[r] ?? 0) ** 2;
        norm = Math.sqrt(norm);
        const inv = norm > 0 ? 1 / norm : 0;
        for (let r = 0; r < n; r += 1) out[r] = (out[r] ?? 0) * inv;
      }
      records.push({ time: m * intervalTime, vectors });
    }
  }
  records.reverse(); // ascending time

  const times = records.map((r) => r.time);
  const vectors = records.map((r) => r.vectors);
  const hyperbolicityAngles = vectors
    .map((v) => minExpandingContractingAngle(v, n, k, exponents, zeroTol))
    .filter((a) => Number.isFinite(a));
  const meanHyperbolicityAngle =
    hyperbolicityAngles.length > 0 ? hyperbolicityAngles.reduce((a, b) => a + b, 0) / hyperbolicityAngles.length : Number.NaN;
  const minHyperbolicityAngle = hyperbolicityAngles.length > 0 ? Math.min(...hyperbolicityAngles) : Number.NaN;

  return {
    exponents,
    times,
    vectors,
    hyperbolicityAngles,
    meanHyperbolicityAngle,
    minHyperbolicityAngle,
    settings: { ...settings, count: k }
  };
}
