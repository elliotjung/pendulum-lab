import {
  LAB_SIDE_PLOT_SHARED_RING_METADATA_INTS,
  LAB_SIDE_PLOT_SHARED_RING_PROTOCOL,
  MAX_LAB_SIDE_PLOT_SHARED_RING_FLOATS,
  MAX_LAB_SIDE_PLOT_SHARED_RING_SLOT_FLOATS,
  MAX_LAB_SIDE_PLOT_SHARED_RING_SLOTS,
  MAX_LAB_SIDE_PLOT_SHARED_SEQUENCE,
  isLabSidePlotPayload,
  isLabSidePlotSharedRingDescriptor,
  type LabSidePlotId,
  type LabSidePlotPayload,
  type LabSidePlotSharedRingDescriptor
} from './LabSidePlotProtocol';

/** Eight slots keep all five plots independently backpressured without unbounded buffering. */
export const DEFAULT_LAB_SIDE_PLOT_SHARED_RING_CAPACITY = 8;
/** 256 KiB per slot; larger snapshots retain the transferable fallback. */
export const DEFAULT_LAB_SIDE_PLOT_SHARED_SLOT_FLOAT_CAPACITY = 65_536;

const SLOT_STATE = 0;
const SLOT_SEQUENCE = 1;
const SLOT_PLOT = 2;
const SLOT_LENGTH_A = 3;
const SLOT_LENGTH_B = 4;
const SLOT_LENGTH_C = 5;
const SLOT_SCALAR_LOW = 6;
const SLOT_SCALAR_HIGH = 7;

const SLOT_FREE = 0;
const SLOT_WRITING = 1;
const SLOT_READY = 2;
const SLOT_READING = 3;

const PLOT_CODE: Record<LabSidePlotId, number> = {
  energy: 1,
  lyap: 2,
  phase: 3,
  poincare: 4,
  fft: 5
};

const CODE_PLOT: Record<number, LabSidePlotId | undefined> = {
  1: 'energy',
  2: 'lyap',
  3: 'phase',
  4: 'poincare',
  5: 'fft'
};

export interface LabSidePlotSharedFrame {
  slot: number;
  sequence: number;
}

export interface LabSidePlotSharedRingOptions {
  capacity?: number;
  slotFloatCapacity?: number;
}

export type LabSidePlotSharedWriteResult =
  { kind: 'written'; frame: LabSidePlotSharedFrame } | { kind: 'oversize' } | { kind: 'backpressured' };

interface EncodedPayload {
  plot: LabSidePlotId;
  lengthA: number;
  lengthB: number;
  lengthC: number;
  scalar: number;
  floatLength: number;
  write(values: Float32Array): void;
}

/**
 * Main-thread producer for a fixed-size, single-consumer side-plot ring.
 * A slot is only reused after the worker has finished reading it. Atomics
 * publish the complete metadata + value snapshot before a render message is
 * posted; the message itself contains only a slot and sequence identifier.
 */
export class LabSidePlotSharedRingWriter {
  readonly descriptor: LabSidePlotSharedRingDescriptor;
  private readonly metadata: Int32Array;
  private readonly values: Float32Array;
  private readonly scalarBits = new DataView(new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT));
  private nextSlot = 0;
  private nextSequence = 1;

  constructor(options: LabSidePlotSharedRingOptions = {}) {
    const capacity = options.capacity ?? DEFAULT_LAB_SIDE_PLOT_SHARED_RING_CAPACITY;
    const slotFloatCapacity = options.slotFloatCapacity ?? DEFAULT_LAB_SIDE_PLOT_SHARED_SLOT_FLOAT_CAPACITY;
    validateDimensions(capacity, slotFloatCapacity);
    if (typeof SharedArrayBuffer === 'undefined') {
      throw new Error('SharedArrayBuffer is unavailable');
    }
    const metadata = new SharedArrayBuffer(
      capacity * LAB_SIDE_PLOT_SHARED_RING_METADATA_INTS * Int32Array.BYTES_PER_ELEMENT
    );
    const values = new SharedArrayBuffer(capacity * slotFloatCapacity * Float32Array.BYTES_PER_ELEMENT);
    this.descriptor = {
      protocol: LAB_SIDE_PLOT_SHARED_RING_PROTOCOL,
      capacity,
      slotFloatCapacity,
      metadata,
      values
    };
    this.metadata = new Int32Array(metadata);
    this.values = new Float32Array(values);
  }

  /** Serialize one finite payload to a free slot without allocating a snapshot copy. */
  tryWrite(payload: LabSidePlotPayload): LabSidePlotSharedWriteResult {
    const encoded = encodePayload(payload);
    if (encoded.floatLength > this.descriptor.slotFloatCapacity) return { kind: 'oversize' };
    const slot = this.claimFreeSlot();
    if (slot === null) return { kind: 'backpressured' };

    const sequence = this.takeSequence();
    const base = slot * LAB_SIDE_PLOT_SHARED_RING_METADATA_INTS;
    try {
      const targetStart = slot * this.descriptor.slotFloatCapacity;
      encoded.write(this.values.subarray(targetStart, targetStart + encoded.floatLength));
      Atomics.store(this.metadata, base + SLOT_SEQUENCE, sequence);
      Atomics.store(this.metadata, base + SLOT_PLOT, PLOT_CODE[encoded.plot]);
      Atomics.store(this.metadata, base + SLOT_LENGTH_A, encoded.lengthA);
      Atomics.store(this.metadata, base + SLOT_LENGTH_B, encoded.lengthB);
      Atomics.store(this.metadata, base + SLOT_LENGTH_C, encoded.lengthC);
      this.writeScalar(base, encoded.scalar);
      // This release-store makes all preceding payload writes visible to the worker.
      Atomics.store(this.metadata, base + SLOT_STATE, SLOT_READY);
      return { kind: 'written', frame: { slot, sequence } };
    } catch (error) {
      Atomics.store(this.metadata, base + SLOT_STATE, SLOT_FREE);
      throw error;
    }
  }

  /** Undo a frame only if it was never claimed by the worker. */
  cancel(frame: LabSidePlotSharedFrame): void {
    if (!this.ownsFrame(frame)) return;
    const base = frame.slot * LAB_SIDE_PLOT_SHARED_RING_METADATA_INTS;
    if (Atomics.load(this.metadata, base + SLOT_SEQUENCE) !== frame.sequence) return;
    Atomics.compareExchange(this.metadata, base + SLOT_STATE, SLOT_READY, SLOT_FREE);
  }

  private claimFreeSlot(): number | null {
    const capacity = this.descriptor.capacity;
    for (let offset = 0; offset < capacity; offset += 1) {
      const slot = (this.nextSlot + offset) % capacity;
      const stateIndex = slot * LAB_SIDE_PLOT_SHARED_RING_METADATA_INTS + SLOT_STATE;
      if (Atomics.compareExchange(this.metadata, stateIndex, SLOT_FREE, SLOT_WRITING) === SLOT_FREE) {
        this.nextSlot = (slot + 1) % capacity;
        return slot;
      }
    }
    return null;
  }

  private takeSequence(): number {
    const sequence = this.nextSequence;
    this.nextSequence = sequence === MAX_LAB_SIDE_PLOT_SHARED_SEQUENCE ? 1 : sequence + 1;
    return sequence;
  }

  private writeScalar(base: number, value: number): void {
    this.scalarBits.setFloat64(0, value, true);
    Atomics.store(this.metadata, base + SLOT_SCALAR_LOW, this.scalarBits.getInt32(0, true));
    Atomics.store(this.metadata, base + SLOT_SCALAR_HIGH, this.scalarBits.getInt32(4, true));
  }

  private ownsFrame(frame: LabSidePlotSharedFrame): boolean {
    return (
      Number.isSafeInteger(frame.slot) &&
      frame.slot >= 0 &&
      frame.slot < this.descriptor.capacity &&
      safeSequence(frame.sequence)
    );
  }
}

export interface LabSidePlotSharedLease {
  payload: LabSidePlotPayload;
  release(): void;
}

/**
 * Worker-side reader. It holds a slot in `reading` state until its synchronous
 * canvas render completes, so a producer cannot overwrite an in-use view.
 */
export class LabSidePlotSharedRingReader {
  private readonly metadata: Int32Array;
  private readonly values: Float32Array;
  private readonly scalarBits = new DataView(new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT));

  constructor(readonly descriptor: LabSidePlotSharedRingDescriptor) {
    if (!isLabSidePlotSharedRingDescriptor(descriptor)) {
      throw new RangeError('side-plot shared transport descriptor is invalid');
    }
    this.metadata = new Int32Array(descriptor.metadata);
    this.values = new Float32Array(descriptor.values);
  }

  acquire(frame: LabSidePlotSharedFrame): LabSidePlotSharedLease {
    if (!this.ownsFrame(frame)) throw new RangeError('side-plot shared render frame is invalid');
    const base = frame.slot * LAB_SIDE_PLOT_SHARED_RING_METADATA_INTS;
    const stateIndex = base + SLOT_STATE;
    if (Atomics.compareExchange(this.metadata, stateIndex, SLOT_READY, SLOT_READING) !== SLOT_READY) {
      throw new Error('side-plot shared render slot was not ready');
    }
    const publishedSequence = Atomics.load(this.metadata, base + SLOT_SEQUENCE);
    if (publishedSequence !== frame.sequence) {
      // A delayed duplicate message must never release a newer frame.
      Atomics.store(this.metadata, stateIndex, SLOT_READY);
      throw new Error('side-plot shared render sequence does not match its slot');
    }
    try {
      const payload = this.decode(base, frame.slot);
      let released = false;
      return {
        payload,
        release: (): void => {
          if (released) return;
          released = true;
          if (Atomics.load(this.metadata, base + SLOT_SEQUENCE) === frame.sequence) {
            Atomics.compareExchange(this.metadata, stateIndex, SLOT_READING, SLOT_FREE);
          }
        }
      };
    } catch (error) {
      Atomics.compareExchange(this.metadata, stateIndex, SLOT_READING, SLOT_FREE);
      throw error;
    }
  }

  private decode(base: number, slot: number): LabSidePlotPayload {
    const plot = CODE_PLOT[Atomics.load(this.metadata, base + SLOT_PLOT)];
    const lengthA = Atomics.load(this.metadata, base + SLOT_LENGTH_A);
    const lengthB = Atomics.load(this.metadata, base + SLOT_LENGTH_B);
    const lengthC = Atomics.load(this.metadata, base + SLOT_LENGTH_C);
    if (!plot || !validLengths(lengthA, lengthB, lengthC, this.descriptor.slotFloatCapacity)) {
      throw new RangeError('side-plot shared slot metadata is invalid');
    }
    const scalar = this.readScalar(base);
    const start = slot * this.descriptor.slotFloatCapacity;
    const view = (offset: number, length: number): Float32Array =>
      this.values.subarray(start + offset, start + offset + length);
    let payload: LabSidePlotPayload;
    switch (plot) {
      case 'energy':
        payload = {
          plot,
          energy: {
            time: view(0, lengthA),
            total: view(lengthA, lengthB),
            drift: view(lengthA + lengthB, lengthC)
          }
        };
        break;
      case 'lyap':
        payload = { plot, history: view(0, lengthA), value: scalar };
        break;
      case 'phase':
        payload = { plot, theta: view(0, lengthA), omega: view(lengthA, lengthB) };
        break;
      case 'poincare':
        payload = { plot, points: view(0, lengthA) };
        break;
      case 'fft':
        payload = { plot, theta1Frames: view(0, lengthA), sampleRate: scalar };
        break;
    }
    if (!isLabSidePlotPayload(payload)) throw new RangeError('side-plot shared slot contains an invalid payload');
    return payload;
  }

  private readScalar(base: number): number {
    this.scalarBits.setInt32(0, Atomics.load(this.metadata, base + SLOT_SCALAR_LOW), true);
    this.scalarBits.setInt32(4, Atomics.load(this.metadata, base + SLOT_SCALAR_HIGH), true);
    return this.scalarBits.getFloat64(0, true);
  }

  private ownsFrame(frame: LabSidePlotSharedFrame): boolean {
    return (
      Number.isSafeInteger(frame.slot) &&
      frame.slot >= 0 &&
      frame.slot < this.descriptor.capacity &&
      safeSequence(frame.sequence)
    );
  }
}

function validateDimensions(capacity: number, slotFloatCapacity: number): void {
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > MAX_LAB_SIDE_PLOT_SHARED_RING_SLOTS) {
    throw new RangeError(
      `shared side-plot ring capacity must be an integer in [1, ${MAX_LAB_SIDE_PLOT_SHARED_RING_SLOTS}]`
    );
  }
  if (
    !Number.isSafeInteger(slotFloatCapacity) ||
    slotFloatCapacity < 1 ||
    slotFloatCapacity > MAX_LAB_SIDE_PLOT_SHARED_RING_SLOT_FLOATS ||
    capacity * slotFloatCapacity > MAX_LAB_SIDE_PLOT_SHARED_RING_FLOATS
  ) {
    throw new RangeError(
      `shared side-plot slot capacity must keep total floats within ${MAX_LAB_SIDE_PLOT_SHARED_RING_FLOATS}`
    );
  }
}

function safeSequence(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_LAB_SIDE_PLOT_SHARED_SEQUENCE;
}

function validLengths(a: number, b: number, c: number, capacity: number): boolean {
  return (
    Number.isSafeInteger(a) &&
    Number.isSafeInteger(b) &&
    Number.isSafeInteger(c) &&
    a >= 0 &&
    b >= 0 &&
    c >= 0 &&
    a + b + c <= capacity
  );
}

function encodePayload(payload: LabSidePlotPayload): EncodedPayload {
  if (!isLabSidePlotPayload(payload)) throw new RangeError('side-plot payload is malformed or exceeds its work budget');
  switch (payload.plot) {
    case 'energy': {
      const { time, total, drift } = payload.energy;
      return {
        plot: payload.plot,
        lengthA: time.length,
        lengthB: total.length,
        lengthC: drift.length,
        scalar: 0,
        floatLength: time.length + total.length + drift.length,
        write: (values): void => {
          values.set(time, 0);
          values.set(total, time.length);
          values.set(drift, time.length + total.length);
        }
      };
    }
    case 'lyap':
      return {
        plot: payload.plot,
        lengthA: payload.history.length,
        lengthB: 0,
        lengthC: 0,
        scalar: payload.value,
        floatLength: payload.history.length,
        write: (values): void => values.set(payload.history)
      };
    case 'phase':
      return {
        plot: payload.plot,
        lengthA: payload.theta.length,
        lengthB: payload.omega.length,
        lengthC: 0,
        scalar: 0,
        floatLength: payload.theta.length + payload.omega.length,
        write: (values): void => {
          values.set(payload.theta, 0);
          values.set(payload.omega, payload.theta.length);
        }
      };
    case 'poincare':
      return {
        plot: payload.plot,
        lengthA: payload.points.length,
        lengthB: 0,
        lengthC: 0,
        scalar: 0,
        floatLength: payload.points.length,
        write: (values): void => values.set(payload.points)
      };
    case 'fft':
      return {
        plot: payload.plot,
        lengthA: payload.theta1Frames.length,
        lengthB: 0,
        lengthC: 0,
        scalar: payload.sampleRate,
        floatLength: payload.theta1Frames.length,
        write: (values): void => values.set(payload.theta1Frames)
      };
  }
}
