import type { Derivative, StateVector } from '../physics/types';
import { rk4Step } from '../physics/integrators';
import { mulberry32 } from './variational';
import {
  assertUsableIntegrationStep,
  checkedWorkProduct,
  NUMERICAL_WORK_BUDGETS
} from '../validation/numericalBudgets';

/**
 * Gottwald–Melbourne "0–1 test for chaos" (2004, with the 2009 modified
 * mean-square-displacement correction).
 *
 * This is a deliberately *independent* chaos detector: unlike the Lyapunov
 * spectrum, SALI and FLI — which all share the same tangent-space/variational
 * machinery — the 0–1 test works only on a scalar observable time series φ(n)
 * and never touches the Jacobian or a deviation vector. Agreement between
 * λ₁ > 0 and K ≈ 1 is therefore a genuine cross-validation, not the same
 * computation reported twice.
 *
 * For a random frequency c, drive the translation variables
 *     p_c(n) = Σ_{j≤n} φ(j) cos(jc),  q_c(n) = Σ_{j≤n} φ(j) sin(jc),
 * whose mean-square displacement grows linearly for chaotic φ (Brownian-like)
 * and stays bounded for regular φ. The finite-sample correlation K_c is in
 * [-1,1] (with values near 0 indicating regular motion and near 1 chaos) and is
 * obtained from the correlation of the (oscillation-corrected) displacement with
 * time. The reported K is the median over many c. K ≈ 0 ⇒ regular,
 * K ≈ 1 ⇒ chaotic.
 */

export interface ZeroOneOptions {
  /** Number of random frequencies c sampled in (cMin, cMax). Default 100. */
  cSamples?: number;
  /** Frequency window, kept away from 0 and π to avoid resonances. Default [π/5, 4π/5]. */
  cRange?: [number, number];
  /** Fraction of the series length used as the maximum displacement lag. Default 0.1. */
  ncutFraction?: number;
  /** Seed for the (reproducible) frequency draws. Default 0x0101. */
  seed?: number;
}

export interface ZeroOneResult {
  /** Median finite-sample correlation K in [-1,1]: near 1 chaotic, near 0 regular. */
  K: number;
  /** Per-frequency correlations K_c in [-1,1] (one per sampled c). */
  kValues: number[];
  /** The frequencies c the test was run at, aligned with `kValues`. */
  cValues: number[];
  /** Bootstrap standard error of the median K (resampling the K_c values). */
  kStdError: number;
  /** Percentile-bootstrap 95% confidence interval for the median K. */
  kCi95: [number, number];
}

/** Pearson correlation coefficient of two equal-length series. */
function correlation(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) {
    mx += x[i] ?? 0;
    my += y[i] ?? 0;
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (x[i] ?? 0) - mx;
    const dy = (y[i] ?? 0) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const denom = Math.sqrt(sxx * syy);
  return denom > 0 ? Math.max(-1, Math.min(1, sxy / denom)) : 0;
}

/** Smallest series that supplies at least two default displacement lags. */
export const MIN_ZERO_ONE_SAMPLES = 20;

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Seeded bootstrap of the median over the per-frequency K_c values: the K_c are
 * i.i.d. draws over random frequencies c (not a time series), so the ordinary
 * bootstrap is the appropriate resampling scheme — no block structure needed.
 */
function bootstrapMedian(
  values: readonly number[],
  seed: number,
  resamples = 400
): { stdError: number; ci95: [number, number] } {
  const n = values.length;
  if (n < 2) return { stdError: 0, ci95: [median(values), median(values)] };
  const rng = mulberry32(seed);
  const medians: number[] = [];
  const draw: number[] = new Array<number>(n);
  for (let b = 0; b < resamples; b += 1) {
    for (let i = 0; i < n; i += 1) draw[i] = values[Math.floor(rng() * n)] ?? 0;
    medians.push(median(draw));
  }
  let mean = 0;
  for (const m of medians) mean += m;
  mean /= medians.length;
  let varSum = 0;
  for (const m of medians) varSum += (m - mean) * (m - mean);
  const stdError = Math.sqrt(varSum / (medians.length - 1));
  const sorted = [...medians].sort((a, b) => a - b);
  const lo = sorted[Math.floor(0.025 * (sorted.length - 1))] ?? mean;
  const hi = sorted[Math.ceil(0.975 * (sorted.length - 1))] ?? mean;
  return { stdError, ci95: [lo, hi] };
}

/**
 * Run the 0–1 test on a scalar observable series. The series should be sampled
 * at a fixed interval and be long enough (a few thousand points) for the
 * displacement statistics to be meaningful.
 */
export function zeroOneTest(series: readonly number[], options: ZeroOneOptions = {}): ZeroOneResult {
  const N = series.length;
  if (!Number.isSafeInteger(N) || N < MIN_ZERO_ONE_SAMPLES) {
    throw new RangeError(`series must contain at least ${MIN_ZERO_ONE_SAMPLES} samples`);
  }
  for (let i = 0; i < N; i += 1) {
    if (!Number.isFinite(series[i])) throw new TypeError(`series[${i}] must be finite`);
  }
  const cSamples = options.cSamples ?? 100;
  if (!Number.isSafeInteger(cSamples) || cSamples < 1) {
    throw new RangeError('cSamples must be a positive safe integer');
  }
  const [cMin, cMax] = options.cRange ?? [Math.PI / 5, (4 * Math.PI) / 5];
  if (!Number.isFinite(cMin) || !Number.isFinite(cMax) || cMin >= cMax) {
    throw new RangeError('cRange must contain two finite, strictly increasing values');
  }
  const cSpan = cMax - cMin;
  if (!(cSpan > 0) || !Number.isFinite(cSpan)) {
    throw new RangeError('cRange span must be positive and finite');
  }
  const ncutFraction = options.ncutFraction ?? 0.1;
  if (!Number.isFinite(ncutFraction) || ncutFraction <= 0 || ncutFraction >= 1) {
    throw new RangeError('ncutFraction must be finite and in (0,1)');
  }
  const ncut = Math.floor(N * ncutFraction);
  if (ncut < 2 || ncut >= N) {
    throw new RangeError('series and ncutFraction must provide at least two displacement lags');
  }
  const seed = options.seed ?? 0x0101;
  if (!Number.isFinite(seed)) throw new RangeError('seed must be finite');
  const rng = mulberry32(seed);

  // Mean of the observable, used for the 2009 oscillation correction.
  let phiMean = 0;
  for (let j = 0; j < N; j += 1) phiMean += series[j] ?? 0;
  phiMean /= N;
  const phiMeanSq = phiMean * phiMean;

  const kValues: number[] = [];
  const cValues: number[] = [];
  const lags: number[] = [];
  for (let n = 1; n <= ncut; n += 1) lags.push(n);

  for (let ci = 0; ci < cSamples; ci += 1) {
    const c = cMin + cSpan * rng();
    if (!Number.isFinite(c)) throw new RangeError('generated 0-1 test frequency must be finite');
    if (!Number.isFinite(N * c)) {
      throw new RangeError('generated 0-1 test frequency must keep every sampled phase finite');
    }
    const cosC = Math.cos(c);

    // Cumulative translation variables P[k], Q[k] for k = 0..N (P[0] = 0).
    const P = new Float64Array(N + 1);
    const Q = new Float64Array(N + 1);
    for (let k = 1; k <= N; k += 1) {
      const phi = series[k - 1] ?? 0;
      P[k] = P[k - 1]! + phi * Math.cos(k * c);
      Q[k] = Q[k - 1]! + phi * Math.sin(k * c);
    }

    // Oscillation-corrected mean-square displacement D(n).
    const D: number[] = [];
    for (let n = 1; n <= ncut; n += 1) {
      let msum = 0;
      const count = N - n;
      for (let j = 1; j <= count; j += 1) {
        const dp = P[j + n]! - P[j]!;
        const dq = Q[j + n]! - Q[j]!;
        msum += dp * dp + dq * dq;
      }
      const M = count > 0 ? msum / count : 0;
      const denom = 1 - cosC;
      const vosc = denom !== 0 ? phiMeanSq * ((1 - Math.cos(n * c)) / denom) : 0;
      D.push(M - vosc);
    }

    kValues.push(correlation(lags, D));
    cValues.push(c);
  }

  const boot = bootstrapMedian(kValues, seed ^ 0x9e3779b9);
  return { K: median(kValues), kValues, cValues, kStdError: boot.stdError, kCi95: boot.ci95 };
}

/**
 * Integrate `rhs` and sample a scalar observable at a fixed stride, producing a
 * series suitable for {@link zeroOneTest}. A transient is discarded first so the
 * series sits on the attractor / chaotic sea rather than the initial approach.
 */
export function sampleObservable(
  rhs: Derivative,
  state0: ArrayLike<number>,
  options: {
    dt: number;
    sampleEvery: number;
    samples: number;
    transientSteps?: number;
    observable?: (state: StateVector) => number;
  }
): number[] {
  const n = state0.length;
  const transientSteps = options.transientSteps ?? 0;
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new Error('sampleObservable: state0 must contain at least one component.');
  }
  for (let i = 0; i < n; i += 1) {
    if (!Number.isFinite(Number(state0[i]))) {
      throw new Error('sampleObservable: state0 components must be finite.');
    }
  }
  if (!(options.dt > 0) || !Number.isFinite(options.dt)) {
    throw new Error('sampleObservable: dt must be positive and finite.');
  }
  assertUsableIntegrationStep(options.dt, 'sampleObservable');
  if (!Number.isSafeInteger(options.sampleEvery) || options.sampleEvery < 1) {
    throw new Error('sampleObservable: sampleEvery must be a positive integer.');
  }
  if (options.sampleEvery > NUMERICAL_WORK_BUDGETS.observableSampling.maxSampleStride) {
    throw new Error(
      `sampleObservable: sampleEvery must not exceed ${NUMERICAL_WORK_BUDGETS.observableSampling.maxSampleStride}.`
    );
  }
  if (!Number.isSafeInteger(options.samples) || options.samples < 1) {
    throw new Error('sampleObservable: samples must be a positive integer.');
  }
  if (options.samples > NUMERICAL_WORK_BUDGETS.observableSampling.maxSamples) {
    throw new Error(
      `sampleObservable: samples must not exceed ${NUMERICAL_WORK_BUDGETS.observableSampling.maxSamples}.`
    );
  }
  if (!Number.isSafeInteger(transientSteps) || transientSteps < 0) {
    throw new Error('sampleObservable: transientSteps must be a non-negative integer.');
  }
  if (transientSteps > NUMERICAL_WORK_BUDGETS.observableSampling.maxTransientSteps) {
    throw new Error(
      `sampleObservable: transientSteps must not exceed ${NUMERICAL_WORK_BUDGETS.observableSampling.maxTransientSteps}.`
    );
  }
  const sampledSteps = checkedWorkProduct([options.samples, options.sampleEvery], 'sampleObservable');
  if (sampledSteps + transientSteps > NUMERICAL_WORK_BUDGETS.observableSampling.maxTotalSteps) {
    throw new Error(
      `sampleObservable: requested integration exceeds the ${NUMERICAL_WORK_BUDGETS.observableSampling.maxTotalSteps}-step work budget.`
    );
  }
  let current = new Float64Array(n);
  let next = new Float64Array(n);
  for (let i = 0; i < n; i += 1) current[i] = Number(state0[i] ?? 0);

  const observable = options.observable ?? ((s) => Number(s[0] ?? 0));
  const advance = (): void => {
    rk4Step(current, options.dt, rhs, next);
    const swap = current;
    current = next;
    next = swap;
  };

  for (let i = 0; i < transientSteps; i += 1) advance();

  const series: number[] = [];
  for (let s = 0; s < options.samples; s += 1) {
    for (let i = 0; i < options.sampleEvery; i += 1) advance();
    const value = observable(current);
    if (!Number.isFinite(value)) throw new Error('sampleObservable: observable must remain finite.');
    series.push(value);
  }
  return series;
}
