export interface Float64RingBufferOptions {
  capacity: number;
  stride: number;
  preferShared?: boolean;
  /** Test/server override. Browsers still require cross-origin isolation. */
  crossOriginIsolated?: boolean;
}

export interface Float64RingBufferDescriptor {
  mode: 'shared' | 'local';
  capacity: number;
  stride: number;
  metadata: SharedArrayBuffer | ArrayBuffer;
  values: SharedArrayBuffer | ArrayBuffer;
}

const MAX_RING_CELLS = 16_777_216;
const SHARED_SNAPSHOT_ATTEMPTS = 512;
const SHARED_SNAPSHOT_WAIT_MS = 1;

/**
 * Single-writer, many-reader f64 history ring. In a COOP/COEP context its
 * descriptor can be posted to workers without copying; GitHub Pages and
 * file:// transparently use the same API backed by ordinary ArrayBuffers.
 */
export class Float64RingBuffer {
  readonly mode: 'shared' | 'local';
  readonly capacity: number;
  readonly stride: number;
  private readonly metadata: Int32Array;
  private readonly values: Float64Array;
  private readonly writeScratch: Float64Array;
  private pushInProgress = false;
  private atomicsWaitSupported: boolean | undefined;

  constructor(options: Float64RingBufferOptions | Float64RingBufferDescriptor) {
    if (!Number.isSafeInteger(options.capacity) || options.capacity < 1)
      throw new RangeError('capacity must be a positive safe integer');
    if (!Number.isSafeInteger(options.stride) || options.stride < 1)
      throw new RangeError('stride must be a positive safe integer');
    if (options.capacity > Math.floor(Number.MAX_SAFE_INTEGER / options.stride)) {
      throw new RangeError('ring dimensions must have a safely representable product');
    }
    const cells = options.capacity * options.stride;
    if (cells > MAX_RING_CELLS) throw new RangeError(`ring storage must not exceed ${MAX_RING_CELLS} float64 cells`);
    this.capacity = options.capacity;
    this.stride = options.stride;

    if ('metadata' in options) {
      if (options.mode !== 'shared' && options.mode !== 'local')
        throw new RangeError('ring descriptor mode is invalid');
      const metadataBytes = Int32Array.BYTES_PER_ELEMENT * 3;
      const valueBytes = Float64Array.BYTES_PER_ELEMENT * cells;
      if (options.metadata.byteLength !== metadataBytes || options.values.byteLength !== valueBytes) {
        throw new RangeError('ring descriptor dimensions do not match its buffers');
      }
      const isSharedMetadata =
        typeof SharedArrayBuffer !== 'undefined' && options.metadata instanceof SharedArrayBuffer;
      const isSharedValues = typeof SharedArrayBuffer !== 'undefined' && options.values instanceof SharedArrayBuffer;
      if (options.mode === 'shared' ? !isSharedMetadata || !isSharedValues : isSharedMetadata || isSharedValues) {
        throw new RangeError('ring descriptor mode does not match its buffer types');
      }
      this.mode = options.mode;
      this.metadata = new Int32Array(options.metadata);
      this.values = new Float64Array(options.values);
    } else {
      const isolated = options.crossOriginIsolated ?? globalIsolationState();
      const shared = options.preferShared !== false && isolated && typeof SharedArrayBuffer !== 'undefined';
      this.mode = shared ? 'shared' : 'local';
      const MetadataBuffer = shared ? SharedArrayBuffer : ArrayBuffer;
      const ValueBuffer = shared ? SharedArrayBuffer : ArrayBuffer;
      this.metadata = new Int32Array(new MetadataBuffer(Int32Array.BYTES_PER_ELEMENT * 3));
      this.values = new Float64Array(new ValueBuffer(Float64Array.BYTES_PER_ELEMENT * this.capacity * this.stride));
    }
    if (this.metadata.length < 3 || this.values.length !== this.capacity * this.stride) {
      throw new RangeError('ring descriptor dimensions do not match its buffers');
    }
    this.writeScratch = new Float64Array(this.stride);
  }

  descriptor(): Float64RingBufferDescriptor {
    return {
      mode: this.mode,
      capacity: this.capacity,
      stride: this.stride,
      metadata: this.metadata.buffer,
      values: this.values.buffer
    };
  }

  push(sample: ArrayLike<number>): void {
    if (this.pushInProgress) throw new Error('reentrant ring push is not supported');
    this.pushInProgress = true;
    try {
      if (sample.length !== this.stride)
        throw new RangeError(`sample length ${sample.length} does not match stride ${this.stride}`);
      // Read every potentially stateful getter exactly once before acquiring
      // the seqlock. Reject reentrant pushes before they can overwrite this
      // instance's reusable scratch buffer.
      for (let i = 0; i < this.stride; i += 1) {
        const value = Number(sample[i]);
        if (!Number.isFinite(value)) throw new TypeError(`sample[${i}] must be finite`);
        this.writeScratch[i] = value;
      }
      const slot = this.load(0);
      if (!Number.isInteger(slot) || slot < 0 || slot >= this.capacity) {
        throw new RangeError('ring metadata contains an invalid next-write slot');
      }
      // Metadata[2] is a seqlock: odd while a write is in flight, even when the
      // next-slot/size/value snapshot is coherent. Unlike a monotonic Int32
      // counter, this remains correct for capacities that do not divide 2^32.
      this.add(2, 1);
      try {
        const offset = slot * this.stride;
        for (let i = 0; i < this.stride; i += 1) this.values[offset + i] = this.writeScratch[i]!;
        this.store(0, (slot + 1) % this.capacity);
        this.store(1, Math.min(this.capacity, this.load(1) + 1));
      } finally {
        this.add(2, 1);
      }
    } finally {
      this.pushInProgress = false;
    }
  }

  size(): number {
    return Math.min(this.capacity, Math.max(0, this.load(1)));
  }

  snapshot(maxSamples: number = this.capacity): Float64Array {
    if (!Number.isSafeInteger(maxSamples) || maxSamples < 0) {
      throw new RangeError('maxSamples must be a non-negative safe integer');
    }
    // Allocate at most once per call. A hot shared writer can invalidate many
    // copies; allocating a capacity-sized array inside every retry would turn
    // bounded contention into an avoidable memory-exhaustion path.
    const copyCapacity = Math.min(this.capacity, maxSamples);
    const copy = new Float64Array(copyCapacity * this.stride);
    const attempts = this.mode === 'shared' ? SHARED_SNAPSHOT_ATTEMPTS : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const versionBefore = this.load(2);
      if ((versionBefore & 1) !== 0) {
        this.waitForWriter(versionBefore, attempt);
        continue;
      }
      const publishedNextSlot = this.load(0);
      if (!Number.isInteger(publishedNextSlot) || publishedNextSlot < 0 || publishedNextSlot >= this.capacity) {
        throw new RangeError('ring metadata contains an invalid published slot');
      }
      const size = Math.min(this.size(), copyCapacity);
      const first = (publishedNextSlot - size + this.capacity) % this.capacity;
      for (let i = 0; i < size; i += 1) {
        const source = ((first + i) % this.capacity) * this.stride;
        copy.set(this.values.subarray(source, source + this.stride), i * this.stride);
      }
      const versionAfter = this.load(2);
      if (versionBefore === versionAfter && (versionAfter & 1) === 0) return copy.subarray(0, size * this.stride);
      if ((versionAfter & 1) !== 0) this.waitForWriter(versionAfter, attempt);
    }
    throw new Error(`ring snapshot could not stabilize after ${attempts} bounded retries while the writer was active`);
  }

  clear(): void {
    this.add(2, 1);
    try {
      this.values.fill(0);
      this.store(0, 0);
      this.store(1, 0);
    } finally {
      this.add(2, 1);
    }
  }

  private load(index: number): number {
    return this.mode === 'shared' ? Atomics.load(this.metadata, index) : (this.metadata[index] ?? 0);
  }

  private store(index: number, value: number): void {
    if (this.mode === 'shared') Atomics.store(this.metadata, index, value);
    else this.metadata[index] = value;
  }

  private add(index: number, value: number): void {
    if (this.mode === 'shared') Atomics.add(this.metadata, index, value);
    else this.metadata[index] = (this.metadata[index] ?? 0) + value;
  }

  /**
   * Give the single writer a bounded chance to publish an even seqlock value.
   * `Atomics.wait` is available in workers and Node; Window contexts reject it,
   * so those contexts fall back to an exponentially bounded atomic spin.
   */
  private waitForWriter(expectedVersion: number, attempt: number): void {
    if (this.mode !== 'shared') return;
    if (this.atomicsWaitSupported !== false && typeof Atomics.wait === 'function') {
      try {
        Atomics.wait(this.metadata, 2, expectedVersion, SHARED_SNAPSHOT_WAIT_MS);
        this.atomicsWaitSupported = true;
        return;
      } catch {
        this.atomicsWaitSupported = false;
      }
    }
    const spins = Math.min(8_192, 32 * 2 ** Math.min(8, Math.floor(attempt / 8)));
    for (let spin = 0; spin < spins; spin += 1) {
      if (Atomics.load(this.metadata, 2) !== expectedVersion) return;
    }
  }
}

export function sharedMemoryCapability(): {
  supported: boolean;
  crossOriginIsolated: boolean;
  reason: 'ready' | 'missing-shared-array-buffer' | 'missing-coop-coep';
} {
  const isolated = globalIsolationState();
  if (typeof SharedArrayBuffer === 'undefined') {
    return { supported: false, crossOriginIsolated: isolated, reason: 'missing-shared-array-buffer' };
  }
  if (!isolated) return { supported: false, crossOriginIsolated: false, reason: 'missing-coop-coep' };
  return { supported: true, crossOriginIsolated: true, reason: 'ready' };
}

function globalIsolationState(): boolean {
  return (
    typeof globalThis !== 'undefined' && 'crossOriginIsolated' in globalThis && globalThis.crossOriginIsolated === true
  );
}
