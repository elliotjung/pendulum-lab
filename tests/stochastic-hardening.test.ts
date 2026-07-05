import { describe, expect, test } from 'vitest';
import {
  buildBrownianGrid,
  eulerMaruyamaStep,
  gaussianSampler,
  milsteinStep
} from '../src/physics/stochastic';

/**
 * Mutation hardening for the stochastic core: seed reproducibility, Brownian
 * grid shape invariants, and the strong-order separation between
 * Euler-Maruyama and Milstein against the EXACT geometric-Brownian-motion
 * solution on a frozen dyadic path.
 *
 * Measured (2026-07-05 probe, mu=0.6 sigma=0.9 T=1, 8 seeds, levels 4-7):
 * - EM RMS errors 4.70e-1 .. 8.77e-2 (slope 0.713);
 * - Milstein RMS errors 1.42e-1 .. 2.25e-2 (slope 0.900);
 * - finest-level error ratio EM/Milstein = 3.9.
 */

describe('seed reproducibility', () => {
  test('gaussianSampler: identical seeds replay, different seeds diverge', () => {
    const a = gaussianSampler(1234);
    const b = gaussianSampler(1234);
    const c = gaussianSampler(4321);
    const seqA = Array.from({ length: 32 }, () => a());
    const seqB = Array.from({ length: 32 }, () => b());
    const seqC = Array.from({ length: 32 }, () => c());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    // Basic law sanity: mean near 0, spread near 1 for a longer run.
    const long = gaussianSampler(77);
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < 20000; i += 1) {
      const x = long();
      sum += x;
      sumSq += x * x;
    }
    expect(Math.abs(sum / 20000)).toBeLessThan(0.03);
    expect(sumSq / 20000).toBeGreaterThan(0.94);
    expect(sumSq / 20000).toBeLessThan(1.06);
  });

  test('buildBrownianGrid: same seed gives the identical path, different seed does not', () => {
    const a = buildBrownianGrid(2, 8, 2, 5);
    const b = buildBrownianGrid(2, 8, 2, 5);
    const c = buildBrownianGrid(2, 8, 2, 6);
    let identical = true;
    let differs = false;
    for (let i = 0; i < a.steps; i += 1) {
      for (let d = 0; d < 2; d += 1) {
        if (a.increment(i, i + 1, d) !== b.increment(i, i + 1, d)) identical = false;
        if (a.increment(i, i + 1, d) !== c.increment(i, i + 1, d)) differs = true;
      }
    }
    expect(identical).toBe(true);
    expect(differs).toBe(true);
  });
});

describe('Brownian grid shape invariants', () => {
  test('dyadic layout: steps = 2^levels, dt * steps = totalTime', () => {
    const grid = buildBrownianGrid(3, 9, 3, 11);
    expect(grid.steps).toBe(2 ** 9);
    expect(grid.dimension).toBe(3);
    expect(grid.totalTime).toBe(3);
    expect(grid.dt * grid.steps).toBeCloseTo(3, 12);
  });

  test('increments are exactly additive and zero-width windows vanish', () => {
    const grid = buildBrownianGrid(1, 8, 2, 21);
    for (const [a, b, c] of [[0, 37, 91], [10, 128, 256], [5, 6, 7]] as const) {
      for (let d = 0; d < 2; d += 1) {
        expect(grid.increment(a, c, d)).toBeCloseTo(grid.increment(a, b, d) + grid.increment(b, c, d), 12);
      }
    }
    expect(grid.increment(42, 42, 0)).toBe(0);
    // Dimensions carry independent paths, not copies of one another.
    expect(grid.increment(0, grid.steps, 0)).not.toBe(grid.increment(0, grid.steps, 1));
  });

  test('window variance scales with the window length (law sanity over many windows)', () => {
    const grid = buildBrownianGrid(4, 12, 1, 31);
    const window = 16; // 16 fine steps => variance = 16 * dt
    let sumSq = 0;
    const count = grid.steps / window;
    for (let i = 0; i < count; i += 1) {
      const dW = grid.increment(i * window, (i + 1) * window, 0);
      sumSq += dW * dW;
    }
    const ratio = sumSq / count / (window * grid.dt);
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.2);
  });

  test('constructor fails closed on invalid shapes', () => {
    expect(() => buildBrownianGrid(0, 8, 1)).toThrow();
    expect(() => buildBrownianGrid(1, 0, 1)).toThrow();
    expect(() => buildBrownianGrid(1, 25, 1)).toThrow();
    expect(() => buildBrownianGrid(1, 8, 0)).toThrow();
  });
});

describe('strong-order separation on geometric Brownian motion', () => {
  const mu = 0.6;
  const sigma = 0.9;
  const X0 = 1;
  const T = 1;
  const ROOT = 12;
  const levels = [4, 5, 6, 7];
  const seeds = [3, 5, 7, 11, 13, 17, 19, 23];
  const drift = (x: ArrayLike<number>, out: Float64Array | number[]): void => {
    out[0] = mu * Number(x[0]);
  };

  function runScheme(scheme: 'em' | 'milstein'): number[] {
    const rms = levels.map(() => 0);
    for (const seed of seeds) {
      const grid = buildBrownianGrid(T, ROOT, 1, seed);
      const exact = X0 * Math.exp((mu - 0.5 * sigma * sigma) * T + sigma * grid.increment(0, grid.steps, 0));
      levels.forEach((level, index) => {
        const steps = 2 ** level;
        const stride = 2 ** (ROOT - level);
        const h = T / steps;
        const x = new Float64Array([X0]);
        const out = new Float64Array(1);
        for (let s = 0; s < steps; s += 1) {
          const dW = grid.increment(s * stride, (s + 1) * stride, 0);
          const injected = (): number => dW / Math.sqrt(h);
          if (scheme === 'em') eulerMaruyamaStep(x, h, drift, [sigma * x[0]!], injected, out);
          else milsteinStep(x, h, drift, [sigma * x[0]!], [sigma], injected, out);
          x[0] = out[0]!;
        }
        rms[index]! += (x[0]! - exact) ** 2;
      });
    }
    return rms.map((v) => Math.sqrt(v / seeds.length));
  }

  test('Milstein converges at order ~1 and beats Euler-Maruyama at every level', () => {
    const em = runScheme('em');
    const milstein = runScheme('milstein');
    for (let i = 0; i < levels.length; i += 1) {
      expect(milstein[i]!).toBeLessThan(em[i]!);
    }
    expect(milstein[levels.length - 1]!).toBeLessThan(5e-2);
    expect(em[levels.length - 1]!).toBeGreaterThan(5e-2);
    expect(em[levels.length - 1]! / milstein[levels.length - 1]!).toBeGreaterThan(2);
    const xs = levels.map((level) => -level);
    const slope = (ys: number[]): number => {
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      return xs.reduce((acc, xv, i) => acc + (xv - mx) * (ys[i]! - my), 0) / xs.reduce((acc, xv) => acc + (xv - mx) ** 2, 0);
    };
    expect(slope(milstein.map((e) => Math.log2(e)))).toBeGreaterThan(0.8);
  });

  test('with additive noise (b\' = 0) Milstein reduces bit-identically to Euler-Maruyama', () => {
    const state = new Float64Array([0.4]);
    const emOut = new Float64Array(1);
    const milOut = new Float64Array(1);
    const draws = [0.7, -1.2, 0.3];
    let i = 0;
    const g1 = (): number => draws[i++ % draws.length]!;
    let j = 0;
    const g2 = (): number => draws[j++ % draws.length]!;
    eulerMaruyamaStep(state, 0.01, drift, [0.5], g1, emOut);
    milsteinStep(state, 0.01, drift, [0.5], [0], g2, milOut);
    expect(milOut[0]).toBe(emOut[0]);
  });
});
