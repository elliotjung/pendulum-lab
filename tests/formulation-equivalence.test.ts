import { describe, expect, it } from 'vitest';
import { compareDoublePendulumFormulations } from '../src/validation/formulationEquivalence';

const parameters = { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 };

describe('Euler-Lagrange / Hamiltonian formulation comparison', () => {
  const fixtures = [
    { name: 'small-angle', state: [0.12, -0.08, 0, 0], horizon: 3 },
    { name: 'classic', state: [2, 2.5, 0, 0], horizon: 1 },
    { name: 'high-energy', state: [2.8, -2.4, 1.4, -0.8], horizon: 0.6 },
    { name: 'nonzero-velocity', state: [0.8, -0.4, 2.1, -1.2], horizon: 1.2 },
    { name: 'damped', state: [1.1, -0.7, 0.4, -0.2], horizon: 1, gamma: 0.15 }
  ] as const;

  for (const fixture of fixtures) {
    it(`agrees for the ${fixture.name} fixture over a bounded horizon`, () => {
      const result = compareDoublePendulumFormulations({
        parameters,
        initialState: fixture.state,
        dt: 0.001,
        horizon: fixture.horizon,
        gamma: 'gamma' in fixture ? fixture.gamma : 0
      });
      expect(result.verdict).toBe('agreement');
      expect(Math.max(...result.maxAngleDifference)).toBeLessThan(5e-7);
      expect(result.maxPositionDifference).toBeLessThan(1e-6);
      expect(result.maxEnergyDifference).toBeLessThan(1e-5);
      expect(result.maxNormalizedMismatch).toBeLessThanOrEqual(result.comparisonTolerance);
      expect(result.caveat).toContain('Short-horizon');
    });
  }

  it('rejects work that exceeds the interactive safety budget', () => {
    expect(() =>
      compareDoublePendulumFormulations({ parameters, initialState: [1, 1.2, 0, 0], dt: 1e-7, horizon: 1 })
    ).toThrow(/safety budget/i);
  });

  it('keeps the normalized verdict finite for a zero-energy static system', () => {
    const result = compareDoublePendulumFormulations({
      parameters: { ...parameters, g: 0 },
      initialState: [0, 0, 0, 0],
      dt: 0.001,
      horizon: 0.2
    });
    expect(result.verdict).toBe('agreement');
    expect(result.maxNormalizedMismatch).toBe(0);
    expect(Number.isFinite(result.comparisonTolerance)).toBe(true);
  });
});
