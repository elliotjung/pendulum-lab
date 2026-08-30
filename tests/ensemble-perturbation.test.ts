import { describe, expect, it } from 'vitest';
import {
  buildPerturbedStates,
  normalizePerturbationVariableForSystem,
  stateIndexForPerturbation
} from '../src/app/ensemblePerturbation';

describe('explicit ensemble perturbation rules', () => {
  const initial = [(2 * Math.PI) / 3, Math.PI / 2, 0, 0];

  it('reproduces the legacy alternating ±kε rule on a user-selected variable', () => {
    const result = buildPerturbedStates(initial, 4, 4, 80, 'double', {
      variable: 'th2',
      pattern: 'alternating',
      epsilon: 1e-4,
      seed: 7
    });
    expect(result.members.map((state) => state[1]! - initial[1]!)).toEqual([
      expect.closeTo(1e-4, 14),
      expect.closeTo(-2e-4, 14),
      expect.closeTo(3e-4, 14),
      expect.closeTo(-4e-4, 14)
    ]);
    expect(result.members.every((state) => state[0] === initial[0])).toBe(true);
  });

  it('creates exact symmetric pairs', () => {
    const result = buildPerturbedStates(initial, 4, 4, 80, 'double', {
      variable: 'iw1',
      pattern: 'symmetric',
      epsilon: 1e-4,
      seed: 7
    });
    expect(result.members.map((state) => state[2])).toEqual([1e-4, -1e-4, 2e-4, -2e-4]);
  });

  it('regenerates seeded random and normalized ensembles byte-for-byte', () => {
    for (const pattern of ['random', 'normalized'] as const) {
      const spec = { variable: 'th1' as const, pattern, epsilon: 1e-4, seed: 20260826 };
      const first = buildPerturbedStates(initial, 4, 12, 80, 'double', spec);
      const second = buildPerturbedStates(initial, 4, 12, 80, 'double', spec);
      expect(first.members.map((state) => [...state])).toEqual(second.members.map((state) => [...state]));
    }
  });

  it('normalizes each state-space displacement to ε', () => {
    const epsilon = 3e-5;
    const result = buildPerturbedStates(initial, 4, 8, 80, 'double', {
      variable: 'iw2',
      pattern: 'normalized',
      epsilon,
      seed: 0
    });
    for (const state of result.members) {
      const norm = Math.hypot(...state.map((value, index) => value - initial[index]!));
      expect(norm).toBeCloseTo(epsilon, 14);
    }
  });

  it('maps angle and velocity variables to the model-specific state order', () => {
    expect(stateIndexForPerturbation('iw1', 'double')).toBe(2);
    expect(stateIndexForPerturbation('iw1', 'triple')).toBe(3);
    expect(stateIndexForPerturbation('th3', 'double')).toBeNull();
    expect(stateIndexForPerturbation('th3', 'triple')).toBe(2);
    expect(normalizePerturbationVariableForSystem('th3', 'double')).toBe('th1');
    expect(normalizePerturbationVariableForSystem('iw3', 'compound-double')).toBe('th1');
    expect(normalizePerturbationVariableForSystem('iw3', 'triple')).toBe('iw3');
    expect(() =>
      buildPerturbedStates(initial, 4, 1, 80, 'double', {
        variable: 'th3',
        pattern: 'alternating',
        epsilon: 1e-4,
        seed: 7
      })
    ).toThrow(/unavailable/u);
  });
});
