/**
 * @packageDocumentation
 *
 * `experimental` - APIs that work but whose shape may still change between
 * minor versions. Pin an exact version if you depend on these.
 *
 * Currently: the WebGPU/CPU double-pendulum ensemble runner, WebGPU-accelerated
 * field scans (flip basin, sweep lambda_max, finite-difference FTLE), the 4D
 * double-pendulum full-spectrum Lyapunov promotion path, and CPU-oracle-gated
 * CLV / variational-FTLE WebGPU promotion paths, including the hybrid N-chain
 * STM/QR pipeline for planar chains up to eight links.
 */

export { runComputeKernel, runDoublePendulumEnsemble, ensembleGrid, ensembleStatistics, webgpuEnsembleStatistics, compareEnsembleStatistics } from '../runtime/gpuEnsemble';
export type { EnsembleOptions, EnsembleResult, EnsembleStatistics, EnsembleStatisticsComparison, EnsembleStatisticsTolerances } from '../runtime/gpuEnsemble';
export { promotedDoublePendulumLyapunovSpectrum, webgpuDoublePendulumLyapunovSpectrumCandidate } from '../runtime/gpuLyapunov';
export type { WebgpuLyapunovSpectrumCandidate, WebgpuLyapunovSpectrumOptions, WebgpuLyapunovSpectrumPromotion } from '../runtime/gpuLyapunov';
export {
  promotedDoublePendulumClv,
  promotedDoublePendulumVariationalFtleField,
  webgpuDoublePendulumClvCandidate,
  webgpuDoublePendulumVariationalFtleFieldCandidate
} from '../runtime/gpuChaosPromotion';
export type {
  WebgpuClvCandidate,
  WebgpuClvOptions,
  WebgpuClvPromotion,
  WebgpuFtleFieldCandidate,
  WebgpuFtleFieldOptions,
  WebgpuFtleFieldPromotion
} from '../runtime/gpuChaosPromotion';
export { buildNChainJacobianTape, nChainVariationalCpuOracle, promotedNChainVariational, webgpuNChainVariationalCandidate } from '../runtime/gpuNChainVariational';
export type {
  NChainVariationalComparison,
  NChainVariationalOptions,
  NChainVariationalPromotion,
  NChainVariationalSummary,
  WebgpuNChainVariationalCandidate
} from '../runtime/gpuNChainVariational';
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
export { Float64RingBuffer, sharedMemoryCapability } from '../runtime/sharedRingBuffer';
export type { Float64RingBufferDescriptor, Float64RingBufferOptions } from '../runtime/sharedRingBuffer';
export { buildNChainJacobianTapeWasm, wasmNChainAvailable, wasmSimdSupported } from '../runtime/wasmNChain';
export type { WasmNChainTapeResult, WasmNChainTapeSettings } from '../runtime/wasmNChain';
