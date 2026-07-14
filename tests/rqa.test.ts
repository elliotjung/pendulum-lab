import { describe, expect, test } from 'vitest';
import { recurrenceMatrix, recurrenceQuantification, rqaBlockUncertainty, sampleObservable } from '../src/chaos/index';
import { mulberry32 } from '../src/chaos/variational';
import { rhsDouble } from '../src/physics/double';

/**
 * RQA must separate deterministic structure from noise on signals whose recurrence
 * geometry is analytically obvious: a pure sine is almost perfectly deterministic
 * (long, dense diagonals → DET ≈ 1, large Lmax), white noise is not (DET small).
 * On the double pendulum it must reproduce the chaos signature — a regular orbit
 * has far longer diagonal lines (smaller divergence) than a chaotic one — which
 * cross-validates the Lyapunov verdict without any tangent-space machinery.
 */

describe('RQA on synthetic signals', () => {
  const sine = Array.from({ length: 600 }, (_, j) => Math.sin(0.3 * j));
  const rng = mulberry32(2024);
  const noise = Array.from({ length: 600 }, () => rng() - 0.5);
  // The sine period is ≈ 2π/0.3 ≈ 20.9 samples; τ ≈ a quarter period unfolds it
  // into a clean limit cycle so the recurrence plot is long unbroken diagonals.
  const embedding = { dimension: 2, delay: 5, targetRecurrenceRate: 0.1 } as const;

  test('rejects malformed embedding and threshold options instead of silently clamping them', () => {
    const invalidOptions = [
      { dimension: 0 },
      { dimension: 1.5 },
      { delay: 0 },
      { delay: Number.POSITIVE_INFINITY },
      { epsilon: -1 },
      { epsilon: Number.NaN },
      { targetRecurrenceRate: 0 },
      { targetRecurrenceRate: 1 }
    ];
    for (const options of invalidOptions) {
      expect(() => recurrenceQuantification(sine, options)).toThrow();
      expect(() => recurrenceMatrix(sine, options)).toThrow();
    }
  });

  test('rejects invalid or embedding-empty uncertainty blocks', () => {
    expect(() => rqaBlockUncertainty(sine, embedding, 1)).toThrow(/blocks/);
    expect(() => rqaBlockUncertainty([1, 2, 3], {}, 4)).toThrow(/too short/);
    expect(() => rqaBlockUncertainty(sine.slice(0, 20), embedding, 4)).toThrow(/too short/);
  });

  test('a pure sine is highly deterministic with long diagonal lines', () => {
    const r = recurrenceQuantification(sine, embedding);
    expect(r.recurrenceRate).toBeGreaterThan(0.05);
    expect(r.recurrenceRate).toBeLessThan(0.2);
    expect(r.determinism).toBeGreaterThan(0.95);
    expect(r.longestDiagonal).toBeGreaterThan(20);
  });

  test('white noise is far less deterministic than the sine', () => {
    const r = recurrenceQuantification(noise, embedding);
    const s = recurrenceQuantification(sine, embedding);
    expect(r.determinism).toBeLessThan(0.6);
    expect(r.determinism).toBeLessThan(s.determinism);
  });

  test('is reproducible for identical input and options', () => {
    const a = recurrenceQuantification(sine, embedding);
    const b = recurrenceQuantification(sine, embedding);
    expect(a.determinism).toBe(b.determinism);
    expect(a.longestDiagonal).toBe(b.longestDiagonal);
  });

  test('a direct ε threshold controls the recurrence density monotonically', () => {
    const tight = recurrenceQuantification(sine, { dimension: 2, delay: 5, epsilon: 1e-9 });
    const loose = recurrenceQuantification(sine, { dimension: 2, delay: 5, epsilon: 1e6 });
    expect(tight.recurrenceRate).toBeLessThan(0.01);
    expect(loose.recurrenceRate).toBeGreaterThan(0.99);
  });
});

describe('RQA cross-validates the Lyapunov verdict on the double pendulum', () => {
  const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
  const rhs = (s: Float64Array, o: Float64Array): void => {
    rhsDouble(s, params, 0, o);
  };
  const observable = (s: Float64Array): number => Number(s[3] ?? 0);
  const sample = (state0: number[]): number[] =>
    sampleObservable(rhs, state0, { dt: 0.01, sampleEvery: 20, samples: 500, transientSteps: 2000, observable });

  test('a regular orbit has longer diagonals (smaller divergence) than a chaotic one', () => {
    const embedding = { dimension: 2, delay: 6, targetRecurrenceRate: 0.1 } as const;
    const regular = recurrenceQuantification(sample([0.2, 0.1, 0, 0]), embedding);
    const chaotic = recurrenceQuantification(sample([2.5, 2.5, 0, 0]), embedding);
    expect(regular.longestDiagonal).toBeGreaterThan(chaotic.longestDiagonal);
    expect(chaotic.divergence).toBeGreaterThan(regular.divergence);
  });
});
