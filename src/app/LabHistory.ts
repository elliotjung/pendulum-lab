interface EnergyPayload {
  time: Float32Array;
  total: Float32Array;
  drift: Float32Array;
}

interface PhasePayload {
  theta: Float32Array;
  omega: Float32Array;
}

class NumericRing {
  private readonly values: Float64Array;
  private next = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError('numeric ring capacity must be positive');
    this.values = new Float64Array(capacity);
  }

  get length(): number {
    return this.count;
  }

  push(value: number): void {
    if (!Number.isFinite(value)) throw new RangeError('numeric ring values must be finite');
    this.values[this.next] = value;
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
  }

  clear(): void {
    this.next = 0;
    this.count = 0;
  }

  toFloat32(): Float32Array {
    const out = new Float32Array(this.count);
    const start = this.count === this.capacity ? this.next : 0;
    for (let i = 0; i < this.count; i += 1) out[i] = this.values[(start + i) % this.capacity]!;
    return out;
  }
}

/** Fixed-capacity typed histories for the high-frequency Lab render path. */
export class LabHistory {
  private readonly theta1 = new NumericRing(1024);
  private readonly energyTime = new NumericRing(600);
  private readonly energyTotal = new NumericRing(600);
  private readonly energyDrift = new NumericRing(600);
  private readonly phaseTheta1 = new NumericRing(800);
  private readonly phaseOmega1 = new NumericRing(800);
  private readonly phaseTheta2 = new NumericRing(800);
  private readonly phaseOmega2 = new NumericRing(800);

  clear(): void {
    this.theta1.clear();
    this.energyTime.clear();
    this.energyTotal.clear();
    this.energyDrift.clear();
    this.phaseTheta1.clear();
    this.phaseOmega1.clear();
    this.phaseTheta2.clear();
    this.phaseOmega2.clear();
  }

  pushStep(state: ArrayLike<number>, w1Index: number, w2Index: number): void {
    this.phaseTheta1.push(state[0] ?? 0);
    this.phaseOmega1.push(state[w1Index] ?? 0);
    this.phaseTheta2.push(state[1] ?? 0);
    this.phaseOmega2.push(state[w2Index] ?? 0);
  }

  pushFrame(time: number, state: ArrayLike<number>, energy: number, drift: number): void {
    this.theta1.push(state[0] ?? 0);
    this.energyTime.push(time);
    this.energyTotal.push(energy);
    this.energyDrift.push(drift);
  }

  energy(): EnergyPayload {
    return {
      time: this.energyTime.toFloat32(),
      total: this.energyTotal.toFloat32(),
      drift: this.energyDrift.toFloat32()
    };
  }

  phase(axis: string): PhasePayload {
    return axis === '2'
      ? { theta: this.phaseTheta2.toFloat32(), omega: this.phaseOmega2.toFloat32() }
      : { theta: this.phaseTheta1.toFloat32(), omega: this.phaseOmega1.toFloat32() };
  }

  thetaFrames(): Float32Array {
    return this.theta1.toFloat32();
  }

  get phasePoints(): number {
    return this.phaseTheta1.length;
  }

  get spectrumSamples(): number {
    return this.theta1.length;
  }
}
