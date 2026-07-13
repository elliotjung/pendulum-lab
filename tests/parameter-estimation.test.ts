import { describe, it, expect } from 'vitest';
import {
  levenbergMarquardt,
  fitDoublePendulum,
  type ResidualFunction,
  type DoublePendulumObservation
} from '../src/research/parameterEstimation';
import { rhsDouble } from '../src/physics/double';
import { rk4Step } from '../src/physics/integrators';
import { gaussianSampler } from '../src/physics/stochastic';
import type { StateVector } from '../src/physics/types';
import type { PendulumParameters } from '../src/types/domain';

/**
 * Independent reference generator for the double-pendulum forward map, mirroring
 * the module's internal sub-stepping (each inter-sample span split into RK4
 * steps of size ≤ dt). Used to manufacture synthetic observations whose true
 * parameters are known, so the inverse solver can be graded against ground
 * truth rather than against itself.
 */
function referenceAngles(
  parameters: PendulumParameters,
  gamma: number,
  initialState: readonly [number, number, number, number],
  times: readonly number[],
  dt: number
): Array<[number, number]> {
  const state = Float64Array.from(initialState) as StateVector;
  const out = new Float64Array(4) as StateVector;
  const rhs = (s: StateVector, o: StateVector): void => {
    rhsDouble(s, parameters, gamma, o);
  };
  const angles: Array<[number, number]> = [];
  let t = 0;
  for (const target of times) {
    const span = target - t;
    if (span > 0) {
      const steps = Math.max(1, Math.ceil(span / dt - 1e-9));
      const h = span / steps;
      for (let k = 0; k < steps; k += 1) {
        rk4Step(state, h, rhs, out);
        state.set(out);
      }
      t = target;
    }
    angles.push([state[0]!, state[1]!]);
  }
  return angles;
}

describe('levenbergMarquardt (generic least squares)', () => {
  it('recovers the coefficients of a linear-in-parameters model to machine precision', () => {
    // Fit y = a + b*x + c*x^2 to noise-free data generated from known coeffs.
    const truth = [0.7, -1.3, 2.1];
    const xs = Array.from({ length: 20 }, (_, i) => -1 + (2 * i) / 19);
    const ys = xs.map((x) => truth[0]! + truth[1]! * x + truth[2]! * x * x);
    const residual: ResidualFunction = (p) => xs.map((x, i) => p[0]! + p[1]! * x + p[2]! * x * x - ys[i]!);

    const fit = levenbergMarquardt(residual, [0, 0, 0]);
    expect(fit.converged).toBe(true);
    expect(fit.parameters[0]!).toBeCloseTo(truth[0]!, 9);
    expect(fit.parameters[1]!).toBeCloseTo(truth[1]!, 9);
    expect(fit.parameters[2]!).toBeCloseTo(truth[2]!, 9);
    expect(fit.rmse).toBeLessThan(1e-8);
  });

  it('recovers the parameters of a nonlinear (exponential) model', () => {
    // y = A*exp(k*t): genuinely nonlinear in k, so Gauss–Newton/LM is exercised.
    const A = 2.5;
    const k = -0.8;
    const ts = Array.from({ length: 25 }, (_, i) => i * 0.2);
    const ys = ts.map((t) => A * Math.exp(k * t));
    const residual: ResidualFunction = (p) => ts.map((t, i) => p[0]! * Math.exp(p[1]! * t) - ys[i]!);

    const fit = levenbergMarquardt(residual, [1, 0], { maxIterations: 200 });
    expect(fit.converged).toBe(true);
    expect(fit.parameters[0]!).toBeCloseTo(A, 6);
    expect(fit.parameters[1]!).toBeCloseTo(k, 6);
  });

  it('throws on an underdetermined problem', () => {
    const residual: ResidualFunction = (p) => [p[0]! + p[1]! - 1]; // 1 residual, 2 params
    expect(() => levenbergMarquardt(residual, [0, 0])).toThrow(/underdetermined/);
  });

  it('respects lower bounds (projected step)', () => {
    // True minimiser of (p-(-2))^2 is -2, but we floor the parameter at 0.
    const residual: ResidualFunction = (p) => [p[0]! - -2, 0];
    const fit = levenbergMarquardt(residual, [1], { lowerBounds: [0] });
    expect(fit.parameters[0]!).toBeGreaterThanOrEqual(0);
    expect(fit.parameters[0]!).toBeCloseTo(0, 6);
  });
});

describe('levenbergMarquardt — uncertainty quantification', () => {
  it('reproduces the textbook standard error of the mean exactly', () => {
    // Fitting a constant c to data: ĉ = mean, s² = sample variance (dof = m−1),
    // SE = sample_std/√m. This is the exact closed form, not an approximation.
    const data = [2, 4, 4, 4, 5, 5, 7, 9];
    const m = data.length;
    const residual: ResidualFunction = (p) => data.map((d) => p[0]! - d);
    const fit = levenbergMarquardt(residual, [0]);

    const mean = data.reduce((s, d) => s + d, 0) / m;
    const sampleVar = data.reduce((s, d) => s + (d - mean) ** 2, 0) / (m - 1);
    expect(fit.parameters[0]!).toBeCloseTo(mean, 9);
    expect(fit.degreesOfFreedom).toBe(m - 1);
    expect(fit.residualVariance).toBeCloseTo(sampleVar, 7);
    expect(fit.standardErrors[0]!).toBeCloseTo(Math.sqrt(sampleVar / m), 7);
    expect(fit.correlation[0]![0]!).toBeCloseTo(1, 9);
  });

  it('reports degrees-of-freedom = 0 and NaN variance for an exactly-determined fit', () => {
    // 2 residuals, 2 parameters: the model can hit the data exactly (dof = 0).
    const residual: ResidualFunction = (p) => [p[0]! + p[1]! - 3, p[0]! - p[1]! - 1];
    const fit = levenbergMarquardt(residual, [0, 0]);
    expect(fit.parameters[0]!).toBeCloseTo(2, 6);
    expect(fit.parameters[1]!).toBeCloseTo(1, 6);
    expect(fit.degreesOfFreedom).toBe(0);
    expect(Number.isNaN(fit.residualVariance)).toBe(true);
  });

  it('its standard errors match the empirical scatter of a linear fit (Monte Carlo)', () => {
    // y = β0 + β1·x + ε, ε ~ N(0, σ²). For a linear model s²(JᵀJ)⁻¹ is the exact
    // estimator covariance, so the reported SE must match the spread of β̂ over
    // many noise realisations.
    const beta0 = 1.5;
    const beta1 = -0.8;
    const sigma = 0.2;
    const xs = Array.from({ length: 24 }, (_, i) => -1.5 + (3 * i) / 23);
    const noise = gaussianSampler(20260615);

    const trials = 500;
    const est0: number[] = [];
    const est1: number[] = [];
    let reportedSe0 = 0;
    let reportedSe1 = 0;
    for (let t = 0; t < trials; t += 1) {
      const ys = xs.map((x) => beta0 + beta1 * x + sigma * noise());
      const residual: ResidualFunction = (p) => xs.map((x, i) => p[0]! + p[1]! * x - ys[i]!);
      const fit = levenbergMarquardt(residual, [0, 0]);
      est0.push(fit.parameters[0]!);
      est1.push(fit.parameters[1]!);
      reportedSe0 += fit.standardErrors[0]!;
      reportedSe1 += fit.standardErrors[1]!;
    }
    reportedSe0 /= trials;
    reportedSe1 /= trials;

    const std = (xs2: number[]): number => {
      const mean = xs2.reduce((s, v) => s + v, 0) / xs2.length;
      return Math.sqrt(xs2.reduce((s, v) => s + (v - mean) ** 2, 0) / (xs2.length - 1));
    };
    const empiricalSe0 = std(est0);
    const empiricalSe1 = std(est1);

    // Mean reported SE should match the empirical SE within ~12% at 500 trials.
    expect(reportedSe0).toBeGreaterThan(empiricalSe0 * 0.88);
    expect(reportedSe0).toBeLessThan(empiricalSe0 * 1.12);
    expect(reportedSe1).toBeGreaterThan(empiricalSe1 * 0.88);
    expect(reportedSe1).toBeLessThan(empiricalSe1 * 1.12);
  });
});

describe('fitDoublePendulum (inverse problem)', () => {
  const base: PendulumParameters = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
  const initialState = [0.5, 0.3, 0, 0] as const;
  const times = Array.from({ length: 41 }, (_, i) => i * 0.05); // 0 .. 2.0 s
  const dt = 1e-3;

  it('recovers a single unknown (g) from a noise-free trajectory to high accuracy', () => {
    const angles = referenceAngles(base, 0, initialState, times, dt);
    const observation: DoublePendulumObservation = { times, angles };

    const fit = fitDoublePendulum(observation, {
      initialState,
      base: { ...base, g: 0 }, // g overwritten by the estimate; prove it isn't read
      gamma: 0,
      estimate: ['g'],
      initialGuess: [8.0],
      dt
    });

    expect(fit.converged).toBe(true);
    expect(fit.estimated.g!).toBeCloseTo(9.81, 4);
    expect(fit.parametersFull.g).toBeCloseTo(9.81, 4);
    expect(fit.rmse).toBeLessThan(1e-6);
  });

  it('recovers two unknowns (g and l2) simultaneously', () => {
    const angles = referenceAngles(base, 0, initialState, times, dt);
    const observation: DoublePendulumObservation = { times, angles };

    const fit = fitDoublePendulum(observation, {
      initialState,
      base,
      gamma: 0,
      estimate: ['g', 'l2'],
      initialGuess: [8.0, 0.8],
      dt
    });

    expect(fit.converged).toBe(true);
    expect(fit.estimated.g!).toBeCloseTo(9.81, 3);
    expect(fit.estimated.l2!).toBeCloseTo(1.0, 3);
  });

  it('stays close to the truth under small observation noise', () => {
    const clean = referenceAngles(base, 0, initialState, times, dt);
    // Deterministic pseudo-noise (no RNG dependency) at the 2e-3 rad level.
    const noisy = clean.map(
      ([a, b], i) => [a + 2e-3 * Math.sin(12.9898 * i), b + 2e-3 * Math.cos(78.233 * i)] as [number, number]
    );
    const observation: DoublePendulumObservation = { times, angles: noisy };

    const fit = fitDoublePendulum(observation, {
      initialState,
      base,
      gamma: 0,
      estimate: ['g'],
      initialGuess: [8.5],
      dt
    });

    // Noise floor ~2e-3 rad should not move g by more than a few percent.
    expect(fit.estimated.g!).toBeGreaterThan(9.6);
    expect(fit.estimated.g!).toBeLessThan(10.0);
    expect(fit.rmse).toBeGreaterThan(0); // residual cannot be driven to zero against noise
  });
});
