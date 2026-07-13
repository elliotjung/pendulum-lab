import { describe, expect, test } from 'vitest';
import {
  sineCircleMap,
  rotationNumber,
  planarMapRotationNumber,
  scanModeLocking,
  torusLyapunovSpectrum,
  neimarkSackerSpectralConvergence,
  type PlanarMapSystem
} from '../src/chaos/index';

/**
 * The Neimark–Sacker invariant torus, turned from a single solver into a
 * research instrument:
 *   • item 5 — Arnold tongues / phase-locking (rotation number + mode locking),
 *   • item 6 — Lyapunov spectrum on the torus (a quasi-periodic torus is neutral),
 *   • item 8 — spectral-convergence gate of the collocation solver.
 * Each is pinned on an independent textbook anchor.
 */

const delayedLogistic: PlanarMapSystem = {
  map: (s, a, out) => {
    out[0] = a * s[0]! * (1 - s[1]!);
    out[1] = s[0]!;
  },
  center: (a) => {
    const x = (a - 1) / a;
    return [x, x];
  }
};

describe('Arnold tongues & phase-locking (sine circle map)', () => {
  test('K = 0: the rotation number equals Ω exactly (rigid rotation)', () => {
    for (const omega of [0.1, 0.2, 0.371]) {
      expect(rotationNumber(sineCircleMap(omega, 0))).toBeCloseTo(omega, 9);
    }
  });

  test('K = 1: ρ locks to 1/2 over a finite Ω interval (the 1/2 Arnold tongue)', () => {
    // Inside the tongue ρ is pinned at 1/2; outside it varies.
    expect(rotationNumber(sineCircleMap(0.5, 1))).toBeCloseTo(0.5, 6);
    expect(rotationNumber(sineCircleMap(0.49, 1))).toBeCloseTo(0.5, 6); // still locked
    expect(Math.abs(rotationNumber(sineCircleMap(0.45, 1)) - 0.5)).toBeGreaterThan(1e-3); // unlocked
  });

  test('scanModeLocking finds the 1/2 tongue and ρ(Ω) is a monotone devil staircase', () => {
    const scan = scanModeLocking((omega) => sineCircleMap(omega, 1), {
      start: 0.4,
      end: 0.6,
      steps: 80,
      rationals: [[1, 2]],
      tolerance: 1e-5,
      rotationOptions: { iterations: 80000, transient: 2000 }
    });
    // Non-decreasing within the rotation-number estimator's O(1/N) noise floor.
    expect(scan.monotone).toBe(true);
    expect(scan.maxDecrease).toBeLessThan(1e-3);
    const half = scan.tongues.find((t) => t.p === 1 && t.q === 2);
    expect(half).toBeDefined();
    expect(half!.end - half!.start).toBeGreaterThan(0.01); // a tongue of finite width
    // Ω = 0.5 sits inside the located tongue.
    expect(half!.start).toBeLessThanOrEqual(0.5);
    expect(half!.end).toBeGreaterThanOrEqual(0.5);
  });

  test('the planar-map winding ρ reproduces the NS solver ρ → 1/6 on the delayed-logistic circle', () => {
    const a = 2.02;
    const center = (a - 1) / a;
    // A point a little off the fixed point spirals out onto the invariant circle.
    const rho = planarMapRotationNumber(delayedLogistic, a, [center, center], [center + 0.1, center], {
      iterations: 200000,
      transient: 5000
    });
    expect(rho).toBeCloseTo(1 / 6, 2); // matches continueNeimarkSackerTorus's reported ρ
  });
});

describe('Lyapunov spectrum on the invariant torus (item 6 — self-consistency gate)', () => {
  test('a pure rotation has two ≈ 0 exponents', () => {
    const alpha = 2 * Math.PI * 0.2;
    const rotation: PlanarMapSystem = {
      map: (s, _p, out) => {
        out[0] = Math.cos(alpha) * s[0]! - Math.sin(alpha) * s[1]!;
        out[1] = Math.sin(alpha) * s[0]! + Math.cos(alpha) * s[1]!;
      },
      center: () => [0, 0]
    };
    const result = torusLyapunovSpectrum(rotation, 0, [0.7, 0], { iterations: 20000, transient: 1000 });
    expect(Math.abs(result.exponents[0])).toBeLessThan(1e-4);
    expect(Math.abs(result.exponents[1])).toBeLessThan(1e-4);
    expect(result.verdict).toBe('quasi-periodic-torus');
  });

  test('the delayed-logistic torus is neutral on-circle and attracting transverse', () => {
    const a = 2.02;
    const center = (a - 1) / a;
    const result = torusLyapunovSpectrum(delayedLogistic, a, [center + 0.12, center], {
      iterations: 40000,
      transient: 5000
    });
    // Largest exponent ≈ 0 (quasi-periodic, NOT chaotic): the self-consistency gate.
    expect(Math.abs(result.largest)).toBeLessThan(1e-3);
    expect(result.largest).toBeLessThan(1e-4);
    // Transverse exponent strictly negative — the circle attracts.
    expect(result.transverseExponent).toBeLessThan(-1e-3);
    expect(result.verdict).toBe('quasi-periodic-torus');
  });
});

describe('NS torus spectral-convergence gate (item 8)', () => {
  const result = neimarkSackerSpectralConvergence(delayedLogistic, 2.02, {
    collocations: [9, 13, 17, 21, 25, 29, 33],
    initialAmplitude: 0.18,
    tolerance: 1e-12,
    maxIterations: 60,
    floor: 1e-8
  });

  test('every collocation level converges', () => {
    expect(result.samples.every((s) => s.converged)).toBe(true);
  });

  test('the truncation error decays geometrically (spectral) to a near-machine floor', () => {
    // Spectral ⇒ ln(res) linear in M, beating the algebraic ln(res)~ln(M) fit.
    expect(result.spectral).toBe(true);
    expect(result.spectralR2).toBeGreaterThanOrEqual(result.algebraicR2);
    expect(result.geometricRate).toBeLessThan(-0.3); // steep geometric decay per node
    expect(result.dropFactor).toBeGreaterThan(1e4); // observed > 1e6 over M = 9 → 33
  });

  test('the result is the genuine off-grid residual, not the Newton residual', () => {
    // The finest level reaches the floor; the coarsest is far above it.
    const coarse = result.samples[0]!.invarianceResidual;
    const fine = result.samples[result.samples.length - 1]!.invarianceResidual;
    expect(fine).toBeLessThan(1e-8);
    expect(coarse).toBeGreaterThan(1e-6);
  });
});
