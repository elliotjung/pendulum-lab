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
});
