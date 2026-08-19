/** Shared validation, finite-buffer checks and deterministic Gaussian source. */
import { assertUsableIntegrationStep, NUMERICAL_WORK_BUDGETS } from '../validation/numericalBudgets';
import { mulberry32 } from './variational';
import type { Derivative, StateVector } from './types';

/** A standard-normal generator. */
export type GaussianSampler = () => number;

const UINT32_MAX = 0xffff_ffff;

export function assertUint32Seed(seed: number, caller: string): void {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > UINT32_MAX) {
    throw new RangeError(`${caller}: seed must be a uint32 integer in [0, ${UINT32_MAX}].`);
  }
}

export function float64ViewsOverlap(left: Float64Array, right: Float64Array): boolean {
  if (left.buffer !== right.buffer) return false;
  const leftEnd = left.byteOffset + left.byteLength;
  const rightEnd = right.byteOffset + right.byteLength;
  return left.byteOffset < rightEnd && right.byteOffset < leftEnd;
}

export function assertFiniteBuffer(buffer: ArrayLike<number>, label: string): void {
  for (let index = 0; index < buffer.length; index += 1) {
    if (!Number.isFinite(buffer[index])) throw new Error(`${label}[${index}] must be finite.`);
  }
}

export function validateDiagonalStepInputs(
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

/**
 * Box–Muller standard-normal sampler driven by a deterministic mulberry32
 * stream. The cached second output keeps seeded paths bit-for-bit reproducible.
 */
export function gaussianSampler(seed: number): GaussianSampler {
  assertUint32Seed(seed, 'gaussianSampler');
  const rng = mulberry32(seed);
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const sample = spare;
      spare = null;
      return sample;
    }
    let u1 = 0;
    do {
      u1 = rng();
    } while (u1 <= 1e-12);
    const u2 = rng();
    const radius = Math.sqrt(-2 * Math.log(u1));
    const angle = 2 * Math.PI * u2;
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}
