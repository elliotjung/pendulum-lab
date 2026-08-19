/** Diagonal state-dependent (multiplicative-noise) Itô stepper family. */
import type { Derivative, StateVector } from './types';
import { type GaussianSampler, validateDiagonalStepInputs } from './stochasticStepperShared';

/** Writes per-component noise coefficients (σ_i(x) or σ'_i(x)) for a state. */
export type StateDependentVector = (state: StateVector, out: number[]) => void;

/** One strong-order-1 Milstein step for diagonal multiplicative noise. */
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

/** Allocation-free Milstein core used by frozen-Brownian adaptive runners. */
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
    // The leading association matches Euler–Maruyama bit-for-bit when b' = 0.
    const noise = b * sqrtDt * xi + 0.5 * b * bPrime * (dW * dW - dt);
    out[i] = state[i]! + out[i]! * dt + noise;
    if (!Number.isFinite(out[i])) throw new Error(`${caller}: result[${i}] must be finite.`);
  }
  return out;
}
