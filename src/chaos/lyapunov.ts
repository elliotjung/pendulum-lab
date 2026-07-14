import type { Derivative, Jacobian, StateVector } from '../physics/types';
import type { IntegratorId } from '../types/domain';
import { rk4Step, step } from '../physics/integrators';
import { gramSchmidt, makeVariationalRhs, mulberry32, seedTangentFrame } from './variational';
import { analyzeSpectrumConsistency, type SpectrumConsistency } from './spectrumConsistency';
import { assertUsableIntegrationStep, NUMERICAL_WORK_BUDGETS } from '../validation/numericalBudgets';

/** Per-step integrator used to advance a (possibly augmented) trajectory. */
type Stepper = (state: StateVector, dt: number, rhs: Derivative, out: StateVector) => void;

/**
 * Resolve the integrator used for the Lyapunov run. The default (and the
 * `rk4` case) returns the bare `rk4Step` so the hot path is byte-identical to
 * the previous behaviour; any other registered method is routed through the
 * shared `step` dispatcher with its own embedded-error accumulator.
 */
function makeStepper(method?: IntegratorId): Stepper {
  if (!method || method === 'rk4') return rk4Step;
  const previousError = { value: 0 };
  return (state, dt, rhs, out) => {
    step(method, state, dt, rhs, out, { previousError });
  };
}

/** Standard error of the mean over the converged (second-half) tail of a sample series. */
function tailStandardError(samples: readonly number[]): number {
  const start = Math.floor(samples.length / 2);
  const n = samples.length - start;
  if (n < 2) return 0;
  let mean = 0;
  for (let i = start; i < samples.length; i += 1) mean += samples[i] ?? 0;
  mean /= n;
  let variance = 0;
  for (let i = start; i < samples.length; i += 1) variance += ((samples[i] ?? 0) - mean) ** 2;
  variance /= n - 1;
  return Math.sqrt(variance / n);
}

/**
 * Batched-means ("non-overlapping block bootstrap") standard error over the
 * converged tail. The per-interval local exponents are strongly autocorrelated,
 * which makes the naive `tailStandardError` an optimistic lower bound. Splitting
 * the tail into `numBlocks` contiguous blocks and taking the standard error of
 * the block means decorrelates the estimate as long as each block is much longer
 * than the correlation time, giving a more honest uncertainty. Falls back to the
 * naive estimate when there are too few samples to form blocks.
 */
export function batchedStandardError(samples: readonly number[], numBlocks = 10): number {
  const start = Math.floor(samples.length / 2);
  const tail = samples.slice(start);
  const m = tail.length;
  if (numBlocks < 2 || m < 2 * numBlocks) return tailStandardError(samples);
  const blockLen = Math.floor(m / numBlocks);
  const means: number[] = [];
  for (let b = 0; b < numBlocks; b += 1) {
    let s = 0;
    for (let i = 0; i < blockLen; i += 1) s += tail[b * blockLen + i] ?? 0;
    means.push(s / blockLen);
  }
  let mean = 0;
  for (const value of means) mean += value;
  mean /= numBlocks;
  let variance = 0;
  for (const value of means) variance += (value - mean) ** 2;
  variance /= numBlocks - 1;
  return Math.sqrt(variance / numBlocks);
}

/**
 * Estimate the integrated autocorrelation time τ_int = 1 + 2·Σ_{k≥1} ρ(k) of a
 * series, with Sokal's self-consistent automatic windowing: the lag sum is
 * truncated at the first window W with W ≥ c·τ(W) (default c = 5), which keeps
 * the high-lag noise of the autocorrelation estimator from inflating the sum.
 * The autocovariances use the biased (÷N) estimator — standard for τ_int. The
 * value is floored at 1, so an uncorrelated (or constant) series gives τ = 1 and
 * callers can safely divide by it. This is the number that says how many samples
 * apart a series must be before they count as independent.
 */
export function integratedAutocorrelationTime(samples: readonly number[], c = 5): number {
  const n = samples.length;
  if (n < 2) return 1;
  let mean = 0;
  for (const v of samples) mean += v;
  mean /= n;
  let c0 = 0;
  for (const v of samples) c0 += (v - mean) ** 2;
  c0 /= n;
  if (!(c0 > 0)) return 1;
  let tau = 1;
  for (let k = 1; k < n; k += 1) {
    let ck = 0;
    for (let i = 0; i < n - k; i += 1) ck += ((samples[i] ?? 0) - mean) * ((samples[i + k] ?? 0) - mean);
    ck /= n;
    tau += 2 * (ck / c0);
    if (tau < 1) tau = 1;
    if (k >= c * tau) break;
  }
  return tau < 1 ? 1 : tau;
}

/**
 * Batched-means standard error with an *automatic* batch length, chosen from the
 * estimated integrated autocorrelation time of the converged tail rather than a
 * fixed block count. Each batch spans ≈ 2·τ_int samples, so the batch means are
 * approximately independent however fast (or slowly) the local exponents
 * decorrelate — a more honest decorrelated SE than the fixed-`numBlocks`
 * {@link batchedStandardError}, which can under- or over-block when the
 * correlation time is unknown a priori. Falls back to the fixed-block estimate
 * (which itself falls back to the naive SE) when the tail is too short to resolve
 * a batch length.
 */
export function autoBatchedStandardError(samples: readonly number[]): number {
  const start = Math.floor(samples.length / 2);
  const tail = samples.slice(start);
  const m = tail.length;
  if (m < 8) return batchedStandardError(samples);
  const tau = integratedAutocorrelationTime(tail);
  const batchLen = Math.max(1, Math.round(2 * tau));
  const numBlocks = Math.floor(m / batchLen);
  if (numBlocks < 2) return batchedStandardError(samples);
  const means: number[] = [];
  for (let b = 0; b < numBlocks; b += 1) {
    let s = 0;
    for (let i = 0; i < batchLen; i += 1) s += tail[b * batchLen + i] ?? 0;
    means.push(s / batchLen);
  }
  let mean = 0;
  for (const value of means) mean += value;
  mean /= numBlocks;
  let variance = 0;
  for (const value of means) variance += (value - mean) ** 2;
  variance /= numBlocks - 1;
  return Math.sqrt(variance / numBlocks);
}

/**
 * Lyapunov exponent estimators. The maximal exponent uses the two-trajectory
 * Benettin method (no Jacobian needed); the full spectrum uses Gram-Schmidt
 * reorthonormalization of the variational flow. Every result carries the
 * transient/renormalization settings it was computed with — a single Lyapunov
 * number without those settings is not a reproducible claim.
 */

export interface LyapunovSettings {
  dt: number;
  steps: number;
  renormEvery: number;
  transientSteps: number;
  seed: number;
  /** Integrator used to advance the trajectories; defaults to rk4. */
  method?: IntegratorId;
}

export interface MaximalLyapunovResult {
  /** Estimated maximal Lyapunov exponent (per unit time). */
  lambdaMax: number;
  /**
   * One-sigma standard error of the estimate, from the spread of the converged
   * per-interval local exponents. Naive (ignores autocorrelation) so it is a
   * lower bound on the true uncertainty, but turns a bare number into a
   * reportable estimate.
   */
  stdError: number;
  /**
   * Batched-means standard error over the converged tail, using an automatic
   * batch length derived from the estimated integrated autocorrelation time
   * (Sokal windowing). Unlike `stdError`, this decorrelates neighbouring
   * renormalization intervals, so it is the more honest (typically larger)
   * uncertainty to report. See {@link autoBatchedStandardError}.
   */
  blockStdError: number;
  /** Approximate 95% confidence interval (lambdaMax ± 1.96 stdError). */
  ci95: [number, number];
  /** Finite-time history of the running estimate, one entry per renormalization. */
  convergence: number[];
  settings: LyapunovSettings;
}

export interface LyapunovSpectrumResult {
  /** Exponents sorted in descending order. */
  spectrum: number[];
  /** One-sigma standard error per exponent, aligned with `spectrum`. */
  stdError: number[];
  /** Batched-means standard error per exponent (decorrelated), aligned with `spectrum`. */
  blockStdError: number[];
  /** Sum of the spectrum (≈ 0 for a conservative/Hamiltonian system). */
  sum: number;
  kaplanYorkeDimension: number;
  /**
   * Hamiltonian self-consistency check (sum-to-zero, symplectic pairing, count of
   * zero exponents). A free, independent validation of the tangent-space pipeline.
   */
  consistency: SpectrumConsistency;
  settings: LyapunovSettings & { count: number };
}

const DEFAULTS = {
  dt: 0.01,
  steps: 20_000,
  renormEvery: 10,
  transientSteps: 2_000,
  seed: 0x9e37
};

function resolve(partial: Partial<LyapunovSettings>, caller: string): LyapunovSettings {
  const settings: LyapunovSettings = {
    dt: partial.dt ?? DEFAULTS.dt,
    steps: partial.steps ?? DEFAULTS.steps,
    renormEvery: partial.renormEvery ?? DEFAULTS.renormEvery,
    transientSteps: partial.transientSteps ?? DEFAULTS.transientSteps,
    seed: partial.seed ?? DEFAULTS.seed,
    ...(partial.method ? { method: partial.method } : {})
  };
  if (!(settings.dt > 0) || !Number.isFinite(settings.dt)) {
    throw new Error(`${caller}: dt must be positive and finite.`);
  }
  assertUsableIntegrationStep(settings.dt, caller);
  if (!Number.isSafeInteger(settings.steps) || settings.steps < 1) {
    throw new Error(`${caller}: steps must be a positive integer.`);
  }
  if (settings.steps > NUMERICAL_WORK_BUDGETS.lyapunov.maxMeasurementSteps) {
    throw new Error(`${caller}: steps must not exceed ${NUMERICAL_WORK_BUDGETS.lyapunov.maxMeasurementSteps}.`);
  }
  if (!Number.isSafeInteger(settings.renormEvery) || settings.renormEvery < 1) {
    throw new Error(`${caller}: renormEvery must be a positive integer.`);
  }
  if (settings.renormEvery > NUMERICAL_WORK_BUDGETS.lyapunov.maxRenormalizationSteps) {
    throw new Error(
      `${caller}: renormEvery must not exceed ${NUMERICAL_WORK_BUDGETS.lyapunov.maxRenormalizationSteps}.`
    );
  }
  if (settings.renormEvery > settings.steps) {
    throw new Error(`${caller}: renormEvery must not exceed steps.`);
  }
  if (!Number.isSafeInteger(settings.transientSteps) || settings.transientSteps < 0) {
    throw new Error(`${caller}: transientSteps must be a non-negative integer.`);
  }
  if (settings.transientSteps > NUMERICAL_WORK_BUDGETS.lyapunov.maxTransientSteps) {
    throw new Error(`${caller}: transientSteps must not exceed ${NUMERICAL_WORK_BUDGETS.lyapunov.maxTransientSteps}.`);
  }
  if (settings.steps + settings.transientSteps > NUMERICAL_WORK_BUDGETS.lyapunov.maxTotalSteps) {
    throw new Error(
      `${caller}: steps plus transientSteps must not exceed ${NUMERICAL_WORK_BUDGETS.lyapunov.maxTotalSteps}.`
    );
  }
  const measurementTime = settings.steps * settings.dt;
  const totalTime = (settings.steps + settings.transientSteps) * settings.dt;
  if (!(measurementTime > 0) || !Number.isFinite(measurementTime) || !Number.isFinite(totalTime)) {
    throw new Error(`${caller}: dt and step counts must define a positive, finite integration horizon.`);
  }
  if (!Number.isFinite(settings.seed)) throw new Error(`${caller}: seed must be finite.`);
  return settings;
}

function validateInitialState(state0: ArrayLike<number>, caller: string): void {
  if (!Number.isInteger(state0.length) || state0.length < 1) {
    throw new Error(`${caller}: state0 must contain at least one component.`);
  }
  for (let i = 0; i < state0.length; i += 1) {
    if (!Number.isFinite(Number(state0[i]))) {
      throw new Error(`${caller}: state0 components must be finite.`);
    }
  }
}

function assertFiniteValues(values: ArrayLike<number>, count: number, caller: string, label: string): void {
  for (let i = 0; i < count; i += 1) {
    if (!Number.isFinite(Number(values[i]))) {
      throw new Error(`${caller}: ${label} contains a non-finite value.`);
    }
  }
}

function checkedDerivative(rhs: Derivative, dimension: number, caller: string, label: string): Derivative {
  return (state, out): void => {
    assertFiniteValues(state, dimension, caller, `${label} input`);
    rhs(state, out);
    assertFiniteValues(out, dimension, caller, `${label} output`);
  };
}

function checkedJacobian(jacobian: Jacobian, dimension: number, caller: string): Jacobian {
  return (state, out): void => {
    assertFiniteValues(state, dimension, caller, 'Jacobian state');
    jacobian(state, out);
    assertFiniteValues(out, dimension * dimension, caller, 'Jacobian output');
  };
}

function advanceFinite(
  stepper: Stepper,
  state: StateVector,
  dt: number,
  rhs: Derivative,
  out: StateVector,
  caller: string,
  label: string
): void {
  stepper(state, dt, rhs, out);
  assertFiniteValues(out, out.length, caller, label);
}

/**
 * Maximal Lyapunov exponent via the Benettin two-trajectory method: evolve a
 * reference and a shadow trajectory, periodically measure their separation,
 * accumulate its logarithmic growth, and rescale the shadow back to the initial
 * separation along the current direction.
 */
export function maximalLyapunov(
  state0: ArrayLike<number>,
  rhs: Derivative,
  options: Partial<LyapunovSettings> = {}
): MaximalLyapunovResult {
  const caller = 'maximalLyapunov';
  validateInitialState(state0, caller);
  const settings = resolve(options, caller);
  const stepper = makeStepper(settings.method);
  const n = state0.length;
  const finiteRhs = checkedDerivative(rhs, n, caller, 'RHS');
  const d0 = 1e-8;

  const ref = new Float64Array(n);
  for (let i = 0; i < n; i += 1) ref[i] = Number(state0[i] ?? 0);
  const refOut = new Float64Array(n);

  // Run the reference through the transient before attaching the shadow.
  for (let i = 0; i < settings.transientSteps; i += 1) {
    advanceFinite(stepper, ref, settings.dt, finiteRhs, refOut, caller, 'reference state');
    ref.set(refOut);
  }

  // Random unit perturbation for the shadow.
  const rng = mulberry32(settings.seed);
  const dir = new Float64Array(n);
  let dnorm = 0;
  for (let i = 0; i < n; i += 1) {
    const value = rng() - 0.5;
    dir[i] = value;
    dnorm += value ** 2;
  }
  dnorm = Math.sqrt(dnorm) || 1;
  const shadow = new Float64Array(n);
  for (let i = 0; i < n; i += 1) shadow[i] = Number(ref[i] ?? 0) + (d0 / dnorm) * Number(dir[i] ?? 0);
  const shadowOut = new Float64Array(n);

  let logSum = 0;
  let elapsed = 0;
  const convergence: number[] = [];
  const localExponents: number[] = [];
  let completedSteps = 0;
  while (completedSteps < settings.steps) {
    const blockSteps = Math.min(settings.renormEvery, settings.steps - completedSteps);
    const intervalTime = blockSteps * settings.dt;
    for (let s = 0; s < blockSteps; s += 1) {
      advanceFinite(stepper, ref, settings.dt, finiteRhs, refOut, caller, 'reference state');
      ref.set(refOut);
      advanceFinite(stepper, shadow, settings.dt, finiteRhs, shadowOut, caller, 'shadow state');
      shadow.set(shadowOut);
    }
    completedSteps += blockSteps;
    let d = 0;
    for (let i = 0; i < n; i += 1) d += (Number(shadow[i] ?? 0) - Number(ref[i] ?? 0)) ** 2;
    d = Math.sqrt(d);
    if (!(d > 0) || !Number.isFinite(d)) {
      throw new Error(`${caller}: trajectory separation is non-finite or collapsed to zero.`);
    }
    const growth = Math.log(d / d0);
    const localExponent = growth / intervalTime;
    if (!Number.isFinite(growth) || !Number.isFinite(localExponent)) {
      throw new Error(`${caller}: separation growth produced a non-finite exponent.`);
    }
    logSum += growth;
    elapsed += intervalTime;
    const runningExponent = logSum / elapsed;
    if (!Number.isFinite(logSum) || !Number.isFinite(runningExponent)) {
      throw new Error(`${caller}: accumulated Lyapunov estimate became non-finite.`);
    }
    convergence.push(runningExponent);
    localExponents.push(localExponent);
    // Rescale shadow back to separation d0 along the current direction.
    const scale = d0 / d;
    for (let i = 0; i < n; i += 1)
      shadow[i] = Number(ref[i] ?? 0) + scale * (Number(shadow[i] ?? 0) - Number(ref[i] ?? 0));
    assertFiniteValues(shadow, n, caller, 'renormalized shadow state');
  }

  const lambdaMax = elapsed > 0 ? logSum / elapsed : 0;
  const stdError = tailStandardError(localExponents);
  return {
    lambdaMax,
    stdError,
    blockStdError: autoBatchedStandardError(localExponents),
    ci95: [lambdaMax - 1.96 * stdError, lambdaMax + 1.96 * stdError],
    convergence,
    settings
  };
}

/**
 * Full Lyapunov spectrum via Gram-Schmidt reorthonormalization of `count`
 * tangent vectors evolved under the variational flow. Returns the exponents in
 * descending order, their sum, and the Kaplan-Yorke dimension.
 */
export function lyapunovSpectrum(
  state0: ArrayLike<number>,
  rhs: Derivative,
  count: number,
  options: Partial<LyapunovSettings> = {},
  jacobian?: Jacobian
): LyapunovSpectrumResult {
  const caller = 'lyapunovSpectrum';
  validateInitialState(state0, caller);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`${caller}: count must be a positive integer.`);
  }
  const settings = resolve(options, caller);
  const stepper = makeStepper(settings.method);
  const n = state0.length;
  const k = Math.min(count, n);
  const finiteRhs = checkedDerivative(rhs, n, caller, 'RHS');
  const finiteJacobian = jacobian ? checkedJacobian(jacobian, n, caller) : undefined;
  const rawVarRhs = makeVariationalRhs(finiteRhs, n, k, finiteJacobian);
  const varRhs = checkedDerivative(rawVarRhs, n * (k + 1), caller, 'variational RHS');

  const aug = new Float64Array(n * (k + 1));
  const augOut = new Float64Array(aug.length);

  // Transient on the reference only, on a clean length-n buffer.
  const refState = new Float64Array(n);
  for (let i = 0; i < n; i += 1) refState[i] = Number(state0[i] ?? 0);
  const refOut = new Float64Array(n);
  for (let i = 0; i < settings.transientSteps; i += 1) {
    advanceFinite(stepper, refState, settings.dt, finiteRhs, refOut, caller, 'reference state');
    refState.set(refOut);
  }
  aug.set(refState, 0);
  seedTangentFrame(aug, n, k, settings.seed);
  assertFiniteValues(aug, aug.length, caller, 'seeded tangent frame');

  const views: StateVector[] = [];
  for (let j = 0; j < k; j += 1) views.push(aug.subarray(n + j * n, n + (j + 1) * n));

  const accum = new Array<number>(k).fill(0);
  const localSeries: number[][] = Array.from({ length: k }, () => []);
  let elapsed = 0;
  let completedSteps = 0;
  while (completedSteps < settings.steps) {
    const blockSteps = Math.min(settings.renormEvery, settings.steps - completedSteps);
    const intervalTime = blockSteps * settings.dt;
    for (let s = 0; s < blockSteps; s += 1) {
      advanceFinite(stepper, aug, settings.dt, varRhs, augOut, caller, 'state/tangent output');
      aug.set(augOut);
    }
    completedSteps += blockSteps;
    const norms = gramSchmidt(views, n);
    for (let j = 0; j < k; j += 1) {
      const norm = norms[j] ?? Number.NaN;
      if (!(norm > 0) || !Number.isFinite(norm)) {
        throw new Error(`${caller}: QR output is non-finite or rank-deficient.`);
      }
      const growth = Math.log(norm);
      if (!Number.isFinite(growth)) throw new Error(`${caller}: QR growth is non-finite.`);
      const localExponent = growth / intervalTime;
      if (!Number.isFinite(localExponent)) throw new Error(`${caller}: local tangent exponent is non-finite.`);
      accum[j] = (accum[j] ?? 0) + growth;
      if (!Number.isFinite(accum[j])) throw new Error(`${caller}: accumulated tangent growth is non-finite.`);
      localSeries[j]!.push(localExponent);
    }
    assertFiniteValues(aug, aug.length, caller, 'orthonormalized state/tangent frame');
    elapsed += intervalTime;
  }

  // Pair each exponent with its standard error before sorting, so the error
  // bars stay aligned with the (descending-sorted) exponents.
  const paired = accum.map((value, j) => ({
    lambda: elapsed > 0 ? value / elapsed : 0,
    se: tailStandardError(localSeries[j] ?? []),
    blockSe: autoBatchedStandardError(localSeries[j] ?? [])
  }));
  paired.sort((a, b) => b.lambda - a.lambda);
  const spectrum = paired.map((p) => p.lambda);
  const stdError = paired.map((p) => p.se);
  const blockStdError = paired.map((p) => p.blockSe);
  const sum = spectrum.reduce((a, b) => a + b, 0);
  return {
    spectrum,
    stdError,
    blockStdError,
    sum,
    kaplanYorkeDimension: kaplanYorkeDimension(spectrum),
    consistency: analyzeSpectrumConsistency(spectrum),
    settings: { ...settings, count: k }
  };
}

/**
 * Kaplan-Yorke (Lyapunov) dimension from a spectrum. Finds the largest j whose
 * partial sum of (descending) exponents is non-negative and interpolates with
 * the next exponent: D = j + (sum_{i<=j} lambda_i) / |lambda_{j+1}|.
 */
export function kaplanYorkeDimension(spectrumInput: readonly number[]): number {
  const spectrum = [...spectrumInput].sort((a, b) => b - a);
  let partial = 0;
  let j = 0;
  for (; j < spectrum.length; j += 1) {
    const nextPartial = partial + (spectrum[j] ?? 0);
    if (nextPartial < 0) break;
    partial = nextPartial;
  }
  if (j === 0) return 0; // not even the first exponent is non-negative
  if (j >= spectrum.length) return spectrum.length; // whole spectrum non-negative
  const nextExp = spectrum[j] ?? 0;
  if (nextExp === 0) return j;
  return j + partial / Math.abs(nextExp);
}
