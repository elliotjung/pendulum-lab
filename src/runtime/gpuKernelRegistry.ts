/**
 * Registry of every WGSL compute kernel shipped in the runtime, with content
 * hashes so evidence reports can pin exactly which shader source produced a
 * result. A reviewer comparing two hardware reports can tell "same kernel,
 * different driver" from "kernel changed" without diffing WGSL by hand.
 */
import { hashText } from '../research/researchExportUtils';
import { WGSL_KERNEL, WGSL_STATS_KERNEL } from './gpuEnsemble';
import { WGSL_FULL_SPECTRUM_KERNEL } from './gpuLyapunov';
import { WGSL_CLV_KERNEL } from './gpuChaosPromotion';
import { WGSL_BASIN, WGSL_SWEEP } from './gpuFields';
import { WGSL_VARIATIONAL_FTLE_FIELD_KERNEL } from './gpuVariationalFtleKernel';
import { WGSL_NCHAIN_TRAJECTORY_TAPE_KERNEL, WGSL_NCHAIN_VARIATIONAL_KERNEL } from './gpuNChainVariationalKernel';

export interface GpuKernelEntry {
  /** Stable identifier used in evidence reports. */
  id: string;
  /** Module that owns and dispatches the kernel. */
  module: string;
  source: string;
}

export const GPU_KERNELS: readonly GpuKernelEntry[] = [
  { id: 'ensemble-rk4', module: 'runtime/gpuEnsemble', source: WGSL_KERNEL },
  { id: 'ensemble-stats-reduction', module: 'runtime/gpuEnsemble', source: WGSL_STATS_KERNEL },
  { id: 'lyapunov-full-spectrum', module: 'runtime/gpuLyapunov', source: WGSL_FULL_SPECTRUM_KERNEL },
  { id: 'clv-forward-backward', module: 'runtime/gpuChaosPromotion', source: WGSL_CLV_KERNEL },
  { id: 'variational-ftle-field', module: 'runtime/gpuVariationalFtleKernel', source: WGSL_VARIATIONAL_FTLE_FIELD_KERNEL },
  { id: 'flip-basin-field', module: 'runtime/gpuFields', source: WGSL_BASIN },
  { id: 'sweep-lambda-field', module: 'runtime/gpuFields', source: WGSL_SWEEP },
  { id: 'nchain-trajectory-tape', module: 'runtime/gpuNChainVariationalKernel', source: WGSL_NCHAIN_TRAJECTORY_TAPE_KERNEL },
  { id: 'nchain-variational-stm-qr', module: 'runtime/gpuNChainVariationalKernel', source: WGSL_NCHAIN_VARIATIONAL_KERNEL }
];

export interface GpuKernelHash {
  id: string;
  module: string;
  /** Content hash of the exact WGSL source dispatched to the adapter. */
  wgslHash: string;
  bytes: number;
}

export function gpuKernelHashes(): GpuKernelHash[] {
  return GPU_KERNELS.map((kernel) => ({
    id: kernel.id,
    module: kernel.module,
    wgslHash: hashText(kernel.source),
    bytes: kernel.source.length
  }));
}

/** Single hash over all kernels: changes whenever any shipped WGSL changes. */
export function gpuKernelSetHash(): string {
  return hashText(gpuKernelHashes().map((kernel) => `${kernel.id}:${kernel.wgslHash}`).join('\n'));
}

/**
 * Fingerprint of an adapter's capability surface (features + limits). Two
 * reports with equal kernel hashes but different feature fingerprints ran the
 * same code on observably different driver/adapter capability sets.
 */
export function adapterFeatureFingerprint(adapter: { features?: readonly string[]; limits?: Record<string, number> } | null | undefined): string | null {
  if (!adapter) return null;
  const features = [...(adapter.features ?? [])].sort();
  const limits = Object.entries(adapter.limits ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return hashText(JSON.stringify({ features, limits }));
}
