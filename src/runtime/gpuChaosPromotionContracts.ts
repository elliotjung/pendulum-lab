/** Shared, fail-closed contracts for promoted WebGPU chaos diagnostics. */
import type { AccelerationComparison, AccelerationTolerance } from '../chaos/accelerationContract';
import type { ClvResult, ClvSettings } from '../chaos/clv';
import type { FtleField, FtleFieldOptions } from '../chaos/ftle';

export const DOUBLE_PENDULUM_VARIATIONAL_DIMENSION = 4;
export const MAX_WEBGPU_CLV_WINDOW = 128;

export const DEFAULT_WEBGPU_CLV_SETTINGS: ClvSettings = Object.freeze({
  dt: 0.01,
  renormEvery: 8,
  forwardTransient: 32,
  window: 48,
  backwardTransient: 12,
  seed: 0x51a1
});

export const DEFAULT_CLV_PROMOTION_TOLERANCES: AccelerationTolerance = Object.freeze({
  exponents: 0.08,
  angle: 0.18
});

export const DEFAULT_FTLE_PROMOTION_TOLERANCES: AccelerationTolerance = Object.freeze({
  field: 0.08,
  aggregate: 0.04
});

/** Raw f32 full-spectrum result before the CLV-specific CPU promotion gate. */
export interface WebgpuFullSpectrumCandidate {
  backend: 'webgpu';
  result: ClvResult;
  elapsedMs: number;
  caveat: string;
}

export interface WebgpuClvOptions extends Partial<ClvSettings> {
  count?: number;
  forceCpu?: boolean;
  tolerances?: AccelerationTolerance;
}

/** A CLV candidate is the full-spectrum kernel output with its vector payload. */
export type WebgpuClvCandidate = WebgpuFullSpectrumCandidate;

export interface WebgpuClvPromotion {
  backend: 'webgpu' | 'cpu';
  result: ClvResult;
  cpuOracle: ClvResult;
  gpuCandidate: WebgpuClvCandidate | null;
  comparison: AccelerationComparison | null;
  caveat: string;
}

export interface WebgpuFtleFieldOptions extends FtleFieldOptions {
  forceCpu?: boolean;
  tolerances?: AccelerationTolerance;
}

export interface WebgpuFtleFieldCandidate {
  backend: 'webgpu';
  field: FtleField;
  elapsedMs: number;
  caveat: string;
}

export interface WebgpuFtleFieldPromotion {
  backend: 'webgpu' | 'cpu';
  field: FtleField;
  cpuOracle: FtleField;
  gpuCandidate: WebgpuFtleFieldCandidate | null;
  comparison: AccelerationComparison | null;
  caveat: string;
}

export const nowForGpuPromotion = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

export const finiteNumbers = (values: readonly number[]): boolean => values.every((value) => Number.isFinite(value));
