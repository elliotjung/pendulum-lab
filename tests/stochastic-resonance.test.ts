import { describe, expect, test } from 'vitest';
import {
  stochasticResonanceResponse,
  stochasticResonanceCurve,
  type BistableSrParameters
} from '../src/physics/stochasticResonance';

/**
 * Stochastic resonance: a sub-threshold periodic drive on the overdamped quartic
 * double well produces almost no inter-well response on its own, but the right
 * amount of noise maximises the spectral response — an interior maximum of the
 * response-vs-noise curve. These tests pin that signature (and the no-noise /
 * reproducibility limits) on the canonical Benzi/McNamara–Wiesenfeld model.
 */

const base: Omit<BistableSrParameters, 'sigma'> = {
  amplitude: 0.1, // sub-threshold (< A_c ≈ 0.385)
  driveOmega: 0.1,
  dt: 0.05,
  periods: 16,
  transientPeriods: 2,
  seed: 1234,
  x0: -1
};

describe('stochastic resonance', () => {
  test('no noise + sub-threshold drive: the state never leaves its well', () => {
    const r = stochasticResonanceResponse({ ...base, seed: 1, sigma: 0 });
    expect(r.transitions).toBe(0);
    expect(r.rightWellFraction).toBe(0); // started in the left well, stays there
    expect(r.responseAmplitude).toBeLessThan(0.1); // only the small intra-well linear response
  });

  test('the response-vs-noise curve has an interior maximum (the resonance)', () => {
    const sigmas = [0.1, 0.25, 0.4, 0.55, 0.8, 1.2];
    const curve = stochasticResonanceCurve(base, sigmas, 16);
    const responses = curve.map((c) => c.responseAmplitude);

    let idxMax = 0;
    for (let i = 1; i < responses.length; i += 1) {
      if (responses[i]! > responses[idxMax]!) idxMax = i;
    }
    // The optimum noise is interior, not at either end of the sweep.
    expect(idxMax).toBeGreaterThan(0);
    expect(idxMax).toBeLessThan(sigmas.length - 1);
    // Noise *amplifies* the response: the peak towers over the weak-noise end and
    // also exceeds the strong-noise end (where noise washes the signal back out).
    expect(responses[idxMax]!).toBeGreaterThan(3 * responses[0]!);
    expect(responses[idxMax]!).toBeGreaterThan(1.5 * responses[responses.length - 1]!);
  });

  test('inter-well hopping increases monotonically with noise', () => {
    const sigmas = [0.1, 0.4, 0.8, 1.2];
    const curve = stochasticResonanceCurve(base, sigmas, 8);
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i]!.transitions).toBeGreaterThanOrEqual(curve[i - 1]!.transitions);
    }
  });

  test('a fixed seed reproduces the response bit-for-bit', () => {
    const a = stochasticResonanceResponse({ ...base, sigma: 0.5 });
    const b = stochasticResonanceResponse({ ...base, sigma: 0.5 });
    expect(a.responseAmplitude).toBe(b.responseAmplitude);
    expect(a.transitions).toBe(b.transitions);
  });

  test('curve seeds wrap within uint32 without accepting invalid base seeds', () => {
    const compact = { ...base, periods: 0.01, transientPeriods: 0, dt: 0.5, seed: 0xffff_ffff };
    expect(() => stochasticResonanceCurve(compact, [0], 2)).not.toThrow();
    expect(() => stochasticResonanceCurve({ ...compact, seed: 0x1_0000_0000 }, [0], 1)).toThrow(/uint32/);
    expect(() => stochasticResonanceCurve(compact, [0], 1.5)).toThrow(/positive safe integer/);
  });

  test('rejects non-finite, subnormal, malformed, and unstable response controls', () => {
    const valid = { ...base, periods: 0.01, transientPeriods: 0, dt: 0.5, sigma: 0 };
    for (const override of [
      { amplitude: Number.NaN },
      { driveOmega: Number.POSITIVE_INFINITY },
      { driveOmega: Number.MIN_VALUE },
      { sigma: Number.POSITIVE_INFINITY },
      { dt: Number.POSITIVE_INFINITY },
      { dt: Number.MIN_VALUE },
      { periods: Number.POSITIVE_INFINITY },
      { transientPeriods: Number.POSITIVE_INFINITY },
      { transientPeriods: -1 },
      { x0: Number.NEGATIVE_INFINITY },
      { seed: -1 },
      { seed: 0x1_0000_0000 }
    ])
      expect(() => stochasticResonanceResponse({ ...valid, ...override })).toThrow();
    expect(() => stochasticResonanceResponse({ ...valid, amplitude: Number.MAX_VALUE, x0: Number.MAX_VALUE })).toThrow(
      /non-finite/
    );
  });

  test('bounds direct and aggregate resonance work before entering integration loops', () => {
    expect(() => stochasticResonanceResponse({ ...base, sigma: 0, dt: 1e-8, periods: 1 })).toThrow(/response work/);
    expect(() => stochasticResonanceCurve(base, new Array(100_001).fill(0), 1)).toThrow(/noise-level count/);
    expect(() => stochasticResonanceCurve(base, [0], 100_001)).toThrow(/realizations exceed/);
    expect(() => stochasticResonanceCurve({ ...base, periods: 100 }, new Array(10).fill(0.2), 100)).toThrow(
      /curve work/
    );
  });

  test('rejects sparse, negative, and non-finite noise grids', () => {
    expect(() => stochasticResonanceCurve(base, new Array<number>(1), 1)).toThrow(/present/);
    expect(() => stochasticResonanceCurve(base, [-0.1], 1)).toThrow(/non-negative/);
    expect(() => stochasticResonanceCurve(base, [Number.NaN], 1)).toThrow(/finite/);
  });
});
