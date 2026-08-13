import { describe, expect, test } from 'vitest';
import {
  kramersRateOverdamped,
  kramersMeanFirstPassage,
  duffingKramersRate,
  arrheniusMTTF,
  simulateQuarticEscape
} from '../src/physics/kramersEscape';

/**
 * Kramers escape rate. The analytic overdamped rate is pinned to its closed
 * form, the Duffing convenience is checked against it, and the Monte-Carlo
 * escape simulation cross-validates the physics: the Arrhenius *exponent*
 * (the activation slope d ln r / d(1/D) ≈ -ΔU) is recovered tightly, while the
 * prefactor matches Kramers only to within the known first-passage-to-barrier
 * factor (~1.5–2×), which is the honest expectation at a moderate barrier.
 */

const QUARTIC = { wellFrequency: Math.SQRT2, barrierFrequency: 1, barrierHeight: 0.25 } as const;

describe('analytic Kramers rate', () => {
  test('overdamped rate matches (ω₀ω_b/2π)·exp(-ΔU/D) for the quartic well', () => {
    const D = 0.125;
    const expected = ((Math.SQRT2 * 1) / (2 * Math.PI)) * Math.exp(-0.25 / D);
    expect(kramersRateOverdamped({ ...QUARTIC, diffusion: D })).toBeCloseTo(expected, 12);
    expect(kramersMeanFirstPassage({ ...QUARTIC, diffusion: D })).toBeCloseTo(1 / expected, 8);
  });

  test('duffingKramersRate(α=-1, β=1) equals the quartic closed form', () => {
    const D = 0.1;
    expect(duffingKramersRate({ linearStiffness: -1, cubicStiffness: 1 }, D)).toBeCloseTo(
      kramersRateOverdamped({ ...QUARTIC, diffusion: D }),
      12
    );
  });

  test('rate rises with diffusion and rejects bad input', () => {
    expect(kramersRateOverdamped({ ...QUARTIC, diffusion: 0.2 })).toBeGreaterThan(
      kramersRateOverdamped({ ...QUARTIC, diffusion: 0.1 })
    );
    expect(() => kramersRateOverdamped({ ...QUARTIC, diffusion: 0 })).toThrow();
    expect(() => kramersRateOverdamped({ ...QUARTIC, barrierHeight: 0, diffusion: 0.1 })).toThrow();
    expect(() => kramersRateOverdamped({ ...QUARTIC, wellFrequency: Number.NaN, diffusion: 0.1 })).toThrow(
      /wellFrequency/
    );
    expect(() =>
      kramersRateOverdamped({ ...QUARTIC, barrierFrequency: Number.POSITIVE_INFINITY, diffusion: 0.1 })
    ).toThrow(/barrierFrequency/);
    expect(
      kramersRateOverdamped({
        wellFrequency: Number.MAX_VALUE,
        barrierFrequency: Number.MAX_VALUE,
        barrierHeight: Number.MAX_VALUE,
        diffusion: Number.MIN_VALUE
      })
    ).toBe(0);
    expect(
      kramersRateOverdamped({
        wellFrequency: Number.MAX_VALUE,
        barrierFrequency: Number.MAX_VALUE,
        barrierHeight: Number.MIN_VALUE,
        diffusion: Number.MAX_VALUE
      })
    ).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('Arrhenius MTTF (reliability analog)', () => {
  test('MTTF = (1/r₀)·exp(E_a/kT) and falls with temperature', () => {
    expect(arrheniusMTTF(2, 1, 0.5)).toBeCloseTo(0.5 * Math.exp(2), 12);
    expect(arrheniusMTTF(1, 1, 0.2)).toBeGreaterThan(arrheniusMTTF(1, 1, 0.4)); // hotter ⇒ fails sooner
    expect(() => arrheniusMTTF(0, 1, 0.3)).toThrow();
    expect(() => arrheniusMTTF(1, 1, 0)).toThrow();
    expect(() => arrheniusMTTF(1, Number.NaN, 0.3)).toThrow(/activationEnergy/);
    expect(arrheniusMTTF(Number.MIN_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE)).toBe(0);
    expect(arrheniusMTTF(Number.MAX_VALUE, Number.MAX_VALUE, Number.MIN_VALUE)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('Monte-Carlo cross-validation', () => {
  test('rejects non-finite work controls and seed aliases before simulation', () => {
    const base = { sigma: 0.4, dt: 0.01, realizations: 2, seed: 1, maxSteps: 10 };
    expect(() => simulateQuarticEscape({ ...base, sigma: Number.POSITIVE_INFINITY })).toThrow(/sigma/);
    expect(() => simulateQuarticEscape({ ...base, dt: Number.NaN })).toThrow(/dt/);
    expect(() => simulateQuarticEscape({ ...base, dt: Number.MIN_VALUE })).toThrow(/too small/);
    expect(() => simulateQuarticEscape({ ...base, realizations: 1.5 })).toThrow(/realizations/);
    expect(() => simulateQuarticEscape({ ...base, seed: 0x1_0000_0001 })).toThrow(/uint32/);
    expect(() => simulateQuarticEscape({ ...base, maxSteps: Number.POSITIVE_INFINITY })).toThrow(/maxSteps/);
    expect(() => simulateQuarticEscape({ ...base, threshold: Number.NaN })).toThrow(/threshold/);
    expect(() => simulateQuarticEscape({ ...base, realizations: 1_000_000, maxSteps: 10_000_000 })).toThrow(
      /total work/
    );
  });

  test('treats an initial state at or beyond the barrier as a t=0 first passage', () => {
    const result = simulateQuarticEscape({
      sigma: 0.4,
      dt: 0.01,
      realizations: 3,
      seed: 1,
      x0: 0,
      threshold: 0,
      maxSteps: 10
    });
    expect(result).toEqual({
      meanFirstPassage: 0,
      rate: Number.POSITIVE_INFINITY,
      escaped: 3,
      realizations: 3
    });
  });

  test('recovers the activation exponent and the Kramers prefactor to within ~2×', () => {
    const sigmas = [0.4, 0.45, 0.5];
    const pts: { invD: number; lnRate: number }[] = [];
    for (const sigma of sigmas) {
      const D = (sigma * sigma) / 2;
      const sim = simulateQuarticEscape({ sigma, dt: 0.01, realizations: 250, seed: 12345, maxSteps: 3_000_000 });
      expect(sim.escaped).toBe(sim.realizations); // every realization escaped within the budget
      const ratio = sim.rate / kramersRateOverdamped({ ...QUARTIC, diffusion: D });
      expect(ratio).toBeGreaterThan(1.2);
      expect(ratio).toBeLessThan(2.2);
      pts.push({ invD: 1 / D, lnRate: Math.log(sim.rate) });
    }
    // Linear fit of ln(rate) vs 1/D; slope must sit near the exact -ΔU = -0.25.
    const n = pts.length;
    const sx = pts.reduce((a, p) => a + p.invD, 0);
    const sy = pts.reduce((a, p) => a + p.lnRate, 0);
    const sxx = pts.reduce((a, p) => a + p.invD * p.invD, 0);
    const sxy = pts.reduce((a, p) => a + p.invD * p.lnRate, 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    expect(slope).toBeGreaterThan(-0.32);
    expect(slope).toBeLessThan(-0.18);
  });
});
