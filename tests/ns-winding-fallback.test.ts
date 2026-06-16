import { describe, expect, test } from 'vitest';
import { continueNeimarkSackerTorusRobust, type PlanarMapSystem } from '../src/chaos/index';

/**
 * Robust Neimark–Sacker continuation with an automatic winding fallback (5-2).
 * Where the trigonometric-collocation solver cannot represent a phase-locked
 * (Arnold-tongue) conjugacy, the orbit-winding rotation number — valid
 * mode-locked or quasi-periodic — is substituted. These tests pin the
 * cross-check and the fallback plumbing on a rigid rotation, whose rotation
 * number is known in closed form (ρ = α/2π).
 */

/** Rigid rotation of the plane by angle α about the origin: every circle is invariant. */
function rotationMap(alpha: number): PlanarMapSystem {
  const c = Math.cos(alpha);
  const s = Math.sin(alpha);
  return {
    map: (state, _parameter, out) => {
      const x = state[0] ?? 0;
      const y = state[1] ?? 0;
      out[0] = c * x - s * y;
      out[1] = s * x + c * y;
    },
    center: () => [0, 0]
  };
}

const ALPHA = 0.5; // ρ = 0.5 / (2π) ≈ 0.0795775
const RHO = ALPHA / (2 * Math.PI);

describe('continueNeimarkSackerTorusRobust', () => {
  test('smooth curve: winding cross-checks collocation, no fallback used', () => {
    const result = continueNeimarkSackerTorusRobust(rotationMap(ALPHA), {
      start: 0,
      end: 0.02,
      step: 0.01,
      initialAmplitude: 0.3,
      collocation: 15,
      tolerance: 1e-9,
      windingIterations: 8000
    });
    expect(result.points.length).toBeGreaterThanOrEqual(3);
    expect(result.fallbackParameters).toHaveLength(0);
    for (const pt of result.points) {
      expect(pt.converged).toBe(true);
      expect(pt.rotationNumberSource).toBe('collocation');
      // The collocation ρ and the independent winding ρ agree on the same circle.
      expect(pt.windingRotationNumber).toBeCloseTo(RHO, 3);
      expect(pt.windingRotationNumber).toBeCloseTo(pt.rotationNumber, 3);
    }
  });

  test('forced fallback: a failed-collocation verdict substitutes the winding ρ', () => {
    // residualThreshold below 0 marks every point as failed (residual ≥ 0), so the
    // winding fallback path is exercised deterministically — and must still return
    // the correct rotation number.
    const result = continueNeimarkSackerTorusRobust(rotationMap(ALPHA), {
      start: 0,
      end: 0.02,
      step: 0.01,
      initialAmplitude: 0.3,
      collocation: 15,
      tolerance: 1e-9,
      windingIterations: 8000,
      residualThreshold: -1
    });
    expect(result.fallbackParameters.length).toBe(result.points.length);
    for (const pt of result.points) {
      expect(pt.rotationNumberSource).toBe('winding-fallback');
      expect(pt.windingRotationNumber).toBeCloseTo(RHO, 3);
    }
  });
});
