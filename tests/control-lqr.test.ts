import { describe, expect, test } from 'vitest';
import { rhsDouble, energyDouble } from '../src/physics/double';
import { rk4Step } from '../src/physics/integrators';
import type { StateVector } from '../src/physics/types';
import {
  DOUBLE_UPRIGHT_STATE,
  controlMatrixDouble,
  rhsDoubleActuated,
  uprightEnergyDouble,
  wrapAngle
} from '../src/control/actuated';
import {
  designUprightLqr,
  discretizeLinear,
  lqrLyapunovLevel,
  lqrTorque,
  matExp,
  solveDare
} from '../src/control/lqr';
import { mulberry32 } from '../src/chaos/variational';

const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };

describe('actuated double-pendulum dynamics', () => {
  test('tau = 0 reproduces rhsDouble exactly (same formulas, bitwise)', () => {
    const rng = mulberry32(0xac7ed);
    for (let trial = 0; trial < 20; trial += 1) {
      const state = new Float64Array([rng() * 6 - 3, rng() * 6 - 3, rng() * 4 - 2, rng() * 4 - 2]);
      const gamma = trial % 2 === 0 ? 0 : 0.1;
      const plain = new Float64Array(4);
      const actuated = new Float64Array(4);
      rhsDouble(state, params, gamma, plain);
      rhsDoubleActuated(state, params, gamma, [0, 0], actuated);
      expect(Array.from(actuated)).toEqual(Array.from(plain));
    }
  });

  test('closed-form control matrix B matches central differences of the actuated RHS', () => {
    const rng = mulberry32(0xb0b);
    for (let trial = 0; trial < 10; trial += 1) {
      const state = new Float64Array([rng() * 6 - 3, rng() * 6 - 3, rng() * 4 - 2, rng() * 4 - 2]);
      const b = new Float64Array(8);
      controlMatrixDouble(state, params, b);
      const h = 1e-6;
      const plus = new Float64Array(4);
      const minus = new Float64Array(4);
      for (let j = 0; j < 2; j += 1) {
        const tauPlus = [0, 0];
        const tauMinus = [0, 0];
        tauPlus[j] = h;
        tauMinus[j] = -h;
        rhsDoubleActuated(state, params, 0, tauPlus, plus);
        rhsDoubleActuated(state, params, 0, tauMinus, minus);
        for (let i = 0; i < 4; i += 1) {
          const fd = ((plus[i] ?? 0) - (minus[i] ?? 0)) / (2 * h);
          expect(Math.abs((b[i * 2 + j] ?? 0) - fd)).toBeLessThan(1e-8);
        }
      }
    }
  });

  test('joint torques inject power tau1*w1 + tau2*(w2 - w1), pinning the virtual-work map', () => {
    const state = new Float64Array([0.9, -0.4, 1.3, -0.7]);
    const tau = [0.8, -0.5];
    const dt = 1e-6;
    const out = new Float64Array(4);
    const rhs = (s: StateVector, o: StateVector): void => {
      rhsDoubleActuated(s, params, 0, tau, o);
    };
    rk4Step(state, dt, rhs, out);
    const numericalPower = (energyDouble(out, params).total - energyDouble(state, params).total) / dt;
    const w1 = state[2]!;
    const w2 = state[3]!;
    const analyticPower = tau[0]! * w1 + tau[1]! * (w2 - w1);
    expect(Math.abs(numericalPower - analyticPower)).toBeLessThan(1e-5);
  });

  test('upright energy matches energyDouble at the inverted equilibrium', () => {
    expect(uprightEnergyDouble(params)).toBeCloseTo(energyDouble(Float64Array.from(DOUBLE_UPRIGHT_STATE), params).total, 12);
  });

  test('wrapAngle maps onto (-pi, pi]', () => {
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI, 15);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 15);
    expect(wrapAngle(3 * Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1, 12);
    expect(wrapAngle(-0.3)).toBeCloseTo(-0.3, 15);
  });
});

describe('discretisation and Riccati solve', () => {
  test('matExp reproduces the closed-form rotation exponential', () => {
    const theta = 0.7;
    const e = matExp([
      [0, theta],
      [-theta, 0]
    ]);
    expect(e[0]![0]).toBeCloseTo(Math.cos(theta), 12);
    expect(e[0]![1]).toBeCloseTo(Math.sin(theta), 12);
    expect(e[1]![0]).toBeCloseTo(-Math.sin(theta), 12);
    expect(e[1]![1]).toBeCloseTo(Math.cos(theta), 12);
  });

  test('Van Loan discretisation is exact for the double integrator', () => {
    const dt = 0.03;
    const { Ad, Bd } = discretizeLinear(
      [
        [0, 1],
        [0, 0]
      ],
      [[0], [1]],
      dt
    );
    expect(Ad[0]![0]).toBeCloseTo(1, 14);
    expect(Ad[0]![1]).toBeCloseTo(dt, 14);
    expect(Ad[1]![0]).toBeCloseTo(0, 14);
    expect(Ad[1]![1]).toBeCloseTo(1, 14);
    expect(Bd[0]![0]).toBeCloseTo(dt * dt / 2, 14);
    expect(Bd[1]![0]).toBeCloseTo(dt, 14);
  });

  test('solveDare converges to a fixed point of the Riccati map with a stabilising gain', () => {
    const Ad = [[1.1]];
    const Bd = [[1]];
    const Q = [[1]];
    const R = [[1]];
    const { P, K, converged } = solveDare(Ad, Bd, Q, R);
    expect(converged).toBe(true);
    const p = P[0]![0]!;
    const k = K[0]![0]!;
    // DARE residual: P = Q + A'PA - A'PB (R + B'PB)^-1 B'PA.
    const residual = 1 + 1.1 * p * 1.1 - (1.1 * p * 1) ** 2 / (1 + p) - p;
    expect(Math.abs(residual)).toBeLessThan(1e-9);
    expect(Math.abs(1.1 - k)).toBeLessThan(1); // closed loop |A - BK| < 1
  });
});

describe('upright LQR design', () => {
  test('produces a Schur-stable closed loop for all three actuation modes', () => {
    for (const mode of ['full', 'acrobot', 'pendubot'] as const) {
      const design = designUprightLqr({ parameters: params, gamma: 0, dt: 0.005, mode });
      expect(design.riccati.converged, mode).toBe(true);
      expect(design.spectralRadius, mode).toBeLessThan(1);
      expect(design.stabilising, mode).toBe(true);
    }
  });

  test('fully-actuated LQR balances the nonlinear pendulum from a finite perturbation', () => {
    const design = designUprightLqr({ parameters: params, gamma: 0, dt: 0.005, mode: 'full' });
    const state = new Float64Array([Math.PI + 0.05, Math.PI - 0.07, 0.1, -0.05]);
    const out = new Float64Array(4);
    const tau = new Float64Array(2);
    const rhs = (s: StateVector, o: StateVector): void => {
      rhsDoubleActuated(s, params, 0, tau, o);
    };
    for (let i = 0; i < 800; i += 1) {
      lqrTorque(design, state, tau);
      rk4Step(state, 0.005, rhs, out);
      state.set(out);
    }
    expect(Math.abs(wrapAngle(state[0]! - Math.PI))).toBeLessThan(1e-4);
    expect(Math.abs(wrapAngle(state[1]! - Math.PI))).toBeLessThan(1e-4);
    expect(Math.abs(state[2]!)).toBeLessThan(1e-4);
    expect(Math.abs(state[3]!)).toBeLessThan(1e-4);
  });

  test('underactuated acrobot LQR balances a small perturbation with the elbow motor only', () => {
    const design = designUprightLqr({ parameters: params, gamma: 0, dt: 0.005, mode: 'acrobot' });
    const state = new Float64Array([Math.PI + 0.02, Math.PI - 0.03, 0, 0]);
    const out = new Float64Array(4);
    const tau = new Float64Array(2);
    const rhs = (s: StateVector, o: StateVector): void => {
      rhsDoubleActuated(s, params, 0, tau, o);
    };
    const initialLevel = lqrLyapunovLevel(design, state);
    for (let i = 0; i < 1600; i += 1) {
      lqrTorque(design, state, tau);
      expect(tau[0]).toBe(0); // shoulder must stay unactuated
      rk4Step(state, 0.005, rhs, out);
      state.set(out);
    }
    expect(lqrLyapunovLevel(design, state)).toBeLessThan(initialLevel * 1e-3);
    expect(Math.abs(wrapAngle(state[0]! - Math.PI))).toBeLessThan(1e-3);
    expect(Math.abs(wrapAngle(state[1]! - Math.PI))).toBeLessThan(1e-3);
  });
});
