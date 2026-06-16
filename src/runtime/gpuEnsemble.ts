import type { PendulumParameters } from '../types/domain';
import { rhsDouble } from '../physics/double';
import { rk4Step } from '../physics/integrators';

/**
 * Ensemble integrator for the double pendulum: advance N independent initial
 * conditions in parallel. When WebGPU is available the RK4 kernel runs as a
 * compute shader (one thread per trajectory, f32); otherwise an identical-API
 * CPU path runs in f64. Ensembles power basin/regime scans and uncertainty
 * clouds, where single-trajectory f32 round-off is acceptable (and is
 * reported as a caveat) because only the statistics are consumed.
 */

export interface EnsembleOptions {
  steps: number;
  dt: number;
  /** Force the CPU path even when WebGPU exists (for A/B validation). */
  forceCpu?: boolean;
}

export interface EnsembleResult {
  /** Final states, packed [θ1, θ2, ω1, ω2] per trajectory. */
  states: Float64Array;
  n: number;
  backend: 'webgpu' | 'cpu';
  steps: number;
  dt: number;
  elapsedMs: number;
  caveat: string;
}

const WGSL_KERNEL = /* wgsl */ `
struct Params {
  m1: f32, m2: f32, l1: f32, l2: f32,
  g: f32, damping: f32, dt: f32, steps: f32,
};
@group(0) @binding(0) var<storage, read_write> states: array<vec4<f32>>;
@group(0) @binding(1) var<uniform> params: Params;

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

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&states)) { return; }
  var s = states[i];
  let h = params.dt;
  let n = u32(params.steps);
  for (var k = 0u; k < n; k = k + 1u) {
    let k1 = rhs(s);
    let k2 = rhs(s + 0.5 * h * k1);
    let k3 = rhs(s + 0.5 * h * k2);
    let k4 = rhs(s + h * k3);
    s = s + (h / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
  }
  states[i] = s;
}
`;

function cpuEnsemble(params: PendulumParameters, damping: number, initial: ArrayLike<number>, options: EnsembleOptions): Float64Array {
  const n = Math.floor(initial.length / 4);
  const out = new Float64Array(initial.length);
  out.set(Array.from(initial));
  const state = new Float64Array(4);
  const next = new Float64Array(4);
  const rhs = (s: Float64Array, o: Float64Array): void => {
    rhsDouble(s, params, damping, o);
  };
  for (let i = 0; i < n; i += 1) {
    state[0] = out[i * 4]!;
    state[1] = out[i * 4 + 1]!;
    state[2] = out[i * 4 + 2]!;
    state[3] = out[i * 4 + 3]!;
    for (let k = 0; k < options.steps; k += 1) {
      rk4Step(state, options.dt, rhs, next);
      state.set(next);
    }
    out[i * 4] = state[0]!;
    out[i * 4 + 1] = state[1]!;
    out[i * 4 + 2] = state[2]!;
    out[i * 4 + 3] = state[3]!;
  }
  return out;
}

interface GpuLike {
  requestAdapter(): Promise<{
    requestDevice(): Promise<GPUDeviceLike>;
  } | null>;
}

interface GPUDeviceLike {
  createShaderModule(desc: { code: string }): unknown;
  createBuffer(desc: { size: number; usage: number; mappedAtCreation?: boolean }): GPUBufferLike;
  createComputePipeline(desc: unknown): GPUPipelineLike;
  createBindGroup(desc: unknown): unknown;
  createCommandEncoder(): GPUEncoderLike;
  queue: { submit(buffers: unknown[]): void; writeBuffer(buffer: GPUBufferLike, offset: number, data: ArrayBufferView): void };
}

interface GPUBufferLike {
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  mapAsync(mode: number): Promise<void>;
}

interface GPUPipelineLike {
  getBindGroupLayout(index: number): unknown;
}

interface GPUEncoderLike {
  beginComputePass(): { setPipeline(p: unknown): void; setBindGroup(i: number, g: unknown): void; dispatchWorkgroups(x: number): void; end(): void };
  copyBufferToBuffer(src: GPUBufferLike, so: number, dst: GPUBufferLike, doff: number, size: number): void;
  finish(): unknown;
}

const GPU_BUFFER_USAGE = { STORAGE: 0x80, COPY_DST: 0x8, COPY_SRC: 0x4, UNIFORM: 0x40, MAP_READ: 0x1 };
const GPU_MAP_READ = 0x1;

/**
 * Run a one-binding-group WGSL compute job: binding 0 is a read_write f32
 * storage buffer initialised from `io` and read back after the dispatch,
 * binding 1 a uniform buffer. Returns null when WebGPU is unavailable or the
 * device errors, so callers can fall back to their CPU path. Shared by the
 * ensemble integrator and the basin/sweep field kernels (`gpuFields.ts`).
 */
export async function runComputeKernel(code: string, uniformData: Float32Array, io: Float32Array, threads: number): Promise<Float32Array | null> {
  if (typeof navigator === 'undefined') return null;
  const gpu = (navigator as unknown as { gpu?: GpuLike }).gpu;
  if (!gpu) return null;
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return null;
    const device = await adapter.requestDevice();

    const ioBuffer = device.createBuffer({
      size: io.byteLength,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST | GPU_BUFFER_USAGE.COPY_SRC
    });
    device.queue.writeBuffer(ioBuffer, 0, io);

    const uniformBuffer = device.createBuffer({ size: uniformData.byteLength, usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST });
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const module = device.createShaderModule({ code });
    const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: ioBuffer } },
        { binding: 1, resource: { buffer: uniformBuffer } }
      ]
    });

    const readBuffer = device.createBuffer({ size: io.byteLength, usage: GPU_BUFFER_USAGE.MAP_READ | GPU_BUFFER_USAGE.COPY_DST });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(threads / 64));
    pass.end();
    encoder.copyBufferToBuffer(ioBuffer, 0, readBuffer, 0, io.byteLength);
    device.queue.submit([encoder.finish()]);
    await readBuffer.mapAsync(GPU_MAP_READ);
    const result = new Float32Array(readBuffer.getMappedRange().slice(0));
    readBuffer.unmap();
    return result;
  } catch {
    return null;
  }
}

async function webgpuEnsemble(
  params: PendulumParameters,
  damping: number,
  initial: ArrayLike<number>,
  options: EnsembleOptions
): Promise<Float64Array | null> {
  const n = Math.floor(initial.length / 4);
  const stateData = new Float32Array(initial.length);
  stateData.set(Array.from(initial));
  const uniformData = new Float32Array([params.m1, params.m2, params.l1, params.l2, params.g, damping, options.dt, options.steps]);
  const result = await runComputeKernel(WGSL_KERNEL, uniformData, stateData, n);
  return result ? new Float64Array(result) : null;
}

/** Integrate an ensemble; WebGPU when present, CPU otherwise. Always resolves. */
export async function runDoublePendulumEnsemble(
  params: PendulumParameters,
  initialStates: ArrayLike<number>,
  options: EnsembleOptions,
  damping = 0
): Promise<EnsembleResult> {
  const n = Math.floor(initialStates.length / 4);
  const started = typeof performance === 'undefined' ? Date.now() : performance.now();
  let backend: 'webgpu' | 'cpu' = 'cpu';
  let states: Float64Array | null = null;
  if (!options.forceCpu && typeof navigator !== 'undefined') {
    states = await webgpuEnsemble(params, damping, initialStates, options);
    if (states) backend = 'webgpu';
  }
  if (!states) states = cpuEnsemble(params, damping, initialStates, options);
  const elapsed = (typeof performance === 'undefined' ? Date.now() : performance.now()) - started;
  return {
    states,
    n,
    backend,
    steps: options.steps,
    dt: options.dt,
    elapsedMs: elapsed,
    caveat: backend === 'webgpu'
      ? 'WebGPU kernel integrates in f32: per-trajectory round-off grows at the Lyapunov rate, so consume ensemble statistics, not individual trajectories.'
      : 'CPU fallback in f64 (WebGPU unavailable or disabled).'
  };
}

export interface EnsembleStatistics {
  n: number;
  /** Mean of [θ1, θ2, ω1, ω2] across the ensemble. */
  mean: Float64Array;
  /** Per-component population variance. */
  variance: Float64Array;
  /** 4×4 population covariance (row-major). */
  covariance: Float64Array;
  /** Overall dispersion radius in state space, √(trace(covariance)). */
  rmsSpread: number;
  /** Fraction of trajectories whose first arm has wound past the upright (|θ1| > π). */
  flipFraction: number;
}

/**
 * Reduce a packed ensemble ([θ1, θ2, ω1, ω2] per trajectory) to the statistics
 * a basin / uncertainty-cloud study consumes: mean, full covariance, dispersion
 * radius and flip fraction. Single-pass Welford for the mean/covariance, so it
 * is numerically stable for large clouds. (The integration backend may be
 * WebGPU f32; these reductions are exact f64 over the returned states — when a
 * GPU reduction is added it must match this within the f32 contract.)
 */
export function ensembleStatistics(states: Float64Array): EnsembleStatistics {
  const n = Math.floor(states.length / 4);
  const mean = new Float64Array(4);
  const m2 = new Float64Array(16); // running co-moments (row-major 4×4)
  let flips = 0;
  for (let i = 0; i < n; i += 1) {
    const base = i * 4;
    const count = i + 1;
    const delta = [0, 0, 0, 0];
    for (let a = 0; a < 4; a += 1) delta[a] = (states[base + a] ?? 0) - (mean[a] ?? 0);
    for (let a = 0; a < 4; a += 1) mean[a] = (mean[a] ?? 0) + (delta[a] ?? 0) / count;
    // Co-moments use the new delta on one side (Welford for covariance).
    for (let a = 0; a < 4; a += 1) {
      const deltaA = delta[a] ?? 0;
      for (let b = 0; b < 4; b += 1) {
        const deltaB2 = (states[base + b] ?? 0) - (mean[b] ?? 0);
        m2[a * 4 + b] = (m2[a * 4 + b] ?? 0) + deltaA * deltaB2;
      }
    }
    if (Math.abs(states[base] ?? 0) > Math.PI) flips += 1;
  }
  const covariance = new Float64Array(16);
  const variance = new Float64Array(4);
  const denom = n > 0 ? n : 1;
  for (let a = 0; a < 4; a += 1) {
    for (let b = 0; b < 4; b += 1) covariance[a * 4 + b] = (m2[a * 4 + b] ?? 0) / denom;
    variance[a] = covariance[a * 4 + a] ?? 0;
  }
  const rmsSpread = Math.sqrt((variance[0] ?? 0) + (variance[1] ?? 0) + (variance[2] ?? 0) + (variance[3] ?? 0));
  return { n, mean, variance, covariance, rmsSpread, flipFraction: n > 0 ? flips / n : 0 };
}

/** Build a grid of initial conditions over (θ1, θ2), released from rest. */
export function ensembleGrid(n: number, range: [number, number]): Float64Array {
  const out = new Float64Array(n * n * 4);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const index = (j * n + i) * 4;
      out[index] = range[0] + ((range[1] - range[0]) * i) / Math.max(1, n - 1);
      out[index + 1] = range[0] + ((range[1] - range[0]) * j) / Math.max(1, n - 1);
    }
  }
  return out;
}
