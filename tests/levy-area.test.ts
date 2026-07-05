import { describe, expect, test } from 'vitest';
import { buildBrownianGrid, commutativeMilsteinStep, gaussianSampler } from '../src/physics/stochastic';
import {
  iteratedItoIntegrals,
  levyAreaCount,
  levyAreaPackedIndex,
  levyAreasFromGrid,
  milsteinLevyStep,
  sampleBrownianStepWithAreas
} from '../src/physics/levyArea';

/**
 * Thresholds are measured (2026-07-05 probe) and pinned with margin:
 * - strong order on the non-commutative Pauli SDE: slope 0.863 WITH areas vs
 *   0.587 WITHOUT (order-1/2 demotion), finest-level error ratio 51x.
 * - subdivision sampler at h=0.3, 64 substeps, N=20000: Var(A)/h^2 = 1.008
 *   (theory 1 - 1/64 = 0.984), mean(A) = -1.6e-3, Var(dW)/h = 1.010,
 *   corr(dW1,dW2) = -0.013, E[I12^2]/(h^2/2) = 1.019.
 */

// Non-commutative linear test SDE: dX = B1 X dW1 + B2 X dW2 with Pauli-x/z
// diffusion directions (they anticommute, so the Lie bracket is maximal).
const S = 0.35;
const B = [
  [[0, S], [S, 0]],
  [[S, 0], [0, -S]]
] as const;
const drift = (_x: ArrayLike<number>, out: number[] | Float64Array): void => {
  out[0] = 0;
  out[1] = 0;
};
const diffusion = (x: ArrayLike<number>, out: number[], m: number): void => {
  for (let i = 0; i < 2; i += 1) {
    for (let k = 0; k < m; k += 1) out[i * m + k] = B[k]![i]![0]! * Number(x[0]) + B[k]![i]![1]! * Number(x[1]);
  }
};
const diffusionJacobian = (_x: ArrayLike<number>, out: number[], m: number): void => {
  for (let i = 0; i < 2; i += 1) {
    for (let k = 0; k < m; k += 1) {
      for (let l = 0; l < 2; l += 1) out[((i * m + k) * 2) + l] = B[k]![i]![l]!;
    }
  }
};

const ROOT_LEVELS = 14;
const REF_LEVEL = 12;
const T = 1;

function runScheme(grid: ReturnType<typeof buildBrownianGrid>, level: number, useAreas: boolean): Float64Array {
  const steps = 2 ** level;
  const stride = 2 ** (ROOT_LEVELS - level);
  const h = T / steps;
  let x = new Float64Array([1, 0.5]);
  const next = new Float64Array(2);
  for (let s = 0; s < steps; s += 1) {
    const a = s * stride;
    const b = (s + 1) * stride;
    const dW = new Float64Array([grid.increment(a, b, 0), grid.increment(a, b, 1)]);
    const areas = useAreas ? levyAreasFromGrid(grid, a, b) : new Float64Array(1);
    const integrals = iteratedItoIntegrals(h, dW, areas);
    milsteinLevyStep(x, h, drift, 2, diffusion, diffusionJacobian, dW, integrals, next);
    x = Float64Array.from(next);
  }
  return x;
}

function leastSquaresSlope(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  return xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i]! - my), 0) / xs.reduce((acc, x) => acc + (x - mx) ** 2, 0);
}

describe('packed Levy-area layout', () => {
  test('packed index enumerates the strict upper triangle', () => {
    expect(levyAreaCount(2)).toBe(1);
    expect(levyAreaCount(4)).toBe(6);
    expect(levyAreaPackedIndex(0, 1, 4)).toBe(0);
    expect(levyAreaPackedIndex(0, 3, 4)).toBe(2);
    expect(levyAreaPackedIndex(1, 2, 4)).toBe(3);
    expect(levyAreaPackedIndex(2, 3, 4)).toBe(5);
    expect(() => levyAreaPackedIndex(1, 1, 4)).toThrow();
    expect(() => levyAreaPackedIndex(2, 1, 4)).toThrow();
  });

  test('iterated integrals satisfy the Ito identities exactly', () => {
    const h = 0.25;
    const dW = [0.4, -0.7];
    const area = 0.31;
    const integrals = iteratedItoIntegrals(h, dW, [area]);
    expect(integrals[0]).toBeCloseTo((0.4 ** 2 - h) / 2, 15);
    expect(integrals[3]).toBeCloseTo(((-0.7) ** 2 - h) / 2, 15);
    // I12 + I21 = dW1 dW2 and I12 - I21 = A.
    expect(integrals[1]! + integrals[2]!).toBeCloseTo(0.4 * -0.7, 15);
    expect(integrals[1]! - integrals[2]!).toBeCloseTo(area, 15);
  });
});

describe('grid Levy areas', () => {
  test('areas compose across adjacent blocks via the cross-increment term', () => {
    const grid = buildBrownianGrid(1, 8, 2, 42);
    const mid = 128;
    const full = levyAreasFromGrid(grid, 0, 256)[0]!;
    const left = levyAreasFromGrid(grid, 0, mid)[0]!;
    const right = levyAreasFromGrid(grid, mid, 256)[0]!;
    const cross = grid.increment(0, mid, 0) * grid.increment(mid, 256, 1)
      - grid.increment(0, mid, 1) * grid.increment(mid, 256, 0);
    expect(full).toBeCloseTo(left + right + cross, 12);
  });
});

describe('milsteinLevyStep', () => {
  test('reduces to commutativeMilsteinStep for commutative (diagonal) noise regardless of the area', () => {
    // Diagonal noise b_i(x_i): commutative, so the antisymmetric area must cancel.
    const diagDiffusion = (x: ArrayLike<number>, out: number[], m: number): void => {
      out[0 * m + 0] = 0.3 * Number(x[0]);
      out[0 * m + 1] = 0;
      out[1 * m + 0] = 0;
      out[1 * m + 1] = 0.5 * Number(x[1]);
    };
    const diagJacobian = (_x: ArrayLike<number>, out: number[], m: number): void => {
      out.fill(0);
      out[((0 * m + 0) * 2) + 0] = 0.3;
      out[((1 * m + 1) * 2) + 1] = 0.5;
    };
    const someDrift = (x: ArrayLike<number>, out: number[] | Float64Array): void => {
      out[0] = -0.2 * Number(x[0]);
      out[1] = 0.1 * Number(x[1]);
    };
    const state = new Float64Array([1.2, -0.8]);
    const h = 0.02;
    const dW = [0.11, -0.07];
    const sqrtH = Math.sqrt(h);
    const draws = [dW[0]! / sqrtH, dW[1]! / sqrtH];
    let drawIndex = 0;
    const fakeGaussian = (): number => draws[drawIndex++] ?? 0;
    const reference = new Float64Array(2);
    commutativeMilsteinStep(state, h, someDrift, 2, diagDiffusion, diagJacobian, fakeGaussian, reference);
    for (const area of [0, 0.5, -1.3]) {
      const integrals = iteratedItoIntegrals(h, dW, [area]);
      const out = new Float64Array(2);
      milsteinLevyStep(state, h, someDrift, 2, diagDiffusion, diagJacobian, dW, integrals, out);
      expect(out[0]).toBeCloseTo(reference[0]!, 12);
      expect(out[1]).toBeCloseTo(reference[1]!, 12);
    }
  });

  test('strong order 1.0 with areas vs order-1/2 demotion without (non-commutative SDE)', () => {
    const levels = [5, 6, 7, 8, 9];
    const seeds = [11, 22, 33, 44, 55, 66, 77, 88];
    const errors = { with: levels.map(() => 0), without: levels.map(() => 0) };
    for (const seed of seeds) {
      const grid = buildBrownianGrid(T, ROOT_LEVELS, 2, seed);
      const reference = runScheme(grid, REF_LEVEL, true);
      levels.forEach((level, index) => {
        for (const useAreas of [true, false] as const) {
          const x = runScheme(grid, level, useAreas);
          const err = Math.hypot(x[0]! - reference[0]!, x[1]! - reference[1]!);
          errors[useAreas ? 'with' : 'without'][index]! += err * err;
        }
      });
    }
    const rms = {
      with: errors.with.map((v) => Math.sqrt(v / seeds.length)),
      without: errors.without.map((v) => Math.sqrt(v / seeds.length))
    };
    const xs = levels.map((level) => -level);
    const slopeWith = leastSquaresSlope(xs, rms.with.map((e) => Math.log2(e)));
    const slopeWithout = leastSquaresSlope(xs, rms.without.map((e) => Math.log2(e)));
    // Measured: 0.863 vs 0.587; finest-level error ratio 51x.
    expect(slopeWith).toBeGreaterThan(0.75);
    expect(slopeWithout).toBeLessThan(0.72);
    expect(slopeWith - slopeWithout).toBeGreaterThan(0.15);
    expect(rms.with[rms.with.length - 1]!).toBeLessThan(5e-4);
    expect(rms.without[rms.without.length - 1]! / rms.with[rms.with.length - 1]!).toBeGreaterThan(10);
  });
});

describe('subdivision sampler law', () => {
  test('matches the exact moments of (dW, A) at finite substeps', () => {
    const gaussian = gaussianSampler(777);
    const N = 20000;
    const h = 0.3;
    const substeps = 64;
    let meanArea = 0;
    let areaSq = 0;
    let w1Sq = 0;
    let crossW = 0;
    let i12Sq = 0;
    for (let i = 0; i < N; i += 1) {
      const { increments, levyAreas } = sampleBrownianStepWithAreas(h, 2, gaussian, substeps);
      const area = levyAreas[0]!;
      meanArea += area;
      areaSq += area * area;
      w1Sq += increments[0]! ** 2;
      crossW += increments[0]! * increments[1]!;
      const i12 = (increments[0]! * increments[1]! + area) / 2;
      i12Sq += i12 * i12;
    }
    // Measured: mean -1.6e-3, Var(A)/h^2 1.008 (theory 0.984), Var(dW)/h 1.010,
    // corr -0.013, E[I12^2]/(h^2/2) 1.019 - pinned with sampling-error margin.
    expect(Math.abs(meanArea / N)).toBeLessThan(0.015);
    expect(areaSq / N / (h * h)).toBeGreaterThan(0.92);
    expect(areaSq / N / (h * h)).toBeLessThan(1.06);
    expect(w1Sq / N / h).toBeGreaterThan(0.95);
    expect(w1Sq / N / h).toBeLessThan(1.05);
    expect(Math.abs(crossW / N / h)).toBeLessThan(0.05);
    expect(i12Sq / N / (h * h / 2)).toBeGreaterThan(0.93);
    expect(i12Sq / N / (h * h / 2)).toBeLessThan(1.08);
  });
});
