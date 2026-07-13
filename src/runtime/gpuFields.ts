/**
 * WebGPU-accelerated field scans for the double pendulum — flip-basin labels,
 * sweep λ_max grids, and finite-difference FTLE fields — with an
 * algorithm-identical f64 CPU fallback and a CPU cross-validation contract:
 *
 * - Every result reports its `backend` ('webgpu' f32 vs 'cpu' f64) and a
 *   caveat describing the precision implications, so the UI can badge GPU
 *   results separately from the validated CPU path.
 * - When the GPU path runs, a probe subset of cells is recomputed on the CPU
 *   with the *same algorithm* and compared (`validation`). If the comparison
 *   fails its tolerance the full grid is recomputed on the CPU and the CPU
 *   result is returned instead — the GPU is an accelerator, never an oracle.
 *
 * Method notes: the sweep kernel uses the two-trajectory (finite-separation)
 * Benettin estimator — cross-validate against the variational `maximalLyapunov`
 * for science claims. The FTLE kernel integrates the IC grid forward and takes
 * the flow-map gradient by central differences of neighbouring cells
 * (Shadden-style grid FTLE), unlike the FTLE tab's variational STM method;
 * the two agree on ridge structure but not cell-for-cell at finite resolution.
 */
import type { PendulumParameters } from '../types/domain';
import { rhsDouble } from '../physics/double';
import { rk4Step } from '../physics/integrators';
import { doublePendulumFlipBasin } from '../chaos/basin';
import { runComputeKernel, runDoublePendulumEnsemble } from './gpuEnsemble';

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
  /** Present when the GPU path ran (null on pure-CPU runs — f64 is the reference). */
  validation: GpuFieldValidation | null;
}

const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

/** Probe-cell indices: corners, edge midpoints, centre — deterministic. */
function probeIndices(n: number): Array<[number, number]> {
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

/** Shared WGSL: double-pendulum RHS + RK4 step (f32). */
const WGSL_COMMON = /* wgsl */ `
fn rhs(s: vec4<f32>) -> vec4<f32> {
  let th1 = s.x; let th2 = s.y; let w1 = s.z; let w2 = s.w;
  let m1 = params.m1; let m2 = params.m2;
  let l1 = params.l1; let l2 = params.l2; let g = params.g;
  let d = th1 - th2;
  let cd = cos(d); let sd = sin(d);
  let den = m1 + m2 * sd * sd;
  let a1 = (-m2 * l1 * w1 * w1 * sd * cd
            + m2 * g * sin(th2) * cd
            - m2 * l2 * w2 * w2 * sd
            - (m1 + m2) * g * sin(th1)) / (l1 * den)
           - params.damping * w1;
  let a2 = ((m1 + m2) * (l1 * w1 * w1 * sd - g * sin(th2) + g * sin(th1) * cd)
            + m2 * l2 * w2 * w2 * sd * cd) / (l2 * den)
           - params.damping * w2;
  return vec4<f32>(w1, w2, a1, a2);
}

fn rk4(s: vec4<f32>, h: f32) -> vec4<f32> {
  let k1 = rhs(s);
  let k2 = rhs(s + 0.5 * h * k1);
  let k3 = rhs(s + 0.5 * h * k2);
  let k4 = rhs(s + h * k3);
  return s + (h / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
}
`;

// ---------------------------------------------------------------------------
// Flip basin
// ---------------------------------------------------------------------------

const WGSL_BASIN = /* wgsl */ `
struct Params {
  m1: f32, m2: f32, l1: f32, l2: f32,
  g: f32, damping: f32, dt: f32, steps: f32,
  lo: f32, span: f32, n: f32, pad: f32,
};
@group(0) @binding(0) var<storage, read_write> out: array<vec2<f32>>;
@group(0) @binding(1) var<uniform> params: Params;
${WGSL_COMMON}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&out)) { return; }
  let n = u32(params.n);
  let ix = i % n;
  let iy = i / n;
  let denom = max(params.n - 1.0, 1.0);
  var s = vec4<f32>(
    params.lo + params.span * f32(ix) / denom,
    params.lo + params.span * f32(iy) / denom,
    0.0, 0.0);
  var label = 2.0;
  var flipTime = -1.0;
  let steps = u32(params.steps);
  let pi = 3.14159265358979;
  for (var k = 0u; k < steps; k = k + 1u) {
    s = rk4(s, params.dt);
    let a1 = abs(s.x);
    let a2 = abs(s.y);
    if (a1 > pi || a2 > pi) {
      if (a1 > pi && (a2 <= pi || a1 >= a2)) { label = 0.0; } else { label = 1.0; }
      flipTime = f32(k + 1u) * params.dt;
      break;
    }
  }
  out[i] = vec2<f32>(label, flipTime);
}
`;

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
  const started = now();

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
      const probes = probeIndices(n);
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
          elapsedMs: now() - started,
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
        elapsedMs: now() - started,
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
    elapsedMs: now() - started,
    caveat: 'CPU f64 path (WebGPU unavailable or disabled) — the validated reference algorithm.',
    validation: null
  };
}

// ---------------------------------------------------------------------------
// Sweep λ_max
// ---------------------------------------------------------------------------

const WGSL_SWEEP = /* wgsl */ `
struct Params {
  m1: f32, m2: f32, l1: f32, l2: f32,
  g: f32, damping: f32, dt: f32, steps: f32,
  lo: f32, span: f32, n: f32, d0: f32,
  renormEvery: f32, transientSteps: f32, pad0: f32, pad1: f32,
};
@group(0) @binding(0) var<storage, read_write> out: array<f32>;
@group(0) @binding(1) var<uniform> params: Params;
${WGSL_COMMON}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&out)) { return; }
  let n = u32(params.n);
  let ix = i % n;
  let iy = i / n;
  // Cell-centre lattice, matching the Sweep tab convention.
  let theta1 = params.lo + params.span * (f32(ix) + 0.5) / params.n;
  let theta2 = params.lo + params.span * (f32(iy) + 0.5) / params.n;
  var a = vec4<f32>(theta1, theta2, 0.0, 0.0);
  var b = a + vec4<f32>(params.d0, 0.0, 0.0, 0.0);
  let steps = u32(params.steps);
  let renorm = max(u32(params.renormEvery), 1u);
  let transient = u32(params.transientSteps);
  var accum = 0.0;
  var measured = 0.0;
  for (var k = 1u; k <= steps; k = k + 1u) {
    a = rk4(a, params.dt);
    b = rk4(b, params.dt);
    if (k % renorm == 0u) {
      let diff = b - a;
      let d = max(length(diff), 1e-12);
      if (k > transient) {
        accum = accum + log(d / params.d0);
        measured = measured + f32(renorm);
      }
      b = a + diff * (params.d0 / d);
    }
  }
  out[i] = accum / max(measured * params.dt, 1e-9);
}
`;

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
  const started = now();

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
      const probes = probeIndices(n);
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
          elapsedMs: now() - started,
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
        elapsedMs: now() - started,
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
    elapsedMs: now() - started,
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
  const started = now();

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
    return { values, width: n, height: n, min, max, backend, elapsedMs: now() - started, caveat, validation };
  };

  const ensemble = await runDoublePendulumEnsemble(params, initial, { steps, dt, forceCpu: options.forceCpu ?? false });
  if (ensemble.backend === 'webgpu') {
    // Validate probe cells: integrate the 5-point stencil on the CPU and
    // compare the resulting σ_T against the GPU-derived field value.
    const gpuField = ftleFromFinalStates(ensemble.states, n, h, h, totalTime);
    const probes = probeIndices(n).filter(([ix, iy]) => ix > 0 && iy > 0 && ix < n - 1 && iy < n - 1);
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
