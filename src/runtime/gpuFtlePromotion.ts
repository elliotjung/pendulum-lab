/** CPU-oracle promotion contract for WebGPU variational-STM FTLE fields. */
import type { PendulumParameters } from '../types/domain';
import { compareFtleFieldAcceleration } from '../chaos/accelerationContract';
import { doublePendulumFtleField, type FtleFieldOptions } from '../chaos/ftle';
import { runComputeKernel } from './gpuEnsemble';
import { WGSL_VARIATIONAL_FTLE_FIELD_KERNEL } from './gpuVariationalFtleKernel';
import {
  DEFAULT_FTLE_PROMOTION_TOLERANCES,
  nowForGpuPromotion,
  type WebgpuFtleFieldCandidate,
  type WebgpuFtleFieldOptions,
  type WebgpuFtleFieldPromotion
} from './gpuChaosPromotionContracts';

export function resolveWebgpuFtleOptions(options: WebgpuFtleFieldOptions = {}): Required<FtleFieldOptions> {
  return {
    n: options.n ?? 8,
    range: options.range ?? [-2, 2],
    totalTime: options.totalTime ?? 1.2,
    dt: options.dt ?? 0.02
  };
}

export async function webgpuDoublePendulumVariationalFtleFieldCandidate(
  params: PendulumParameters,
  options: WebgpuFtleFieldOptions = {}
): Promise<WebgpuFtleFieldCandidate | null> {
  const resolved = resolveWebgpuFtleOptions(options);
  if (options.forceCpu || resolved.n <= 1 || resolved.n > 64 || resolved.dt <= 0 || resolved.totalTime <= 0)
    return null;
  const steps = Math.max(1, Math.round(resolved.totalTime / resolved.dt));
  const n = resolved.n;
  const values = new Float32Array(n * n);
  const uniform = new Float32Array([
    params.m1,
    params.m2,
    params.l1,
    params.l2,
    params.g,
    0,
    resolved.dt,
    steps,
    n,
    resolved.range[0],
    resolved.range[1],
    steps * resolved.dt,
    0,
    0,
    0,
    0
  ]);
  const started = nowForGpuPromotion();
  const reduced = await runComputeKernel(WGSL_VARIATIONAL_FTLE_FIELD_KERNEL, uniform, values, n * n);
  const elapsedMs = nowForGpuPromotion() - started;
  if (!reduced) return null;
  const out = new Float64Array(reduced.length);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < reduced.length; i += 1) {
    const value = Number(reduced[i] ?? NaN);
    if (!Number.isFinite(value)) return null;
    out[i] = value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return {
    backend: 'webgpu',
    elapsedMs,
    field: { values: out, width: n, height: n, min, max },
    caveat:
      'WebGPU f32 variational-STM FTLE field for the 4D double pendulum. It is promotable only after cellwise CPU f64 variational-STM oracle comparison.'
  };
}

export async function promotedDoublePendulumVariationalFtleField(
  params: PendulumParameters,
  options: WebgpuFtleFieldOptions = {}
): Promise<WebgpuFtleFieldPromotion> {
  const resolved = resolveWebgpuFtleOptions(options);
  const cpuOracle = doublePendulumFtleField(params, resolved);
  const gpuCandidate = await webgpuDoublePendulumVariationalFtleFieldCandidate(params, options);
  if (!gpuCandidate) {
    return {
      backend: 'cpu',
      field: cpuOracle,
      cpuOracle,
      gpuCandidate: null,
      comparison: null,
      caveat:
        'CPU f64 variational-STM FTLE field returned because WebGPU was unavailable, disabled, or outside the validated field scope.'
    };
  }
  const comparison = compareFtleFieldAcceleration(gpuCandidate.field, cpuOracle, {
    ...DEFAULT_FTLE_PROMOTION_TOLERANCES,
    ...options.tolerances
  });
  if (!comparison.passed) {
    return {
      backend: 'cpu',
      field: cpuOracle,
      cpuOracle,
      gpuCandidate,
      comparison,
      caveat:
        'CPU f64 variational-STM FTLE field returned because the WebGPU f32 candidate failed the CPU oracle promotion gate.'
    };
  }
  return {
    backend: 'webgpu',
    field: gpuCandidate.field,
    cpuOracle,
    gpuCandidate,
    comparison,
    caveat: 'WebGPU f32 variational-STM FTLE field promoted after same-run CPU f64 oracle comparison.'
  };
}
