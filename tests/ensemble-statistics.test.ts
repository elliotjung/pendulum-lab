import { describe, expect, test } from 'vitest';
import { ensembleStatistics, ensembleGrid, runDoublePendulumEnsemble } from '../src/runtime/gpuEnsemble';

/**
 * Ensemble reduction (the layer a basin / uncertainty-cloud study consumes).
 * Pinned on a hand-computable two-trajectory case, cross-checked against a naive
 * two-pass covariance, and exercised on a real CPU-fallback ensemble.
 */
describe('ensembleStatistics', () => {
  test('mean, variance, covariance and dispersion on a hand-computable pair', () => {
    // Two trajectories [θ1, θ2, ω1, ω2]: deviations from the mean are ±(1,2,3,4).
    const states = Float64Array.of(0, 0, 0, 0, 2, 4, 6, 8);
    const s = ensembleStatistics(states);
    expect(s.n).toBe(2);
    expect(Array.from(s.mean)).toEqual([1, 2, 3, 4]);
    expect(Array.from(s.variance)).toEqual([1, 4, 9, 16]);
    // covariance[a][b] = dev[a]·dev[b] with dev = (1,2,3,4).
    const dev = [1, 2, 3, 4];
    for (let a = 0; a < 4; a += 1) for (let b = 0; b < 4; b += 1) expect(s.covariance[a * 4 + b]).toBeCloseTo(dev[a]! * dev[b]!, 12);
    expect(s.rmsSpread).toBeCloseTo(Math.sqrt(1 + 4 + 9 + 16), 12);
    expect(s.flipFraction).toBe(0);
  });

  test('covariance is symmetric and matches a naive two-pass computation', () => {
    const n = 50;
    const states = new Float64Array(n * 4);
    let seed = 12345;
    const rng = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff - 0.5;
    };
    for (let i = 0; i < states.length; i += 1) states[i] = rng() * 6;
    const s = ensembleStatistics(states);

    // Naive two-pass reference.
    const mean = [0, 0, 0, 0];
    for (let i = 0; i < n; i += 1) for (let a = 0; a < 4; a += 1) mean[a]! += states[i * 4 + a]! / n;
    const cov = new Array<number>(16).fill(0);
    for (let i = 0; i < n; i += 1) for (let a = 0; a < 4; a += 1) for (let b = 0; b < 4; b += 1) cov[a * 4 + b]! += ((states[i * 4 + a]! - mean[a]!) * (states[i * 4 + b]! - mean[b]!)) / n;

    for (let a = 0; a < 4; a += 1) {
      expect(s.mean[a]).toBeCloseTo(mean[a]!, 10);
      for (let b = 0; b < 4; b += 1) {
        expect(s.covariance[a * 4 + b]).toBeCloseTo(cov[a * 4 + b]!, 10);
        expect(s.covariance[a * 4 + b]).toBeCloseTo(s.covariance[b * 4 + a]!, 12); // symmetric
      }
    }
  });

  test('flipFraction counts trajectories wound past the upright (|θ1| > π)', () => {
    const states = Float64Array.of(3.5, 0, 0, 0, -4.0, 0, 0, 0, 1.0, 0, 0, 0, 0.5, 0, 0, 0);
    expect(ensembleStatistics(states).flipFraction).toBe(0.5); // 2 of 4 have |θ1| > π
  });

  test('empty ensemble is handled', () => {
    const s = ensembleStatistics(new Float64Array(0));
    expect(s.n).toBe(0);
    expect(s.flipFraction).toBe(0);
    expect(s.rmsSpread).toBe(0);
  });

  test('reduces a real CPU-fallback ensemble to finite, consistent statistics', async () => {
    const result = await runDoublePendulumEnsemble({ m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 }, ensembleGrid(6, [-2, 2]), { steps: 300, dt: 0.01 });
    const s = ensembleStatistics(result.states);
    expect(s.n).toBe(36);
    expect(Array.from(s.mean).every(Number.isFinite)).toBe(true);
    for (let a = 0; a < 4; a += 1) expect(s.variance[a]).toBeGreaterThanOrEqual(0);
    expect(s.rmsSpread).toBeCloseTo(Math.sqrt(Array.from(s.variance).reduce((acc, v) => acc + v, 0)), 12);
    expect(s.flipFraction).toBeGreaterThanOrEqual(0);
    expect(s.flipFraction).toBeLessThanOrEqual(1);
  });
});
