import { describe, expect, test } from 'vitest';
import {
  integratedAutocorrelationTime,
  autoBatchedStandardError,
  batchedStandardError,
  mulberry32
} from '../src/chaos/index';

/**
 * Automatic batch-length standard error: the integrated autocorrelation time
 * drives the batch size, so the decorrelated SE adapts to how fast the series
 * mixes instead of assuming a fixed block count. These tests pin the estimator
 * on series whose correlation structure is known in closed form.
 */

/** A stationary AR(1) series x_t = phi*x_{t-1} + eps, uniform innovations. */
function ar1(n: number, phi: number, seed: number): number[] {
  const rng = mulberry32(seed);
  const out: number[] = [];
  let x = 0;
  // Burn in past the x0 = 0 transient so the returned series is stationary.
  for (let i = 0; i < 200; i += 1) x = phi * x + (rng() - 0.5);
  for (let i = 0; i < n; i += 1) {
    x = phi * x + (rng() - 0.5);
    out.push(x);
  }
  return out;
}

function naiveSeOfTail(series: readonly number[]): number {
  const start = Math.floor(series.length / 2);
  const tail = series.slice(start);
  const m = tail.length;
  let mean = 0;
  for (const v of tail) mean += v;
  mean /= m;
  let variance = 0;
  for (const v of tail) variance += (v - mean) ** 2;
  variance /= m - 1;
  return Math.sqrt(variance / m);
}

describe('integratedAutocorrelationTime', () => {
  test('uncorrelated (white) series gives tau ≈ 1', () => {
    const rng = mulberry32(101);
    const series = Array.from({ length: 4000 }, () => rng() - 0.5);
    const tau = integratedAutocorrelationTime(series);
    expect(tau).toBeGreaterThanOrEqual(1);
    expect(tau).toBeLessThan(3);
  });

  test('strongly correlated AR(1) has tau well above 1 (theory: (1+phi)/(1-phi) = 9)', () => {
    const series = ar1(8000, 0.8, 202);
    const tau = integratedAutocorrelationTime(series);
    expect(tau).toBeGreaterThan(4);
    expect(tau).toBeLessThan(20);
  });

  test('degenerate inputs are safe (tau = 1)', () => {
    expect(integratedAutocorrelationTime([])).toBe(1);
    expect(integratedAutocorrelationTime([5])).toBe(1);
    expect(integratedAutocorrelationTime([3, 3, 3, 3])).toBe(1); // zero variance
  });
});

describe('autoBatchedStandardError', () => {
  test('is finite, non-negative, and reproducible (no internal RNG)', () => {
    const series = ar1(4000, 0.7, 303);
    const a = autoBatchedStandardError(series);
    const b = autoBatchedStandardError(series);
    expect(Number.isFinite(a)).toBe(true);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBe(b);
  });

  test('inflates the SE vs the naive i.i.d. estimate for correlated data', () => {
    // For positively autocorrelated data the true SE of the mean is larger than
    // the naive per-sample SE by ~sqrt(tau_int) (phi=0.85 -> tau≈12.3, ~3.5x).
    const series = ar1(8000, 0.85, 404);
    const autoSe = autoBatchedStandardError(series);
    expect(autoSe).toBeGreaterThan(1.8 * naiveSeOfTail(series));
  });

  test('stays close to the naive SE for white noise (no over-inflation)', () => {
    const rng = mulberry32(505);
    const series = Array.from({ length: 6000 }, () => rng() - 0.5);
    const autoSe = autoBatchedStandardError(series);
    const naiveSe = naiveSeOfTail(series);
    expect(autoSe).toBeGreaterThan(0.4 * naiveSe);
    expect(autoSe).toBeLessThan(2.5 * naiveSe);
  });

  test('reduces to the fixed-block estimate for short series', () => {
    const series = [1, 2, 1, 2, 1, 2];
    expect(autoBatchedStandardError(series)).toBe(batchedStandardError(series));
  });
});
