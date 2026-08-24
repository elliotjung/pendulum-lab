interface EnergyPayload {
  time: Float32Array;
  total: Float32Array;
  drift: Float32Array;
}

interface PhasePayload {
  theta: Float32Array;
  omega: Float32Array;
}

export interface AngleProjectionPayload {
  theta1: Float32Array;
  theta2: Float32Array;
}

export interface AngleTimePayload extends AngleProjectionPayload {
  time: Float32Array;
}

export interface FftHistoryPayload {
  theta1Frames: Float32Array;
  /** Samples per unit of simulation time, never wall/render time. */
  sampleRate: number;
}

/**
 * Linearly resample irregular observations onto a bounded, uniform
 * simulation-time grid so FFT bins retain physical Hz under variable rAF
 * cadence, speed multipliers, and catch-up steps.
 */
export function uniformSimulationSeries(
  times: ArrayLike<number>,
  values: ArrayLike<number>,
  maxSamples = 1024
): FftHistoryPayload {
  if (!Number.isSafeInteger(maxSamples) || maxSamples < 2) throw new RangeError('maxSamples must be an integer >= 2');
  const count = Math.min(times.length, values.length, maxSamples);
  if (count < 2) return { theta1Frames: new Float32Array(), sampleRate: 1 };
  const timeOffset = times.length - count;
  const valueOffset = values.length - count;
  const firstTime = Number(times[timeOffset]);
  const lastTime = Number(times[timeOffset + count - 1]);
  if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime) || lastTime <= firstTime) {
    return { theta1Frames: new Float32Array(), sampleRate: 1 };
  }
  for (let index = 0; index < count; index += 1) {
    if (!Number.isFinite(Number(values[valueOffset + index]))) {
      return { theta1Frames: new Float32Array(), sampleRate: 1 };
    }
    if (index > 0 && Number(times[timeOffset + index]) <= Number(times[timeOffset + index - 1])) {
      return { theta1Frames: new Float32Array(), sampleRate: 1 };
    }
  }

  const interval = (lastTime - firstTime) / (count - 1);
  const output = new Float32Array(count);
  let sourceIndex = 0;
  for (let index = 0; index < count; index += 1) {
    const targetTime = index === count - 1 ? lastTime : firstTime + interval * index;
    while (sourceIndex + 1 < count - 1 && Number(times[timeOffset + sourceIndex + 1]) < targetTime) {
      sourceIndex += 1;
    }
    const leftTime = Number(times[timeOffset + sourceIndex]);
    const rightTime = Number(times[timeOffset + sourceIndex + 1]);
    const left = Number(values[valueOffset + sourceIndex]);
    const right = Number(values[valueOffset + sourceIndex + 1]);
    const alpha = Math.max(0, Math.min(1, (targetTime - leftTime) / (rightTime - leftTime)));
    output[index] = left + (right - left) * alpha;
  }
  return { theta1Frames: output, sampleRate: 1 / interval };
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

  toFloat32(limit = this.count): Float32Array {
    const outputCount = Math.min(this.count, Math.max(0, Math.floor(limit)));
    const out = new Float32Array(outputCount);
    const oldest = this.count === this.capacity ? this.next : 0;
    const start = (oldest + (this.count - outputCount)) % this.capacity;
    for (let i = 0; i < outputCount; i += 1) out[i] = this.values[(start + i) % this.capacity]!;
    return out;
  }

  toFloat64(limit = this.count): Float64Array {
    const outputCount = Math.min(this.count, Math.max(0, Math.floor(limit)));
    const out = new Float64Array(outputCount);
    const oldest = this.count === this.capacity ? this.next : 0;
    const start = (oldest + (this.count - outputCount)) % this.capacity;
    for (let i = 0; i < outputCount; i += 1) out[i] = this.values[(start + i) % this.capacity]!;
    return out;
  }
}

/** Fixed-capacity typed histories for the high-frequency Lab render path. */
export class LabHistory {
  private readonly theta1 = new NumericRing(1024);
  private readonly theta2 = new NumericRing(1024);
  private readonly fftTime = new NumericRing(1024);
  private readonly energyTime = new NumericRing(600);
  private readonly energyTotal = new NumericRing(600);
  private readonly energyDrift = new NumericRing(600);
  private readonly phaseTheta1 = new NumericRing(800);
  private readonly phaseOmega1 = new NumericRing(800);
  private readonly phaseTheta2 = new NumericRing(800);
  private readonly phaseOmega2 = new NumericRing(800);

  clear(): void {
    this.theta1.clear();
    this.theta2.clear();
    this.fftTime.clear();
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
    this.theta2.push(state[1] ?? 0);
    this.fftTime.push(time);
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

  fft(): FftHistoryPayload {
    return uniformSimulationSeries(this.fftTime.toFloat64(), this.theta1.toFloat64());
  }

  /** Bounded configuration-space history sampled once per rendered physics frame. */
  angleProjection(): AngleProjectionPayload {
    return { theta1: this.theta1.toFloat32(), theta2: this.theta2.toFloat32() };
  }

  /** Bounded time history sharing the energy plot's physical-time sampling. */
  angleTime(): AngleTimePayload {
    const sampleCount = this.energyTime.length;
    return {
      time: this.energyTime.toFloat32(),
      theta1: this.theta1.toFloat32(sampleCount),
      theta2: this.theta2.toFloat32(sampleCount)
    };
  }

  get phasePoints(): number {
    return this.phaseTheta1.length;
  }

  get spectrumSamples(): number {
    return this.theta1.length;
  }

  get angleTimeSamples(): number {
    return this.energyTime.length;
  }
}
