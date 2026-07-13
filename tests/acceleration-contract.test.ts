import { describe, expect, it } from 'vitest';
import {
  CHAOS_ACCELERATION_CONTRACTS,
  compareClvAcceleration,
  compareFtleFieldAcceleration,
  compareLyapunovSpectrumAcceleration
} from '../src/chaos';

describe('chaos GPU acceleration promotion contracts', () => {
  it('declares CLV, FTLE, and full-spectrum CPU oracle gates', () => {
    expect(CHAOS_ACCELERATION_CONTRACTS.map((contract) => contract.target).sort()).toEqual([
      'clv',
      'ftle-field',
      'lyapunov-spectrum'
    ]);
  });

  it('accepts near-identical Lyapunov spectra and rejects drift', () => {
    const reference = { spectrum: [0.2, 0.01, -0.01, -0.2], sum: 0, kaplanYorkeDimension: 4 };
    expect(
      compareLyapunovSpectrumAcceleration(
        { spectrum: [0.201, 0.009, -0.011, -0.199], sum: 0, kaplanYorkeDimension: 3.999 },
        reference,
        { spectrum: 0.005, aggregate: 0.01 }
      ).passed
    ).toBe(true);
    expect(
      compareLyapunovSpectrumAcceleration(
        { spectrum: [0.24, 0.01, -0.01, -0.2], sum: 0.04, kaplanYorkeDimension: 3.8 },
        reference,
        { spectrum: 0.005, aggregate: 0.01 }
      ).passed
    ).toBe(false);
  });

  it('compares CLV summaries with sign-invariant angle gates', () => {
    const comparison = compareClvAcceleration(
      { exponents: [0.5, -0.3], meanHyperbolicityAngle: 0.75, minHyperbolicityAngle: 0.4 },
      { exponents: [0.501, -0.299], meanHyperbolicityAngle: 0.752, minHyperbolicityAngle: 0.398 },
      { exponents: 0.005, angle: 0.01 }
    );
    expect(comparison.passed).toBe(true);
    expect(Number(comparison.metrics.exponentMaxAbsDiff)).toBeLessThan(0.005);
  });

  it('requires FTLE field shape and value agreement', () => {
    const reference = { values: Float64Array.of(0.1, 0.2, 0.3, 0.4), width: 2, height: 2, min: 0.1, max: 0.4 };
    expect(
      compareFtleFieldAcceleration(
        { values: Float64Array.of(0.101, 0.199, 0.301, 0.399), width: 2, height: 2, min: 0.101, max: 0.399 },
        reference,
        { field: 0.01, aggregate: 0.01 }
      ).passed
    ).toBe(true);
    expect(
      compareFtleFieldAcceleration(
        { values: Float64Array.of(0.1, 0.2), width: 1, height: 2, min: 0.1, max: 0.2 },
        reference,
        { field: 0.01, aggregate: 0.01 }
      ).passed
    ).toBe(false);
  });
});
