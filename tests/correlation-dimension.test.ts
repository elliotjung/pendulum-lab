import { describe, expect, test } from 'vitest';
import {
  correlationDimension,
  correlationSum,
  delayEmbed
} from '../src/chaos/correlationDimension';

/**
 * Grassberger–Procaccia correlation dimension. Pinned on point sets of known
 * dimension (a line, a filled square, a circle) and on the Hénon strange
 * attractor, whose correlation dimension D₂ ≈ 1.22 is a canonical GP benchmark.
 * Tolerances are set from the finite-sample behaviour at the sample sizes used.
 */

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('delayEmbed and correlationSum', () => {
  test('delay embedding has the right shape and values', () => {
    const embedded = delayEmbed([0, 1, 2, 3, 4], 3, 1);
    expect(embedded).toEqual([
      [0, 1, 2],
      [1, 2, 3],
      [2, 3, 4]
    ]);
    expect(() => delayEmbed([0, 1], 5)).toThrow();
  });

  test('correlation sum is monotone in r and saturates to 1', () => {
    const rng = mulberry32(7);
    const pts = Array.from({ length: 200 }, () => [rng(), rng()]);
    expect(correlationSum(pts, 0)).toBe(0);
    expect(correlationSum(pts, 0.1)).toBeLessThan(correlationSum(pts, 0.5));
    expect(correlationSum(pts, 100)).toBeCloseTo(1, 12);
  });
});

describe('correlation dimension on sets of known dimension', () => {
  test('uniform points on a line have D₂ ≈ 1', () => {
    const rng = mulberry32(1);
    const pts = Array.from({ length: 1000 }, () => [rng()]);
    const { dimension, rSquared } = correlationDimension(pts);
    expect(dimension).toBeGreaterThan(0.9);
    expect(dimension).toBeLessThan(1.1);
    expect(rSquared).toBeGreaterThan(0.99);
  });

  test('uniform points filling a square have D₂ ≈ 2', () => {
    const rng = mulberry32(2);
    const pts = Array.from({ length: 1000 }, () => [rng(), rng()]);
    const { dimension } = correlationDimension(pts);
    expect(dimension).toBeGreaterThan(1.8);
    expect(dimension).toBeLessThan(2.15);
  });

  test('points on a circle (1-D manifold in 2-D) have D₂ ≈ 1', () => {
    const rng = mulberry32(3);
    const pts = Array.from({ length: 1000 }, () => {
      const theta = 2 * Math.PI * rng();
      return [Math.cos(theta), Math.sin(theta)];
    });
    const { dimension } = correlationDimension(pts);
    expect(dimension).toBeGreaterThan(0.9);
    expect(dimension).toBeLessThan(1.1);
  });

  test('Hénon strange attractor has D₂ ≈ 1.22 (canonical GP benchmark)', () => {
    let x = 0.1;
    let y = 0.1;
    for (let i = 0; i < 1000; i += 1) {
      const xn = 1 - 1.4 * x * x + y; // burn-in onto the attractor
      y = 0.3 * x;
      x = xn;
    }
    const pts: number[][] = [];
    for (let i = 0; i < 2500; i += 1) {
      const xn = 1 - 1.4 * x * x + y;
      y = 0.3 * x;
      x = xn;
      pts.push([x, y]);
    }
    const { dimension, rSquared } = correlationDimension(pts, { theilerWindow: 1 });
    expect(dimension).toBeGreaterThan(1.05);
    expect(dimension).toBeLessThan(1.3);
    expect(rSquared).toBeGreaterThan(0.99);
  });
});
