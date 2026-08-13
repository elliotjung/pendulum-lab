/**
 * Adaptive Langevin paths and ensemble statistics.
 *
 * Low-level diagonal and matrix SDE steppers live in stochasticSteppers so
 * both modules remain reviewable and below the source-size ratchet.
 */
import type { Derivative, StateVector } from './types';
import { stochasticSchemeMetadata, type LangevinScheme } from './stochasticMetadata';
import {
  assertUsableIntegrationStep,
  checkedWorkProduct,
  NUMERICAL_WORK_BUDGETS
} from '../validation/numericalBudgets';
import {
  assertFiniteBuffer,
  assertUint32Seed,
  commutativeMilsteinStepCore,
  eulerMaruyamaStepCore,
  gaussianSampler,
  milsteinStepCore,
  stochasticHeunStratonovichStepCore,
  type DiffusionMatrix,
  type DiffusionMatrixJacobian,
  type MatrixSdeScratch,
  type StateDependentVector
} from './stochasticSteppers';

export {
  commutativeMilsteinStep,
  eulerMaruyamaStep,
  gaussianSampler,
  milsteinStep,
  stochasticHeunStratonovichStep
} from './stochasticSteppers';
export type {
  DiffusionMatrix,
  DiffusionMatrixJacobian,
  GaussianSampler,
  MatrixSdeScratch,
  StateDependentVector
} from './stochasticSteppers';
export type { LangevinScheme };

// ---------------------------------------------------------------------------
// Adaptive (step-size-controlled) SDE integration over a frozen Brownian path.
//
// Adaptive ODE solvers cannot be lifted to SDEs naively: changing the step size
// must keep the *same* Brownian path, or the trajectory being refined is no
// longer the same realisation. The clean, reproducible construction is a dyadic
// Brownian grid — the driving Wiener process is sampled once on a fine grid of
// 2^L intervals; the integrator then takes steps that are dyadic multiples of
// that finest interval, so the increment over any step is just W(b) − W(a)
// (exactly consistent under refinement, no Brownian-bridge resampling). Local
// error is estimated by step doubling (one big step vs two half steps over the
// identical sub-path), and the stride is halved on rejection / doubled when the
// error is comfortably under tolerance. This makes the adaptive solution
// strongly (pathwise) convergent to the all-fine reference on the same grid.
// ---------------------------------------------------------------------------

/** A Wiener path sampled once on a dyadic grid of `steps` = 2^levels intervals. */
export interface BrownianGrid {
  readonly steps: number;
  readonly dt: number;
  readonly totalTime: number;
  readonly dimension: number;
  /** ΔW_i over the node interval [aIndex, bIndex] (0 ≤ aIndex ≤ bIndex ≤ steps). */
  increment(aIndex: number, bIndex: number, i: number): number;
}

/** Build a frozen, reproducible Wiener path on 2^levels intervals of [0, totalTime]. */
export function buildBrownianGrid(totalTime: number, levels: number, dimension: number, seed = 1): BrownianGrid {
  const budget = NUMERICAL_WORK_BUDGETS.adaptiveLangevin;
  if (!Number.isFinite(totalTime) || !(totalTime > 0)) {
    throw new Error('buildBrownianGrid: totalTime must be positive and finite.');
  }
  if (!Number.isInteger(levels) || levels < 1 || levels > 24)
    throw new Error('buildBrownianGrid: levels must be an integer in [1, 24].');
  if (!Number.isSafeInteger(dimension) || dimension < 1 || dimension > budget.maxStateDimension) {
    throw new Error(`buildBrownianGrid: dimension must be an integer in [1, ${budget.maxStateDimension}].`);
  }
  const steps = 2 ** levels;
  const dt = totalTime / steps;
  assertUsableIntegrationStep(dt, 'buildBrownianGrid');
  const cells = checkedWorkProduct([steps + 1, dimension], 'buildBrownianGrid');
  if (cells > budget.maxBrownianCells) {
    throw new RangeError(`buildBrownianGrid: Brownian grid storage exceeds ${budget.maxBrownianCells} float64 cells.`);
  }
  const sqrtDt = Math.sqrt(dt);
  const gaussian = gaussianSampler(seed);
  // Cumulative W at each node, row-major (steps+1) × dimension.
  const cum = new Float64Array((steps + 1) * dimension);
  for (let k = 1; k <= steps; k += 1) {
    for (let i = 0; i < dimension; i += 1) {
      cum[k * dimension + i] = (cum[(k - 1) * dimension + i] ?? 0) + sqrtDt * gaussian();
    }
  }
  return {
    steps,
    dt,
    totalTime,
    dimension,
    increment(aIndex, bIndex, i) {
      if (
        !Number.isSafeInteger(aIndex) ||
        !Number.isSafeInteger(bIndex) ||
        aIndex < 0 ||
        bIndex < aIndex ||
        bIndex > steps
      ) {
        throw new RangeError('BrownianGrid.increment: indices must satisfy 0 <= aIndex <= bIndex <= steps.');
      }
      if (!Number.isSafeInteger(i) || i < 0 || i >= dimension) {
        throw new RangeError('BrownianGrid.increment: component index is outside the grid dimension.');
      }
      return (cum[bIndex * dimension + i] ?? 0) - (cum[aIndex * dimension + i] ?? 0);
    }
  };
}

export interface AdaptiveLangevinSpec {
  /** Deterministic drift f(x). */
  drift: Derivative;
  /** Per-component diagonal noise: constant σ_i, or a state-dependent σ_i(x). */
  diffusion: readonly number[] | StateDependentVector;
  /** σ′_i(x) = ∂σ_i/∂x_i; enables the strong-order-1 Milstein base. */
  diffusionPrime?: StateDependentVector;
  initialState: readonly number[];
  /** The frozen Brownian path (its dimension must equal the state dimension). */
  grid: BrownianGrid;
  /** Base scheme stepped adaptively. Default 'euler-maruyama'. */
  base?: 'euler-maruyama' | 'milstein';
  /** Absolute local-error tolerance. Default 1e-3. */
  absoluteTolerance?: number;
  /** Relative local-error tolerance. Default 1e-3. */
  relativeTolerance?: number;
}

export interface AdaptiveLangevinResult {
  /** Accepted-step times (includes t = 0 and t = totalTime). */
  times: number[];
  /** State at each accepted time: states[k][i]. */
  states: number[][];
  acceptedSteps: number;
  rejectedSteps: number;
  /** Smallest / largest accepted step (in time units). */
  minDt: number;
  maxDt: number;
  method: string;
}

function validateAdaptiveLangevinSpec(spec: AdaptiveLangevinSpec, recordsPath: boolean): void {
  const caller = recordsPath ? 'runAdaptiveLangevinPath' : 'fixedGridLangevinPath';
  const budget = NUMERICAL_WORK_BUDGETS.adaptiveLangevin;
  if (!spec || typeof spec !== 'object') throw new TypeError(`${caller}: spec must be an object.`);
  const dim = spec.initialState?.length;
  if (!Number.isSafeInteger(dim) || dim < 1 || dim > budget.maxStateDimension) {
    throw new RangeError(`${caller}: state dimension must be in [1, ${budget.maxStateDimension}].`);
  }
  assertFiniteBuffer(spec.initialState, `${caller}: initialState`);
  if (typeof spec.drift !== 'function') throw new TypeError(`${caller}: drift must be a function.`);
  if (typeof spec.diffusion !== 'function') {
    if (!spec.diffusion || spec.diffusion.length !== dim) {
      throw new RangeError(`${caller}: diffusion length must equal the state dimension.`);
    }
    assertFiniteBuffer(spec.diffusion, `${caller}: diffusion`);
  }
  if (spec.diffusionPrime !== undefined && typeof spec.diffusionPrime !== 'function') {
    throw new TypeError(`${caller}: diffusionPrime must be a function when supplied.`);
  }
  if (spec.base !== undefined && spec.base !== 'euler-maruyama' && spec.base !== 'milstein') {
    throw new RangeError(`${caller}: base scheme is unsupported.`);
  }
  const grid = spec.grid;
  if (!grid || typeof grid !== 'object') throw new TypeError(`${caller}: grid must be an object.`);
  if (
    !Number.isSafeInteger(grid.steps) ||
    grid.steps < 2 ||
    grid.steps > budget.maxGridSteps ||
    !Number.isInteger(Math.log2(grid.steps))
  ) {
    throw new RangeError(`${caller}: grid.steps must be a power of two in [2, ${budget.maxGridSteps}].`);
  }
  if (!Number.isSafeInteger(grid.dimension) || grid.dimension !== dim) {
    throw new RangeError(`${caller}: grid dimension must equal the state dimension.`);
  }
  assertUsableIntegrationStep(grid.dt, caller);
  if (!Number.isFinite(grid.totalTime) || !(grid.totalTime > 0)) {
    throw new RangeError(`${caller}: grid.totalTime must be positive and finite.`);
  }
  const reconstructedTotal = grid.steps * grid.dt;
  const timeScale = Math.max(Math.abs(reconstructedTotal), Math.abs(grid.totalTime));
  if (
    !Number.isFinite(reconstructedTotal) ||
    Math.abs(reconstructedTotal - grid.totalTime) > 32 * Number.EPSILON * timeScale
  ) {
    throw new RangeError(`${caller}: grid totalTime must equal steps * dt.`);
  }
  if (typeof grid.increment !== 'function') throw new TypeError(`${caller}: grid.increment must be a function.`);
  const pathStepCells = checkedWorkProduct([grid.steps, dim], caller);
  if (pathStepCells > budget.maxPathStepCells) {
    throw new RangeError(`${caller}: path work exceeds ${budget.maxPathStepCells} state-step cells.`);
  }
  if (recordsPath) {
    const outputCells = checkedWorkProduct([grid.steps + 1, dim], caller);
    if (outputCells > budget.maxRecordedStateCells) {
      throw new RangeError(`${caller}: worst-case recorded path exceeds ${budget.maxRecordedStateCells} state cells.`);
    }
  }
  const atol = spec.absoluteTolerance ?? 1e-3;
  const rtol = spec.relativeTolerance ?? 1e-3;
  if (!Number.isFinite(atol) || atol < 0 || !Number.isFinite(rtol) || rtol < 0 || (atol === 0 && rtol === 0)) {
    throw new RangeError(`${caller}: tolerances must be finite and non-negative, with at least one positive.`);
  }
}

/** One diagonal base step over [a, b] (dt = b−a) with the grid's own ΔW; writes into out. */
function adaptiveBaseStep(
  spec: AdaptiveLangevinSpec,
  state: Float64Array,
  aIndex: number,
  bIndex: number,
  dt: number,
  bScratch: number[],
  bPrimeScratch: number[],
  driftScratch: Float64Array,
  out: Float64Array
): void {
  const dim = state.length;
  driftScratch.fill(Number.NaN);
  spec.drift(state, driftScratch);
  assertFiniteBuffer(driftScratch, 'adaptive Langevin: drift output');
  const diffusion = spec.diffusion;
  if (typeof diffusion === 'function') {
    bScratch.fill(0);
    diffusion(state, bScratch);
    assertFiniteBuffer(bScratch, 'adaptive Langevin: diffusion output');
  }
  const useMilstein = (spec.base ?? 'euler-maruyama') === 'milstein';
  if (useMilstein && spec.diffusionPrime) {
    bPrimeScratch.fill(0);
    spec.diffusionPrime(state, bPrimeScratch);
    assertFiniteBuffer(bPrimeScratch, 'adaptive Langevin: diffusionPrime output');
  }
  for (let i = 0; i < dim; i += 1) {
    const b = typeof diffusion === 'function' ? (bScratch[i] ?? 0) : (diffusion[i] ?? 0);
    const dW = spec.grid.increment(aIndex, bIndex, i);
    if (!Number.isFinite(b)) throw new Error(`adaptive Langevin: diffusion[${i}] must be finite.`);
    if (!Number.isFinite(dW)) throw new Error(`adaptive Langevin: Brownian increment[${i}] must be finite.`);
    let increment = (driftScratch[i] ?? 0) * dt + b * dW;
    if (useMilstein && b !== 0) {
      const bPrime = spec.diffusionPrime ? (bPrimeScratch[i] ?? 0) : 0;
      increment += 0.5 * b * bPrime * (dW * dW - dt);
    }
    out[i] = (state[i] ?? 0) + increment;
    if (!Number.isFinite(out[i])) throw new Error(`adaptive Langevin: result[${i}] must be finite.`);
  }
}

/**
 * Integrate one realisation of a diagonal-noise SDE with adaptive step size over
 * a frozen {@link BrownianGrid}, controlling the local error by step doubling.
 */
export function runAdaptiveLangevinPath(spec: AdaptiveLangevinSpec): AdaptiveLangevinResult {
  validateAdaptiveLangevinSpec(spec, true);
  const dim = spec.initialState.length;
  const atol = spec.absoluteTolerance ?? 1e-3;
  const rtol = spec.relativeTolerance ?? 1e-3;
  const totalSteps = spec.grid.steps;
  const fineDt = spec.grid.dt;

  const state = Float64Array.from(spec.initialState);
  const big = new Float64Array(dim);
  const mid = new Float64Array(dim);
  const small = new Float64Array(dim);
  const driftScratch = new Float64Array(dim);
  const bScratch = new Array<number>(dim).fill(0);
  const bPrimeScratch = new Array<number>(dim).fill(0);

  const times: number[] = [0];
  const states: number[][] = [Array.from(state)];
  let pos = 0; // current node index
  let stride = totalSteps; // start as coarse as the whole interval allows
  let accepted = 0;
  let rejected = 0;
  let minDt = Infinity;
  let maxDt = 0;

  while (pos < totalSteps) {
    if (pos + stride > totalSteps) stride = Math.max(1, totalSteps - pos);
    const dt = stride * fineDt;
    // One big step over [pos, pos+stride].
    adaptiveBaseStep(spec, state, pos, pos + stride, dt, bScratch, bPrimeScratch, driftScratch, big);
    let acceptable: boolean;
    if (stride === 1) {
      // Finest resolution: nothing finer to compare against — accept the base step.
      small.set(big);
      acceptable = true;
    } else {
      const half = stride / 2;
      const halfDt = half * fineDt;
      adaptiveBaseStep(spec, state, pos, pos + half, halfDt, bScratch, bPrimeScratch, driftScratch, mid);
      adaptiveBaseStep(spec, mid, pos + half, pos + stride, halfDt, bScratch, bPrimeScratch, driftScratch, small);
      let errNorm = 0;
      for (let i = 0; i < dim; i += 1) {
        const scale = atol + rtol * Math.max(Math.abs(state[i] ?? 0), Math.abs(small[i] ?? 0));
        const difference = Math.abs((small[i] ?? 0) - (big[i] ?? 0));
        const normalizedError = scale === 0 ? (difference === 0 ? 0 : Number.POSITIVE_INFINITY) : difference / scale;
        errNorm = Math.max(errNorm, normalizedError);
      }
      acceptable = errNorm <= 1;
    }

    if (acceptable) {
      state.set(small); // the two-half-step value is the more accurate one
      pos += stride;
      accepted += 1;
      minDt = Math.min(minDt, dt);
      maxDt = Math.max(maxDt, dt);
      times.push(pos * fineDt);
      states.push(Array.from(state));
      // Try to grow the stride when comfortably aligned (stay on the dyadic grid).
      if (stride < totalSteps && pos % (2 * stride) === 0 && pos + 2 * stride <= totalSteps) stride *= 2;
    } else {
      rejected += 1;
      stride = Math.max(1, stride / 2);
    }
  }

  return {
    times,
    states,
    acceptedSteps: accepted,
    rejectedSteps: rejected,
    minDt: Number.isFinite(minDt) ? minDt : fineDt,
    maxDt,
    method: `adaptive ${spec.base ?? 'euler-maruyama'} (step-doubling local-error control) over a frozen dyadic Brownian grid`
  };
}

/** Full diagonal-noise reference: fixed step on every fine node of the grid (the all-fine baseline). */
export function fixedGridLangevinPath(spec: AdaptiveLangevinSpec): number[] {
  validateAdaptiveLangevinSpec(spec, false);
  const dim = spec.initialState.length;
  const state = Float64Array.from(spec.initialState);
  const out = new Float64Array(dim);
  const driftScratch = new Float64Array(dim);
  const bScratch = new Array<number>(dim).fill(0);
  const bPrimeScratch = new Array<number>(dim).fill(0);
  for (let k = 0; k < spec.grid.steps; k += 1) {
    adaptiveBaseStep(spec, state, k, k + 1, spec.grid.dt, bScratch, bPrimeScratch, driftScratch, out);
    state.set(out);
  }
  return Array.from(state);
}

/** State-dependent (multiplicative) noise for the ensemble runner. */
export interface MultiplicativeNoise {
  /** σ_i(x): per-component noise amplitude as a function of state. */
  diffusion: StateDependentVector;
  /** σ'_i(x) = ∂σ_i/∂x_i; required only for the Milstein scheme. */
  diffusionPrime?: StateDependentVector;
}

export interface LangevinEnsembleSpec {
  /** Deterministic drift f(x) (the platform's RHS, with parameters bound in). */
  drift: Derivative;
  /** Initial state, shared by every realisation. */
  initialState: readonly number[];
  /**
   * Per-component *additive* noise amplitude σ_i (constant). Ignored when
   * `multiplicative` is supplied.
   */
  diffusion: readonly number[];
  /** Integration scheme. Default 'euler-maruyama' (strong order ½). */
  scheme?: LangevinScheme;
  /** State-dependent diagonal noise; when present it overrides `diffusion`. */
  multiplicative?: MultiplicativeNoise;
  /**
   * Full matrix diffusion B(x) (stateDim × noiseDim). When present it overrides
   * `diffusion`/`multiplicative` and selects the matrix steppers — `scheme`
   * must be 'heun-stratonovich' (Stratonovich predictor–corrector) or
   * 'commutative-milstein' (strong-order-1, which needs `jacobian`).
   */
  matrixNoise?: {
    noiseDimension: number;
    diffusion: DiffusionMatrix;
    /** dB_{i,k}/dx_l in the layout of {@link DiffusionMatrixJacobian}; required for commutative-milstein. */
    jacobian?: DiffusionMatrixJacobian;
  };
  /** Time step. */
  dt: number;
  /** Number of Euler–Maruyama steps. */
  steps: number;
  /** Number of independent realisations to average over (≥ 2). */
  realizations: number;
  /** Uint32 base seed; realisation r uses a decorrelated derived seed. Default 1. */
  seed?: number;
  /** Record ensemble stats every `recordEvery` steps (≥ 1). Default = steps (final only). */
  recordEvery?: number;
}

export interface LangevinEnsembleResult {
  /** Times at which statistics were recorded (includes t = 0). */
  times: number[];
  /** Ensemble mean per recorded time: mean[k][i]. */
  mean: number[][];
  /** Unbiased ensemble variance per recorded time: variance[k][i]. */
  variance: number[][];
  /** Number of realisations averaged. */
  realizations: number;
  /** Dimension of the state. */
  dimension: number;
  scheme: LangevinScheme;
  /** Human-readable strong-order contract for the selected scheme. */
  strongOrder: string;
  /** Limitations that should travel with exported stochastic statistics. */
  caveats: string[];
}

/** Decorrelate per-realisation seeds with a SplitMix-style odd-constant mix. */
function realizationSeed(baseSeed: number, index: number): number {
  let z = (baseSeed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}

/**
 * Run an ensemble of independent Langevin realisations and accumulate the
 * mean and (unbiased) variance of the state at the recorded times, using
 * Welford's online moments so memory is O(samples × dim), not O(realisations).
 */
export function runLangevinEnsemble(spec: LangevinEnsembleSpec): LangevinEnsembleResult {
  const dim = spec.initialState.length;
  const budget = NUMERICAL_WORK_BUDGETS.langevinEnsemble;
  if (!Number.isSafeInteger(dim) || dim < 1 || dim > budget.maxStateDimension) {
    throw new RangeError(`runLangevinEnsemble: state dimension must be in [1, ${budget.maxStateDimension}].`);
  }
  if (typeof spec.drift !== 'function') throw new TypeError('runLangevinEnsemble: drift must be a function.');
  for (let i = 0; i < dim; i += 1) {
    if (!Object.hasOwn(spec.initialState, i) || !Number.isFinite(spec.initialState[i])) {
      throw new TypeError(`runLangevinEnsemble: initialState[${i}] must be present and finite.`);
    }
  }
  assertUsableIntegrationStep(spec.dt, 'runLangevinEnsemble');
  if (!Number.isSafeInteger(spec.realizations) || spec.realizations < 2 || spec.realizations > budget.maxRealizations) {
    throw new RangeError(`runLangevinEnsemble: realizations must be a safe integer in [2, ${budget.maxRealizations}].`);
  }
  if (!Number.isSafeInteger(spec.steps) || spec.steps < 1 || spec.steps > budget.maxSteps) {
    throw new RangeError(`runLangevinEnsemble: steps must be a safe integer in [1, ${budget.maxSteps}].`);
  }
  const recordEvery = spec.recordEvery ?? spec.steps;
  if (!Number.isSafeInteger(recordEvery) || recordEvery < 1) {
    throw new RangeError('runLangevinEnsemble: recordEvery must be a positive safe integer.');
  }
  const seed = spec.seed ?? 1;
  assertUint32Seed(seed, 'runLangevinEnsemble');
  const scheme = spec.scheme ?? 'euler-maruyama';
  if (
    scheme !== 'euler-maruyama' &&
    scheme !== 'milstein' &&
    scheme !== 'heun-stratonovich' &&
    scheme !== 'commutative-milstein'
  ) {
    throw new RangeError(`runLangevinEnsemble: unsupported scheme ${String(scheme)}.`);
  }
  const multiplicative = spec.multiplicative;
  const matrixNoise = spec.matrixNoise;
  const useMilstein = scheme === 'milstein';
  if (!matrixNoise && !multiplicative) {
    if (spec.diffusion.length !== dim) {
      throw new RangeError('runLangevinEnsemble: additive diffusion length must equal the state dimension.');
    }
    for (let i = 0; i < dim; i += 1) {
      if (!Object.hasOwn(spec.diffusion, i) || !Number.isFinite(spec.diffusion[i])) {
        throw new TypeError(`runLangevinEnsemble: diffusion[${i}] must be present and finite.`);
      }
    }
  }
  if (multiplicative && typeof multiplicative.diffusion !== 'function') {
    throw new TypeError('runLangevinEnsemble: multiplicative.diffusion must be a function.');
  }
  if (multiplicative?.diffusionPrime !== undefined && typeof multiplicative.diffusionPrime !== 'function') {
    throw new TypeError('runLangevinEnsemble: multiplicative.diffusionPrime must be a function when supplied.');
  }
  if (useMilstein && multiplicative && typeof multiplicative.diffusionPrime !== 'function') {
    throw new Error('runLangevinEnsemble: the Milstein scheme needs multiplicative.diffusionPrime (σ′).');
  }
  if (matrixNoise && scheme !== 'heun-stratonovich' && scheme !== 'commutative-milstein') {
    throw new Error("runLangevinEnsemble: matrixNoise requires scheme 'heun-stratonovich' or 'commutative-milstein'.");
  }
  if (!matrixNoise && (scheme === 'heun-stratonovich' || scheme === 'commutative-milstein')) {
    throw new Error(`runLangevinEnsemble: the '${scheme}' scheme requires matrixNoise (a full diffusion matrix).`);
  }
  if (matrixNoise && scheme === 'commutative-milstein' && !matrixNoise.jacobian) {
    throw new Error('runLangevinEnsemble: the commutative-milstein scheme needs matrixNoise.jacobian.');
  }
  let workFactors = [spec.realizations, spec.steps, dim];
  if (matrixNoise) {
    if (
      !Number.isSafeInteger(matrixNoise.noiseDimension) ||
      matrixNoise.noiseDimension < 1 ||
      matrixNoise.noiseDimension > budget.maxNoiseDimension
    ) {
      throw new RangeError(`runLangevinEnsemble: matrix-noise dimension must be in [1, ${budget.maxNoiseDimension}].`);
    }
    if (typeof matrixNoise.diffusion !== 'function') {
      throw new TypeError('runLangevinEnsemble: matrixNoise.diffusion must be a function.');
    }
    if (matrixNoise.jacobian !== undefined && typeof matrixNoise.jacobian !== 'function') {
      throw new TypeError('runLangevinEnsemble: matrixNoise.jacobian must be a function when supplied.');
    }
    workFactors =
      scheme === 'commutative-milstein'
        ? [spec.realizations, spec.steps, dim, dim, matrixNoise.noiseDimension, matrixNoise.noiseDimension]
        : [spec.realizations, spec.steps, dim, matrixNoise.noiseDimension];
  }
  const stateUpdates = checkedWorkProduct(workFactors, 'runLangevinEnsemble');
  if (stateUpdates > budget.maxStateUpdates) {
    throw new RangeError(`runLangevinEnsemble: requested work exceeds ${budget.maxStateUpdates} scalar updates.`);
  }
  const recordCount = Math.floor((spec.steps - 1) / recordEvery) + 2;
  const statisticCells = checkedWorkProduct([recordCount, dim, 2], 'runLangevinEnsemble');
  if (statisticCells > budget.maxStatisticCells) {
    throw new RangeError(`runLangevinEnsemble: recorded statistics exceed ${budget.maxStatisticCells} cells.`);
  }
  // Scratch for state-dependent coefficients and the additive Milstein σ′ = 0.
  const bScratch = new Array<number>(dim).fill(0);
  const bPrimeScratch = new Array<number>(dim).fill(0);
  const zeroPrime = new Array<number>(dim).fill(0);
  const matrixScratchBuffers: MatrixSdeScratch | undefined = matrixNoise ? {} : undefined;

  // Recorded step indices: 0 (initial), then every `recordEvery`, always the last.
  const recordSteps: number[] = [0];
  for (let s = recordEvery; s < spec.steps; s += recordEvery) recordSteps.push(s);
  if (recordSteps[recordSteps.length - 1] !== spec.steps) recordSteps.push(spec.steps);
  const sampleCount = recordSteps.length;

  // Welford accumulators: mean[k][i], m2[k][i].
  const mean: number[][] = recordSteps.map(() => new Array(dim).fill(0));
  const m2: number[][] = recordSteps.map(() => new Array(dim).fill(0));

  const state = new Float64Array(dim) as StateVector;
  const next = new Float64Array(dim) as StateVector;

  for (let r = 0; r < spec.realizations; r += 1) {
    const gaussian = gaussianSampler(realizationSeed(seed, r));
    for (let i = 0; i < dim; i += 1) state[i] = spec.initialState[i]!;

    let recordIndex = 0;
    const accumulate = (): void => {
      const meanRow = mean[recordIndex]!;
      const m2Row = m2[recordIndex]!;
      const count = r + 1;
      for (let i = 0; i < dim; i += 1) {
        const delta = state[i]! - meanRow[i]!;
        meanRow[i] = meanRow[i]! + delta / count;
        m2Row[i] = m2Row[i]! + delta * (state[i]! - meanRow[i]!);
      }
      recordIndex += 1;
    };

    accumulate(); // step 0
    for (let s = 1; s <= spec.steps; s += 1) {
      if (matrixNoise) {
        if (scheme === 'commutative-milstein') {
          commutativeMilsteinStepCore(
            state,
            spec.dt,
            spec.drift,
            matrixNoise.noiseDimension,
            matrixNoise.diffusion,
            matrixNoise.jacobian!,
            gaussian,
            next,
            matrixScratchBuffers,
            false
          );
        } else {
          stochasticHeunStratonovichStepCore(
            state,
            spec.dt,
            spec.drift,
            matrixNoise.noiseDimension,
            matrixNoise.diffusion,
            gaussian,
            next,
            matrixScratchBuffers,
            false
          );
        }
      } else if (multiplicative) {
        bScratch.fill(0);
        multiplicative.diffusion(state, bScratch);
        if (useMilstein) {
          bPrimeScratch.fill(0);
          multiplicative.diffusionPrime!(state, bPrimeScratch);
          milsteinStepCore(state, spec.dt, spec.drift, bScratch, bPrimeScratch, gaussian, next, 'runLangevinEnsemble');
        } else {
          eulerMaruyamaStepCore(state, spec.dt, spec.drift, bScratch, gaussian, next, 'runLangevinEnsemble');
        }
      } else if (useMilstein) {
        // Constant additive diffusion ⇒ σ′ = 0 (Milstein reduces to EM, exercised for parity).
        milsteinStepCore(state, spec.dt, spec.drift, spec.diffusion, zeroPrime, gaussian, next, 'runLangevinEnsemble');
      } else {
        eulerMaruyamaStepCore(state, spec.dt, spec.drift, spec.diffusion, gaussian, next, 'runLangevinEnsemble');
      }
      state.set(next);
      if (recordIndex < sampleCount && recordSteps[recordIndex] === s) accumulate();
    }
  }

  const denom = spec.realizations - 1;
  const variance = m2.map((row) => row.map((v) => v / denom));
  const metadata = stochasticSchemeMetadata(scheme, Boolean(matrixNoise));
  return {
    times: recordSteps.map((s) => s * spec.dt),
    mean,
    variance,
    realizations: spec.realizations,
    dimension: dim,
    scheme,
    strongOrder: metadata.strongOrder,
    caveats: metadata.caveats
  };
}
