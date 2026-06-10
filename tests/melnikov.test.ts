import { describe, expect, test } from 'vitest';
import {
  melnikovCriticalAmplitude,
  melnikovFunction,
  melnikovFunctionNumeric,
  melnikovVerdict,
  zeroOneTest,
  sampleObservable
} from '../src/chaos/index';
import { rhsDriven, DAMPED_DRIVEN_CHAOS_PRESET, type DrivenParameters } from '../src/physics/driven';

/**
 * Melnikov analysis is the project's *analytic* chaos threshold. Three layers
 * are pinned here:
 *  1. the closed-form Melnikov function against brute-force quadrature along
 *     the separatrix (special-function identities vs Simpson's rule);
 *  2. structural properties of A_c (known value, linear-in-γ scaling, growth
 *     with drive frequency, zero-crossing structure of M(τ₀) across A_c);
 *  3. physics consistency: the 0–1 test finds regular motion well below A_c
 *     and the literature chaotic preset sits above A_c.
 */

const base: DrivenParameters = { g: 1, length: 1, damping: 0.5, driveAmplitude: 1.15, driveFrequency: 2 / 3 };

describe('closed form vs direct quadrature', () => {
  test('M(τ₀) matches Simpson integration along the separatrix', () => {
    const cases: Array<{ p: DrivenParameters; tau0: number }> = [
      { p: base, tau0: 0 },
      { p: base, tau0: 1.3 },
      { p: { ...base, damping: 0.1, driveAmplitude: 0.3, driveFrequency: 1.1 }, tau0: 2.7 },
      { p: { ...base, g: 4, length: 1.5, damping: 0.25, driveAmplitude: 0.9, driveFrequency: 0.8 }, tau0: 0.4 }
    ];
    for (const { p, tau0 } of cases) {
      const closed = melnikovFunction(tau0, p);
      const numeric = melnikovFunctionNumeric(tau0, p);
      expect(Math.abs(closed - numeric)).toBeLessThan(1e-8);
    }
  });
});

describe('critical amplitude structure', () => {
  test('known value: γ = 0.5, ω = 2/3, ω₀ = 1 gives A_c = (2/π)·cosh(π/3) ≈ 1.0187', () => {
    const ac = melnikovCriticalAmplitude(base);
    expect(ac).toBeCloseTo((2 / Math.PI) * Math.cosh(Math.PI / 3), 12);
    expect(ac).toBeCloseTo(1.0187, 3);
  });

  test('A_c is linear in the damping γ', () => {
    const a1 = melnikovCriticalAmplitude({ ...base, damping: 0.1 });
    const a4 = melnikovCriticalAmplitude({ ...base, damping: 0.4 });
    expect(a4 / a1).toBeCloseTo(4, 12);
  });

  test('A_c grows monotonically with drive frequency (high-frequency drives barely shake the separatrix)', () => {
    const low = melnikovCriticalAmplitude({ ...base, driveFrequency: 0.2 });
    const mid = melnikovCriticalAmplitude({ ...base, driveFrequency: 1.0 });
    const high = melnikovCriticalAmplitude({ ...base, driveFrequency: 2.0 });
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });

  test('M(τ₀) has zeros above A_c and is strictly negative below it', () => {
    const ac = melnikovCriticalAmplitude(base);
    const Omega = base.driveFrequency; // ω₀ = 1
    const period = (2 * Math.PI) / Omega;
    const signsAt = (amplitude: number): { hasPositive: boolean; hasNegative: boolean } => {
      let hasPositive = false;
      let hasNegative = false;
      for (let i = 0; i <= 200; i += 1) {
        const m = melnikovFunction((i / 200) * period, { ...base, driveAmplitude: amplitude });
        if (m > 0) hasPositive = true;
        if (m < 0) hasNegative = true;
      }
      return { hasPositive, hasNegative };
    };
    const above = signsAt(1.05 * ac);
    expect(above.hasPositive).toBe(true);
    expect(above.hasNegative).toBe(true); // sign change ⇒ simple zeros
    const below = signsAt(0.95 * ac);
    expect(below.hasPositive).toBe(false);
    expect(below.hasNegative).toBe(true);
  });

  test('verdict object is self-consistent', () => {
    const v = melnikovVerdict(base);
    expect(v.omega0).toBeCloseTo(1, 12);
    expect(v.delta).toBeCloseTo(0.5, 12);
    expect(v.Omega).toBeCloseTo(2 / 3, 12);
    expect(v.amplitudeRatio).toBeCloseTo(1.15 / v.criticalAmplitude, 12);
    expect(v.predictsHomoclinicTangle).toBe(true);
  });
});

describe('physics consistency with the 0–1 test', () => {
  const observable = (s: Float64Array): number => Number(s[1] ?? 0); // angular velocity

  function kAtAmplitude(driveAmplitude: number, damping: number): number {
    const p: DrivenParameters = { ...base, damping, driveAmplitude };
    const rhs = (s: Float64Array, o: Float64Array): void => {
      rhsDriven(s, p, o);
    };
    // Sample roughly stroboscopically (drive period 2π/(2/3) ≈ 9.42 s).
    const series = sampleObservable(rhs, [0.3, 0, 0], {
      dt: 0.02,
      sampleEvery: 157,
      samples: 1500,
      transientSteps: 15000,
      observable
    });
    return zeroOneTest(series).K;
  }

  test('well below A_c the attractor is regular (K ≈ 0)', () => {
    const ac = melnikovCriticalAmplitude({ ...base, damping: 0.2 });
    const K = kAtAmplitude(0.5 * ac, 0.2);
    expect(K).toBeLessThan(0.3);
  });

  test('the literature chaotic preset lies above A_c and the 0–1 test confirms chaos', () => {
    const v = melnikovVerdict(DAMPED_DRIVEN_CHAOS_PRESET);
    expect(v.predictsHomoclinicTangle).toBe(true);
    expect(v.amplitudeRatio).toBeGreaterThan(1);
    const K = kAtAmplitude(DAMPED_DRIVEN_CHAOS_PRESET.driveAmplitude, DAMPED_DRIVEN_CHAOS_PRESET.damping);
    expect(K).toBeGreaterThan(0.7);
  });
});
