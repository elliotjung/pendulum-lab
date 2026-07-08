export interface LabRecordedFrame {
  time: number;
  state: Float64Array;
}

export class LabRecording {
  private readonly frames: LabRecordedFrame[] = [];
  private start = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    this.capacity = Math.max(1, Math.floor(capacity));
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
    const writeIndex = (this.start + this.count) % this.capacity;
    let slot = this.frames[writeIndex];
    if (!slot || slot.state.length !== state.length) {
      slot = { time, state: new Float64Array(state.length) };
      this.frames[writeIndex] = slot;
    }
    slot.time = time;
    for (let i = 0; i < state.length; i += 1) slot.state[i] = state[i] ?? 0;
    if (this.count < this.capacity) {
      this.count += 1;
    } else {
      this.start = (this.start + 1) % this.capacity;
    }
  }

  at(index: number): LabRecordedFrame | undefined {
    if (index < 0 || index >= this.count) return undefined;
    return this.frames[(this.start + index) % this.capacity];
  }

  samples(): LabRecordedFrame[] {
    const out: LabRecordedFrame[] = new Array(this.count);
    for (let i = 0; i < this.count; i += 1) out[i] = this.at(i)!;
    return out;
  }
}
