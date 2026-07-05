import { describe, expect, test } from 'vitest';
import { rhsChain, type ChainParameters } from '../src/physics/nPendulum';
import { rk4Step } from '../src/physics/integrators';
import type { StateVector } from '../src/physics/types';
import { rhsDoubleActuated, wrapAngle } from '../src/control/actuated';
import {
  controlMatrixChain,
  jacobianChainActuated,
  rhsChainActuated,
  uprightChainState,
  uprightEnergyChain
} from '../src/control/actuatedChain';
import { designChainUprightLqr, designUprightLqr, lqrChainTorque } from '../src/control/lqr';
import { energyChain } from '../src/physics/nPendulum';
import { mulberry32 } from '../src/chaos/variational';

const chain3: ChainParameters = { masses: [1, 0.8, 0.6], lengths: [1, 0.9, 0.7], g: 9.81 };

describe('actuated N-chain dynamics', () => {
  test('tau = 0 reproduces rhsChain exactly (same assembly, bitwise)', () => {
    const rng = mulberry32(0xc4a1);
    for (let trial = 0; trial < 10; trial += 1) {
      const state = new Float64Array(6).map(() => rng() * 4 - 2);
      const gamma = trial % 2 === 0 ? 0 : 0.1;
      const plain = new Float64Array(6);
      const actuated = new Float64Array(6);
      rhsChain(state, chain3, gamma, plain);
      rhsChainActuated(state, chain3, gamma, [0, 0, 0], actuated);
      expect(Array.from(actuated)).toEqual(Array.from(plain));
    }
  });

  test('N = 2 chain with joint torques matches the actuated double pendulum', () => {
    const chain2: ChainParameters = { masses: [1.1, 0.9], lengths: [1.2, 0.8], g: 9.81 };
    const dp = { m1: 1.1, m2: 0.9, l1: 1.2, l2: 0.8, g: 9.81 };
    const state = new Float64Array([0.7, -0.4, 0.9, -1.1]);
    const tau = [0.6, -0.8];
    const fromChain = new Float64Array(4);
    const fromDouble = new Float64Array(4);
    rhsChainActuated(state, chain2, 0.05, tau, fromChain);
    rhsDoubleActuated(state, dp, 0.05, tau, fromDouble);
    for (let i = 0; i < 4; i += 1) {
      expect(Math.abs((fromChain[i] ?? 0) - (fromDouble[i] ?? 0))).toBeLessThan(1e-12);
    }
  });

  test('closed-form control matrix matches central differences (N = 3)', () => {
    const rng = mulberry32(0xb3a7);
    const state = new Float64Array(6).map(() => rng() * 4 - 2);
    const b = new Float64Array(18); // 6×3
    controlMatrixChain(state, chain3, b);
    const h = 1e-6;
    const plus = new Float64Array(6);
    const minus = new Float64Array(6);
    for (let c = 0; c < 3; c += 1) {
      const tauPlus = [0, 0, 0];
      const tauMinus = [0, 0, 0];
      tauPlus[c] = h;
      tauMinus[c] = -h;
      rhsChainActuated(state, chain3, 0, tauPlus, plus);
      rhsChainActuated(state, chain3, 0, tauMinus, minus);
      for (let i = 0; i < 6; i += 1) {
        const fd = ((plus[i] ?? 0) - (minus[i] ?? 0)) / (2 * h);
        expect(Math.abs((b[i * 3 + c] ?? 0) - fd)).toBeLessThan(1e-7);
      }
    }
  });

  test('actuated chain Jacobian matches central differences at nonzero torque', () => {
    const rng = mulberry32(0xdada);
    const state = new Float64Array(6).map(() => rng() * 4 - 2);
    const tau = [1.5, -2, 0.7];
    const gamma = 0.1;
    const jac = new Float64Array(36);
    jacobianChainActuated(state, chain3, gamma, tau, jac);

    const h = 1e-6;
    const plus = new Float64Array(6);
    const minus = new Float64Array(6);
    const probe = new Float64Array(6);
    for (let j = 0; j < 6; j += 1) {
      probe.set(state);
      probe[j] = state[j]! + h;
      rhsChainActuated(probe, chain3, gamma, tau, plus);
      probe[j] = state[j]! - h;
      rhsChainActuated(probe, chain3, gamma, tau, minus);
      for (let i = 0; i < 6; i += 1) {
        const fd = ((plus[i] ?? 0) - (minus[i] ?? 0)) / (2 * h);
        expect(Math.abs((jac[i * 6 + j] ?? 0) - fd), `J[${i}][${j}]`).toBeLessThan(5e-5);
      }
    }
  });

  test('upright helpers agree with energyChain at the inverted equilibrium', () => {
    const upright = uprightChainState(3);
    expect(uprightEnergyChain(chain3)).toBeCloseTo(energyChain(upright, chain3).total, 10);
  });
});

describe('N-chain upright LQR', () => {
  test('N = 2 chain design reproduces the double-pendulum full-actuation gain', () => {
    const chain2: ChainParameters = { masses: [1, 1], lengths: [1, 1], g: 9.81 };
    const chainDesign = designChainUprightLqr({ parameters: chain2, gamma: 0, dt: 0.005 });
    const doubleDesign = designUprightLqr({
      parameters: { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
      gamma: 0,
      dt: 0.005,
      mode: 'full'
    });
    for (let r = 0; r < 2; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        expect(chainDesign.riccati.K[r]![c]).toBeCloseTo(doubleDesign.riccati.K[r]![c]!, 5);
      }
    }
    expect(chainDesign.stabilising).toBe(true);
  });

  test('designs are Schur-stable for N = 3 and N = 4', () => {
    for (const n of [3, 4]) {
      const design = designChainUprightLqr({
        parameters: { masses: new Array<number>(n).fill(1), lengths: new Array<number>(n).fill(1), g: 9.81 },
        gamma: 0,
        dt: 0.005
      });
      expect(design.riccati.converged, `N=${n}`).toBe(true);
      expect(design.spectralRadius, `N=${n}`).toBeLessThan(1);
      expect(design.stabilising, `N=${n}`).toBe(true);
    }
  });

  test('balances the nonlinear inverted triple chain from a finite perturbation', () => {
    const design = designChainUprightLqr({ parameters: chain3, gamma: 0, dt: 0.005 });
    const state = new Float64Array([Math.PI + 0.03, Math.PI - 0.04, Math.PI + 0.02, 0, 0, 0]);
    const out = new Float64Array(6);
    const tau = new Float64Array(3);
    const rhs = (s: StateVector, o: StateVector): void => {
      rhsChainActuated(s, chain3, 0, tau, o);
    };
    for (let i = 0; i < 1600; i += 1) {
      lqrChainTorque(design, state, tau);
      rk4Step(state, 0.005, rhs, out);
      state.set(out);
    }
    for (let j = 0; j < 3; j += 1) {
      expect(Math.abs(wrapAngle(state[j]! - Math.PI)), `theta[${j}]`).toBeLessThan(1e-3);
      expect(Math.abs(state[3 + j]!), `omega[${j}]`).toBeLessThan(1e-3);
    }
  });
});
