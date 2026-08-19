/** Raw WebGPU full-spectrum computation and its CPU f64 oracle. */
import type { PendulumParameters } from '../types/domain';
import { covariantLyapunovVectors, type ClvResult, type ClvSettings } from '../chaos/clv';
import { jacobianDouble, rhsDouble } from '../physics/double';
import { runComputeKernel } from './gpuEnsemble';
import { WGSL_CLV_KERNEL } from './gpuFullSpectrumKernel';
import {
  DEFAULT_WEBGPU_CLV_SETTINGS,
  DOUBLE_PENDULUM_VARIATIONAL_DIMENSION,
  finiteNumbers,
  MAX_WEBGPU_CLV_WINDOW,
  nowForGpuPromotion,
  type WebgpuClvOptions,
  type WebgpuFullSpectrumCandidate
} from './gpuChaosPromotionContracts';

export type ResolvedWebgpuClvSettings = ClvSettings & { count: number };

export function resolveWebgpuClvSettings(options: WebgpuClvOptions = {}): ResolvedWebgpuClvSettings {
  return {
    dt: options.dt ?? DEFAULT_WEBGPU_CLV_SETTINGS.dt,
    renormEvery: options.renormEvery ?? DEFAULT_WEBGPU_CLV_SETTINGS.renormEvery,
    forwardTransient: options.forwardTransient ?? DEFAULT_WEBGPU_CLV_SETTINGS.forwardTransient,
    window: options.window ?? DEFAULT_WEBGPU_CLV_SETTINGS.window,
    backwardTransient: options.backwardTransient ?? DEFAULT_WEBGPU_CLV_SETTINGS.backwardTransient,
    seed: options.seed ?? DEFAULT_WEBGPU_CLV_SETTINGS.seed,
    count: options.count ?? DOUBLE_PENDULUM_VARIATIONAL_DIMENSION
  };
}

/** The independent f64 Ginelli oracle used by the CLV promotion contract. */
export function cpuDoublePendulumClv(
  params: PendulumParameters,
  state0: ArrayLike<number>,
  settings: ResolvedWebgpuClvSettings,
  damping: number
): ClvResult {
  const rhs = (state: Float64Array, out: Float64Array): Float64Array => rhsDouble(state, params, damping, out);
  const jacobian = (state: Float64Array, jac: Float64Array): Float64Array =>
    jacobianDouble(state, params, damping, jac);
  return covariantLyapunovVectors(state0, rhs, settings.count, settings, jacobian);
}

/**
 * Execute the f32 kernel that computes the entire Lyapunov spectrum and CLV
 * summary. This is deliberately not a promotion: callers must compare it with
 * `cpuDoublePendulumClv` before using it as a scientific result.
 */
export async function webgpuDoublePendulumFullSpectrumCandidate(
  params: PendulumParameters,
  state0: ArrayLike<number>,
  options: WebgpuClvOptions = {},
  damping = 0
): Promise<WebgpuFullSpectrumCandidate | null> {
  const settings = resolveWebgpuClvSettings(options);
  const dim = DOUBLE_PENDULUM_VARIATIONAL_DIMENSION;
  if (options.forceCpu || settings.count !== dim) return null;
  if (settings.dt <= 0 || settings.renormEvery <= 0 || settings.forwardTransient < 0 || settings.window <= 0)
    return null;
  if (
    settings.window > MAX_WEBGPU_CLV_WINDOW ||
    settings.backwardTransient < 0 ||
    settings.backwardTransient >= settings.window
  ) {
    return null;
  }
  const io = new Float32Array(32);
  for (let i = 0; i < dim; i += 1) io[i] = Number(state0[i] ?? 0);
  const uniform = new Float32Array([
    params.m1,
    params.m2,
    params.l1,
    params.l2,
    params.g,
    damping,
    settings.dt,
    settings.renormEvery,
    settings.forwardTransient,
    settings.window,
    settings.backwardTransient,
    settings.seed,
    0,
    0,
    0,
    0
  ]);
  const started = nowForGpuPromotion();
  const reduced = await runComputeKernel(WGSL_CLV_KERNEL, uniform, io, 64);
  const elapsedMs = nowForGpuPromotion() - started;
  if (!reduced || (reduced[7] ?? -1) < 0) return null;
  const exponents = Array.from(reduced.slice(0, dim), Number);
  const meanAngle = Number(reduced[4] ?? NaN);
  const minAngle = Number(reduced[5] ?? NaN);
  const angleCount = Math.max(0, Math.round(Number(reduced[6] ?? 0)));
  const vectors = new Float64Array(dim * dim);
  for (let i = 0; i < dim * dim; i += 1) vectors[i] = Number(reduced[8 + i] ?? 0);
  if (!finiteNumbers(exponents) || !Number.isFinite(meanAngle) || !Number.isFinite(minAngle) || angleCount <= 0)
    return null;
  return {
    backend: 'webgpu',
    elapsedMs,
    result: {
      exponents,
      times: [0],
      vectors: [vectors],
      hyperbolicityAngles: [minAngle],
      meanHyperbolicityAngle: meanAngle,
      minHyperbolicityAngle: minAngle,
      settings: { ...settings, count: dim }
    },
    caveat:
      'WebGPU f32 full-spectrum/CLV candidate for the 4D double pendulum. It is promotable only after a same-run CPU f64 Ginelli-oracle comparison.'
  };
}
