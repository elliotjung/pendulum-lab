import { describe, expect, test } from 'vitest';
import {
  zeroOneTest,
  basinEntropy,
  boxCountingDimension,
  rqaBlockUncertainty,
  mulberry32,
  type LabelGrid
} from '../src/chaos/index';

/**
 * Uncertainty quantification across the non-variational diagnostics: every
 * headline number (0–1 K, RQA measures, basin entropy, box-counting dimension)
 * now carries an error estimate. These tests pin the estimators' structural
 * properties on signals where the truth is known.
 */

function makeGrid(width: number, height: number, fill: (x: number, y: number) => number): LabelGrid {
  const labels = new Int32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) labels[y * width + x] = fill(x, y);
  }
  return { labels, width, height };
}

describe('0–1 test bootstrap uncertainty', () => {
  test('periodic signal: tight CI around K ≈ 0 and the CI brackets K', () => {
    const series = Array.from({ length: 2000 }, (_, j) => Math.sin(0.4 * j) + 0.5 * Math.cos(0.13 * j));
    const r = zeroOneTest(series);
    expect(r.kStdError).toBeGreaterThanOrEqual(0);
    expect(r.kStdError).toBeLessThan(0.15);
    expect(r.kCi95[0]).toBeLessThanOrEqual(r.K + 1e-12);
    expect(r.kCi95[1]).toBeGreaterThanOrEqual(r.K - 1e-12);
  });

  test('white noise: K ≈ 1 with a tight CI (many concordant frequencies)', () => {
    const rng = mulberry32(12345);
    const series = Array.from({ length: 2000 }, () => rng() - 0.5);
    const r = zeroOneTest(series);
    expect(r.K).toBeGreaterThan(0.8);
    expect(r.kCi95[1] - r.kCi95[0]).toBeLessThan(0.2);
  });

  test('uncertainty is reproducible for a fixed seed', () => {
    const series = Array.from({ length: 1500 }, (_, j) => Math.sin(0.4 * j));
    const a = zeroOneTest(series, { seed: 7 });
    const b = zeroOneTest(series, { seed: 7 });
    expect(a.kStdError).toBe(b.kStdError);
    expect(a.kCi95).toEqual(b.kCi95);
  });
});

describe('basin entropy SEM', () => {
  test('a uniform grid has zero entropy and zero SEM', () => {
    const grid = makeGrid(20, 20, () => 1);
    const r = basinEntropy(grid, 5);
    expect(r.basinEntropy).toBe(0);
    expect(r.basinEntropyStdError).toBe(0);
  });

  test('a mixed grid reports a positive, sub-mean SEM', () => {
    // Half the boxes are pure, half straddle the boundary: box entropies vary.
    const grid = makeGrid(20, 20, (x) => (x < 7 ? 0 : 1));
    const r = basinEntropy(grid, 5);
    expect(r.basinEntropyStdError).toBeGreaterThan(0);
    expect(r.basinEntropyStdError).toBeLessThan(r.basinEntropy);
    expect(r.boundaryBasinEntropyStdError).toBeGreaterThanOrEqual(0);
  });
});

describe('box-counting regression diagnostics', () => {
  test('a filled plane scales perfectly: R² ≈ 1, tiny slope SE, CI brackets d ≈ 2', () => {
    const size = 64;
    const mask = new Uint8Array(size * size).fill(1);
    const r = boxCountingDimension(mask, size, size);
    expect(r.r2).toBeGreaterThan(0.999);
    expect(r.stdError).toBeLessThan(0.05);
    expect(r.ci95[0]).toBeLessThanOrEqual(r.dimension);
    expect(r.ci95[1]).toBeGreaterThanOrEqual(r.dimension);
    expect(r.ci95[0]).toBeGreaterThan(1.8);
  });

  test('a straight line also fits cleanly with d ≈ 1 inside the CI', () => {
    const size = 64;
    const mask = new Uint8Array(size * size);
    for (let x = 0; x < size; x += 1) mask[32 * size + x] = 1;
    const r = boxCountingDimension(mask, size, size);
    expect(r.ci95[0]).toBeLessThanOrEqual(1);
    expect(r.ci95[1]).toBeGreaterThanOrEqual(1);
    expect(r.r2).toBeGreaterThan(0.99);
  });
});

describe('RQA block uncertainty', () => {
  test('a stationary sine gives consistent per-block DET (small SE, high mean)', () => {
    const series = Array.from({ length: 1200 }, (_, j) => Math.sin(0.3 * j));
    const u = rqaBlockUncertainty(series, { dimension: 2, delay: 5, targetRecurrenceRate: 0.1 }, 4);
    expect(u.blocks).toBe(4);
    expect(u.blockResults).toHaveLength(4);
    expect(u.determinism.mean).toBeGreaterThan(0.9);
    expect(u.determinism.stdError).toBeLessThan(0.05);
    expect(u.divergence.stdError).toBeGreaterThanOrEqual(0);
  });

  test('all summarized measures are finite and non-negative SEs', () => {
    const rng = mulberry32(42);
    const series = Array.from({ length: 800 }, () => rng() - 0.5);
    const u = rqaBlockUncertainty(series, { dimension: 2, delay: 3, targetRecurrenceRate: 0.1 }, 4);
    for (const m of [u.determinism, u.laminarity, u.divergence, u.entropy, u.trappingTime, u.recurrenceRate]) {
      expect(Number.isFinite(m.mean)).toBe(true);
      expect(m.stdError).toBeGreaterThanOrEqual(0);
    }
  });
});
