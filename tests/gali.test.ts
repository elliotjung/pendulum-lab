import { describe, expect, test } from 'vitest';
import { galiIndicator, saliIndicator } from '../src/chaos/index';
import { rhsDriven, DAMPED_DRIVEN_CHAOS_PRESET } from '../src/physics/driven';
import { rhsDouble } from '../src/physics/double';

const driven = (s: Float64Array, o: Float64Array): void => {
  rhsDriven(s, DAMPED_DRIVEN_CHAOS_PRESET, o);
};
const oscillator = (s: Float64Array, o: Float64Array): void => {
  o[0] = s[1] ?? 0;
  o[1] = -(s[0] ?? 0);
};
const dpParams = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
const doublePendulum = (s: Float64Array, o: Float64Array): void => {
  rhsDouble(s, dpParams, 0, o);
};

describe('GALI_k', () => {
  test('collapses exponentially for chaos but stays O(1) for regular motion', () => {
    const chaos = galiIndicator(new Float64Array([0.2, 0, 0]), driven, 2, { steps: 8_000 });
    const regular = galiIndicator(new Float64Array([1, 0]), oscillator, 2, { steps: 8_000 });
    expect(chaos.finalGali).toBeLessThan(0.05);
    expect(regular.finalGali).toBeGreaterThan(0.1);
    expect(regular.collapsed).toBe(false);
    expect(regular.finalGali).toBeGreaterThan(chaos.finalGali * 100);
  });

  test('GALI_3 collapses at least as fast as GALI_2 on the chaotic driven pendulum', () => {
    // Each extra vector adds a positive gap lambda_1 - lambda_i to the decay
    // rate, so higher k can only fall faster (Skokos et al. 2007).
    const settings = { steps: 6_000, threshold: 0 };
    const g2 = galiIndicator(new Float64Array([0.2, 0, 0]), driven, 2, settings);
    const g3 = galiIndicator(new Float64Array([0.2, 0, 0]), driven, 3, settings);
    expect(g3.finalGali).toBeLessThanOrEqual(g2.finalGali * 1.01);
  });

  test('separates torus dimension on the regular double pendulum: GALI_2 survives, GALI_4 decays', () => {
    // Regular motion lies on a 2-torus in the 4D phase space: GALI_k is
    // bounded away from zero only for k <= 2, while k > 2 decays
    // algebraically (~t^{-2(k-2)}). The decay is driven by the torus shear
    // dOmega/dJ, which vanishes in the isochronous small-amplitude limit, so
    // the test uses a moderate-amplitude regular orbit where the separation
    // is unambiguous (calibrated: GALI_2 ~ 1.0 vs GALI_4 ~ 4.6e-3 at t = 120).
    const state0 = new Float64Array([0.5, 0.7, 0, 0]);
    const settings = { steps: 12_000, threshold: 0 };
    const g2 = galiIndicator(state0, doublePendulum, 2, settings);
    const g4 = galiIndicator(state0, doublePendulum, 4, settings);
    expect(g2.finalGali).toBeGreaterThan(0.1);
    expect(g4.finalGali).toBeLessThan(0.05);
    expect(g4.finalGali).toBeLessThan(g2.finalGali * 0.05);
  });

  test('GALI_2 brackets SALI: GALI_2 <= SALI <= sqrt(2)*GALI_2 on the same tangent flow', () => {
    // Both indicators evolve the same two unit deviation vectors; with equal
    // seeds the algebraic identity ||w1 ^ w2|| = sin(angle) versus
    // min-alignment norm forces this bracket at every sample.
    const options = { steps: 3_000, seed: 0x1234, threshold: 0 };
    const chaosState = new Float64Array([0.2, 0, 0]);
    const gali = galiIndicator(chaosState, driven, 2, options);
    const sali = saliIndicator(chaosState, driven, options);
    expect(sali.finalSali).toBeGreaterThanOrEqual(gali.finalGali * 0.999999);
    expect(sali.finalSali).toBeLessThanOrEqual(gali.finalGali * Math.SQRT2 * 1.000001);
  });

  test('rejects invalid k', () => {
    expect(() => galiIndicator(new Float64Array([1, 0]), oscillator, 1)).toThrow();
    expect(() => galiIndicator(new Float64Array([1, 0]), oscillator, 3)).toThrow();
    expect(() => galiIndicator(new Float64Array([1, 0]), oscillator, 2.5)).toThrow();
  });
});
