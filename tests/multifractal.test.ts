import { describe, expect, test } from 'vitest';
import {
  renyiDimensions,
  generalizedDimensions,
  binomialCascadeScales,
  singularitySpectrum
} from '../src/chaos/multifractal';

/**
 * Multifractal generalized dimensions D_q and the f(α) spectrum. The rigorous
 * benchmark is the binomial multiplicative cascade, whose D_q has the closed
 * form log₂(p^q+(1-p)^q)/(1-q); the point-cloud front-end is checked on a
 * uniform (monofractal) set where every D_q equals the embedding dimension.
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

const closedDq = (p: number, q: number): number =>
  Math.abs(q - 1) < 1e-9
    ? -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p))
    : Math.log2(Math.pow(p, q) + Math.pow(1 - p, q)) / (1 - q);

describe('binomial cascade (analytic benchmark)', () => {
  test('D_q matches the closed form log₂(p^q+(1-p)^q)/(1-q)', () => {
    const p = 0.7;
    const qs = [0, 1, 2, 3, 4];
    const result = renyiDimensions(binomialCascadeScales(p, [4, 5, 6, 7, 8, 9]), qs);
    for (let i = 0; i < qs.length; i += 1) {
      expect(result.Dq[i]).toBeCloseTo(closedDq(p, qs[i]!), 6);
      expect(result.rSquared[i]).toBeGreaterThan(0.999);
    }
  });

  test('D_q is non-increasing in q (a true multifractal)', () => {
    const result = renyiDimensions(binomialCascadeScales(0.65, [4, 5, 6, 7, 8]), [0, 1, 2, 3, 4, 5]);
    for (let i = 1; i < result.Dq.length; i += 1) {
      expect(result.Dq[i]).toBeLessThanOrEqual(result.Dq[i - 1]! + 1e-9);
    }
    // D_0 is the support dimension (= 1 for the [0,1] cascade).
    expect(result.Dq[0]).toBeCloseTo(1, 9);
  });

  test('f(α) singularity spectrum peaks at D_0', () => {
    const result = renyiDimensions(binomialCascadeScales(0.7, [4, 5, 6, 7, 8, 9]), [-2, -1, 0, 1, 2, 3, 4]);
    const spec = singularitySpectrum(result);
    expect(Math.max(...spec.f)).toBeCloseTo(1, 2); // max f(α) = D_0 = 1
    for (const fv of spec.f) expect(fv).toBeLessThan(1 + 1e-6); // f(α) ≤ D_0
  });
});

describe('point-cloud generalized dimensions', () => {
  test('uniform 2-D set is monofractal with D_q ≈ 2 for all q', () => {
    const rng = mulberry32(5);
    const pts = Array.from({ length: 3000 }, () => [rng(), rng()]);
    const result = generalizedDimensions(pts, { qs: [0, 2, 4] });
    for (const d of result.Dq) {
      expect(d).toBeGreaterThan(1.8);
      expect(d).toBeLessThan(2.2);
    }
    // Flat spectrum: D_0 and D_4 nearly equal (monofractal).
    expect(Math.abs(result.Dq[0]! - result.Dq[2]!)).toBeLessThan(0.2);
  });

  test('rejects degenerate input', () => {
    expect(() => renyiDimensions([{ epsilon: 0.5, probabilities: [1] }], [2])).toThrow(/2 scales/);
    expect(() => binomialCascadeScales(0, [3])).toThrow();
  });
});
