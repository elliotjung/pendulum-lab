/**
 * Field dispatch/readback plumbing with a validated f64 CPU fallback.
 * WGSL source is isolated in gpuFieldKernels.ts.
 */
import type { PendulumParameters } from '../types/domain';
import { rhsDouble } from '../physics/double';
import { rk4Step } from '../physics/integrators';
import { doublePendulumFlipBasin } from '../chaos/basin';
import { runComputeKernel, runDoublePendulumEnsemble } from './gpuEnsemble';
import { type GpuFieldMeta, type GpuFieldValidation, gpuFieldProbeIndices, nowForGpuField } from './gpuFieldContracts';
import { WGSL_BASIN, WGSL_SWEEP } from './gpuFieldKernels';
export interface FlipBasinFieldOptions {
  /** Grid cells per axis. Default 60. */
  n?: number;
  /** Inclusive angle range for both θ₁ and θ₂. Default [-3, 3]. */
  range?: [number, number];
  dt?: number;
  maxTime?: number;
  forceCpu?: boolean;
}

export interface FlipBasinFieldResult extends GpuFieldMeta {
  /** 0 = rod 1 flips first, 1 = rod 2 flips first, 2 = no flip. Row-major. */
  labels: Int32Array;
  width: number;
  height: number;
}

/** CPU flip label of a single cell (the validation/reference primitive). */
function flipLabelCpu(
  params: PendulumParameters,
  theta1: number,
  theta2: number,
  dt: number,
  maxSteps: number
): number {
  const state = new Float64Array([theta1, theta2, 0, 0]);
  const next = new Float64Array(4);
  const rhs = (s: Float64Array, o: Float64Array): void => {
    rhsDouble(s, params, 0, o);
  };
  for (let step = 0; step < maxSteps; step += 1) {
    rk4Step(state, dt, rhs, next);
    state.set(next);
    const a1 = Math.abs(state[0]!);
    const a2 = Math.abs(state[1]!);
    if (a1 > Math.PI || a2 > Math.PI) {
      return a1 > Math.PI && (a2 <= Math.PI || a1 >= a2) ? 0 : 1;
    }
  }
  return 2;
}

/**
 * Flip-basin label grid (which rod flips over first, from rest), GPU when
 * available. Semantics match `doublePendulumFlipBasin` exactly; the CPU
 * fallback simply calls it.
 */
export async function flipBasinField(
  params: PendulumParameters,
  options: FlipBasinFieldOptions = {}
): Promise<FlipBasinFieldResult> {
  const n = options.n ?? 60;
  const [lo, hi] = options.range ?? [-3, 3];
  const dt = options.dt ?? 0.01;
  const maxTime = options.maxTime ?? 20;
  const maxSteps = Math.round(maxTime / dt);
  const started = nowForGpuField();

  const cpuFull = (): Int32Array =>
    new Int32Array(doublePendulumFlipBasin(params, { n, range: [lo, hi], dt, maxTime }).labels);

  if (!options.forceCpu) {
    const uniform = new Float32Array([
      params.m1,
      params.m2,
      params.l1,
      params.l2,
      params.g,
      0,
      dt,
      maxSteps,
      lo,
      hi - lo,
      n,
      0
    ]);
    const io = new Float32Array(n * n * 2);
    const gpuOut = await runComputeKernel(WGSL_BASIN, uniform, io, n * n);
    if (gpuOut) {
      const labels = new Int32Array(n * n);
      for (let i = 0; i < n * n; i += 1) labels[i] = Math.round(gpuOut[i * 2] ?? 2);
      // Cross-validate probe cells against the same algorithm in f64. Basin
      // boundaries are fractal, so isolated disagreements are expected — the
      // gate is on the disagreement *fraction*, not exact equality.
      const probes = gpuFieldProbeIndices(n);
      let disagreements = 0;
      for (const [ix, iy] of probes) {
        const theta1 = lo + ((hi - lo) * ix) / Math.max(n - 1, 1);
        const theta2 = lo + ((hi - lo) * iy) / Math.max(n - 1, 1);
        if (flipLabelCpu(params, theta1, theta2, dt, maxSteps) !== labels[iy * n + ix]) disagreements += 1;
      }
      const fraction = disagreements / probes.length;
      const tolerance = 0.34;
      const validation: GpuFieldValidation = {
        cells: probes.length,
        maxAbsDiff: fraction,
        tolerance,
        passed: fraction <= tolerance
      };
      if (validation.passed) {
        return {
          labels,
          width: n,
          height: n,
          backend: 'webgpu',
          elapsedMs: nowForGpuField() - started,
          caveat: `WebGPU f32 kernel; ${disagreements}/${probes.length} probe cells differ from the f64 CPU reference (boundary cells legitimately flip side under round-off). Statistics consumed from this grid inherit f32 per-cell uncertainty.`,
          validation
        };
      }
      const labelsCpu = cpuFull();
      return {
        labels: labelsCpu,
        width: n,
        height: n,
        backend: 'cpu',
        elapsedMs: nowForGpuField() - started,
        caveat: `WebGPU output failed CPU cross-validation (${disagreements}/${probes.length} probe disagreements > ${Math.round(tolerance * 100)}%); returned the f64 CPU grid instead.`,
        validation
      };
    }
  }

  const labels = cpuFull();
  return {
    labels,
    width: n,
    height: n,
    backend: 'cpu',
    elapsedMs: nowForGpuField() - started,
    caveat: 'CPU f64 path (WebGPU unavailable or disabled) — the validated reference algorithm.',
    validation: null
  };
}

// ---------------------------------------------------------------------------
// Sweep λ_max
// ---------------------------------------------------------------------------

export interface SweepFieldOptions {
  /** Grid cells per axis. Default 60. */
  n?: number;
  /** Cell-centre range for both axes. Default [-π, π]. */
  range?: [number, number];
  /** Benettin steps per cell. Default 1000 (≈ 20 s at dt 0.02). */
  steps?: number;
  dt?: number;
  /** Finite separation; f32-safe default 1e-3. */
  d0?: number;
  renormEvery?: number;
  transientSteps?: number;
  forceCpu?: boolean;
}

export interface SweepFieldResult extends GpuFieldMeta {
  /** Row-major λ_max estimates (two-trajectory Benettin). */
  values: Float64Array;
  width: number;
  height: number;
}

/** CPU two-trajectory Benettin λ at one cell — same algorithm as the kernel. */
function sweepLambdaCpu(
  params: PendulumParameters,
  theta1: number,
  theta2: number,
  options: Required<Pick<SweepFieldOptions, 'steps' | 'dt' | 'd0' | 'renormEvery' | 'transientSteps'>>
): number {
  const { steps, dt, d0, renormEvery, transientSteps } = options;
  const rhs = (s: Float64Array, o: Float64Array): void => {
    rhsDouble(s, params, 0, o);
  };
  const a = new Float64Array([theta1, theta2, 0, 0]);
  const b = new Float64Array([theta1 + d0, theta2, 0, 0]);
  const nextA = new Float64Array(4);
  const nextB = new Float64Array(4);
  let accum = 0;
  let measured = 0;
  for (let k = 1; k <= steps; k += 1) {
    rk4Step(a, dt, rhs, nextA);
    a.set(nextA);
    rk4Step(b, dt, rhs, nextB);
    b.set(nextB);
    if (k % renormEvery === 0) {
      let d2 = 0;
      for (let c = 0; c < 4; c += 1) d2 += (b[c]! - a[c]!) ** 2;
      const d = Math.max(Math.sqrt(d2), 1e-12);
      if (k > transientSteps) {
        accum += Math.log(d / d0);
        measured += renormEvery;
      }
      const scale = d0 / d;
      for (let c = 0; c < 4; c += 1) b[c] = a[c]! + (b[c]! - a[c]!) * scale;
    }
  }
  return accum / Math.max(measured * dt, 1e-9);
}

/**
 * λ_max grid by the two-trajectory Benettin estimator, GPU when available.
 * The estimator differs from the Sweep tab's variational `maximalLyapunov`
 * (finite separation d0 vs tangent-space flow) — agreement is expected to a
 * few times the per-cell finite-time noise, not to machine precision.
 */
export async function sweepLambdaField(
  params: PendulumParameters,
  options: SweepFieldOptions = {}
): Promise<SweepFieldResult> {
  const n = options.n ?? 60;
  const [lo, hi] = options.range ?? [-Math.PI, Math.PI];
  const steps = options.steps ?? 1000;
  const dt = options.dt ?? 0.02;
  const d0 = options.d0 ?? 1e-3;
  const renormEvery = options.renormEvery ?? 5;
  const transientSteps = options.transientSteps ?? Math.min(300, steps);
  const cellOptions = { steps, dt, d0, renormEvery, transientSteps };
  const started = nowForGpuField();

  const cellTheta = (index: number): number => lo + ((hi - lo) * (index + 0.5)) / n;
  const cpuFull = (): Float64Array => {
    const values = new Float64Array(n * n);
    for (let iy = 0; iy < n; iy += 1) {
      for (let ix = 0; ix < n; ix += 1) {
        values[iy * n + ix] = sweepLambdaCpu(params, cellTheta(ix), cellTheta(iy), cellOptions);
      }
    }
    return values;
  };

  if (!options.forceCpu) {
    const uniform = new Float32Array([
      params.m1,
      params.m2,
      params.l1,
      params.l2,
      params.g,
      0,
      dt,
      steps,
      lo,
      hi - lo,
      n,
      d0,
      renormEvery,
      transientSteps,
      0,
      0
    ]);
    const io = new Float32Array(n * n);
    const gpuOut = await runComputeKernel(WGSL_SWEEP, uniform, io, n * n);
    if (gpuOut) {
      const values = new Float64Array(gpuOut.subarray(0, n * n));
      const probes = gpuFieldProbeIndices(n);
      let maxDiff = 0;
      for (const [ix, iy] of probes) {
        const cpuValue = sweepLambdaCpu(params, cellTheta(ix), cellTheta(iy), cellOptions);
        maxDiff = Math.max(maxDiff, Math.abs(cpuValue - (values[iy * n + ix] ?? Number.NaN)));
      }
      // f32 trajectories decorrelate at the Lyapunov rate, but the *averaged*
      // stretching estimate stays close; tolerance reflects finite-time noise.
      const tolerance = 0.25;
      const validation: GpuFieldValidation = {
        cells: probes.length,
        maxAbsDiff: maxDiff,
        tolerance,
        passed: maxDiff <= tolerance
      };
      if (validation.passed) {
        return {
          values,
          width: n,
          height: n,
          backend: 'webgpu',
          elapsedMs: nowForGpuField() - started,
          caveat: `WebGPU f32 two-trajectory Benettin (d0=${d0}); probe max |Δλ| vs f64 CPU = ${maxDiff.toFixed(3)}. Finite-time estimates — cross-validate science claims with the variational CPU sweep.`,
          validation
        };
      }
      const valuesCpu = cpuFull();
      return {
        values: valuesCpu,
        width: n,
        height: n,
        backend: 'cpu',
        elapsedMs: nowForGpuField() - started,
        caveat: `WebGPU output failed CPU cross-validation (max |Δλ| = ${maxDiff.toFixed(3)} > ${tolerance}); returned the f64 CPU grid instead.`,
        validation
      };
    }
  }

  const values = cpuFull();
  return {
    values,
    width: n,
    height: n,
    backend: 'cpu',
    elapsedMs: nowForGpuField() - started,
    caveat: 'CPU f64 path (WebGPU unavailable or disabled) — same two-trajectory estimator in double precision.',
    validation: null
  };
}

// ---------------------------------------------------------------------------
// FTLE (finite-difference flow-map gradient)
// ---------------------------------------------------------------------------

export interface FtleFdFieldOptions {
  /** Grid cells per axis. Default 60. */
  n?: number;
  /** Inclusive angle range for both θ₁ and θ₂. Default [-3, 3]. */
  range?: [number, number];
  totalTime?: number;
  dt?: number;
  forceCpu?: boolean;
}

export interface FtleFdFieldResult extends GpuFieldMeta {
  /** Row-major σ_T values (NaN-free; edges use one-sided differences). */
  values: Float64Array;
  width: number;
  height: number;
  min: number;
  max: number;
}

/**
 * σ_T from the finite-difference flow-map gradient: for each interior cell the
 * 4×2 gradient G of the final state w.r.t. (θ₁(0), θ₂(0)) is formed from
 * neighbouring cells and σ_T = ln(σ_max(G)) / T via the closed-form largest
 * eigenvalue of the 2×2 Gram matrix GᵀG.
 */
function ftleFromFinalStates(
  finalStates: Float64Array,
  n: number,
  h1: number,
  h2: number,
  totalTime: number
): Float64Array {
  const values = new Float64Array(n * n);
  const stateAt = (ix: number, iy: number, c: number): number => {
    const cx = Math.max(0, Math.min(n - 1, ix));
    const cy = Math.max(0, Math.min(n - 1, iy));
    return finalStates[(cy * n + cx) * 4 + c] ?? 0;
  };
  for (let iy = 0; iy < n; iy += 1) {
    for (let ix = 0; ix < n; ix += 1) {
      // Central differences clamp to one-sided at the edges; the denominator
      // tracks the actual stencil width.
      const xPlus = Math.min(n - 1, ix + 1);
      const xMinus = Math.max(0, ix - 1);
      const yPlus = Math.min(n - 1, iy + 1);
      const yMinus = Math.max(0, iy - 1);
      const dx = (xPlus - xMinus) * h1;
      const dy = (yPlus - yMinus) * h2;
      // Gram matrix of the 4×2 gradient.
      let g11 = 0;
      let g12 = 0;
      let g22 = 0;
      for (let c = 0; c < 4; c += 1) {
        const ddx = (stateAt(xPlus, iy, c) - stateAt(xMinus, iy, c)) / Math.max(dx, 1e-12);
        const ddy = (stateAt(ix, yPlus, c) - stateAt(ix, yMinus, c)) / Math.max(dy, 1e-12);
        g11 += ddx * ddx;
        g12 += ddx * ddy;
        g22 += ddy * ddy;
      }
      const trace = g11 + g22;
      const det = g11 * g22 - g12 * g12;
      const lambdaMax = Math.max(1e-300, 0.5 * (trace + Math.sqrt(Math.max(0, trace * trace - 4 * det))));
      values[iy * n + ix] = Math.log(Math.sqrt(lambdaMax)) / totalTime;
    }
  }
  return values;
}

/**
 * FTLE field by the grid finite-difference method, GPU-accelerated through the
 * ensemble kernel when available. Distinct from the FTLE tab's variational
 * state-transition-matrix method: ridge structure agrees, exact cell values
 * differ at finite resolution (documented in the caveat).
 */
export async function ftleFieldFiniteDifference(
  params: PendulumParameters,
  options: FtleFdFieldOptions = {}
): Promise<FtleFdFieldResult> {
  const n = options.n ?? 60;
  const [lo, hi] = options.range ?? [-3, 3];
  const totalTime = options.totalTime ?? 3;
  const dt = options.dt ?? 0.01;
  const steps = Math.round(totalTime / dt);
  const h = (hi - lo) / Math.max(n - 1, 1);
  const started = nowForGpuField();

  const initial = new Float64Array(n * n * 4);
  for (let iy = 0; iy < n; iy += 1) {
    for (let ix = 0; ix < n; ix += 1) {
      const index = (iy * n + ix) * 4;
      initial[index] = lo + h * ix;
      initial[index + 1] = lo + h * iy;
    }
  }

  const finish = (
    finalStates: Float64Array,
    backend: 'webgpu' | 'cpu',
    caveat: string,
    validation: GpuFieldValidation | null
  ): FtleFdFieldResult => {
    const values = ftleFromFinalStates(finalStates, n, h, h, totalTime);
    let min = Infinity;
    let max = -Infinity;
    for (const value of values) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    return {
      values,
      width: n,
      height: n,
      min,
      max,
      backend,
      elapsedMs: nowForGpuField() - started,
      caveat,
      validation
    };
  };

  const ensemble = await runDoublePendulumEnsemble(params, initial, { steps, dt, forceCpu: options.forceCpu ?? false });
  if (ensemble.backend === 'webgpu') {
    // Validate probe cells: integrate the 5-point stencil on the CPU and
    // compare the resulting σ_T against the GPU-derived field value.
    const gpuField = ftleFromFinalStates(ensemble.states, n, h, h, totalTime);
    const probes = gpuFieldProbeIndices(n).filter(([ix, iy]) => ix > 0 && iy > 0 && ix < n - 1 && iy < n - 1);
    let maxDiff = 0;
    for (const [ix, iy] of probes) {
      const stencil = [
        [ix, iy],
        [ix + 1, iy],
        [ix - 1, iy],
        [ix, iy + 1],
        [ix, iy - 1]
      ] as const;
      const stencilStates = new Float64Array(stencil.length * 4);
      stencil.forEach(([sx, sy], s) => {
        stencilStates[s * 4] = lo + h * sx;
        stencilStates[s * 4 + 1] = lo + h * sy;
      });
      const cpuStencil = await runDoublePendulumEnsemble(params, stencilStates, { steps, dt, forceCpu: true });
      let g11 = 0;
      let g12 = 0;
      let g22 = 0;
      for (let c = 0; c < 4; c += 1) {
        const ddx = ((cpuStencil.states[1 * 4 + c] ?? 0) - (cpuStencil.states[2 * 4 + c] ?? 0)) / (2 * h);
        const ddy = ((cpuStencil.states[3 * 4 + c] ?? 0) - (cpuStencil.states[4 * 4 + c] ?? 0)) / (2 * h);
        g11 += ddx * ddx;
        g12 += ddx * ddy;
        g22 += ddy * ddy;
      }
      const trace = g11 + g22;
      const det = g11 * g22 - g12 * g12;
      const lambdaMax = Math.max(1e-300, 0.5 * (trace + Math.sqrt(Math.max(0, trace * trace - 4 * det))));
      const cpuValue = Math.log(Math.sqrt(lambdaMax)) / totalTime;
      maxDiff = Math.max(maxDiff, Math.abs(cpuValue - (gpuField[iy * n + ix] ?? Number.NaN)));
    }
    const tolerance = 0.3;
    const validation: GpuFieldValidation = {
      cells: probes.length,
      maxAbsDiff: maxDiff,
      tolerance,
      passed: maxDiff <= tolerance
    };
    if (validation.passed) {
      return finish(
        ensemble.states,
        'webgpu',
        `WebGPU f32 trajectories, finite-difference flow-map gradient (Shadden-style); probe max |Δσ_T| vs f64 CPU = ${maxDiff.toFixed(3)}. Method differs from the variational tab FTLE — compare ridges, not cell values.`,
        validation
      );
    }
    const cpuEnsembleResult = await runDoublePendulumEnsemble(params, initial, { steps, dt, forceCpu: true });
    return finish(
      cpuEnsembleResult.states,
      'cpu',
      `WebGPU output failed CPU cross-validation (max |Δσ_T| = ${maxDiff.toFixed(3)} > ${tolerance}); returned the f64 CPU field instead.`,
      validation
    );
  }

  return finish(
    ensemble.states,
    'cpu',
    'CPU f64 path (WebGPU unavailable or disabled). Finite-difference flow-map FTLE; the variational tab method remains the validated reference.',
    null
  );
}
