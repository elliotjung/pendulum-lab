/**
 * Stochastic (Langevin) dynamics — additive-noise SDEs and ensemble statistics.
 *
 * The rest of the engine integrates deterministic ODEs ẋ = f(x). Real
 * oscillators are also kicked by thermal/electronic noise; this module adds that
 * channel as an Itô stochastic differential equation
 *
 *     dx = f(x) dt + σ ⊙ dW,        dW_i ~ N(0, dt) independent,
 *
 * advanced with the Euler–Maruyama scheme x_{n+1} = x_n + f(x_n) dt + σ √dt ξ
 * (ξ standard normal per component, strong order ½ / weak order 1 for additive
 * noise). Noise is *additive* (σ constant), so Itô and Stratonovich coincide and
 * there is no drift-correction subtlety.
 *
 * Everything is seeded and reproducible: a given seed reproduces the entire
 * ensemble bit-for-bit. The point of the ensemble runner is the *statistics* —
 * mean and variance across realisations — which converge to the SDE's true
 * moments and are validated against closed forms (Brownian MSD σ²t, and the
 * Ornstein–Uhlenbeck stationary variance σ²/2θ) in the test suite.
 */

import { mulberry32 } from './variational';
import { stochasticSchemeMetadata, type LangevinScheme } from './stochasticMetadata';
import type { Derivative, StateVector } from './types';

export type { LangevinScheme };

/** A standard-normal generator. */
export type GaussianSampler = () => number;

/**
 * Box–Muller standard-normal sampler driven by the deterministic mulberry32
 * PRNG. The second Box–Muller output is cached so two normals cost one pair of
 * uniforms.
 */
export function gaussianSampler(seed: number): GaussianSampler {
  const rng = mulberry32(seed >>> 0);
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u1 = 0;
    do {
      u1 = rng();
    } while (u1 <= 1e-12); // guard log(0)
    const u2 = rng();
    const radius = Math.sqrt(-2 * Math.log(u1));
    const angle = 2 * Math.PI * u2;
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

/**
 * One Euler–Maruyama step in place into `out`:
 *   out = state + drift(state)·dt + diffusion·√dt·ξ.
 * `diffusion[i]` is the per-component noise amplitude σ_i; components with σ_i=0
 * are integrated deterministically. `gaussian` supplies the ξ samples.
 */
export function eulerMaruyamaStep(
  state: StateVector,
  dt: number,
  drift: Derivative,
  diffusion: readonly number[],
  gaussian: GaussianSampler,
  out: StateVector
): StateVector {
  drift(state, out);
  const sqrtDt = Math.sqrt(dt);
  for (let i = 0; i < state.length; i += 1) {
    const sigma = diffusion[i] ?? 0;
    const noise = sigma !== 0 ? sigma * sqrtDt * gaussian() : 0;
    out[i] = state[i]! + out[i]! * dt + noise;
  }
  return out;
}

/** Writes per-component noise coefficients (σ_i(x) or σ'_i(x)) for a state. */
export type StateDependentVector = (state: StateVector, out: number[]) => void;

/**
 * One Milstein step in place into `out` for *diagonal* noise:
 *   out_i = x_i + a_i·dt + b_i·ΔW_i + ½·b_i·b'_i·(ΔW_i² − dt),   ΔW_i = √dt·ξ_i,
 * where `diffusion[i]` = b_i(x) and `diffusionPrime[i]` = ∂b_i/∂x_i, both already
 * evaluated at the current state. The ½·b·b' term is the Milstein correction
 * that lifts the strong order from ½ (Euler–Maruyama) to 1 for multiplicative
 * noise; with b' = 0 (additive noise) it vanishes and this reduces exactly to
 * {@link eulerMaruyamaStep}.
 */
export function milsteinStep(
  state: StateVector,
  dt: number,
  drift: Derivative,
  diffusion: readonly number[],
  diffusionPrime: readonly number[],
  gaussian: GaussianSampler,
  out: StateVector
): StateVector {
  drift(state, out);
  const sqrtDt = Math.sqrt(dt);
  for (let i = 0; i < state.length; i += 1) {
    const b = diffusion[i] ?? 0;
    if (b === 0) {
      out[i] = state[i]! + out[i]! * dt;
      continue;
    }
    const bPrime = diffusionPrime[i] ?? 0;
    const xi = gaussian();
    const dW = sqrtDt * xi;
    // `b * sqrtDt * xi` matches eulerMaruyamaStep's exact association, so with
    // bPrime = 0 (additive noise) the Milstein step is bit-identical to EM.
    const noise = b * sqrtDt * xi + 0.5 * b * bPrime * (dW * dW - dt);
    out[i] = state[i]! + out[i]! * dt + noise;
  }
  return out;
}

/** Writes a row-major diffusion matrix B(x), shape stateDim x noiseDim. */
export type DiffusionMatrix = (state: StateVector, out: number[], noiseDimension: number) => void;

/**
 * Writes dB[i,k]/dx[l] in row-major blocks:
 *   out[((i * noiseDimension + k) * stateDim) + l].
 *
 * This is the derivative layout needed by the commutative-noise Milstein
 * correction L_j B_{i,k} = sum_l B_{l,j} dB_{i,k}/dx_l.
 */
export type DiffusionMatrixJacobian = (state: StateVector, out: number[], noiseDimension: number) => void;

export interface MatrixSdeScratch {
  drift0?: Float64Array;
  drift1?: Float64Array;
  predictor?: Float64Array;
  diffusion0?: number[];
  diffusion1?: number[];
  diffusionJacobian?: number[];
  increments?: number[];
}

function matrixScratch(spec: MatrixSdeScratch | undefined, dim: number, noiseDim: number): Required<MatrixSdeScratch> {
  return {
    drift0: spec?.drift0 ?? new Float64Array(dim),
    drift1: spec?.drift1 ?? new Float64Array(dim),
    predictor: spec?.predictor ?? new Float64Array(dim),
    diffusion0: spec?.diffusion0 ?? new Array<number>(dim * noiseDim).fill(0),
    diffusion1: spec?.diffusion1 ?? new Array<number>(dim * noiseDim).fill(0),
    diffusionJacobian: spec?.diffusionJacobian ?? new Array<number>(dim * noiseDim * dim).fill(0),
    increments: spec?.increments ?? new Array<number>(noiseDim).fill(0)
  };
}

function validateNoiseDimension(noiseDimension: number): void {
  if (!Number.isInteger(noiseDimension) || noiseDimension < 1) {
    throw new Error('matrix SDE step: noiseDimension must be a positive integer.');
  }
}

/**
 * One stochastic Heun predictor-corrector step for Stratonovich SDEs:
 *
 *   dx = a(x) dt + B(x) o dW
 *
 * where B is a full stateDim x noiseDim diffusion matrix. For additive noise it
 * reduces to Euler-Maruyama with a trapezoidal drift correction; for
 * multiplicative Stratonovich noise it avoids silently applying the Ito drift
 * convention used by Euler-Maruyama.
 */
export function stochasticHeunStratonovichStep(
  state: StateVector,
  dt: number,
  drift: Derivative,
  noiseDimension: number,
  diffusion: DiffusionMatrix,
  gaussian: GaussianSampler,
  out: StateVector,
  scratch?: MatrixSdeScratch
): StateVector {
  validateNoiseDimension(noiseDimension);
  const dim = state.length;
  const ws = matrixScratch(scratch, dim, noiseDimension);
  drift(state, ws.drift0);
  diffusion(state, ws.diffusion0, noiseDimension);
  const sqrtDt = Math.sqrt(dt);
  for (let k = 0; k < noiseDimension; k += 1) ws.increments[k] = sqrtDt * gaussian();

  for (let i = 0; i < dim; i += 1) {
    let noise = 0;
    const row = i * noiseDimension;
    for (let k = 0; k < noiseDimension; k += 1) noise += (ws.diffusion0[row + k] ?? 0) * (ws.increments[k] ?? 0);
    ws.predictor[i] = state[i]! + ws.drift0[i]! * dt + noise;
  }

  drift(ws.predictor, ws.drift1);
  diffusion(ws.predictor, ws.diffusion1, noiseDimension);
  for (let i = 0; i < dim; i += 1) {
    let noise = 0;
    const row = i * noiseDimension;
    for (let k = 0; k < noiseDimension; k += 1) {
      noise += 0.5 * ((ws.diffusion0[row + k] ?? 0) + (ws.diffusion1[row + k] ?? 0)) * (ws.increments[k] ?? 0);
    }
    out[i] = state[i]! + 0.5 * (ws.drift0[i]! + ws.drift1[i]!) * dt + noise;
  }
  return out;
}

/**
 * One strong-order-1 Milstein step for full matrix diffusion under the standard
 * commutative-noise assumption:
 *
 *   dx_i = a_i dt + sum_k B_{i,k} dW_k
 *          + 1/2 sum_{j,k} L_j B_{i,k} (dW_j dW_k - delta_jk dt)
 *
 * where L_j = sum_l B_{l,j} d/dx_l. Non-commutative noise needs Levy-area
 * terms and is intentionally not approximated here.
 */
export function commutativeMilsteinStep(
  state: StateVector,
  dt: number,
  drift: Derivative,
  noiseDimension: number,
  diffusion: DiffusionMatrix,
  diffusionJacobian: DiffusionMatrixJacobian,
  gaussian: GaussianSampler,
  out: StateVector,
  scratch?: MatrixSdeScratch
): StateVector {
  validateNoiseDimension(noiseDimension);
  const dim = state.length;
  const ws = matrixScratch(scratch, dim, noiseDimension);
  drift(state, ws.drift0);
  diffusion(state, ws.diffusion0, noiseDimension);
  diffusionJacobian(state, ws.diffusionJacobian, noiseDimension);
  const sqrtDt = Math.sqrt(dt);
  for (let k = 0; k < noiseDimension; k += 1) ws.increments[k] = sqrtDt * gaussian();

  for (let i = 0; i < dim; i += 1) {
    let noise = 0;
    const row = i * noiseDimension;
    for (let k = 0; k < noiseDimension; k += 1) noise += (ws.diffusion0[row + k] ?? 0) * (ws.increments[k] ?? 0);

    let correction = 0;
    for (let j = 0; j < noiseDimension; j += 1) {
      for (let k = 0; k < noiseDimension; k += 1) {
        let lieDerivative = 0;
        for (let l = 0; l < dim; l += 1) {
          const bLj = ws.diffusion0[l * noiseDimension + j] ?? 0;
          const dBikDxl = ws.diffusionJacobian[(i * noiseDimension + k) * dim + l] ?? 0;
          lieDerivative += bLj * dBikDxl;
        }
        const quadratic = (ws.increments[j] ?? 0) * (ws.increments[k] ?? 0) - (j === k ? dt : 0);
        correction += lieDerivative * quadratic;
      }
    }
    out[i] = state[i]! + ws.drift0[i]! * dt + noise + 0.5 * correction;
  }
  return out;
}

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
  if (!(totalTime > 0)) throw new Error('buildBrownianGrid: totalTime must be positive.');
  if (!Number.isInteger(levels) || levels < 1 || levels > 24)
    throw new Error('buildBrownianGrid: levels must be an integer in [1, 24].');
  if (!Number.isInteger(dimension) || dimension < 1)
    throw new Error('buildBrownianGrid: dimension must be a positive integer.');
  const steps = 2 ** levels;
  const dt = totalTime / steps;
  const sqrtDt = Math.sqrt(dt);
  const gaussian = gaussianSampler(seed >>> 0);
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
  spec.drift(state, driftScratch);
  const diffusion = spec.diffusion;
  if (typeof diffusion === 'function') diffusion(state, bScratch);
  const useMilstein = (spec.base ?? 'euler-maruyama') === 'milstein';
  if (useMilstein && spec.diffusionPrime) spec.diffusionPrime(state, bPrimeScratch);
  for (let i = 0; i < dim; i += 1) {
    const b = typeof diffusion === 'function' ? (bScratch[i] ?? 0) : (diffusion[i] ?? 0);
    const dW = spec.grid.increment(aIndex, bIndex, i);
    let increment = (driftScratch[i] ?? 0) * dt + b * dW;
    if (useMilstein && b !== 0) {
      const bPrime = spec.diffusionPrime ? (bPrimeScratch[i] ?? 0) : 0;
      increment += 0.5 * b * bPrime * (dW * dW - dt);
    }
    out[i] = (state[i] ?? 0) + increment;
  }
}

/**
 * Integrate one realisation of a diagonal-noise SDE with adaptive step size over
 * a frozen {@link BrownianGrid}, controlling the local error by step doubling.
 */
export function runAdaptiveLangevinPath(spec: AdaptiveLangevinSpec): AdaptiveLangevinResult {
  const dim = spec.initialState.length;
  if (dim === 0) throw new Error('runAdaptiveLangevinPath: empty initial state.');
  if (spec.grid.dimension !== dim)
    throw new Error('runAdaptiveLangevinPath: grid dimension must equal the state dimension.');
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
        errNorm = Math.max(errNorm, Math.abs((small[i] ?? 0) - (big[i] ?? 0)) / scale);
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
  /** Base seed; realisation r uses a decorrelated derived seed. Default 1. */
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
  if (dim === 0) throw new Error('runLangevinEnsemble: empty initial state.');
  if (spec.realizations < 2) throw new Error('runLangevinEnsemble: need at least 2 realisations for variance.');
  if (spec.steps < 1) throw new Error('runLangevinEnsemble: steps must be ≥ 1.');
  const recordEvery = spec.recordEvery ?? spec.steps;
  if (recordEvery < 1) throw new Error('runLangevinEnsemble: recordEvery must be ≥ 1.');
  const seed = spec.seed ?? 1;
  const scheme = spec.scheme ?? 'euler-maruyama';
  const multiplicative = spec.multiplicative;
  const matrixNoise = spec.matrixNoise;
  const useMilstein = scheme === 'milstein';
  if (useMilstein && multiplicative && !multiplicative.diffusionPrime) {
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
          commutativeMilsteinStep(
            state,
            spec.dt,
            spec.drift,
            matrixNoise.noiseDimension,
            matrixNoise.diffusion,
            matrixNoise.jacobian!,
            gaussian,
            next,
            matrixScratchBuffers
          );
        } else {
          stochasticHeunStratonovichStep(
            state,
            spec.dt,
            spec.drift,
            matrixNoise.noiseDimension,
            matrixNoise.diffusion,
            gaussian,
            next,
            matrixScratchBuffers
          );
        }
      } else if (multiplicative) {
        multiplicative.diffusion(state, bScratch);
        if (useMilstein) {
          multiplicative.diffusionPrime!(state, bPrimeScratch);
          milsteinStep(state, spec.dt, spec.drift, bScratch, bPrimeScratch, gaussian, next);
        } else {
          eulerMaruyamaStep(state, spec.dt, spec.drift, bScratch, gaussian, next);
        }
      } else if (useMilstein) {
        // Constant additive diffusion ⇒ σ′ = 0 (Milstein reduces to EM, exercised for parity).
        milsteinStep(state, spec.dt, spec.drift, spec.diffusion, zeroPrime, gaussian, next);
      } else {
        eulerMaruyamaStep(state, spec.dt, spec.drift, spec.diffusion, gaussian, next);
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
