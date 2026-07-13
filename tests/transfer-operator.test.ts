import { describe, expect, it } from 'vitest';
import {
  invariantMeasure,
  transferOperatorInvariantDensity,
  ulamTransitionMatrix1D
} from '../src/chaos/transferOperator';

describe('Ulam transition matrix', () => {
  it('is row-stochastic and reduces to the identity for the identity map', () => {
    const ulam = ulamTransitionMatrix1D((x) => x, [0, 1], 5, 20);
    for (let i = 0; i < 5; i += 1) {
      let row = 0;
      for (let j = 0; j < 5; j += 1) {
        row += ulam.transition[i * 5 + j]!;
        // every sample stays in its own box ⇒ P = I.
        expect(ulam.transition[i * 5 + j]!).toBeCloseTo(i === j ? 1 : 0, 12);
      }
      expect(row).toBeCloseTo(1, 12);
    }
  });

  it('rejects invalid arguments', () => {
    expect(() => ulamTransitionMatrix1D((x) => x, [0, 1], 1)).toThrow(/boxes/);
    expect(() => ulamTransitionMatrix1D((x) => x, [0, 1], 4, 0)).toThrow(/samplesPerBox/);
    expect(() => ulamTransitionMatrix1D((x) => x, [1, 0], 4)).toThrow(/b > a/);
  });
});

describe('transfer operator — invariant measure vs closed forms', () => {
  it('recovers the uniform (Lebesgue) measure of the doubling map', () => {
    const boxes = 64;
    const r = transferOperatorInvariantDensity((x) => (2 * x) % 1, [0, 1], boxes, 40);
    const target = 1 / boxes;
    let maxDev = 0;
    let sum = 0;
    for (const m of r.measure) {
      maxDev = Math.max(maxDev, Math.abs(m - target));
      sum += m;
    }
    expect(sum).toBeCloseTo(1, 9);
    expect(maxDev).toBeLessThan(1e-9); // exactly uniform (doubly stochastic)
  });

  it('recovers the arcsine density of the logistic map x↦4x(1−x)', () => {
    const boxes = 200;
    const r = transferOperatorInvariantDensity((x) => 4 * x * (1 - x), [0, 1], boxes, 60);
    // CDF of the invariant measure: F(x) = (2/π)·arcsin(√x).
    const F = (x: number): number => (2 / Math.PI) * Math.asin(Math.sqrt(Math.min(Math.max(x, 0), 1)));
    const w = 1 / boxes;
    let l1 = 0;
    let sum = 0;
    let minMeasure = Infinity;
    for (let i = 0; i < boxes; i += 1) {
      const analytic = F((i + 1) * w) - F(i * w);
      l1 += Math.abs((r.measure[i] ?? 0) - analytic);
      sum += r.measure[i] ?? 0;
      minMeasure = Math.min(minMeasure, r.measure[i] ?? 0);
    }
    expect(sum).toBeCloseTo(1, 9);
    expect(minMeasure).toBeGreaterThanOrEqual(0); // a measure is non-negative
    expect(l1).toBeLessThan(0.15); // total-variation distance (finite-box Ulam error)
    // Interior density matches the closed form 1/(π√(x(1−x))).
    const mid = Math.floor(boxes / 2);
    const xc = r.boxCenters[mid]!;
    const rhoAnalytic = 1 / (Math.PI * Math.sqrt(xc * (1 - xc)));
    expect(Math.abs(r.density[mid]! - rhoAnalytic) / rhoAnalytic).toBeLessThan(0.12);
    // Characteristic U-shape: density piles up at the edges.
    expect(r.density[0]!).toBeGreaterThan(2 * r.density[mid]!);
  });

  it('returns a stationary, normalised measure (μP = μ)', () => {
    const boxes = 64;
    const ulam = ulamTransitionMatrix1D((x) => (2 * x) % 1, [0, 1], boxes, 40);
    const mu = invariantMeasure(ulam.transition, boxes);
    const next = new Array<number>(boxes).fill(0);
    for (let i = 0; i < boxes; i += 1) {
      for (let j = 0; j < boxes; j += 1) next[j] = (next[j] ?? 0) + mu[i]! * ulam.transition[i * boxes + j]!;
    }
    let resid = 0;
    let sum = 0;
    for (let j = 0; j < boxes; j += 1) {
      resid = Math.max(resid, Math.abs((next[j] ?? 0) - mu[j]!));
      sum += mu[j]!;
    }
    expect(sum).toBeCloseTo(1, 9);
    expect(resid).toBeLessThan(1e-9);
  });
});
