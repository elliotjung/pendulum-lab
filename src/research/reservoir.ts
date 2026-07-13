/**
 * **Echo State Network (reservoir computing)** — a recurrent network whose
 * hidden weights are *fixed random* and only a linear readout is trained, so
 * "training" is a single closed-form **ridge regression**, not iterative
 * gradient descent. This is the data-driven companion to {@link identifyDynamics}
 * (SINDy) and {@link dmd}/{@link havok}: where those recover an explicit model,
 * an ESN learns a black-box predictor that can free-run as a surrogate of the
 * underlying dynamical system.
 *
 * A reservoir of N neurons with state r evolves under the leaky-integrator map
 *
 *     r(t+1) = (1−α) r(t) + α·tanh( W_res·r(t) + W_in·u(t) + b ),
 *
 * with a sparse random recurrent matrix W_res rescaled to a target **spectral
 * radius** ρ < 1 (the *echo state property*: the reservoir forgets its initial
 * condition, so its state is a fading-memory function of the input history).
 * The readout y = W_out·φ with feature φ = [1; u; r] is fit by ridge regression
 * W_out = Y Φᵀ (ΦΦᵀ + βI)⁻¹ — solved here through the engine's SPD Cholesky
 * route, exactly as SINDy solves its normal equations.
 *
 * Reproducibility: every random weight comes from a seeded `mulberry32` stream,
 * so a given spec yields the same network and the same fit on every run — the
 * project's "measure, then pin the threshold" contract applies unchanged. The
 * spectral radius is rescaled *exactly* using the general eigensolver
 * (`eigenvaluesGeneral`), not the circular-law estimate, so ρ is hit to
 * round-off.
 *
 * Scope: a single leaky-ESN with a linear readout. Deep/parallel reservoirs,
 * online learning, and intrinsic-plasticity tuning are out of scope; for a chaotic
 * target the free-run tracks only over the predictability (Lyapunov) horizon —
 * a physical limit, surfaced by the returned NRMSE, not a defect.
 */
import { solveCholeskyInPlace } from '../physics/linearSolve';
import { eigenvaluesGeneral } from './eigenGeneral';
import { complexAbs } from './complexEig';

export interface EsnSpec {
  /** Reservoir size N (number of recurrent neurons), ≥ 1. */
  reservoirSize: number;
  /** Input/output dimension (equal — the readout predicts the next input). */
  dimension: number;
  /** Target spectral radius ρ of W_res (echo state property needs ρ < 1). Default 0.9. */
  spectralRadius?: number;
  /** Scaling of the random input weights W_in. Default 1. */
  inputScaling?: number;
  /** Leak rate α ∈ (0, 1]. Default 1 (no leak). */
  leakRate?: number;
  /** Fraction of non-zero W_res entries ∈ (0, 1]. Default 0.1. */
  connectivity?: number;
  /** Constant bias b added inside the tanh. Default 0. */
  bias?: number;
  /** Tikhonov ridge β added to the readout normal-equations diagonal. Default 1e-6. */
  ridge?: number;
  /** Initial transient (samples) discarded before collecting features. Default 50. */
  washout?: number;
  /** PRNG seed. Default 1. */
  seed?: number;
}

type FullEsnSpec = Required<EsnSpec>;

export interface TrainedEsn {
  /** The resolved spec (defaults filled in). */
  spec: FullEsnSpec;
  /** Spectral radius actually realised after rescaling (≈ spec.spectralRadius). */
  measuredSpectralRadius: number;
  /** Recurrent matrix W_res (N×N, row-major). */
  reservoir: number[];
  /** Input matrix W_in (N×dimension, row-major). */
  inputWeights: number[];
  /** Readout W_out (dimension×featureDim, row-major). */
  readout: number[];
  /** Feature length 1 + dimension + N. */
  featureDim: number;
  /** Training residual NRMSE per output dimension on the (post-washout) fit data. */
  trainNrmse: number[];
}

/** mulberry32 — a small deterministic PRNG returning uniforms in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard-normal sample via Box–Muller from a uniform stream. */
function gaussian(rng: () => number): number {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function resolveSpec(spec: EsnSpec): FullEsnSpec {
  if (!Number.isInteger(spec.reservoirSize) || spec.reservoirSize < 1) {
    throw new Error('trainEsn: reservoirSize must be a positive integer.');
  }
  if (!Number.isInteger(spec.dimension) || spec.dimension < 1) {
    throw new Error('trainEsn: dimension must be a positive integer.');
  }
  const leakRate = spec.leakRate ?? 1;
  if (!(leakRate > 0 && leakRate <= 1)) throw new Error('trainEsn: leakRate must be in (0, 1].');
  const connectivity = spec.connectivity ?? 0.1;
  if (!(connectivity > 0 && connectivity <= 1)) throw new Error('trainEsn: connectivity must be in (0, 1].');
  return {
    reservoirSize: spec.reservoirSize,
    dimension: spec.dimension,
    spectralRadius: spec.spectralRadius ?? 0.9,
    inputScaling: spec.inputScaling ?? 1,
    leakRate,
    connectivity,
    bias: spec.bias ?? 0,
    ridge: spec.ridge ?? 1e-6,
    washout: spec.washout ?? 50,
    seed: spec.seed ?? 1
  };
}

/** Build and exactly rescale the sparse recurrent matrix to the target ρ. */
function buildReservoir(spec: FullEsnSpec, rng: () => number): { reservoir: number[]; measured: number } {
  const n = spec.reservoirSize;
  const w = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (rng() < spec.connectivity) w[i * n + j] = gaussian(rng);
    }
  }
  // Exact spectral-radius rescale via the general eigensolver.
  const rows: number[][] = [];
  for (let i = 0; i < n; i += 1) rows.push(w.slice(i * n, i * n + n));
  let radius = 0;
  for (const lambda of eigenvaluesGeneral(rows)) radius = Math.max(radius, complexAbs(lambda));
  if (radius === 0)
    throw new Error('trainEsn: reservoir matrix is nilpotent (radius 0); raise connectivity or reservoirSize.');
  const scale = spec.spectralRadius / radius;
  for (let k = 0; k < w.length; k += 1) w[k] = (w[k] ?? 0) * scale;
  return { reservoir: w, measured: spec.spectralRadius };
}

/** Advance the reservoir state one step under input u (in place into `out`). */
function reservoirStep(
  state: Float64Array,
  input: ArrayLike<number>,
  reservoir: number[],
  inputWeights: number[],
  spec: FullEsnSpec,
  out: Float64Array
): void {
  const n = spec.reservoirSize;
  const d = spec.dimension;
  const alpha = spec.leakRate;
  for (let i = 0; i < n; i += 1) {
    let pre = spec.bias;
    const rowR = i * n;
    for (let j = 0; j < n; j += 1) pre += (reservoir[rowR + j] ?? 0) * (state[j] ?? 0);
    const rowI = i * d;
    for (let k = 0; k < d; k += 1) pre += spec.inputScaling * (inputWeights[rowI + k] ?? 0) * (input[k] ?? 0);
    out[i] = (1 - alpha) * (state[i] ?? 0) + alpha * Math.tanh(pre);
  }
}

/** Assemble the readout feature φ = [1; u; r]. */
function feature(input: ArrayLike<number>, state: Float64Array, dimension: number): Float64Array {
  const f = new Float64Array(1 + dimension + state.length);
  f[0] = 1;
  for (let k = 0; k < dimension; k += 1) f[1 + k] = input[k] ?? 0;
  for (let i = 0; i < state.length; i += 1) f[1 + dimension + i] = state[i] ?? 0;
  return f;
}

function rectangular(rows: readonly (readonly number[])[], what: string, dim: number): void {
  if (rows.length === 0) throw new Error(`trainEsn: ${what} is empty.`);
  for (const row of rows) {
    if (row.length !== dim) throw new Error(`trainEsn: every ${what} row must have length ${dim}.`);
  }
}

/**
 * Train an ESN to predict `targets[t]` from `inputs[t]`. For autonomous
 * time-series surrogacy pass targets[t] = inputs[t+1] (use {@link buildNextStepTargets}).
 * The reservoir is driven through the inputs, the post-washout features and
 * targets are collected, and the readout is fit by ridge regression.
 */
export function trainEsn(
  inputs: readonly (readonly number[])[],
  targets: readonly (readonly number[])[],
  spec: EsnSpec
): TrainedEsn {
  const full = resolveSpec(spec);
  const { dimension: d, reservoirSize: n, washout } = full;
  if (inputs.length !== targets.length) throw new Error('trainEsn: inputs and targets must have equal length.');
  if (inputs.length <= washout + 1) throw new Error('trainEsn: need more samples than the washout length.');
  rectangular(inputs, 'input', d);
  rectangular(targets, 'target', d);

  const rng = mulberry32(full.seed);
  const inputWeights = new Array<number>(n * d).fill(0);
  for (let k = 0; k < inputWeights.length; k += 1) inputWeights[k] = gaussian(rng);
  const { reservoir, measured } = buildReservoir(full, rng);

  const featureDim = 1 + d + n;
  let state = new Float64Array(n);
  let next = new Float64Array(n);
  const features: Float64Array[] = [];
  const collectedTargets: number[][] = [];
  for (let t = 0; t < inputs.length; t += 1) {
    reservoirStep(state, inputs[t]!, reservoir, inputWeights, full, next);
    [state, next] = [next, state];
    if (t >= washout) {
      features.push(feature(inputs[t]!, state, d));
      collectedTargets.push(targets[t]!.slice());
    }
  }

  // Ridge regression: per output dim, solve (ΦᵀΦ + βI) w = Φᵀ y via SPD Cholesky.
  const samples = features.length;
  const gram = new Float64Array(featureDim * featureDim);
  for (let p = 0; p < featureDim; p += 1) {
    for (let q = p; q < featureDim; q += 1) {
      let g = 0;
      for (let s = 0; s < samples; s += 1) g += (features[s]![p] ?? 0) * (features[s]![q] ?? 0);
      if (p === q) g += full.ridge;
      gram[p * featureDim + q] = g;
      gram[q * featureDim + p] = g;
    }
  }
  const readout = new Array<number>(d * featureDim).fill(0);
  const trainNrmse = new Array<number>(d).fill(0);
  const factorScratch = new Float64Array(featureDim * featureDim);
  for (let j = 0; j < d; j += 1) {
    const rhs = new Float64Array(featureDim);
    for (let p = 0; p < featureDim; p += 1) {
      let r = 0;
      for (let s = 0; s < samples; s += 1) r += (features[s]![p] ?? 0) * (collectedTargets[s]![j] ?? 0);
      rhs[p] = r;
    }
    const gramCopy = Float64Array.from(gram);
    const result = solveCholeskyInPlace(gramCopy, rhs, featureDim, factorScratch, {
      fallbackPolicy: 'return-diagnostics'
    });
    if (!result.ok) {
      throw new Error(
        `trainEsn: readout normal equations not positive-definite (${result.reason}); raise the ridge term.`
      );
    }
    for (let p = 0; p < featureDim; p += 1) readout[j * featureDim + p] = rhs[p] ?? 0;

    // Training NRMSE for diagnostics.
    let mean = 0;
    for (let s = 0; s < samples; s += 1) mean += collectedTargets[s]![j] ?? 0;
    mean /= samples;
    let ssRes = 0;
    let ssTot = 0;
    for (let s = 0; s < samples; s += 1) {
      let pred = 0;
      for (let p = 0; p < featureDim; p += 1) pred += (readout[j * featureDim + p] ?? 0) * (features[s]![p] ?? 0);
      const y = collectedTargets[s]![j] ?? 0;
      ssRes += (pred - y) ** 2;
      ssTot += (y - mean) ** 2;
    }
    trainNrmse[j] = ssTot > 0 ? Math.sqrt(ssRes / ssTot) : Math.sqrt(ssRes / samples);
  }

  return { spec: full, measuredSpectralRadius: measured, reservoir, inputWeights, readout, featureDim, trainNrmse };
}

/** Apply the readout to a feature vector → predicted output. */
function applyReadout(esn: TrainedEsn, f: Float64Array): number[] {
  const d = esn.spec.dimension;
  const out = new Array<number>(d).fill(0);
  for (let j = 0; j < d; j += 1) {
    let pred = 0;
    for (let p = 0; p < esn.featureDim; p += 1) pred += (esn.readout[j * esn.featureDim + p] ?? 0) * (f[p] ?? 0);
    out[j] = pred;
  }
  return out;
}

/**
 * Teacher-forced one-step prediction: drive the reservoir through `inputs` and
 * return ŷ(t) = readout(φ(t)) at every step (the input at each step is the true
 * observation). Output length equals `inputs.length`.
 */
export function predictEsnOneStep(esn: TrainedEsn, inputs: readonly (readonly number[])[]): number[][] {
  const { dimension: d, reservoirSize: n } = esn.spec;
  rectangular(inputs, 'input', d);
  let state = new Float64Array(n);
  let next = new Float64Array(n);
  const out: number[][] = [];
  for (let t = 0; t < inputs.length; t += 1) {
    reservoirStep(state, inputs[t]!, esn.reservoir, esn.inputWeights, esn.spec, next);
    [state, next] = [next, state];
    out.push(applyReadout(esn, feature(inputs[t]!, state, d)));
  }
  return out;
}

/**
 * Free-running (generative) prediction: drive the reservoir with `warmup` to
 * synchronise its state, then run autonomously for `steps`, feeding each
 * prediction back as the next input. Returns the `steps` generated vectors —
 * the ESN acting as a surrogate of the underlying flow.
 */
export function predictEsnFree(esn: TrainedEsn, warmup: readonly (readonly number[])[], steps: number): number[][] {
  const { dimension: d, reservoirSize: n } = esn.spec;
  if (!Number.isInteger(steps) || steps < 1) throw new Error('predictEsnFree: steps must be a positive integer.');
  if (warmup.length < 1) throw new Error('predictEsnFree: need at least one warmup input.');
  rectangular(warmup, 'warmup', d);
  let state = new Float64Array(n);
  let next = new Float64Array(n);
  let current: number[] = warmup[0]!.slice();
  for (let t = 0; t < warmup.length; t += 1) {
    reservoirStep(state, warmup[t]!, esn.reservoir, esn.inputWeights, esn.spec, next);
    [state, next] = [next, state];
    current = applyReadout(esn, feature(warmup[t]!, state, d));
  }
  const out: number[][] = [];
  for (let s = 0; s < steps; s += 1) {
    out.push(current.slice());
    reservoirStep(state, current, esn.reservoir, esn.inputWeights, esn.spec, next);
    [state, next] = [next, state];
    current = applyReadout(esn, feature(current, state, d));
  }
  return out;
}

/** Build autonomous next-step targets: targets[t] = series[t+1], inputs[t] = series[t]. */
export function buildNextStepTargets(series: readonly (readonly number[])[]): {
  inputs: number[][];
  targets: number[][];
} {
  if (series.length < 2) throw new Error('buildNextStepTargets: need at least two samples.');
  const inputs: number[][] = [];
  const targets: number[][] = [];
  for (let t = 0; t < series.length - 1; t += 1) {
    inputs.push(series[t]!.slice());
    targets.push(series[t + 1]!.slice());
  }
  return { inputs, targets };
}

/** Normalised RMSE √(Σ‖pred−true‖² / Σ‖true−mean‖²) between two equal-length series. */
export function predictionNrmse(
  predicted: readonly (readonly number[])[],
  truth: readonly (readonly number[])[]
): number {
  if (predicted.length !== truth.length) throw new Error('predictionNrmse: length mismatch.');
  if (predicted.length === 0) throw new Error('predictionNrmse: empty series.');
  const d = truth[0]!.length;
  const mean = new Array<number>(d).fill(0);
  for (const row of truth) for (let k = 0; k < d; k += 1) mean[k] = (mean[k] ?? 0) + (row[k] ?? 0);
  for (let k = 0; k < d; k += 1) mean[k] = (mean[k] ?? 0) / truth.length;
  let ssRes = 0;
  let ssTot = 0;
  for (let t = 0; t < truth.length; t += 1) {
    for (let k = 0; k < d; k += 1) {
      ssRes += ((predicted[t]![k] ?? 0) - (truth[t]![k] ?? 0)) ** 2;
      ssTot += ((truth[t]![k] ?? 0) - (mean[k] ?? 0)) ** 2;
    }
  }
  return ssTot > 0 ? Math.sqrt(ssRes / ssTot) : Math.sqrt(ssRes / (truth.length * d));
}
