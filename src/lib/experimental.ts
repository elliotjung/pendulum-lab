/**
 * @packageDocumentation
 *
 * `experimental` — APIs that work but whose shape may still change between
 * minor versions. Pin an exact version if you depend on these.
 *
 * Currently: the WebGPU/CPU double-pendulum ensemble runner and the
 * WebGPU-accelerated field scans (flip basin, sweep λ_max, finite-difference
 * FTLE) with their CPU cross-validation contract.
 */

export { runComputeKernel, runDoublePendulumEnsemble, ensembleGrid, ensembleStatistics } from '../runtime/gpuEnsemble';
export type { EnsembleOptions, EnsembleResult, EnsembleStatistics } from '../runtime/gpuEnsemble';
export { flipBasinField, sweepLambdaField, ftleFieldFiniteDifference } from '../runtime/gpuFields';
export type {
  FlipBasinFieldOptions,
  FlipBasinFieldResult,
  FtleFdFieldOptions,
  FtleFdFieldResult,
  GpuFieldMeta,
  GpuFieldValidation,
  SweepFieldOptions,
  SweepFieldResult
} from '../runtime/gpuFields';
