import { describe, expect, test } from 'vitest';
import { ilqrSolve, makeDoublePendulumStepMap, makeDoubleSwingUpProblem } from '../src/control/ilqr';
import { rhsDoubleActuated } from '../src/control/actuated';
import { rk4Step } from '../src/physics/integrators';
import type { StateVector } from '../src/physics/types';

const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };

const TIGHT_QF = [
  [1000, 0, 0, 0],
  [0, 1000, 0, 0],
  [0, 0, 200, 0],
  [0, 0, 0, 200]
];

describe('discrete step map', () => {
  test('matches one RK4 step of the actuated dynamics with ZOH torque', () => {
    const stepMap = makeDoublePendulumStepMap(params, 0.05, 0.01, 'full');
    const x = [0.4, -0.2, 0.7, -0.1];
    const u = [0.3, -0.8];
    const viaMap = new Float64Array(4);
    stepMap(x, u, viaMap);

    const direct = new Float64Array(4);
    const rhs = (s: StateVector, o: StateVector): void => {
      rhsDoubleActuated(s, params, 0.05, u, o);
    };
    rk4Step(Float64Array.from(x), 0.01, rhs, direct);
    expect(Array.from(viaMap)).toEqual(Array.from(direct));
  });

  test('acrobot map exposes a single control channel mapped to the elbow torque', () => {
    const stepMap = makeDoublePendulumStepMap(params, 0, 0.01, 'acrobot');
    const x = [0.4, -0.2, 0.7, -0.1];
    const viaMap = new Float64Array(4);
    stepMap(x, [0.5], viaMap);
    const direct = new Float64Array(4);
    const rhs = (s: StateVector, o: StateVector): void => {
      rhsDoubleActuated(s, params, 0, [0, 0.5], o);
    };
    rk4Step(Float64Array.from(x), 0.01, rhs, direct);
    expect(Array.from(viaMap)).toEqual(Array.from(direct));
  });
});

describe('iLQR swing-up (crocoddyl/drake-style DDP variant)', () => {
  test('fully-actuated swing-up: hanging to inverted in 3 s with a non-increasing cost', () => {
    const problem = makeDoubleSwingUpProblem({
      parameters: params,
      gamma: 0,
      dt: 0.025,
      horizon: 120,
      Qf: TIGHT_QF
    });
    const result = ilqrSolve(problem, { maxIterations: 300 });
    // Line-search acceptance only on actual decrease makes this exact.
    for (let i = 1; i < result.costHistory.length; i += 1) {
      expect(result.costHistory[i]!).toBeLessThan(result.costHistory[i - 1]!);
    }
    expect(result.costHistory.length).toBeGreaterThan(10);
    expect(result.cost).toBeLessThan(20);
    const xN = result.xs[result.xs.length - 1]!;
    // Calibrated run reaches [3.1386, 3.1389, 0.0065, 0.0050] vs goal [pi, pi, 0, 0].
    expect(Math.abs(xN[0]! - Math.PI)).toBeLessThan(0.02);
    expect(Math.abs(xN[1]! - Math.PI)).toBeLessThan(0.02);
    expect(Math.abs(xN[2]!)).toBeLessThan(0.05);
    expect(Math.abs(xN[3]!)).toBeLessThan(0.05);
    // The optimised rollout must satisfy the dynamics: replaying us through
    // the step map reproduces the stored states exactly.
    const replay = Float64Array.from(problem.x0);
    const next = new Float64Array(4);
    for (let k = 0; k < problem.horizon; k += 1) {
      problem.dynamics(replay, result.us[k]!, next);
      replay.set(next);
    }
    for (let i = 0; i < 4; i += 1) expect(replay[i]).toBe(xN[i]);
  }, 30_000);

  test('underactuated acrobot recovers to the upright goal with the elbow motor only', () => {
    const problem = makeDoubleSwingUpProblem({
      parameters: params,
      gamma: 0,
      dt: 0.02,
      horizon: 150,
      mode: 'acrobot',
      Q: [
        [0.02, 0, 0, 0],
        [0, 0.02, 0, 0],
        [0, 0, 0.002, 0],
        [0, 0, 0, 0.002]
      ],
      R: [[0.002]],
      Qf: TIGHT_QF
    });
    problem.x0 = [Math.PI - 0.15, Math.PI + 0.1, 0, 0];
    const result = ilqrSolve(problem, { maxIterations: 300 });
    expect(result.converged).toBe(true);
    expect(result.us[0]!.length).toBe(1); // single actuated channel
    const xN = result.xs[result.xs.length - 1]!;
    // Calibrated run reaches [3.1224, 3.1328, 0.0439, 0.0270].
    expect(Math.abs(xN[0]! - Math.PI)).toBeLessThan(0.05);
    expect(Math.abs(xN[1]! - Math.PI)).toBeLessThan(0.05);
    expect(Math.abs(xN[2]!)).toBeLessThan(0.1);
    expect(Math.abs(xN[3]!)).toBeLessThan(0.1);
  }, 30_000);

  test('torque limits are respected throughout the optimised sequence', () => {
    const problem = makeDoubleSwingUpProblem({
      parameters: params,
      gamma: 0,
      dt: 0.025,
      horizon: 120,
      Qf: TIGHT_QF,
      torqueLimit: 8
    });
    const result = ilqrSolve(problem, { maxIterations: 150 });
    for (const u of result.us) {
      for (const value of u) expect(Math.abs(value)).toBeLessThanOrEqual(8 + 1e-12);
    }
    for (let i = 1; i < result.costHistory.length; i += 1) {
      expect(result.costHistory[i]!).toBeLessThan(result.costHistory[i - 1]!);
    }
  }, 30_000);
});
