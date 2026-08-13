/**
 * Stochastic (Langevin) stepping kernels for diagonal and matrix-noise SDEs.
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
import type { LangevinScheme } from './stochasticMetadata';
import type { Derivative, StateVector } from './types';
import {
  assertUsableIntegrationStep,
  checkedWorkProduct,
  NUMERICAL_WORK_BUDGETS
} from '../validation/numericalBudgets';

export type { LangevinScheme };

/** A standard-normal generator. */
export type GaussianSampler = () => number;

const UINT32_MAX = 0xffff_ffff;

export function assertUint32Seed(seed: number, caller: string): void {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > UINT32_MAX) {
    throw new RangeError(`${caller}: seed must be a uint32 integer in [0, ${UINT32_MAX}].`);
  }
}

function float64ViewsOverlap(left: Float64Array, right: Float64Array): boolean {
  if (left.buffer !== right.buffer) return false;
  const leftEnd = left.byteOffset + left.byteLength;
  const rightEnd = right.byteOffset + right.byteLength;
  return left.byteOffset < rightEnd && right.byteOffset < leftEnd;
}

function validateDiagonalStepInputs(
  caller: string,
  state: StateVector,
  dt: number,
  drift: Derivative,
  diffusion: readonly number[],
  gaussian: GaussianSampler,
  out: StateVector,
  diffusionPrime?: readonly number[]
): void {
  const maxDimension = NUMERICAL_WORK_BUDGETS.langevinEnsemble.maxStateDimension;
  if (!(state instanceof Float64Array) || state.length < 1 || state.length > maxDimension) {
    throw new RangeError(`${caller}: state must be a Float64Array with dimension in [1, ${maxDimension}].`);
  }
  if (!(out instanceof Float64Array) || out.length !== state.length) {
    throw new RangeError(`${caller}: out must be a Float64Array matching the state dimension.`);
  }
  if (float64ViewsOverlap(state, out)) throw new RangeError(`${caller}: state and out must not overlap.`);
  assertUsableIntegrationStep(dt, caller);
  if (typeof drift !== 'function') throw new TypeError(`${caller}: drift must be a function.`);
  if (typeof gaussian !== 'function') throw new TypeError(`${caller}: gaussian must be a function.`);
  if (!diffusion || diffusion.length !== state.length) {
    throw new RangeError(`${caller}: diffusion length must equal the state dimension.`);
  }
  if (diffusionPrime && diffusionPrime.length !== state.length) {
    throw new RangeError(`${caller}: diffusionPrime length must equal the state dimension.`);
  }
  assertFiniteBuffer(state, `${caller}: state`);
  assertFiniteBuffer(diffusion, `${caller}: diffusion`);
  if (diffusionPrime) assertFiniteBuffer(diffusionPrime, `${caller}: diffusionPrime`);
}

export function eulerMaruyamaStepCore(
  state: StateVector,
  dt: number,
  drift: Derivative,
  diffusion: readonly number[],
  gaussian: GaussianSampler,
  out: StateVector,
  caller: string
): StateVector {
  out.fill(Number.NaN);
  drift(state, out);
  const sqrtDt = Math.sqrt(dt);
  for (let i = 0; i < state.length; i += 1) {
    if (!Number.isFinite(out[i])) throw new Error(`${caller}: drift output[${i}] must be finite.`);
    const sigma = diffusion[i] ?? 0;
    if (!Number.isFinite(sigma)) throw new Error(`${caller}: diffusion[${i}] must be finite.`);
    let noise = 0;
    if (sigma !== 0) {
      const sample = gaussian();
      if (!Number.isFinite(sample)) throw new Error(`${caller}: gaussian output must be finite.`);
      noise = sigma * sqrtDt * sample;
    }
    out[i] = state[i]! + out[i]! * dt + noise;
    if (!Number.isFinite(out[i])) throw new Error(`${caller}: result[${i}] must be finite.`);
  }
  return out;
}

/**
 * Box–Muller standard-normal sampler driven by the deterministic mulberry32
 * PRNG. The second Box–Muller output is cached so two normals cost one pair of
 * uniforms.
 */
export function gaussianSampler(seed: number): GaussianSampler {
  assertUint32Seed(seed, 'gaussianSampler');
  const rng = mulberry32(seed);
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
  const caller = 'eulerMaruyamaStep';
  validateDiagonalStepInputs(caller, state, dt, drift, diffusion, gaussian, out);
  return eulerMaruyamaStepCore(state, dt, drift, diffusion, gaussian, out, caller);
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
  const caller = 'milsteinStep';
  validateDiagonalStepInputs(caller, state, dt, drift, diffusion, gaussian, out, diffusionPrime);
  return milsteinStepCore(state, dt, drift, diffusion, diffusionPrime, gaussian, out, caller);
}

export function milsteinStepCore(
  state: StateVector,
  dt: number,
  drift: Derivative,
  diffusion: readonly number[],
  diffusionPrime: readonly number[],
  gaussian: GaussianSampler,
  out: StateVector,
  caller: string
): StateVector {
  out.fill(Number.NaN);
  drift(state, out);
  const sqrtDt = Math.sqrt(dt);
  for (let i = 0; i < state.length; i += 1) {
    if (!Number.isFinite(out[i])) throw new Error(`${caller}: drift output[${i}] must be finite.`);
    const b = diffusion[i] ?? 0;
    const bPrime = diffusionPrime[i] ?? 0;
    if (!Number.isFinite(b)) throw new Error(`${caller}: diffusion[${i}] must be finite.`);
    if (!Number.isFinite(bPrime)) throw new Error(`${caller}: diffusionPrime[${i}] must be finite.`);
    if (b === 0) {
      out[i] = state[i]! + out[i]! * dt;
      if (!Number.isFinite(out[i])) throw new Error(`${caller}: result[${i}] must be finite.`);
      continue;
    }
    const xi = gaussian();
    if (!Number.isFinite(xi)) throw new Error(`${caller}: gaussian output must be finite.`);
    const dW = sqrtDt * xi;
    // `b * sqrtDt * xi` matches eulerMaruyamaStep's exact association, so with
    // bPrime = 0 (additive noise) the Milstein step is bit-identical to EM.
    const noise = b * sqrtDt * xi + 0.5 * b * bPrime * (dW * dW - dt);
    out[i] = state[i]! + out[i]! * dt + noise;
    if (!Number.isFinite(out[i])) throw new Error(`${caller}: result[${i}] must be finite.`);
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

function validatedMatrixScratch(
  caller: string,
  spec: MatrixSdeScratch | undefined,
  state: StateVector,
  out: StateVector,
  dim: number,
  noiseDim: number,
  needsJacobian: boolean
): MatrixSdeScratch | undefined {
  if (spec === undefined) return undefined;
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec) || ArrayBuffer.isView(spec)) {
    throw new TypeError(`${caller}: scratch must be a matrix SDE workspace object.`);
  }

  // Snapshot every possibly accessor-backed property exactly once. Validation
  // and the subsequent step then operate on the same references.
  const drift0 = spec.drift0;
  const drift1 = spec.drift1;
  const predictor = spec.predictor;
  const diffusion0 = spec.diffusion0;
  const diffusion1 = spec.diffusion1;
  const diffusionJacobian = spec.diffusionJacobian;
  const increments = spec.increments;
  const snapshot: MatrixSdeScratch = {};
  if (drift0 !== undefined) snapshot.drift0 = drift0;
  if (drift1 !== undefined) snapshot.drift1 = drift1;
  if (predictor !== undefined) snapshot.predictor = predictor;
  if (diffusion0 !== undefined) snapshot.diffusion0 = diffusion0;
  if (diffusion1 !== undefined) snapshot.diffusion1 = diffusion1;
  if (diffusionJacobian !== undefined) snapshot.diffusionJacobian = diffusionJacobian;
  if (increments !== undefined) snapshot.increments = increments;
  const matrixCells = dim * noiseDim;
  const expectedLengths: Record<keyof MatrixSdeScratch, number> = {
    drift0: dim,
    drift1: dim,
    predictor: dim,
    diffusion0: matrixCells,
    diffusion1: matrixCells,
    diffusionJacobian: needsJacobian ? matrixCells * dim : 0,
    increments: noiseDim
  };

  const floatEntries = (['drift0', 'drift1', 'predictor'] as const)
    .map((name) => [name, snapshot[name]] as const)
    .filter((entry): entry is readonly [(typeof entry)[0], Float64Array] => entry[1] !== undefined);
  for (const [name, buffer] of floatEntries) {
    if (!(buffer instanceof Float64Array)) throw new TypeError(`${caller}: scratch.${name} must be a Float64Array.`);
    if (buffer.length !== expectedLengths[name]) {
      throw new RangeError(`${caller}: scratch.${name} length must be ${expectedLengths[name]}.`);
    }
    if (float64ViewsOverlap(buffer, state) || float64ViewsOverlap(buffer, out)) {
      throw new RangeError(`${caller}: scratch.${name} must not overlap state or out.`);
    }
  }
  for (let left = 0; left < floatEntries.length; left += 1) {
    for (let right = left + 1; right < floatEntries.length; right += 1) {
      if (float64ViewsOverlap(floatEntries[left]![1], floatEntries[right]![1])) {
        throw new RangeError(`${caller}: Float64Array scratch buffers must not overlap each other.`);
      }
    }
  }

  const arrayEntries = (['diffusion0', 'diffusion1', 'diffusionJacobian', 'increments'] as const)
    .map((name) => [name, snapshot[name]] as const)
    .filter((entry): entry is readonly [(typeof entry)[0], number[]] => entry[1] !== undefined);
  for (const [name, buffer] of arrayEntries) {
    if (!Array.isArray(buffer)) throw new TypeError(`${caller}: scratch.${name} must be a number array.`);
    if (buffer.length !== expectedLengths[name]) {
      throw new RangeError(`${caller}: scratch.${name} length must be ${expectedLengths[name]}.`);
    }
  }
  for (let left = 0; left < arrayEntries.length; left += 1) {
    for (let right = left + 1; right < arrayEntries.length; right += 1) {
      if (arrayEntries[left]![1] === arrayEntries[right]![1]) {
        throw new RangeError(`${caller}: number-array scratch buffers must not alias each other.`);
      }
    }
  }
  return snapshot;
}

function matrixScratch(
  spec: MatrixSdeScratch | undefined,
  dim: number,
  noiseDim: number,
  needsJacobian: boolean
): Required<MatrixSdeScratch> {
  const matrixCells = dim * noiseDim;
  const jacobianCells = needsJacobian ? matrixCells * dim : 0;
  if (
    spec?.drift0?.length === dim &&
    spec.drift1?.length === dim &&
    spec.predictor?.length === dim &&
    spec.diffusion0?.length === matrixCells &&
    spec.diffusion1?.length === matrixCells &&
    spec.diffusionJacobian?.length === jacobianCells &&
    spec.increments?.length === noiseDim
  ) {
    return spec as Required<MatrixSdeScratch>;
  }
  const resolved: Required<MatrixSdeScratch> = {
    drift0: spec?.drift0?.length === dim ? spec.drift0 : new Float64Array(dim),
    drift1: spec?.drift1?.length === dim ? spec.drift1 : new Float64Array(dim),
    predictor: spec?.predictor?.length === dim ? spec.predictor : new Float64Array(dim),
    diffusion0: spec?.diffusion0?.length === matrixCells ? spec.diffusion0 : new Array<number>(matrixCells).fill(0),
    diffusion1: spec?.diffusion1?.length === matrixCells ? spec.diffusion1 : new Array<number>(matrixCells).fill(0),
    diffusionJacobian:
      spec?.diffusionJacobian?.length === jacobianCells
        ? spec.diffusionJacobian
        : new Array<number>(jacobianCells).fill(0),
    increments: spec?.increments?.length === noiseDim ? spec.increments : new Array<number>(noiseDim).fill(0)
  };
  // Persist allocated buffers in a caller-provided workspace. The ensemble
  // runner invokes this path millions of times; recreating the arrays here
  // made matrix-noise mutation tests spend most of their time in allocation/GC.
  if (spec && Object.isExtensible(spec)) Object.assign(spec, resolved);
  return resolved;
}

interface MatrixStepFunctions {
  readonly drift: Derivative;
  readonly diffusion: DiffusionMatrix;
  readonly gaussian: GaussianSampler;
  readonly diffusionJacobian?: DiffusionMatrixJacobian;
}

function validateMatrixStepInputs(
  caller: string,
  state: StateVector,
  dt: number,
  noiseDimension: number,
  out: StateVector,
  functions: MatrixStepFunctions,
  needsJacobian: boolean
): number {
  const budget = NUMERICAL_WORK_BUDGETS.langevinEnsemble;
  if (!(state instanceof Float64Array)) throw new TypeError(`${caller}: state must be a Float64Array.`);
  const dim = state.length;
  if (!Number.isSafeInteger(dim) || dim < 1 || dim > budget.maxStateDimension) {
    throw new RangeError(`${caller}: state dimension must be in [1, ${budget.maxStateDimension}].`);
  }
  if (!(out instanceof Float64Array) || out.length !== dim) {
    throw new RangeError(`${caller}: out must be a Float64Array matching the state dimension.`);
  }
  if (float64ViewsOverlap(state, out)) throw new RangeError(`${caller}: state and out must not overlap.`);
  for (let index = 0; index < dim; index += 1) {
    if (!Number.isFinite(state[index])) throw new TypeError(`${caller}: state[${index}] must be finite.`);
  }
  assertUsableIntegrationStep(dt, caller);
  if (!Number.isSafeInteger(noiseDimension) || noiseDimension < 1 || noiseDimension > budget.maxNoiseDimension) {
    throw new RangeError(`${caller}: noiseDimension must be in [1, ${budget.maxNoiseDimension}].`);
  }
  if (typeof functions.drift !== 'function') throw new TypeError(`${caller}: drift must be a function.`);
  if (typeof functions.diffusion !== 'function') throw new TypeError(`${caller}: diffusion must be a function.`);
  if (typeof functions.gaussian !== 'function') throw new TypeError(`${caller}: gaussian must be a function.`);
  if (needsJacobian && typeof functions.diffusionJacobian !== 'function') {
    throw new TypeError(`${caller}: diffusionJacobian must be a function.`);
  }
  const matrixCells = checkedWorkProduct([dim, noiseDimension], caller);
  const jacobianCells = needsJacobian ? checkedWorkProduct([matrixCells, dim], caller) : 0;
  const scratchCells = 3 * dim + 2 * matrixCells + jacobianCells + noiseDimension;
  if (!Number.isSafeInteger(scratchCells) || scratchCells > budget.maxMatrixScratchCells) {
    throw new RangeError(`${caller}: matrix scratch exceeds ${budget.maxMatrixScratchCells} numeric cells.`);
  }
  const operations = needsJacobian
    ? checkedWorkProduct([dim, dim, noiseDimension, noiseDimension], caller)
    : matrixCells;
  if (operations > budget.maxMatrixStepOperations) {
    throw new RangeError(`${caller}: requested work exceeds ${budget.maxMatrixStepOperations} scalar operations.`);
  }
  return dim;
}

export function assertFiniteBuffer(buffer: ArrayLike<number>, label: string): void {
  for (let index = 0; index < buffer.length; index += 1) {
    if (!Number.isFinite(buffer[index])) throw new Error(`${label}[${index}] must be finite.`);
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
  return stochasticHeunStratonovichStepCore(state, dt, drift, noiseDimension, diffusion, gaussian, out, scratch, true);
}

export function stochasticHeunStratonovichStepCore(
  state: StateVector,
  dt: number,
  drift: Derivative,
  noiseDimension: number,
  diffusion: DiffusionMatrix,
  gaussian: GaussianSampler,
  out: StateVector,
  scratch: MatrixSdeScratch | undefined,
  validateInputs: boolean
): StateVector {
  const caller = 'stochasticHeunStratonovichStep';
  const dim = validateInputs
    ? validateMatrixStepInputs(caller, state, dt, noiseDimension, out, { drift, diffusion, gaussian }, false)
    : state.length;
  const validatedScratch = validateInputs
    ? validatedMatrixScratch(caller, scratch, state, out, dim, noiseDimension, false)
    : scratch;
  const ws = matrixScratch(validatedScratch, dim, noiseDimension, false);
  if (validateInputs && scratch && Object.isExtensible(scratch)) Object.assign(scratch, ws);
  const scalarNoise = dim === 1 && noiseDimension === 1;
  if (scalarNoise) ws.drift0[0] = Number.NaN;
  else ws.drift0.fill(Number.NaN);
  // Matrix callbacks may sparsely write non-zero entries; clear every call so
  // omitted cells mean zero instead of retaining a prior step's coefficient.
  if (scalarNoise) ws.diffusion0[0] = 0;
  else ws.diffusion0.fill(0);
  drift(state, ws.drift0);
  diffusion(state, ws.diffusion0, noiseDimension);
  if (scalarNoise) {
    const drift0 = ws.drift0[0]!;
    const diffusion0 = ws.diffusion0[0]!;
    const sample = gaussian();
    if (!Number.isFinite(drift0)) throw new Error(`${caller}: drift output[0] must be finite.`);
    if (!Number.isFinite(diffusion0)) throw new Error(`${caller}: diffusion output[0] must be finite.`);
    if (!Number.isFinite(sample)) throw new Error(`${caller}: gaussian output must be finite.`);
    const increment = Math.sqrt(dt) * sample;
    const predictor = state[0]! + drift0 * dt + diffusion0 * increment;
    if (!Number.isFinite(predictor)) throw new Error(`${caller}: predictor[0] must be finite.`);
    ws.predictor[0] = predictor;
    ws.drift1[0] = Number.NaN;
    ws.diffusion1[0] = 0;
    drift(ws.predictor, ws.drift1);
    diffusion(ws.predictor, ws.diffusion1, noiseDimension);
    const drift1 = ws.drift1[0]!;
    const diffusion1 = ws.diffusion1[0]!;
    if (!Number.isFinite(drift1)) throw new Error(`${caller}: predictor drift output[0] must be finite.`);
    if (!Number.isFinite(diffusion1)) throw new Error(`${caller}: predictor diffusion output[0] must be finite.`);
    const result = state[0]! + 0.5 * (drift0 + drift1) * dt + 0.5 * (diffusion0 + diffusion1) * increment;
    if (!Number.isFinite(result)) throw new Error(`${caller}: result[0] must be finite.`);
    out[0] = result;
    return out;
  }
  assertFiniteBuffer(ws.drift0, `${caller}: drift output`);
  assertFiniteBuffer(ws.diffusion0, `${caller}: diffusion output`);
  const sqrtDt = Math.sqrt(dt);
  for (let k = 0; k < noiseDimension; k += 1) {
    const increment = sqrtDt * gaussian();
    if (!Number.isFinite(increment)) throw new Error(`${caller}: gaussian output must be finite.`);
    ws.increments[k] = increment;
  }

  for (let i = 0; i < dim; i += 1) {
    let noise = 0;
    const row = i * noiseDimension;
    for (let k = 0; k < noiseDimension; k += 1) noise += (ws.diffusion0[row + k] ?? 0) * (ws.increments[k] ?? 0);
    ws.predictor[i] = state[i]! + ws.drift0[i]! * dt + noise;
  }

  assertFiniteBuffer(ws.predictor, `${caller}: predictor`);
  ws.drift1.fill(Number.NaN);
  ws.diffusion1.fill(0);
  drift(ws.predictor, ws.drift1);
  diffusion(ws.predictor, ws.diffusion1, noiseDimension);
  assertFiniteBuffer(ws.drift1, `${caller}: predictor drift output`);
  assertFiniteBuffer(ws.diffusion1, `${caller}: predictor diffusion output`);
  for (let i = 0; i < dim; i += 1) {
    let noise = 0;
    const row = i * noiseDimension;
    for (let k = 0; k < noiseDimension; k += 1) {
      noise += 0.5 * ((ws.diffusion0[row + k] ?? 0) + (ws.diffusion1[row + k] ?? 0)) * (ws.increments[k] ?? 0);
    }
    ws.predictor[i] = state[i]! + 0.5 * (ws.drift0[i]! + ws.drift1[i]!) * dt + noise;
  }
  assertFiniteBuffer(ws.predictor, `${caller}: result`);
  out.set(ws.predictor);
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
  return commutativeMilsteinStepCore(
    state,
    dt,
    drift,
    noiseDimension,
    diffusion,
    diffusionJacobian,
    gaussian,
    out,
    scratch,
    true
  );
}

export function commutativeMilsteinStepCore(
  state: StateVector,
  dt: number,
  drift: Derivative,
  noiseDimension: number,
  diffusion: DiffusionMatrix,
  diffusionJacobian: DiffusionMatrixJacobian,
  gaussian: GaussianSampler,
  out: StateVector,
  scratch: MatrixSdeScratch | undefined,
  validateInputs: boolean
): StateVector {
  const caller = 'commutativeMilsteinStep';
  const dim = validateInputs
    ? validateMatrixStepInputs(
        caller,
        state,
        dt,
        noiseDimension,
        out,
        { drift, diffusion, diffusionJacobian, gaussian },
        true
      )
    : state.length;
  const validatedScratch = validateInputs
    ? validatedMatrixScratch(caller, scratch, state, out, dim, noiseDimension, true)
    : scratch;
  const ws = matrixScratch(validatedScratch, dim, noiseDimension, true);
  if (validateInputs && scratch && Object.isExtensible(scratch)) Object.assign(scratch, ws);
  const scalarNoise = dim === 1 && noiseDimension === 1;
  if (scalarNoise) {
    ws.drift0[0] = Number.NaN;
    ws.diffusion0[0] = 0;
    ws.diffusionJacobian[0] = 0;
  } else {
    ws.drift0.fill(Number.NaN);
    ws.diffusion0.fill(0);
    ws.diffusionJacobian.fill(0);
  }
  drift(state, ws.drift0);
  diffusion(state, ws.diffusion0, noiseDimension);
  diffusionJacobian(state, ws.diffusionJacobian, noiseDimension);
  if (scalarNoise) {
    const drift0 = ws.drift0[0]!;
    const b = ws.diffusion0[0]!;
    const bPrime = ws.diffusionJacobian[0]!;
    const sample = gaussian();
    if (!Number.isFinite(drift0)) throw new Error(`${caller}: drift output[0] must be finite.`);
    if (!Number.isFinite(b)) throw new Error(`${caller}: diffusion output[0] must be finite.`);
    if (!Number.isFinite(bPrime)) throw new Error(`${caller}: diffusionJacobian output[0] must be finite.`);
    if (!Number.isFinite(sample)) throw new Error(`${caller}: gaussian output must be finite.`);
    const dW = Math.sqrt(dt) * sample;
    const result = state[0]! + drift0 * dt + b * dW + 0.5 * b * bPrime * (dW * dW - dt);
    if (!Number.isFinite(result)) throw new Error(`${caller}: result[0] must be finite.`);
    out[0] = result;
    return out;
  }
  assertFiniteBuffer(ws.drift0, `${caller}: drift output`);
  assertFiniteBuffer(ws.diffusion0, `${caller}: diffusion output`);
  assertFiniteBuffer(ws.diffusionJacobian, `${caller}: diffusionJacobian output`);
  const sqrtDt = Math.sqrt(dt);
  for (let k = 0; k < noiseDimension; k += 1) {
    const increment = sqrtDt * gaussian();
    if (!Number.isFinite(increment)) throw new Error(`${caller}: gaussian output must be finite.`);
    ws.increments[k] = increment;
  }

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
    ws.predictor[i] = state[i]! + ws.drift0[i]! * dt + noise + 0.5 * correction;
  }
  assertFiniteBuffer(ws.predictor, `${caller}: result`);
  out.set(ws.predictor);
  return out;
}
