/** CPU-oracle promotion contract for WebGPU full-spectrum/CLV candidates. */
import type { PendulumParameters } from '../types/domain';
import { compareClvAcceleration } from '../chaos/accelerationContract';
import {
  DEFAULT_CLV_PROMOTION_TOLERANCES,
  type WebgpuClvCandidate,
  type WebgpuClvOptions,
  type WebgpuClvPromotion
} from './gpuChaosPromotionContracts';
import {
  cpuDoublePendulumClv,
  resolveWebgpuClvSettings,
  webgpuDoublePendulumFullSpectrumCandidate
} from './gpuFullSpectrumPromotion';

/** Backwards-compatible CLV name for the raw full-spectrum candidate. */
export async function webgpuDoublePendulumClvCandidate(
  params: PendulumParameters,
  state0: ArrayLike<number>,
  options: WebgpuClvOptions = {},
  damping = 0
): Promise<WebgpuClvCandidate | null> {
  return webgpuDoublePendulumFullSpectrumCandidate(params, state0, options, damping);
}

/**
 * Promote a WebGPU CLV result only when it agrees with the same-run f64
 * Ginelli oracle. Failure always returns the complete CPU result.
 */
export async function promotedDoublePendulumClv(
  params: PendulumParameters,
  state0: ArrayLike<number>,
  options: WebgpuClvOptions = {},
  damping = 0
): Promise<WebgpuClvPromotion> {
  const settings = resolveWebgpuClvSettings(options);
  const cpuOracle = cpuDoublePendulumClv(params, state0, settings, damping);
  const gpuCandidate = await webgpuDoublePendulumFullSpectrumCandidate(params, state0, options, damping);
  if (!gpuCandidate) {
    return {
      backend: 'cpu',
      result: cpuOracle,
      cpuOracle,
      gpuCandidate: null,
      comparison: null,
      caveat:
        'CPU f64 CLV result returned because WebGPU was unavailable, disabled, or outside the validated 4D CLV scope.'
    };
  }
  const comparison = compareClvAcceleration(gpuCandidate.result, cpuOracle, {
    ...DEFAULT_CLV_PROMOTION_TOLERANCES,
    ...options.tolerances
  });
  if (!comparison.passed) {
    return {
      backend: 'cpu',
      result: cpuOracle,
      cpuOracle,
      gpuCandidate,
      comparison,
      caveat: 'CPU f64 CLV result returned because the WebGPU f32 CLV candidate failed the CPU oracle promotion gate.'
    };
  }
  return {
    backend: 'webgpu',
    result: {
      ...cpuOracle,
      exponents: gpuCandidate.result.exponents,
      meanHyperbolicityAngle: gpuCandidate.result.meanHyperbolicityAngle,
      minHyperbolicityAngle: gpuCandidate.result.minHyperbolicityAngle
    },
    cpuOracle,
    gpuCandidate,
    comparison,
    caveat:
      'WebGPU f32 CLV summary promoted after same-run CPU f64 Ginelli-oracle comparison; CPU vectors/times are retained for full-resolution inspection.'
  };
}
