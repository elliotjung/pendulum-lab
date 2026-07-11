import type { PendulumParameters } from '../types/domain';
import { rhsDouble } from '../physics/double';
import { rk4Step } from '../physics/integrators';

/**
 * WASM acceleration lane for the double-pendulum RK4 ensemble hot loop.
 *
 * The kernel (`wasm/assembly/ensemble.ts`, compiled to
 * `src/runtime/wasm/pendulum-kernel.wasm` by `npm run build:wasm`) is a 1:1
 * f64 port of `rhsDouble` + `rk4Step`, so unlike the WebGPU f32 lane it is a
 * *trajectory-grade* accelerator: agreement with the JS oracle is at
 * round-off level over short horizons (only `Math.sin`/`Math.cos` differ by
 * ≤1 ulp between the WASM libm and the JS engine), and the binary gives
 * bit-identical results across JS engines.
 *
 * Adoption scope (decision recorded): the lane is wired for the *headless*
 * heavy paths — research CLI batch runs, paper studies, Node benchmarks —
 * where WebAssembly needs no CSP concession. Enabling it inside the served
 * app requires adding `'wasm-unsafe-eval'` to the CSP `script-src` (browsers
 * gate WebAssembly compilation behind it); that posture change is deliberate
 * and deferred until an in-app workload actually needs the lane.
 *
 * Fallback contract mirrors the GPU lane: if the kernel is unavailable the
 * same API runs the identical JS loop and reports `backend: 'cpu'`.
 */

export interface WasmEnsembleOptions {
  steps: number;
  dt: number;
  /** Force the JS path even when the kernel loads (for A/B validation). */
  forceCpu?: boolean;
}

export interface WasmEnsembleResult {
  /** Final states, packed [θ1, θ2, ω1, ω2] per trajectory. */
  states: Float64Array;
  n: number;
  backend: 'wasm' | 'cpu';
  steps: number;
  dt: number;
  elapsedMs: number;
  caveat: string;
}

interface KernelExports {
  memory: WebAssembly.Memory;
  alloc(bytes: number): number;
  stepEnsembleRk4(
    ptr: number,
    n: number,
    steps: number,
    dt: number,
    m1: number,
    m2: number,
    l1: number,
    l2: number,
    g: number,
    gamma: number
  ): void;
}

let kernelPromise: Promise<KernelExports | null> | null = null;
// Bump-allocator block reuse: the stub-runtime kernel never frees, so the
// wrapper keeps one block and re-allocates only when capacity grows.
let statesPtr = 0;
let statesCapacity = 0;

async function kernelBytes(): Promise<ArrayBuffer | null> {
  const wasmUrl = new URL('./wasm/pendulum-kernel.wasm', import.meta.url);
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const buffer = await readFile(fileURLToPath(wasmUrl));
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  }
  const response = await fetch(wasmUrl);
  if (!response.ok) return null;
  return response.arrayBuffer();
}

async function instantiateKernel(): Promise<KernelExports | null> {
  try {
    if (typeof WebAssembly === 'undefined') return null;
    const bytes = await kernelBytes();
    if (!bytes) return null;
    const module = await WebAssembly.compile(bytes);
    const instance = await WebAssembly.instantiate(module, {});
    const exports = instance.exports as unknown as KernelExports;
    if (typeof exports.stepEnsembleRk4 !== 'function' || typeof exports.alloc !== 'function') return null;
    return exports;
  } catch {
    // CSP without 'wasm-unsafe-eval', missing file, or no WASM support:
    // the caller transparently falls back to the JS loop.
    return null;
  }
}

function loadKernel(): Promise<KernelExports | null> {
  if (!kernelPromise) kernelPromise = instantiateKernel();
  return kernelPromise;
}

/** Whether the WASM kernel can be loaded in this environment. */
export async function wasmEnsembleAvailable(): Promise<boolean> {
  return (await loadKernel()) !== null;
}

function cpuFallback(
  params: PendulumParameters,
  damping: number,
  states: Float64Array,
  options: WasmEnsembleOptions
): void {
  const n = states.length / 4;
  const state = new Float64Array(4);
  const out = new Float64Array(4);
  const rhs = (s: Float64Array, o: Float64Array): void => {
    rhsDouble(s, params, damping, o);
  };
  for (let i = 0; i < n; i += 1) {
    state.set(states.subarray(i * 4, i * 4 + 4));
    for (let k = 0; k < options.steps; k += 1) {
      rk4Step(state, options.dt, rhs, out);
      state.set(out);
    }
    states.set(state, i * 4);
  }
}

/**
 * Advance an ensemble of packed [θ1, θ2, ω1, ω2] initial conditions by
 * `steps` RK4 steps of `dt`; WASM kernel when available, identical JS loop
 * otherwise. Always resolves.
 */
export async function runDoublePendulumEnsembleWasm(
  params: PendulumParameters,
  damping: number,
  initialStates: ArrayLike<number>,
  options: WasmEnsembleOptions
): Promise<WasmEnsembleResult> {
  if (initialStates.length % 4 !== 0) {
    throw new Error('runDoublePendulumEnsembleWasm: initialStates length must be a multiple of 4.');
  }
  const n = initialStates.length / 4;
  const states = Float64Array.from(initialStates as ArrayLike<number>);
  const kernel = options.forceCpu ? null : await loadKernel();
  const started = performance.now();

  if (kernel) {
    const bytes = n * 4 * Float64Array.BYTES_PER_ELEMENT;
    if (bytes > statesCapacity) {
      statesPtr = kernel.alloc(bytes);
      statesCapacity = bytes;
    }
    new Float64Array(kernel.memory.buffer, statesPtr, n * 4).set(states);
    kernel.stepEnsembleRk4(statesPtr, n, options.steps, options.dt, params.m1, params.m2, params.l1, params.l2, params.g, damping);
    // The buffer reference may have been invalidated by memory growth inside
    // alloc, so re-view before reading back.
    states.set(new Float64Array(kernel.memory.buffer, statesPtr, n * 4));
    return {
      states,
      n,
      backend: 'wasm',
      steps: options.steps,
      dt: options.dt,
      elapsedMs: performance.now() - started,
      caveat:
        'WASM kernel integrates in f64 with its own libm sin/cos (<=1 ulp vs JS Math): per-trajectory agreement with the JS oracle is round-off-level over short horizons and diverges at the Lyapunov rate over long ones, as any two correct f64 integrators do.'
    };
  }

  cpuFallback(params, damping, states, options);
  return {
    states,
    n,
    backend: 'cpu',
    steps: options.steps,
    dt: options.dt,
    elapsedMs: performance.now() - started,
    caveat: 'WASM kernel unavailable in this environment; identical JS loop was used.'
  };
}
