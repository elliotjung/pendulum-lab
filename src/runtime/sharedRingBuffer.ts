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

  constructor(options: Float64RingBufferOptions | Float64RingBufferDescriptor) {
    if (!Number.isInteger(options.capacity) || options.capacity < 1)
      throw new RangeError('capacity must be a positive integer');
    if (!Number.isInteger(options.stride) || options.stride < 1)
      throw new RangeError('stride must be a positive integer');
    this.capacity = options.capacity;
    this.stride = options.stride;

    if ('metadata' in options) {
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
    if (sample.length !== this.stride)
      throw new RangeError(`sample length ${sample.length} does not match stride ${this.stride}`);
    const sequence = this.load(0);
    const slot = sequence % this.capacity;
    const offset = slot * this.stride;
    for (let i = 0; i < this.stride; i += 1) this.values[offset + i] = Number(sample[i] ?? 0);
    this.store(0, sequence + 1);
    this.store(1, Math.min(this.capacity, this.load(1) + 1));
    // Publish only after every f64 cell is written. Readers synchronize here.
    this.store(2, sequence + 1);
  }

  size(): number {
    return Math.min(this.capacity, this.load(1));
  }

  snapshot(maxSamples: number = this.capacity): Float64Array {
    const published = this.load(2);
    const size = Math.min(this.size(), Math.max(0, Math.floor(maxSamples)));
    const first = Math.max(0, published - size);
    const out = new Float64Array(size * this.stride);
    for (let i = 0; i < size; i += 1) {
      const source = ((first + i) % this.capacity) * this.stride;
      out.set(this.values.subarray(source, source + this.stride), i * this.stride);
    }
    return out;
  }

  clear(): void {
    this.values.fill(0);
    this.store(0, 0);
    this.store(1, 0);
    this.store(2, 0);
  }

  private load(index: number): number {
    return this.mode === 'shared' ? Atomics.load(this.metadata, index) : (this.metadata[index] ?? 0);
  }

  private store(index: number, value: number): void {
    if (this.mode === 'shared') Atomics.store(this.metadata, index, value);
    else this.metadata[index] = value;
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
