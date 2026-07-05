import { describe, expect, test } from 'vitest';
import { maximalLyapunov } from '../src/chaos/lyapunov';
import { recurrenceMatrix, recurrenceQuantification } from '../src/chaos/rqa';
import { levenbergMarquardt } from '../src/research/parameterEstimation';
import {
  angleChainToEmbedded,
  embeddedChainEnergy,
  embeddedChainLz,
  embeddedChainPositions,
  embeddedChainToAngle
} from '../src/physics/sphericalEmbeddedChain';
import { sphericalChainEnergy, sphericalChainLz } from '../src/physics/sphericalChain';
import { mulberry32 } from '../src/chaos/variational';

/**
 * Mutation hardening for the lyapunov / rqa / parameterEstimation /
 * sphericalEmbeddedChain shards. Measured values (2026-07-05 probe) are noted
 * inline; every threshold carries margin over the measurement.
 */

describe('maximalLyapunov analytic pins', () => {
  test('uniform linear contraction is measured exactly: lambda = -0.5', () => {
    // dx/dt = -0.5 x: every direction contracts at exactly 0.5 per unit time,
    // so the Benettin estimate is exact and its spread is zero.
    const result = maximalLyapunov(
      [1, 1],
      (x, out) => {
        out[0] = -0.5 * Number(x[0]);
        out[1] = -0.5 * Number(x[1]);
      },
      { dt: 0.01, steps: 8_000, transientSteps: 200 }
    );
    expect(result.lambdaMax).toBeCloseTo(-0.5, 6);
    expect(result.stdError).toBeLessThan(1e-8);
    // ci95 arithmetic is exactly lambda +/- 1.96 * stdError.
    expect(result.ci95[0]).toBeCloseTo(result.lambdaMax - 1.96 * result.stdError, 12);
    expect(result.ci95[1]).toBeCloseTo(result.lambdaMax + 1.96 * result.stdError, 12);
    // One convergence entry per renormalization interval.
    expect(result.convergence.length).toBe(8_000 / result.settings.renormEvery);
    expect(result.settings.dt).toBe(0.01);
    expect(result.settings.steps).toBe(8_000);
  });

  test('harmonic oscillator is neutral: |lambda| at the round-off floor', () => {
    const result = maximalLyapunov(
      [1, 0],
      (x, out) => {
        out[0] = Number(x[1]);
        out[1] = -Number(x[0]);
      },
      { dt: 0.01, steps: 8_000, transientSteps: 200 }
    );
    // Measured -4.3e-9.
    expect(Math.abs(result.lambdaMax)).toBeLessThan(1e-6);
    expect(result.blockStdError).toBeGreaterThanOrEqual(0);
  });
});

describe('recurrenceQuantification structural pins', () => {
  const N = 400;
  const sine = Array.from({ length: N }, (_, i) => Math.sin((2 * Math.PI * i) / 25));
  const rng = mulberry32(99);
  const noise = Array.from({ length: N }, () => rng() * 2 - 1);

  test('periodic signal: high determinism, RR at the requested target, exact structural relations', () => {
    const result = recurrenceQuantification(sine, { dimension: 3, delay: 2 });
    // Measured: RR 0.100, DET 0.932, LAM 0.883, longest diagonal 371.
    expect(result.recurrenceRate).toBeGreaterThan(0.08);
    expect(result.recurrenceRate).toBeLessThan(0.12);
    expect(result.determinism).toBeGreaterThan(0.85);
    expect(result.laminarity).toBeGreaterThan(0.7);
    expect(result.longestDiagonal).toBeGreaterThan(300);
    // Exact relations: DIV = 1/Lmax; embedded length = N - (m-1) tau.
    expect(result.divergence).toBeCloseTo(1 / result.longestDiagonal, 12);
    expect(result.embeddedLength).toBe(N - 2 * 2);
    expect(result.epsilon).toBeGreaterThan(0);
    expect(result.entropy).toBeGreaterThanOrEqual(0);
  });

  test('white noise scores far lower determinism than the periodic signal at the same RR', () => {
    const periodic = recurrenceQuantification(sine, { dimension: 3, delay: 2 });
    const random = recurrenceQuantification(noise, { dimension: 3, delay: 2 });
    // Measured: DET 0.932 vs 0.160.
    expect(random.determinism).toBeLessThan(0.4);
    expect(periodic.determinism - random.determinism).toBeGreaterThan(0.4);
  });

  test('constant series with a fixed epsilon is fully recurrent', () => {
    const constant = Array.from({ length: N }, () => 0.7);
    const result = recurrenceQuantification(constant, { epsilon: 0.1 });
    // Measured RR/DET/LAM 0.99999 (the theiler band trims the counts).
    expect(result.recurrenceRate).toBeGreaterThan(0.999);
    expect(result.determinism).toBeGreaterThan(0.999);
    expect(result.laminarity).toBeGreaterThan(0.999);
    // Longest diagonal excludes the line of identity and the theiler band:
    // N - 2 for the default theiler window of 1.
    expect(result.longestDiagonal).toBe(N - 2);
  });

  test('recurrence matrix is symmetric with a recurrent main diagonal', () => {
    const { matrix, size } = recurrenceMatrix(sine.slice(0, 60), { dimension: 2, delay: 1 });
    expect(size).toBe(59);
    for (let i = 0; i < size; i += 1) {
      expect(matrix[i * size + i]).toBe(1);
      for (let j = 0; j < i; j += 1) {
        expect(matrix[i * size + j]).toBe(matrix[j * size + i]);
      }
    }
  });
});

describe('levenbergMarquardt recovery pins', () => {
  const xs = Array.from({ length: 25 }, (_, i) => i / 12);
  const target = xs.map((x) => 2.3 * x - 1.1);
  const residual = (p: readonly number[]): number[] => xs.map((x, i) => p[0]! * x + p[1]! - target[i]!);

  test('recovers a linear model exactly with correct statistics', () => {
    const fit = levenbergMarquardt(residual, [0, 0]);
    expect(fit.parameters[0]).toBeCloseTo(2.3, 8);
    expect(fit.parameters[1]).toBeCloseTo(-1.1, 8);
    expect(fit.converged).toBe(true);
    expect(['cost-converged', 'gradient-converged', 'step-converged']).toContain(fit.status);
    expect(fit.rmse).toBeLessThan(1e-10);
    expect(fit.degreesOfFreedom).toBe(25 - 2);
    expect(fit.covariance.length).toBe(2);
    expect(fit.correlation[0]![0]).toBeCloseTo(1, 9);
    expect(fit.correlation[1]![1]).toBeCloseTo(1, 9);
    expect(fit.standardErrors.length).toBe(2);
  });

  test('bounds are projections: a lower bound above the optimum clamps the parameter', () => {
    const fit = levenbergMarquardt(residual, [4, 0], { lowerBounds: [3, -10] });
    expect(fit.parameters[0]).toBe(3);
  });

  test('fails closed on a non-finite initial residual', () => {
    expect(() => levenbergMarquardt(() => [Number.NaN], [1])).toThrow();
  });
});

describe('embedded spherical chain consistency pins', () => {
  const params = { masses: [1, 0.7], lengths: [1, 0.8], g: 9.81, damping: 0 };

  test('polar -> embedded -> polar roundtrips to machine precision away from the poles', () => {
    const rng = mulberry32(4242);
    let worstRoundtrip = 0;
    let worstEnergy = 0;
    let worstLz = 0;
    let worstLink = 0;
    for (let trial = 0; trial < 50; trial += 1) {
      const polar = new Float64Array(8);
      for (let i = 0; i < 2; i += 1) {
        polar[2 * i] = 0.3 + rng() * 2.4;
        polar[2 * i + 1] = rng() * 6.28;
        polar[4 + 2 * i] = (rng() * 2 - 1) * 2;
        polar[4 + 2 * i + 1] = (rng() * 2 - 1) * 2;
      }
      const embedded = angleChainToEmbedded(polar, 2);
      const back = embeddedChainToAngle(embedded, 2);
      for (let i = 0; i < 8; i += 1) {
        let diff = Math.abs(Number(back[i]) - polar[i]!);
        if (i % 2 === 1 && i < 4) diff = Math.min(diff, Math.abs(diff - 2 * Math.PI));
        worstRoundtrip = Math.max(worstRoundtrip, diff);
      }
      // Both formulations must assign the same physical E and L_z to the state.
      worstEnergy = Math.max(worstEnergy, Math.abs(embeddedChainEnergy(embedded, params).total - sphericalChainEnergy(polar, params).total));
      worstLz = Math.max(worstLz, Math.abs(embeddedChainLz(embedded, params) - sphericalChainLz(polar, params)));
      // Link lengths telescope exactly: |p_k - p_(k-1)| = l_k.
      const positions = embeddedChainPositions(embedded, params);
      const inner = Math.hypot(positions[0]!.x, positions[0]!.y, positions[0]!.z);
      const outer = Math.hypot(positions[1]!.x - positions[0]!.x, positions[1]!.y - positions[0]!.y, positions[1]!.z - positions[0]!.z);
      worstLink = Math.max(worstLink, Math.abs(inner - 1), Math.abs(outer - 0.8));
    }
    // Measured: 1.6e-15 / 8.9e-16 / 4.4e-16 / 2.2e-16.
    expect(worstRoundtrip).toBeLessThan(1e-12);
    expect(worstEnergy).toBeLessThan(1e-12);
    expect(worstLz).toBeLessThan(1e-12);
    expect(worstLink).toBeLessThan(1e-12);
  });
});
