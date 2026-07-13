import { describe, expect, test } from 'vitest';
import {
  canonicalHamiltonian,
  canonicalRhs,
  canonicalStepThetaOmega,
  omegaToMomentum,
  momentumToOmega,
  rhsDouble,
  rhsTriple,
  rk4Step
} from '../src/physics';

const doubleParameters = { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 };

function finiteArray(values: ArrayLike<number>): boolean {
  return Array.from(values).every(Number.isFinite);
}

describe('physics edge cases', () => {
  test('canonical theta/p conversion round-trips theta/omega coordinates', () => {
    const thetaOmega = new Float64Array([0.7, -0.35, 0.2, -0.12]);
    const canonical = omegaToMomentum(thetaOmega, doubleParameters);
    const recovered = momentumToOmega(canonical, doubleParameters);
    expect(recovered[0]).toBeCloseTo(thetaOmega[0]!, 12);
    expect(recovered[1]).toBeCloseTo(thetaOmega[1]!, 12);
    expect(recovered[2]).toBeCloseTo(thetaOmega[2]!, 12);
    expect(recovered[3]).toBeCloseTo(thetaOmega[3]!, 12);
  });

  test('canonical Hamiltonian RHS and midpoint stats stay finite', () => {
    const canonical = omegaToMomentum([0.5, 0.8, 0.05, -0.03], doubleParameters);
    const rhs = canonicalRhs(canonical, doubleParameters, 0);
    const h0 = canonicalHamiltonian(canonical, doubleParameters).total;
    const result = canonicalStepThetaOmega([0.5, 0.8, 0.05, -0.03], 0.001, doubleParameters, 0);
    expect(finiteArray(rhs)).toBe(true);
    expect(Number.isFinite(h0)).toBe(true);
    expect(result.stats.iterations).toBeGreaterThan(0);
    expect(Number.isFinite(result.stats.residual)).toBe(true);
    expect(finiteArray(result.state)).toBe(true);
  });

  test('double pendulum RHS remains finite for extreme but valid mass and length ratios', () => {
    const parameters = { m1: 0.02, m2: 80, l1: 0.05, l2: 20, g: 9.81 };
    const out = new Float64Array(4);
    rhsDouble([2.8, -2.4, 8, -7], parameters, 0.02, out);
    expect(finiteArray(out)).toBe(true);
  });

  test('RK4 handles very small and large safe dt without non-finite state', () => {
    for (const dt of [1e-6, 0.05]) {
      const state = new Float64Array([0.6, 0.9, 0.1, -0.2]);
      const out = new Float64Array(4);
      rk4Step(state, dt, (s, o) => rhsDouble(s, doubleParameters, 0, o), out);
      expect(finiteArray(out)).toBe(true);
    }
  });

  test('triple pendulum RHS stays finite in a stress configuration', () => {
    const parameters = { m1: 0.5, m2: 8, m3: 0.08, l1: 0.2, l2: 4, l3: 0.15, g: 9.81 };
    const out = new Float64Array(6);
    rhsTriple([2.9, -2.7, 2.4, 12, -10, 8], parameters, 0.05, out);
    expect(finiteArray(out)).toBe(true);
  });
});
