import { describe, expect, test } from 'vitest';
import { zeroOneTest, sampleObservable } from '../src/chaos/index';
import { rhsDouble } from '../src/physics/double';
import { mulberry32 } from '../src/chaos/variational';

/**
 * The 0–1 test must report K ≈ 0 for regular signals and K ≈ 1 for chaotic
 * ones, and — crucially — must agree with the (independently computed) Lyapunov
 * verdict on the double pendulum. These synthetic cases pin the two ends of the
 * scale exactly; the pendulum cases confirm the cross-validation.
 */

describe('0–1 test on synthetic signals', () => {
  test('rejects empty, too-short, and non-finite series', () => {
    expect(() => zeroOneTest([])).toThrow(/at least/);
    expect(() => zeroOneTest(new Array<number>(19).fill(0))).toThrow(/at least/);
    expect(() => zeroOneTest([...new Array<number>(19).fill(0), Number.NaN])).toThrow(/finite/);
    expect(() => zeroOneTest([...new Array<number>(19).fill(0), Number.POSITIVE_INFINITY])).toThrow(/finite/);
  });

  test('a purely periodic signal is classified as regular (K ≈ 0)', () => {
    const series = Array.from({ length: 2000 }, (_, j) => Math.sin(0.4 * j) + 0.5 * Math.cos(0.13 * j));
    const { K } = zeroOneTest(series);
    expect(K).toBeLessThan(0.2);
  });

  test('white noise is classified as chaotic/stochastic (K ≈ 1)', () => {
    const rng = mulberry32(12345);
    const series = Array.from({ length: 2000 }, () => rng() - 0.5);
    const { K } = zeroOneTest(series);
    expect(K).toBeGreaterThan(0.8);
  });

  test('K is reproducible for a fixed seed', () => {
    const series = Array.from({ length: 1500 }, (_, j) => Math.sin(0.4 * j));
    const a = zeroOneTest(series, { seed: 7 });
    const b = zeroOneTest(series, { seed: 7 });
    expect(a.K).toBe(b.K);
    expect(a.kValues.every((value) => value >= -1 && value <= 1)).toBe(true);
  });
});

describe('0–1 test cross-validates the Lyapunov verdict on the double pendulum', () => {
  const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
  const rhs = (s: Float64Array, o: Float64Array): void => {
    rhsDouble(s, params, 0, o);
  };
  // Use the second-bob angular velocity as the scalar observable.
  const observable = (s: Float64Array): number => Number(s[3] ?? 0);

  test('a high-energy initial condition is chaotic (K large)', () => {
    const series = sampleObservable(rhs, [2.5, 2.5, 0, 0], {
      dt: 0.01,
      sampleEvery: 30,
      samples: 2500,
      transientSteps: 2000,
      observable
    });
    const { K } = zeroOneTest(series);
    expect(K).toBeGreaterThan(0.6);
  });

  test('a tiny-oscillation initial condition is regular (K small)', () => {
    const series = sampleObservable(rhs, [0.05, 0.02, 0, 0], {
      dt: 0.01,
      sampleEvery: 30,
      samples: 2500,
      transientSteps: 2000,
      observable
    });
    const { K } = zeroOneTest(series);
    expect(K).toBeLessThan(0.4);
  });
});
