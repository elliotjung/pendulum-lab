/**
 * Compatibility facade for WebGPU field scans.
 *
 * Shader source, dispatch/readback behavior, and shared result contracts are
 * separate modules; consumers keep the established import path.
 */
export { flipBasinField, ftleFieldFiniteDifference, sweepLambdaField } from './gpuFieldDispatch';
export type {
  FlipBasinFieldOptions,
  FlipBasinFieldResult,
  FtleFdFieldOptions,
  FtleFdFieldResult,
  SweepFieldOptions,
  SweepFieldResult
} from './gpuFieldDispatch';
export type { GpuFieldMeta, GpuFieldValidation } from './gpuFieldContracts';
