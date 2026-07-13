import { describe, expect, test } from 'vitest';
import { continueNeimarkSackerTorus, type PlanarMapSystem } from '../src/chaos/index';

/**
 * Invariant-circle (Neimark–Sacker torus) continuation, validated on two anchors.
 *
 * 1. A pure planar rotation by α: every circle about the origin is exactly
 *    invariant with rotation number ρ = α/2π. The collocation solver must
 *    reproduce this to machine precision (the curve is exactly representable).
 *
 * 2. The delayed-logistic map  x_{n+1} = a·x_n·(1 − x_{n-1}),  written as the
 *    planar map (x, y) ↦ (a·x·(1 − y), x), is the textbook NS example: its
 *    fixed point ((a−1)/a, (a−1)/a) has a complex multiplier pair crossing the
 *    unit circle at a = 2 with angle arg(λ) = π/3, so an invariant closed curve
 *    is born there with rotation number → 1/6. We continue the curve from
 *    a = 2.05 toward onset and check it converges, that ρ → 1/6 and the
 *    amplitude → 0 monotonically, that the (gauge-free, off-grid) invariance
 *    error stays tiny, and — independently of the solver's own residual — that
 *    iterating the *raw* map from a point on the computed curve keeps the orbit
 *    on the curve.
 *
 * Numbers cross-checked with an out-of-suite probe before being pinned here.
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

describe('continueNeimarkSackerTorus — trigonometric-collocation invariant circle', () => {
  test('a pure rotation by α: every circle is invariant with ρ = α/2π (exact)', () => {
    const alpha = 2 * Math.PI * 0.2;
    const rotation: PlanarMapSystem = {
      map: (s, _p, out) => {
        out[0] = Math.cos(alpha) * s[0]! - Math.sin(alpha) * s[1]!;
        out[1] = Math.sin(alpha) * s[0]! + Math.cos(alpha) * s[1]!;
      },
      center: () => [0, 0]
    };
    const res = continueNeimarkSackerTorus(rotation, {
      start: 0,
      end: 0,
      step: 1,
      initialAmplitude: 0.7,
      collocation: 21
    });
    const p = res.points[0]!;
    expect(p.converged).toBe(true);
    expect(p.rotationNumber).toBeCloseTo(0.2, 9);
    expect(p.invarianceResidual).toBeLessThan(1e-10);
  });

  const sweep = continueNeimarkSackerTorus(delayedLogistic, {
    start: 2.05,
    end: 2.01,
    step: 0.01,
    initialAmplitude: 0.24,
    collocation: 31,
    tolerance: 1e-8,
    maxIterations: 40
  });

  test('the delayed-logistic invariant circle is found and resolved at every step', () => {
    expect(sweep.points).toHaveLength(5);
    expect(sweep.points.every((p) => p.converged)).toBe(true);
    // Off-grid (between collocation nodes) invariance error — the curve really maps to itself.
    for (const p of sweep.points) expect(p.invarianceResidual).toBeLessThan(1e-6);
  });

  test('ρ → 1/6 and amplitude → 0 monotonically as a → 2 (onset)', () => {
    const last = sweep.points[sweep.points.length - 1]!; // a = 2.01, nearest onset
    expect(last.parameter).toBeCloseTo(2.01, 9);
    expect(last.rotationNumber).toBeCloseTo(1 / 6, 2); // |ρ − 1/6| ≈ 9.3e-4

    // The sweep runs a = 2.05 → 2.01: as a decreases toward onset, ρ rises to 1/6
    // and the curve shrinks to the fixed point.
    for (let i = 1; i < sweep.points.length; i += 1) {
      expect(sweep.points[i]!.rotationNumber).toBeGreaterThan(sweep.points[i - 1]!.rotationNumber);
      expect(sweep.points[i]!.amplitude).toBeLessThan(sweep.points[i - 1]!.amplitude);
    }
    for (const p of sweep.points) {
      expect(p.rotationNumber).toBeGreaterThan(0.16);
      expect(p.rotationNumber).toBeLessThan(1 / 6);
      expect(p.amplitude).toBeGreaterThan(0);
    }
  });

  test('the computed curve is invariant under the RAW map (independent re-iteration)', () => {
    const target = sweep.points.find((p) => Math.abs(p.parameter - 2.02) < 1e-9)!;
    const m = target.curve.length / 2;
    const thetas = Array.from({ length: m }, (_, j) => (2 * Math.PI * j) / m);
    const kernel = (phi: number): number => {
      const h = phi / 2;
      const sn = Math.sin(h);
      return Math.abs(sn) < 1e-12 ? 1 : Math.sin(m * h) / (m * sn);
    };
    const sampleCurve = (phi: number): [number, number] => {
      let x = 0;
      let y = 0;
      for (let l = 0; l < m; l += 1) {
        const k = kernel(phi - thetas[l]!);
        x += k * target.curve[2 * l]!;
        y += k * target.curve[2 * l + 1]!;
      }
      return [x, y];
    };
    const fine = Array.from({ length: 720 }, (_, g) => sampleCurve((2 * Math.PI * g) / 720));
    const distToCurve = (x: number, y: number): number => {
      let best = Infinity;
      for (const f of fine) best = Math.min(best, Math.hypot(x - f[0], y - f[1]));
      return best;
    };

    // Iterate the actual delayed-logistic map from a point on the curve.
    let p = sampleCurve(1.0);
    const a = target.parameter;
    let drift = 0;
    for (let it = 0; it < 5000; it += 1) {
      p = [a * p[0] * (1 - p[1]), p[0]];
      if (it > 100) drift = Math.max(drift, distToCurve(p[0], p[1]));
    }
    expect(drift / target.amplitude).toBeLessThan(0.02); // observed ≈ 5e-3
  });

  test('the solve is deterministic', () => {
    const opts = {
      start: 2.05,
      end: 2.02,
      step: 0.01,
      initialAmplitude: 0.24,
      collocation: 31,
      tolerance: 1e-8,
      maxIterations: 40
    } as const;
    const a = continueNeimarkSackerTorus(delayedLogistic, opts);
    const b = continueNeimarkSackerTorus(delayedLogistic, opts);
    expect(a.points.map((p) => p.rotationNumber)).toEqual(b.points.map((p) => p.rotationNumber));
    expect(a.points.map((p) => p.amplitude)).toEqual(b.points.map((p) => p.amplitude));
  });

  test('without an analytic centre the fixed point is found by Newton', () => {
    const noCenter: PlanarMapSystem = {
      map: (s, a, out) => {
        out[0] = a * s[0]! * (1 - s[1]!);
        out[1] = s[0]!;
      }
    };
    const res = continueNeimarkSackerTorus(noCenter, {
      start: 2.05,
      end: 2.02,
      step: 0.01,
      initialAmplitude: 0.22,
      collocation: 31,
      tolerance: 1e-8,
      maxIterations: 40,
      centerGuess: [0.5, 0.5]
    });
    // The enclosed fixed point (a−1)/a is recovered at every step (independent of curve convergence).
    for (const p of res.points) {
      const want = (p.parameter - 1) / p.parameter;
      expect(p.center[0]).toBeCloseTo(want, 6);
      expect(p.center[1]).toBeCloseTo(want, 6);
    }
    expect(res.points.some((p) => p.converged)).toBe(true);
  });

  test('input validation', () => {
    const base = { start: 2.05, end: 2.01, step: 0.01, initialAmplitude: 0.2 };
    expect(() => continueNeimarkSackerTorus(delayedLogistic, { ...base, initialAmplitude: 0 })).toThrow(
      /initialAmplitude/
    );
    expect(() => continueNeimarkSackerTorus(delayedLogistic, { ...base, step: 0 })).toThrow(/step/);
    expect(() => continueNeimarkSackerTorus(delayedLogistic, { ...base, collocation: 30 })).toThrow(/odd/);
    expect(() => continueNeimarkSackerTorus(delayedLogistic, { ...base, collocation: 7 })).toThrow(/odd/);
  });
});
