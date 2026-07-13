import { describe, expect, it } from 'vitest';
import {
  buildFeatureLibrary,
  finiteDifferenceDerivatives,
  identifyDynamics,
  type SindyResult
} from '../src/research/sindy';
import { mulberry32 } from '../src/physics/variational';
import { rhsDuffing, type DuffingParameters } from '../src/physics/duffing';
import { rk4Step } from '../src/physics/integrators';
import type { StateVector } from '../src/physics/types';

/** Coefficient of a named term in one equation (0 if pruned / absent). */
function coeff(result: SindyResult, stateIndex: number, termName: string): number {
  const idx = result.terms.findIndex((t) => t.name === termName);
  if (idx < 0) return Number.NaN;
  return result.equations[stateIndex]!.coefficients[idx]!;
}

function activeTermNames(result: SindyResult, stateIndex: number): string[] {
  return result.equations[stateIndex]!.activeTerms.map((a) => a.term).sort();
}

describe('SINDy feature library', () => {
  it('builds the total-degree polynomial basis with the constant first', () => {
    const { terms, theta } = buildFeatureLibrary([[2, 3]], { polynomialDegree: 2 });
    // C(dim+deg, deg) = C(4,2) = 6 terms.
    expect(terms.map((t) => t.name)).toEqual(['1', 'x0', 'x1', 'x0^2', 'x0 x1', 'x1^2']);
    // Θ row for (x0,x1)=(2,3): [1, 2, 3, 4, 6, 9].
    expect(theta[0]).toEqual([1, 2, 3, 4, 6, 9]);
  });

  it('appends sin/cos columns when includeTrig is set', () => {
    const { terms, theta } = buildFeatureLibrary([[0.5, -0.25]], { polynomialDegree: 1, includeTrig: true });
    expect(terms.map((t) => t.name)).toEqual(['1', 'x0', 'x1', 'sin(x0)', 'cos(x0)', 'sin(x1)', 'cos(x1)']);
    const row = theta[0]!;
    expect(row[3]).toBeCloseTo(Math.sin(0.5), 12);
    expect(row[4]).toBeCloseTo(Math.cos(0.5), 12);
    expect(row[5]).toBeCloseTo(Math.sin(-0.25), 12);
  });
});

describe('SINDy identification — exact derivatives recover the governing equations', () => {
  it('recovers a linear oscillator x0′=v, x1′=-4 x0 exactly and sparsely', () => {
    const rng = mulberry32(0x51d2);
    const states: number[][] = [];
    const derivatives: number[][] = [];
    for (let i = 0; i < 400; i += 1) {
      const x = -2 + 4 * rng();
      const v = -3 + 6 * rng();
      states.push([x, v]);
      derivatives.push([v, -4 * x]);
    }
    const result = identifyDynamics(states, derivatives, { polynomialDegree: 2 }, { threshold: 0.1 });

    expect(activeTermNames(result, 0)).toEqual(['x1']);
    expect(activeTermNames(result, 1)).toEqual(['x0']);
    expect(coeff(result, 0, 'x1')).toBeCloseTo(1, 6);
    expect(coeff(result, 1, 'x0')).toBeCloseTo(-4, 6);
    // Every other library coefficient is pruned to exactly zero.
    expect(coeff(result, 0, '1')).toBe(0);
    expect(coeff(result, 0, 'x0^2')).toBe(0);
    expect(coeff(result, 1, 'x1^2')).toBe(0);
    expect(result.equations[0]!.rSquared).toBeGreaterThan(1 - 1e-9);
    expect(result.equations[1]!.residualNorm).toBeLessThan(1e-9);
  });

  it("recovers the engine's autonomous Duffing coefficients from rhsDuffing samples", () => {
    const params: DuffingParameters = {
      damping: 0.3,
      linearStiffness: -1,
      cubicStiffness: 1,
      driveAmplitude: 0,
      driveFrequency: 1.2
    };
    const rng = mulberry32(0xd00f);
    const states: number[][] = [];
    const derivatives: number[][] = [];
    const out = new Float64Array(3) as unknown as StateVector;
    for (let i = 0; i < 600; i += 1) {
      const x = -1.6 + 3.2 * rng();
      const v = -1.6 + 3.2 * rng();
      rhsDuffing([x, v, 0], params, out);
      states.push([x, v]);
      derivatives.push([out[0]!, out[1]!]);
    }
    const result = identifyDynamics(states, derivatives, { polynomialDegree: 3 }, { threshold: 0.05 });

    // x0' = v  (sparse: just x1).
    expect(activeTermNames(result, 0)).toEqual(['x1']);
    expect(coeff(result, 0, 'x1')).toBeCloseTo(1, 8);
    // x1' = -δ v - α x - β x³ = -0.3 v + 1·x - 1·x³ for these params.
    expect(activeTermNames(result, 1)).toEqual(['x0', 'x0^3', 'x1']);
    expect(coeff(result, 1, 'x0')).toBeCloseTo(-params.linearStiffness, 6); // +1
    expect(coeff(result, 1, 'x0^3')).toBeCloseTo(-params.cubicStiffness, 6); // -1
    expect(coeff(result, 1, 'x1')).toBeCloseTo(-params.damping, 6); // -0.3
    // No spurious quadratic/other cubic terms survive.
    expect(coeff(result, 1, 'x0^2')).toBe(0);
    expect(coeff(result, 1, 'x0^2 x1')).toBe(0);
    expect(result.equations[1]!.residualNorm).toBeLessThan(1e-9);
  });

  it('recovers a pendulum sine nonlinearity and the -g/l coefficient', () => {
    const g = 9.81;
    const l = 1;
    const rng = mulberry32(0xbeef);
    const states: number[][] = [];
    const derivatives: number[][] = [];
    for (let i = 0; i < 500; i += 1) {
      const th = -2.5 + 5 * rng();
      const om = -3 + 6 * rng();
      states.push([th, om]);
      derivatives.push([om, -(g / l) * Math.sin(th)]);
    }
    const result = identifyDynamics(
      states,
      derivatives,
      { polynomialDegree: 1, includeTrig: true },
      { threshold: 0.2 }
    );

    expect(activeTermNames(result, 0)).toEqual(['x1']);
    expect(activeTermNames(result, 1)).toEqual(['sin(x0)']);
    expect(coeff(result, 1, 'sin(x0)')).toBeCloseTo(-g / l, 6);
    expect(coeff(result, 1, 'x0')).toBe(0); // the linear term is correctly NOT used
  });
});

describe('SINDy with finite-differenced derivatives (realistic pipeline)', () => {
  it('recovers Duffing from an RK4 trajectory and central differences', () => {
    const drift = (s: StateVector, o: StateVector): StateVector => {
      o[0] = s[1]!;
      o[1] = -0.3 * s[1]! + s[0]! - s[0]! ** 3;
      return o;
    };
    const dt = 0.005;
    const states: number[][] = [];
    let s = Float64Array.from([1.2, 0.4]) as unknown as StateVector;
    const next = new Float64Array(2) as unknown as StateVector;
    for (let i = 0; i < 4000; i += 1) {
      states.push([s[0]!, s[1]!]);
      rk4Step(s, dt, drift, next);
      s = Float64Array.from(next) as unknown as StateVector;
    }
    const derivatives = finiteDifferenceDerivatives(states, dt);
    const result = identifyDynamics(states, derivatives, { polynomialDegree: 3 }, { threshold: 0.05 });

    expect(activeTermNames(result, 1)).toEqual(['x0', 'x0^3', 'x1']);
    // Central differences are O(dt²); coefficients land within ~1e-3 of truth.
    expect(coeff(result, 1, 'x0')).toBeCloseTo(1, 3);
    expect(coeff(result, 1, 'x0^3')).toBeCloseTo(-1, 3);
    expect(coeff(result, 1, 'x1')).toBeCloseTo(-0.3, 3);
    expect(result.equations[1]!.rSquared).toBeGreaterThan(0.9999);
  });

  it('central-difference derivatives match a known closed form to O(dt^2)', () => {
    // x(t) = (sin t, cos t) ⇒ ẋ = (cos t, -sin t).
    const dt = 1e-3;
    const states: number[][] = [];
    for (let i = 0; i < 200; i += 1) {
      const t = i * dt;
      states.push([Math.sin(t), Math.cos(t)]);
    }
    const d = finiteDifferenceDerivatives(states, dt);
    const mid = 100;
    const t = mid * dt;
    expect(d[mid]![0]).toBeCloseTo(Math.cos(t), 6);
    expect(d[mid]![1]).toBeCloseTo(-Math.sin(t), 6);
  });
});

describe('SINDy input validation', () => {
  it('rejects empty, mismatched, or ragged input', () => {
    expect(() => identifyDynamics([], [], { polynomialDegree: 1 }, { threshold: 0.1 })).toThrow(/empty/);
    expect(() =>
      identifyDynamics(
        [[1, 2]],
        [
          [1, 2],
          [3, 4]
        ],
        { polynomialDegree: 1 },
        { threshold: 0.1 }
      )
    ).toThrow(/same number/);
    expect(() =>
      identifyDynamics(
        [[1, 2], [3]],
        [
          [1, 2],
          [3, 4]
        ],
        { polynomialDegree: 1 },
        { threshold: 0.1 }
      )
    ).toThrow(/rectangular/);
  });

  it('reports a rank-deficient library rather than returning a bogus fit', () => {
    // 2 samples but a degree-3 library (10 terms) ⇒ ΘᵀΘ is singular.
    const states = [
      [0.1, 0.2],
      [0.3, 0.4]
    ];
    const derivatives = [
      [0.2, -0.1],
      [0.4, -0.3]
    ];
    expect(() => identifyDynamics(states, derivatives, { polynomialDegree: 3 }, { threshold: 0.01 })).toThrow(
      /rank-deficient|positive-definite/
    );
  });
});
