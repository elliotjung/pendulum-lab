/**
 * Full diffusion-matrix SDE steppers. These are separated from diagonal
 * additive/multiplicative solvers because workspace validation and the
 * commutative-noise correction have materially different complexity bounds.
 */
import {
  assertUsableIntegrationStep,
  checkedWorkProduct,
  NUMERICAL_WORK_BUDGETS
} from '../validation/numericalBudgets';
import type { Derivative, StateVector } from './types';
import { assertFiniteBuffer, float64ViewsOverlap, type GaussianSampler } from './stochasticStepperShared';

/** Writes a row-major diffusion matrix B(x), shape stateDim × noiseDim. */
export type DiffusionMatrix = (state: StateVector, out: number[], noiseDimension: number) => void;

/** Writes dB[i,k]/dx[l] in row-major blocks. */
export type DiffusionMatrixJacobian = (state: StateVector, out: number[], noiseDimension: number) => void;

/** Reusable workspace for matrix-noise steppers. */
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

/** One stochastic Heun predictor-corrector step for Stratonovich matrix noise. */
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

/** Strong-order-1 Milstein step for full diffusion under commutative noise. */
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
