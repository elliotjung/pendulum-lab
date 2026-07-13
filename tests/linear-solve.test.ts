import { describe, expect, test } from 'vitest';
import { solveLinearInPlace } from '../src/physics/linearSolve';

describe('linear solver diagnostics', () => {
  test('solves a well-conditioned system and reports residual diagnostics when requested', () => {
    const a = new Float64Array([3, 1, 1, 2]);
    const b = new Float64Array([5, 5]);

    const result = solveLinearInPlace(a, b, 2, { diagnostics: true });

    expect(result.ok).toBe(true);
    expect(b[0]).toBeCloseTo(1, 14);
    expect(b[1]).toBeCloseTo(2, 14);
    expect(result.matrixScale).toBe(3);
    expect(result.rhsScale).toBe(5);
    expect(result.minPivotAbs).toBeGreaterThan(0);
    expect(result.maxPivotAbs).toBeGreaterThanOrEqual(result.minPivotAbs ?? 0);
    expect(result.conditionEstimate).toBeGreaterThanOrEqual(1);
    expect(result.residualNorm).toBeLessThan(1e-12);
    expect(result.relativeResidual).toBeLessThan(1e-13);
    expect(result.fallbackPolicy).toBe('return-diagnostics');
  });

  test('keeps the hot path residual-free unless diagnostics are requested', () => {
    const result = solveLinearInPlace(new Float64Array([2, 0, 0, 4]), new Float64Array([2, 8]), 2);

    expect(result.ok).toBe(true);
    expect(result.residualNorm).toBeUndefined();
    expect(result.relativeResidual).toBeUndefined();
  });

  test('returns structured singular-matrix diagnostics instead of fabricating a fallback solution', () => {
    const b = new Float64Array([3, 6]);
    const result = solveLinearInPlace(new Float64Array([1, 2, 2, 4]), b, 2);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('singular-matrix');
    expect(result.pivotIndex).toBe(1);
    expect(result.pivotAbs).toBeLessThan(1e-14);
    expect(result.conditionEstimate).toBe(Infinity);
    expect(result.fallbackPolicy).toBe('return-diagnostics');
  });

  test('can fail fast at the solver boundary for research-only call sites', () => {
    expect(() =>
      solveLinearInPlace(new Float64Array([1, 2, 2, 4]), new Float64Array([3, 6]), 2, { fallbackPolicy: 'throw' })
    ).toThrow(/linear solve failed/);
  });
});
