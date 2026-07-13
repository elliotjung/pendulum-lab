/**
 * Koopman operator approximation via Dynamic Mode Decomposition (DMD) and
 * Extended DMD (EDMD).
 *
 * Where SINDy (`sindy.ts`) finds a *sparse nonlinear* model, DMD finds the best
 * *linear* operator A advancing the (observable) state one step,
 *
 *     x_{t+1} ≈ A x_t,
 *
 * whose eigenvalues are the discrete-time Koopman/DMD multipliers λ. Their
 * continuous-time images μ = ln(λ)/dt give a growth rate Re(μ) and an angular
 * frequency Im(μ) per mode — a globally *linear* spectral picture of a possibly
 * nonlinear flow (Schmid 2010; Rowley et al. 2009; Williams–Kevrekidis–Rowley
 * EDMD 2015).
 *
 * **EDMD** lifts the state through a dictionary of observables Θ(x) (the very
 * `buildFeatureLibrary` SINDy uses) and runs DMD in that space, so the recovered
 * eigenvalues approximate the Koopman *operator* spectrum. For a linear flow
 * ẋ = Lx with a total-degree-d polynomial dictionary the dictionary is
 * Koopman-invariant, so EDMD is *exact*: its eigenvalues are precisely the
 * integer combinations Σ kᵢμᵢ (|k| ≤ d) of the eigenvalues μ of L — the crisp
 * self-validation used in the test suite.
 *
 * The operator is the least-squares A = X₂X₁ᵀ(X₁X₁ᵀ)⁻¹ formed through the
 * engine's SPD Cholesky solver (no SVD dependency); eigenvalues come from
 * `complexEig`. This is exact for clean, full-rank data of modest observable
 * dimension — the regime where DMD recovers the engine's own spectrum to
 * round-off. Rank-deficient / redundant observables are reported, not fitted;
 * SVD-truncated DMD (for noisy, high-dimensional data) is a documented next step.
 */
import { choleskyFactor, choleskySolveFactored } from '../physics/linearSolve';
import { complexLog, matrixEigenvalues, type Complex } from './complexEig';
import { buildFeatureLibrary, type SindyLibrarySpec, type SindyTerm } from './sindy';
import { thinSvd } from './svd';

export interface DmdResult {
  /** Operator dimension: the observable dimension n for full DMD, or the
   *  truncation rank r for SVD-truncated DMD. */
  dimension: number;
  /** Numerical rank used (= n for full DMD; ≤ requested rank for truncated). */
  rank: number;
  /** The one-step operator (row-major dimension×dimension): the full A for plain
   *  DMD, or the reduced Ã (in the leading-mode coordinates) for truncated DMD. */
  operator: number[];
  /** Eigenvalues λ of A — the discrete-time (per-step) DMD multipliers. */
  discreteEigenvalues: Complex[];
  /** Continuous-time eigenvalues μ = ln(λ)/dt. */
  continuousEigenvalues: Complex[];
  /** Per-mode growth rate Re(μ) (negative ⇒ decaying). */
  growthRates: number[];
  /** Per-mode angular frequency |Im(μ)| (rad/s). */
  angularFrequencies: number[];
  /** Relative one-step prediction error ‖AX₁ − X₂‖_F / ‖X₂‖_F. */
  oneStepError: number;
}

export interface EdmdResult extends DmdResult {
  /** The dictionary terms (columns of the lifted observable vector). */
  terms: SindyTerm[];
}

function rectangular(rows: readonly number[][], what: string): number {
  if (rows.length === 0) throw new Error(`DMD: ${what} is empty.`);
  const width = rows[0]!.length;
  if (width === 0) throw new Error(`DMD: ${what} rows have zero width.`);
  for (const row of rows) if (row.length !== width) throw new Error(`DMD: ${what} is not rectangular.`);
  return width;
}

/** Discrete eigenvalues of an operator and their continuous images μ = ln(λ)/dt. */
function spectrumOf(
  operator: readonly number[],
  dim: number,
  dt: number
): Pick<DmdResult, 'discreteEigenvalues' | 'continuousEigenvalues' | 'growthRates' | 'angularFrequencies'> {
  const discreteEigenvalues = matrixEigenvalues(operator, dim);
  const continuousEigenvalues = discreteEigenvalues.map((lam) => {
    const log = complexLog(lam);
    return { re: log.re / dt, im: log.im / dt };
  });
  return {
    discreteEigenvalues,
    continuousEigenvalues,
    growthRates: continuousEigenvalues.map((z) => z.re),
    angularFrequencies: continuousEigenvalues.map((z) => Math.abs(z.im))
  };
}

/**
 * SVD-truncated ("exact") DMD: project onto the leading `requestedRank` POD modes
 * of X₁ and form the reduced operator Ã = UᵀX₂VΣ⁻¹. Unlike the normal-equations
 * path this stays well-posed when X₁ is rank-deficient (more observables than
 * dynamic modes) — it recovers the dominant eigenvalues where the full operator
 * would be singular.
 */
function truncatedDmd(
  snapshots: readonly number[][],
  dt: number,
  n: number,
  pairs: number,
  requestedRank: number
): DmdResult {
  const x1 = new Array<number>(n * pairs).fill(0);
  const x2 = new Array<number>(n * pairs).fill(0);
  for (let i = 0; i < n; i += 1) {
    for (let t = 0; t < pairs; t += 1) {
      x1[i * pairs + t] = snapshots[t]![i] ?? 0;
      x2[i * pairs + t] = snapshots[t + 1]![i] ?? 0;
    }
  }
  const svd = thinSvd(x1, n, pairs, { maxRank: requestedRank });
  const r = svd.rank;
  if (r === 0) throw new Error('DMD (truncated): the snapshot matrix is numerically zero.');

  // Ã = Uᵀ X₂ V Σ⁻¹ (r×r). U is n×r, V is pairs×r (both column-aligned, row-major).
  const p = new Array<number>(r * pairs).fill(0); // P = Uᵀ X₂ (r×pairs)
  for (let a = 0; a < r; a += 1) {
    for (let t = 0; t < pairs; t += 1) {
      let s = 0;
      for (let i = 0; i < n; i += 1) s += (svd.u[i * r + a] ?? 0) * (x2[i * pairs + t] ?? 0);
      p[a * pairs + t] = s;
    }
  }
  const atilde = new Array<number>(r * r).fill(0);
  for (let a = 0; a < r; a += 1) {
    for (let b = 0; b < r; b += 1) {
      let s = 0;
      for (let t = 0; t < pairs; t += 1) s += (p[a * pairs + t] ?? 0) * (svd.v[t * r + b] ?? 0);
      atilde[a * r + b] = s / (svd.singularValues[b] ?? 1);
    }
  }

  // Full-space one-step error using x̂_{t+1} = U Ã Uᵀ x_t.
  let errSq = 0;
  let refSq = 0;
  const proj = new Array<number>(r).fill(0);
  const adv = new Array<number>(r).fill(0);
  for (let t = 0; t < pairs; t += 1) {
    const xt = snapshots[t]!;
    const xt1 = snapshots[t + 1]!;
    for (let a = 0; a < r; a += 1) {
      let s = 0;
      for (let i = 0; i < n; i += 1) s += (svd.u[i * r + a] ?? 0) * (xt[i] ?? 0);
      proj[a] = s;
    }
    for (let a = 0; a < r; a += 1) {
      let s = 0;
      for (let b = 0; b < r; b += 1) s += (atilde[a * r + b] ?? 0) * (proj[b] ?? 0);
      adv[a] = s;
    }
    for (let i = 0; i < n; i += 1) {
      let pred = 0;
      for (let a = 0; a < r; a += 1) pred += (svd.u[i * r + a] ?? 0) * (adv[a] ?? 0);
      const e = pred - (xt1[i] ?? 0);
      errSq += e * e;
      refSq += (xt1[i] ?? 0) ** 2;
    }
  }
  const oneStepError = refSq > 0 ? Math.sqrt(errSq / refSq) : Math.sqrt(errSq);
  return { dimension: r, rank: r, operator: atilde, ...spectrumOf(atilde, r, dt), oneStepError };
}

/**
 * Dynamic Mode Decomposition on a uniformly-sampled snapshot sequence
 * (`snapshots[t]` is the observable vector at time t·dt). Returns the one-step
 * operator and its discrete/continuous spectrum.
 */
export function dynamicModeDecomposition(
  snapshots: readonly number[][],
  dt: number,
  options: { ridge?: number; rank?: number } = {}
): DmdResult {
  if (snapshots.length < 2) throw new Error('DMD: need at least two snapshots.');
  const n = rectangular(snapshots, 'snapshots');
  if (!(dt > 0)) throw new Error('DMD: dt must be positive.');
  const pairs = snapshots.length - 1;
  if (options.rank !== undefined) {
    if (!Number.isInteger(options.rank) || options.rank < 1) throw new Error('DMD: rank must be a positive integer.');
    return truncatedDmd(snapshots, dt, n, pairs, options.rank);
  }
  const ridge = options.ridge ?? 0;

  // C1 = Σ x_t x_tᵀ, C2 = Σ x_{t+1} x_tᵀ (t = 0 … pairs−1).
  const c1 = new Float64Array(n * n);
  const c2 = new Array<number>(n * n).fill(0);
  for (let t = 0; t < pairs; t += 1) {
    const xt = snapshots[t]!;
    const xt1 = snapshots[t + 1]!;
    for (let i = 0; i < n; i += 1) {
      const xi = xt[i] ?? 0;
      const yi = xt1[i] ?? 0;
      for (let k = 0; k < n; k += 1) {
        c1[i * n + k] = (c1[i * n + k] ?? 0) + xi * (xt[k] ?? 0);
        c2[i * n + k] = (c2[i * n + k] ?? 0) + yi * (xt[k] ?? 0);
      }
    }
  }
  for (let i = 0; i < n; i += 1) c1[i * n + i] = (c1[i * n + i] ?? 0) + ridge;

  const factor = new Float64Array(n * n);
  const fres = choleskyFactor(c1, n, factor);
  if (!fres.ok) {
    throw new Error(
      'DMD: the snapshot covariance X₁X₁ᵀ is not positive-definite (too few snapshots or redundant observables); supply richer data or add a ridge term.'
    );
  }

  // Row j of A solves C1 · (Aⱼ)ᵀ = (C2 row j)ᵀ  (C1 symmetric).
  const operator = new Array<number>(n * n).fill(0);
  const rhs = new Float64Array(n);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) rhs[i] = c2[j * n + i] ?? 0;
    choleskySolveFactored(factor, rhs, n);
    for (let i = 0; i < n; i += 1) operator[j * n + i] = rhs[i] ?? 0;
  }

  let errSq = 0;
  let refSq = 0;
  for (let t = 0; t < pairs; t += 1) {
    const xt = snapshots[t]!;
    const xt1 = snapshots[t + 1]!;
    for (let i = 0; i < n; i += 1) {
      let pred = 0;
      for (let k = 0; k < n; k += 1) pred += (operator[i * n + k] ?? 0) * (xt[k] ?? 0);
      const r = pred - (xt1[i] ?? 0);
      errSq += r * r;
      refSq += (xt1[i] ?? 0) ** 2;
    }
  }
  const oneStepError = refSq > 0 ? Math.sqrt(errSq / refSq) : Math.sqrt(errSq);

  return { dimension: n, rank: n, operator, ...spectrumOf(operator, n, dt), oneStepError };
}

/**
 * Extended DMD: lift a uniformly-sampled state trajectory through a SINDy
 * feature dictionary and run DMD in observable space, approximating the Koopman
 * operator's spectrum. `states[t]` is the state at time t·dt.
 */
export function extendedDmd(
  states: readonly number[][],
  dt: number,
  librarySpec: SindyLibrarySpec,
  options: { ridge?: number; rank?: number } = {}
): EdmdResult {
  rectangular(states, 'states');
  const { terms, theta } = buildFeatureLibrary(states, librarySpec);
  const result = dynamicModeDecomposition(theta, dt, options);
  return { ...result, terms };
}
