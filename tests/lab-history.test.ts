import { describe, expect, it } from 'vitest';
import { LabHistory } from '../src/app/LabHistory';
import { dominantBin, magnitudeSpectrum } from '../src/app/fft';

describe('LabHistory student angle histories', () => {
  it('keeps aligned physical-time and angle samples in a bounded ring', () => {
    const history = new LabHistory();
    for (let index = 0; index < 1_100; index += 1) {
      history.pushFrame(index * 0.01, [index, -index, 0, 0], 1, 0);
    }

    const projection = history.angleProjection();
    const timeSeries = history.angleTime();
    expect(projection.theta1).toHaveLength(1_024);
    expect(projection.theta2).toHaveLength(1_024);
    expect(timeSeries.time).toHaveLength(600);
    expect(timeSeries.theta1).toHaveLength(600);
    expect(timeSeries.theta2).toHaveLength(600);
    expect(history.angleTimeSamples).toBe(600);
    expect(projection.theta1[0]).toBe(76);
    expect(projection.theta2.at(-1)).toBe(-1_099);
    expect(timeSeries.theta1[0]).toBe(500);
    expect(timeSeries.theta2.at(-1)).toBe(-1_099);
    expect(timeSeries.time.at(-1)).toBeCloseTo(10.99, 4);
  });

  it('clears both new angle histories with the rest of a simulation rebuild', () => {
    const history = new LabHistory();
    history.pushFrame(0.1, [0.2, -0.4, 0, 0], 1, 0);
    history.clear();
    expect(history.angleProjection().theta1).toHaveLength(0);
    expect(history.angleProjection().theta2).toHaveLength(0);
    expect(history.angleTime().time).toHaveLength(0);
  });

  it('resamples variable render cadence in simulation time before FFT', () => {
    const history = new LabHistory();
    const frequency = 4;
    let time = 0;
    for (let index = 0; index < 480; index += 1) {
      const theta = Math.sin(2 * Math.PI * frequency * time);
      history.pushFrame(time, [theta, 0, 0, 0], 1, 0);
      time += [1 / 90, 1 / 43, 1 / 67, 1 / 51][index % 4]!;
    }

    const sampled = history.fft();
    expect(sampled.theta1Frames).toHaveLength(480);
    expect(sampled.sampleRate).toBeGreaterThan(55);
    expect(sampled.sampleRate).toBeLessThan(65);
    const spectrum = magnitudeSpectrum(sampled.theta1Frames, sampled.sampleRate);
    expect(spectrum.freqs[dominantBin(spectrum)]).toBeCloseTo(frequency, 0);
  });
});
