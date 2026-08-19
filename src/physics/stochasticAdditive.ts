/** Additive (diagonal, state-independent) Itô SDE stepper family. */
import type { Derivative, StateVector } from './types';
import { type GaussianSampler, validateDiagonalStepInputs } from './stochasticStepperShared';

/**
 * Allocation-free Euler–Maruyama core. Callers that already validated a batch
 * workspace may use this directly; public callers should use the wrapper.
 */
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

/** One Euler–Maruyama step for independent additive per-component noise. */
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
