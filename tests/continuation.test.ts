import { describe, expect, test } from 'vitest';
import { classifyBifurcation, continueDrivenPeriodicOrbit } from '../src/chaos/index';
import type { FloquetMultiplier } from '../src/chaos/index';

/**
 * Bifurcation classification is pinned on constructed multiplier sets whose type
 * is unambiguous (ρ → −1 flip, ρ → +1 tangent, a complex pair on the unit circle
 * → Neimark–Sacker). The driven-pendulum continuation then traces the period-1
 * branch and must (a) start stable, (b) vary smoothly, and (c) detect the first
 * stability loss — a real multiplier passing through +1 near A ≈ 1.01 (a tangent
 * bifurcation, not period-doubling).
 */

const m = (re: number, im: number): FloquetMultiplier => ({ re, im, modulus: Math.hypot(re, im) });

describe('classifyBifurcation', () => {
  test('a real multiplier through −1 is period-doubling', () => {
    expect(classifyBifurcation([m(-1.05, 0), m(0.3, 0)])).toBe('period-doubling');
  });
  test('a real multiplier through +1 is a tangent bifurcation', () => {
    expect(classifyBifurcation([m(1.08, 0), m(0.2, 0)])).toBe('tangent');
  });
  test('a complex pair on the unit circle is Neimark–Sacker', () => {
    const t = 0.6;
    expect(
      classifyBifurcation([m(1.01 * Math.cos(t), 1.01 * Math.sin(t)), m(1.01 * Math.cos(t), -1.01 * Math.sin(t))])
    ).toBe('neimark-sacker');
  });
});

describe('continuation of the driven-pendulum period-1 orbit', () => {
  const base = { g: 1, length: 1, damping: 0.5, driveAmplitude: 0.7, driveFrequency: 2 / 3 };

  test('traces a smooth stable branch that loses stability via a tangent bifurcation', () => {
    const result = continueDrivenPeriodicOrbit(base, {
      parameter: 'driveAmplitude',
      start: 0.7,
      end: 1.06,
      step: 0.02,
      dt: 0.004,
      tolerance: 1e-11
    });

    // Every step converged to an orbit.
    expect(result.branch.length).toBeGreaterThan(15);
    expect(result.branch.every((p) => p.converged)).toBe(true);

    // The branch starts stable.
    expect(result.branch[0]!.stable).toBe(true);
    expect(result.branch[0]!.maxModulus).toBeLessThan(1);

    // The orbit varies smoothly (no Newton jumps to a different solution).
    for (let i = 1; i < result.branch.length; i += 1) {
      const a = result.branch[i - 1]!.orbit;
      const b = result.branch[i]!.orbit;
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.6);
    }

    // Stability is lost near A ≈ 1.01 via a real multiplier crossing +1.
    expect(result.bifurcation).not.toBeNull();
    expect(result.bifurcation!.type).toBe('tangent');
    expect(result.bifurcation!.parameter).toBeGreaterThan(1.0);
    expect(result.bifurcation!.parameter).toBeLessThan(1.05);
    const crit = result.bifurcation!.multipliers.reduce((x, y) => (y.modulus > x.modulus ? y : x));
    expect(crit.re).toBeGreaterThan(1); // just outside +1
    expect(Math.abs(crit.im)).toBeLessThan(1e-6); // real
  });
});
