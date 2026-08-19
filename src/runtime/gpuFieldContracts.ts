/** Shared result metadata and deterministic probe selection for GPU fields. */
export interface GpuFieldValidation {
  /** Number of probe cells recomputed on the CPU with the same algorithm. */
  cells: number;
  /** Max |GPU − CPU| over the probes (labels: fraction of disagreements). */
  maxAbsDiff: number;
  tolerance: number;
  passed: boolean;
}

export interface GpuFieldMeta {
  backend: 'webgpu' | 'cpu';
  elapsedMs: number;
  caveat: string;
  /** Present when the GPU path ran (null on pure-CPU f64 reference runs). */
  validation: GpuFieldValidation | null;
}

export const nowForGpuField = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

/** Probe-cell indices: corners, edge midpoints, centre — deterministic. */
export function gpuFieldProbeIndices(n: number): Array<[number, number]> {
  const lo = 0;
  const hi = n - 1;
  const mid = Math.floor(n / 2);
  return [
    [lo, lo],
    [hi, lo],
    [lo, hi],
    [hi, hi],
    [mid, lo],
    [lo, mid],
    [hi, mid],
    [mid, hi],
    [mid, mid]
  ];
}
