import { validateChainParameters, type ChainParameters } from '../physics/nPendulum';
import { buildNChainJacobianTape } from './gpuNChainVariational';

const ABI_VERSION = 2;
const MAX_LINKS = 8;

/** Settings shared with the CPU f64 Jacobian-tape oracle. */
export interface WasmNChainTapeSettings {
  dt: number;
  renormEvery: number;
  forwardTransient: number;
  window: number;
  /** Exercise the identical JS f64 fallback even if SIMD is available. */
  forceCpu?: boolean;
}

export interface WasmNChainTapeResult {
  tape: Float64Array;
  backend: 'wasm-simd' | 'cpu';
  elapsedMs: number;
  abiVersion: number | null;
  /** This lane remains a candidate until every ADR 0002 promotion gate passes. */
  promoted: false;
  caveat: string;
}

interface NChainKernelExports {
  memory: WebAssembly.Memory;
  alloc(bytes: number): number;
  nChainKernelAbiVersion(): number;
  nChainKernelMaxLinks(): number;
  nChainTapeOffset(n: number): number;
  nChainRequiredBytes(n: number, steps: number): number;
  buildNChainJacobianTapeSimd(basePtr: number, n: number, steps: number, dt: number, g: number, gamma: number): number;
}

// Minimal module: (func (i8x16.splat (i32.const 0)) drop). Validation is a
// synchronous feature probe and happens before the production module is read
// or compiled, as required by ADR 0002.
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 9, 1, 7, 0, 65, 0, 253, 15, 26, 11
]);

let kernelPromise: Promise<NChainKernelExports | null> | null = null;
let blockPtr = 0;
let blockCapacity = 0;

/** True only when this engine validates a module containing a simd128 opcode. */
export function wasmSimdSupported(): boolean {
  return typeof WebAssembly !== 'undefined' && typeof WebAssembly.validate === 'function' && WebAssembly.validate(SIMD_PROBE);
}

async function kernelBytes(): Promise<ArrayBuffer | null> {
  const wasmUrl = new URL('./wasm/pendulum-kernel.wasm', import.meta.url);
  // Library builds inline the small kernel as a data URL. Handle that before
  // the Node file path so the published experimental subpath works in Node as
  // well as in browsers.
  if (wasmUrl.protocol === 'data:') {
    const response = await fetch(wasmUrl);
    return response.ok ? response.arrayBuffer() : null;
  }
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const buffer = await readFile(fileURLToPath(wasmUrl));
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  }
  const response = await fetch(wasmUrl);
  return response.ok ? response.arrayBuffer() : null;
}

async function instantiateKernel(): Promise<NChainKernelExports | null> {
  try {
    if (!wasmSimdSupported()) return null;
    const bytes = await kernelBytes();
    if (!bytes) return null;
    const module = await WebAssembly.compile(bytes);
    const instance = await WebAssembly.instantiate(module, {});
    const exports = instance.exports as unknown as NChainKernelExports;
    if (
      typeof exports.alloc !== 'function' ||
      typeof exports.buildNChainJacobianTapeSimd !== 'function' ||
      exports.nChainKernelAbiVersion() !== ABI_VERSION ||
      exports.nChainKernelMaxLinks() !== MAX_LINKS
    ) {
      return null;
    }
    return exports;
  } catch {
    // Unsupported SIMD, CSP, binary drift, or ABI mismatch fails closed.
    return null;
  }
}

function loadKernel(): Promise<NChainKernelExports | null> {
  if (!kernelPromise) kernelPromise = instantiateKernel();
  return kernelPromise;
}

export async function wasmNChainAvailable(): Promise<boolean> {
  return (await loadKernel()) !== null;
}

function validateSettings(parameters: ChainParameters, state0: ArrayLike<number>, settings: WasmNChainTapeSettings): number {
  validateChainParameters(parameters);
  const links = parameters.masses.length;
  if (links > MAX_LINKS) throw new Error(`WASM N-chain candidate is limited to ${MAX_LINKS} links`);
  if (state0.length !== links * 2) throw new Error(`N-chain state length ${state0.length} does not match 2N=${links * 2}`);
  if (!(settings.dt > 0) || !Number.isInteger(settings.renormEvery) || settings.renormEvery <= 0) {
    throw new Error('WASM N-chain settings require dt>0 and an integer renormEvery>0');
  }
  if (!Number.isInteger(settings.forwardTransient) || settings.forwardTransient < 0 || !Number.isInteger(settings.window) || settings.window <= 0) {
    throw new Error('WASM N-chain settings require integer forwardTransient>=0 and window>0');
  }
  return (settings.forwardTransient + settings.window) * settings.renormEvery;
}

function cpuResult(
  parameters: ChainParameters,
  state0: ArrayLike<number>,
  damping: number,
  settings: WasmNChainTapeSettings,
  started: number,
  reason: string
): WasmNChainTapeResult {
  const tape = buildNChainJacobianTape(parameters, state0, damping, settings);
  return {
    tape,
    backend: 'cpu',
    elapsedMs: performance.now() - started,
    abiVersion: null,
    promoted: false,
    caveat: `${reason} The existing JS f64 oracle produced the tape.`
  };
}

/**
 * Execute the versioned f64 SIMD candidate. This does not replace the CPU
 * oracle or enter a production WebGPU promotion path: callers receive an
 * explicit unpromoted result and every load/ABI/kernel failure falls back.
 */
export async function buildNChainJacobianTapeWasm(
  parameters: ChainParameters,
  state0: ArrayLike<number>,
  damping: number,
  settings: WasmNChainTapeSettings
): Promise<WasmNChainTapeResult> {
  const steps = validateSettings(parameters, state0, settings);
  const started = performance.now();
  if (settings.forceCpu) return cpuResult(parameters, state0, damping, settings, started, 'WASM was disabled by the caller.');
  const kernel = await loadKernel();
  if (!kernel) return cpuResult(parameters, state0, damping, settings, started, 'The SIMD kernel was unavailable or failed its ABI/feature probe.');

  const links = parameters.masses.length;
  const dimension = links * 2;
  const bytes = kernel.nChainRequiredBytes(links, steps);
  const tapeOffset = kernel.nChainTapeOffset(links);
  const tapeLength = steps * dimension * dimension;
  if (bytes <= 0 || tapeOffset !== links * 4 * Float64Array.BYTES_PER_ELEMENT) {
    return cpuResult(parameters, state0, damping, settings, started, 'The SIMD kernel returned an invalid versioned memory layout.');
  }
  if (bytes > blockCapacity) {
    blockPtr = kernel.alloc(bytes);
    blockCapacity = bytes;
  }

  // alloc may grow memory, so all views are created after it returns.
  const memory = kernel.memory.buffer;
  new Float64Array(memory, blockPtr, links).set(parameters.masses);
  new Float64Array(memory, blockPtr + links * 8, links).set(parameters.lengths);
  new Float64Array(memory, blockPtr + links * 16, dimension).set(Float64Array.from(state0));
  const status = kernel.buildNChainJacobianTapeSimd(blockPtr, links, steps, settings.dt, parameters.g, damping);
  if (status !== 0) return cpuResult(parameters, state0, damping, settings, started, `The SIMD kernel rejected the workload (status ${status}).`);

  // The function performs no allocation, so memory cannot grow during this
  // call. Copy both outputs before the reusable block is overwritten.
  const tape = Float64Array.from(new Float64Array(kernel.memory.buffer, blockPtr + tapeOffset, tapeLength));
  if (tape.some((value) => !Number.isFinite(value))) {
    return cpuResult(parameters, state0, damping, settings, started, 'The SIMD kernel emitted a non-finite value.');
  }
  return {
    tape,
    backend: 'wasm-simd',
    elapsedMs: performance.now() - started,
    abiVersion: ABI_VERSION,
    promoted: false,
    caveat:
      'Unpromoted f64 SIMD candidate (ABI 2): numerical agreement is benchmarked against the CPU oracle, but production adoption remains gated by cross-engine and repeatable-speedup evidence in ADR 0002.'
  };
}
