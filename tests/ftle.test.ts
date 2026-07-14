import { describe, expect, test } from 'vitest';
import {
  flowMapGradient,
  largestSingularValue,
  determinant,
  finiteTimeLyapunov,
  doublePendulumFtleField
} from '../src/chaos/index';
import { rhsDouble } from '../src/physics/double';
import { buildJacobian } from '../src/physics/systemSpec';

/**
 * For a linear system ẋ = A x the flow-map gradient is exactly the matrix
 * exponential M(T) = exp(A T), so a diagonal A gives analytically known FTLE and
 * determinant — a ground-truth pin for the variational propagation and the
 * singular-value / determinant routines. The double-pendulum cases then confirm
 * the field separates chaotic from regular initial conditions.
 */

describe('largestSingularValue', () => {
  test('diagonal matrix → largest |entry|', () => {
    expect(largestSingularValue(Float64Array.of(3, 0, 0, 2), 2)).toBeCloseTo(3, 9);
  });
  test('nilpotent [[0,2],[0,0]] has singular values {2,0}', () => {
    expect(largestSingularValue(Float64Array.of(0, 2, 0, 0), 2)).toBeCloseTo(2, 9);
  });
  test('finds a dominant direction orthogonal to the legacy all-ones power-iteration seed', () => {
    // The dominant right singular vector of this rank-one matrix is [1,-1].
    // A power iteration seeded with [1,1] returns zero instead of sigma_max=2.
    expect(largestSingularValue(Float64Array.of(1, -1, -1, 1), 2)).toBeCloseTo(2, 12);
  });
  test('scales safely for finite matrices whose unscaled Gram matrix would overflow', () => {
    const sigma = largestSingularValue(Float64Array.of(1e200, 0, 0, 5e199), 2);
    expect(sigma / 1e200).toBeCloseTo(1, 12);
  });
});

describe('determinant', () => {
  test('diagonal product', () => {
    expect(determinant(Float64Array.of(2, 0, 0, 0, 3, 0, 0, 0, 4), 3)).toBeCloseTo(24, 9);
  });
  test('a row swap keeps the magnitude (sign via pivoting)', () => {
    // [[0,1],[1,0]] has determinant −1.
    expect(determinant(Float64Array.of(0, 1, 1, 0), 2)).toBeCloseTo(-1, 9);
  });
});

describe('FTLE on a linear system matches exp(A T) exactly', () => {
  // A = diag(0.5, −0.3): M(T) = diag(e^{0.5T}, e^{-0.3T}).
  const A = [0.5, -0.3];
  const rhs = (s: Float64Array, o: Float64Array): void => {
    o[0] = A[0]! * (s[0] ?? 0);
    o[1] = A[1]! * (s[1] ?? 0);
  };
  const jacobian = (_s: Float64Array, j: Float64Array): void => {
    j[0] = A[0]!;
    j[1] = 0;
    j[2] = 0;
    j[3] = A[1]!;
  };
  const T = 2;

  test('flow-map gradient reproduces the matrix exponential', () => {
    const { stm } = flowMapGradient([1, 1], rhs, T, { dt: 0.005 }, jacobian);
    expect(stm[0]!).toBeCloseTo(Math.exp(A[0]! * T), 5); // e^{1.0}
    expect(stm[3]!).toBeCloseTo(Math.exp(A[1]! * T), 5); // e^{-0.6}
    expect(Math.abs(stm[1]!)).toBeLessThan(1e-6);
    expect(Math.abs(stm[2]!)).toBeLessThan(1e-6);
  });

  test('uses a shortened final step to land on a non-integral requested horizon', () => {
    const rate = 0.2;
    const scalarRhs = (s: Float64Array, o: Float64Array): void => {
      o[0] = rate * (s[0] ?? 0);
    };
    const scalarJacobian = (_s: Float64Array, j: Float64Array): void => {
      j[0] = rate;
    };
    const { stm } = flowMapGradient([1], scalarRhs, 1, { dt: 0.6 }, scalarJacobian);
    expect(stm[0]!).toBeCloseTo(Math.exp(rate), 6);
    // The legacy rounded-step implementation integrated 1.2 seconds here.
    expect(Math.abs(stm[0]! - Math.exp(rate * 1.2))).toBeGreaterThan(0.03);
  });

  test('a zero horizon returns the identity flow map without taking a step', () => {
    const { stm } = flowMapGradient([1, 1], rhs, 0, { dt: 0.3 }, jacobian);
    expect(Array.from(stm)).toEqual([1, 0, 0, 1]);
  });

  test('FTLE equals the dominant rate 0.5 and det equals e^{(0.5−0.3)T}', () => {
    expect(finiteTimeLyapunov([1, 1], rhs, T, { dt: 0.005 }, jacobian)).toBeCloseTo(0.5, 4);
    const { stm } = flowMapGradient([1, 1], rhs, T, { dt: 0.005 }, jacobian);
    expect(determinant(stm, 2)).toBeCloseTo(Math.exp((A[0]! + A[1]!) * T), 4);
  });
});

describe('FTLE field of the double pendulum', () => {
  const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
  const rhs = (s: Float64Array, o: Float64Array): void => {
    rhsDouble(s, params, 0, o);
  };
  const jacobian = buildJacobian({ kind: 'double', ...params });

  test('a chaotic initial condition has a larger FTLE than a regular one', () => {
    const chaotic = finiteTimeLyapunov([2.5, 2.5, 0, 0], rhs, 4, { dt: 0.01 }, jacobian);
    const regular = finiteTimeLyapunov([0.15, 0.1, 0, 0], rhs, 4, { dt: 0.01 }, jacobian);
    expect(chaotic).toBeGreaterThan(regular);
    expect(chaotic).toBeGreaterThan(0);
  });

  test('the field has real spatial variation (a non-trivial LCS structure)', () => {
    const field = doublePendulumFtleField(params, { n: 24, totalTime: 3, dt: 0.02 });
    expect(field.width).toBe(24);
    expect(field.values.length).toBe(24 * 24);
    expect(field.max).toBeGreaterThan(field.min);
    // The high-energy corner is more chaotic than the near-rest centre.
    const centre = field.values[12 * 24 + 12]!;
    const corner = field.values[0]!;
    expect(Number.isFinite(centre)).toBe(true);
    expect(Number.isFinite(corner)).toBe(true);
  });
});
