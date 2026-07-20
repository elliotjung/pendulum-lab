export interface LabRecordedFrame {
  time: number;
  state: Float64Array;
}

const MAX_RECORDING_CAPACITY = 1_000_000;
const MAX_RECORDED_DIMENSION = 256;

export class LabRecording {
  private readonly frames: LabRecordedFrame[] = [];
  private start = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > MAX_RECORDING_CAPACITY) {
      throw new RangeError(`recording capacity must be a safe integer in [1, ${MAX_RECORDING_CAPACITY}]`);
    }
  }

  get length(): number {
    return this.count;
  }

  clear(): void {
    this.frames.length = 0;
    this.start = 0;
    this.count = 0;
  }

  push(time: number, state: ArrayLike<number>): void {
    if (!Number.isFinite(time) || time < 0) throw new RangeError('recording time must be finite and non-negative');
    if (!Number.isSafeInteger(state.length) || state.length < 1 || state.length > MAX_RECORDED_DIMENSION) {
      throw new RangeError(`recorded state length must be a safe integer in [1, ${MAX_RECORDED_DIMENSION}]`);
    }
    const nextState = new Float64Array(state.length);
    for (let i = 0; i < state.length; i += 1) {
      if (!Object.hasOwn(state, i) || !Number.isFinite(state[i])) {
        throw new RangeError(`recorded state must be dense and finite at index ${i}`);
      }
      nextState[i] = state[i] as number;
    }
    const writeIndex = (this.start + this.count) % this.capacity;
    let slot = this.frames[writeIndex];
    if (!slot || slot.state.length !== state.length) {
      slot = { time, state: new Float64Array(state.length) };
      this.frames[writeIndex] = slot;
    }
    slot.time = time;
    slot.state.set(nextState);
    if (this.count < this.capacity) {
      this.count += 1;
    } else {
      this.start = (this.start + 1) % this.capacity;
    }
  }

  at(index: number): LabRecordedFrame | undefined {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.count) return undefined;
    const frame = this.frames[(this.start + index) % this.capacity];
    return frame ? { time: frame.time, state: frame.state.slice() } : undefined;
  }

  samples(): LabRecordedFrame[] {
    const out: LabRecordedFrame[] = new Array(this.count);
    for (let i = 0; i < this.count; i += 1) out[i] = this.at(i)!;
    return out;
  }
}
