import { describe, expect, it } from 'vitest';
import { magnitudeSpectrum, dominantBin, nextPow2, fftInPlace } from '../src/app/fft';
import { PoincareAccumulator } from '../src/app/PoincareAccumulator';
import { LyapunovEstimator } from '../src/app/LyapunovEstimator';
import { rhsDouble } from '../src/physics/double';
import { rk4Step } from '../src/physics/integrators';

describe('fft', () => {
  it('rounds up to the next power of two', () => {
    expect(nextPow2(1)).toBe(1);
    expect(nextPow2(5)).toBe(8);
    expect(nextPow2(1024)).toBe(1024);
    expect(nextPow2(1025)).toBe(2048);
  });

  it('transforms a unit impulse to a flat spectrum', () => {
    const re = new Float64Array([1, 0, 0, 0]);
    const im = new Float64Array(4);
    fftInPlace(re, im);
    for (let i = 0; i < 4; i += 1) {
      expect(re[i]).toBeCloseTo(1, 12);
      expect(im[i]).toBeCloseTo(0, 12);
    }
  });

  it('peaks at the bin matching a pure sinusoid frequency', () => {
    const sampleRate = 64; // Hz
    const freq = 8; // Hz
    const n = 256;
    const signal = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * freq * i) / sampleRate));
    const spectrum = magnitudeSpectrum(signal, sampleRate, false);
    const peak = dominantBin(spectrum);
    expect(spectrum.freqs[peak]).toBeCloseTo(freq, 0);
  });

  it('returns empty spectra for degenerate input', () => {
    expect(magnitudeSpectrum([], 10)).toEqual({ freqs: [], mags: [] });
    expect(magnitudeSpectrum([1], 10)).toEqual({ freqs: [], mags: [] });
  });
});

describe('PoincareAccumulator', () => {
  it('records a rising θ1=0 crossing with interpolated (θ2, ω2)', () => {
    const acc = new PoincareAccumulator();
    // θ1 goes from -0.1 to +0.1 (rising), ω1 > 0. θ2 interpolates 1.0→2.0 at the
    // midpoint crossing → 1.5; ω2 interpolates 3.0→5.0 → 4.0.
    expect(acc.push([-0.1, 1.0, 0.5, 3.0])).toBeNull(); // first sample, no prev
    const point = acc.push([0.1, 2.0, 0.5, 5.0]);
    expect(point).not.toBeNull();
    expect(point!.x).toBeCloseTo(1.5, 9);
    expect(point!.y).toBeCloseTo(4.0, 9);
    expect(acc.size).toBe(1);
  });

  it('uses the angle-first triple-pendulum layout for crossing direction and ω2', () => {
    const acc = new PoincareAccumulator();
    // [θ1, θ2, θ3, ω1, ω2, ω3]; θ3 is deliberately negative so treating it
    // as ω1 would incorrectly discard this valid rising crossing.
    expect(acc.push([-0.1, 1, -9, 2, 3, 4])).toBeNull();
    const point = acc.push([0.1, 2, -8, 2, 5, 6]);
    expect(point).toEqual({ x: 1.5, y: 4 });
  });

  it('rejects malformed odd-dimensional states without retaining a stale bracket', () => {
    const acc = new PoincareAccumulator();
    acc.push([-0.1, 1, 1, 3]);
    expect(acc.push([0.1, 2, 1])).toBeNull();
    expect(acc.push([0.1, 2, 1, 5])).toBeNull();
    expect(acc.size).toBe(0);
  });

  it('ignores falling crossings and θ̇1 ≤ 0', () => {
    const acc = new PoincareAccumulator();
    acc.push([0.1, 1.0, -0.5, 0]); // descending region
    expect(acc.push([-0.1, 2.0, -0.5, 0])).toBeNull(); // falling crossing
    acc.clear();
    acc.push([-0.1, 1.0, -0.5, 0]);
    expect(acc.push([0.1, 2.0, -0.5, 0])).toBeNull(); // rising position but ω1<0
  });

  it('records equivalent 2π section crossings for rotating trajectories', () => {
    const acc = new PoincareAccumulator();
    acc.push([Math.PI * 2 - 0.1, 1, 2, 3]);
    const point = acc.push([Math.PI * 2 + 0.1, 2, 2, 5]);
    expect(point).toEqual({ x: 1.5, y: 4 });
  });

  it('caps the number of stored points', () => {
    const acc = new PoincareAccumulator(2);
    for (let k = 0; k < 5; k += 1) {
      acc.push([-0.1, k, 1, 0]);
      acc.push([0.1, k, 1, 0]);
    }
    expect(acc.size).toBe(2);
  });
});

describe('LyapunovEstimator', () => {
  const params = { m1: 1, m2: 1, l1: 1.2, l2: 1.0, g: 9.81 };
  const rhs = (s: Float64Array, o: Float64Array) => rhsDouble(s, params, 0, o);

  it('estimates a positive maximal exponent for a chaotic double pendulum', () => {
    const est = new LyapunovEstimator(rhs, 4, 0.01, 1e-8, 10);
    const reference = new Float64Array([2.0, 2.5, 0, 0]);
    const out = new Float64Array(4);
    est.reset(reference);
    // Drive a reference trajectory and feed the estimator each step.
    for (let i = 0; i < 6000; i += 1) {
      rk4Step(reference, 0.01, rhs, out);
      reference.set(out);
      est.step(reference);
    }
    expect(est.value()).toBeGreaterThan(0.1);
    expect(est.history().length).toBeGreaterThan(10);
  });

  it.each([
    [0, 0.01, 1e-8, 10, /dimension/],
    [4, 0, 1e-8, 10, /dt/],
    [4, 0.01, 0, 10, /d0/],
    [4, 0.01, 1e-8, 0, /renormEvery/]
  ])('rejects malformed estimator settings', (dim, dt, d0, renormEvery, expected) => {
    expect(() => new LyapunovEstimator(rhs, dim, dt, d0, renormEvery)).toThrow(expected as RegExp);
  });

  it('rejects malformed references without contaminating history', () => {
    const est = new LyapunovEstimator(rhs, 4, 0.01);
    expect(() => est.reset([0, 0, 0])).toThrow(/exactly 4/);
    expect(() => est.step([0, 0, Number.NaN, 0])).toThrow(/dense and finite/);
    expect(est.history()).toHaveLength(0);
    expect(est.value()).toBe(0);
  });
});
