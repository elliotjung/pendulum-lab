import { describe, expect, test } from 'vitest';
import { energyDouble } from '../src/physics/double';
import { rk4Step } from '../src/physics/integrators';
import type { StateVector } from '../src/physics/types';
import { rhsDoubleActuated, uprightEnergyDouble, wrapAngle } from '../src/control/actuated';
import {
  DEFAULT_SWINGUP_GAINS,
  createHybridSwingUpController,
  energyPumpTorque,
  simulateHybridSwingUp
} from '../src/control/swingup';

const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
const spec = { parameters: params, gamma: 0, dt: 0.005, mode: 'full' as const };

describe('energy-pump swing-up phase', () => {
  test('drives the total energy monotonically toward the upright level', () => {
    const gains = DEFAULT_SWINGUP_GAINS;
    const state = new Float64Array([0.1, 0, 0, 0]);
    const out = new Float64Array(4);
    const tau = new Float64Array(2);
    const rhs = (s: StateVector, o: StateVector): void => {
      rhsDoubleActuated(s, params, 0, tau, o);
    };
    const eUp = uprightEnergyDouble(params);
    let previousGap = eUp - energyDouble(state, params).total;
    expect(previousGap).toBeGreaterThan(50); // hanging start is far below the upright level
    // dE/dt = k_e (E_up - E)(w1^2 + w2^2) >= 0 in continuous time; with the
    // zero-order-hold torque the gap can dither by discretisation error once
    // it is essentially closed, so monotonicity is asserted while the gap is
    // still macroscopic and convergence is asserted at the end.
    for (let block = 0; block < 10; block += 1) {
      for (let i = 0; i < 200; i += 1) {
        energyPumpTorque(state, params, gains, tau);
        rk4Step(state, 0.005, rhs, out);
        state.set(out);
      }
      const gap = eUp - energyDouble(state, params).total;
      if (previousGap > 0.5) expect(gap).toBeLessThan(previousGap);
      previousGap = gap;
    }
    expect(Math.abs(previousGap)).toBeLessThan(1e-3); // energy pinned to the upright level after 10 s
  });

  test('the kick torque breaks the degenerate hanging equilibrium', () => {
    const tau = new Float64Array(2);
    energyPumpTorque(new Float64Array([0, 0, 0, 0]), params, DEFAULT_SWINGUP_GAINS, tau);
    expect(tau[0]).toBe(DEFAULT_SWINGUP_GAINS.kick);
    // At the upright energy with zero velocity no kick (and no pump) is applied.
    energyPumpTorque(Float64Array.from([Math.PI, Math.PI, 0, 0]), params, DEFAULT_SWINGUP_GAINS, tau);
    expect(tau[0]).toBe(0);
    expect(tau[1]).toBe(0);
  });
});

describe('hybrid swing-up + LQR capture', () => {
  test('swings up from hanging, latches the capture phase, and balances inverted', () => {
    const controller = createHybridSwingUpController(spec);
    const result = simulateHybridSwingUp(controller, spec, [0.1, 0, 0, 0], { dt: 0.005, steps: 20_000 });
    // Calibrated run: the pump reaches the upright level set and first dips
    // below the capture gate near t = 6.9 s; LQR then holds the balance.
    expect(result.captureTime).not.toBeNull();
    expect(result.captureTime!).toBeLessThan(30);
    expect(result.finalPhase).toBe('capture');
    const f = result.finalState;
    expect(Math.abs(wrapAngle(f[0]! - Math.PI))).toBeLessThan(1e-3);
    expect(Math.abs(wrapAngle(f[1]! - Math.PI))).toBeLessThan(1e-3);
    expect(Math.abs(f[2]!)).toBeLessThan(1e-3);
    expect(Math.abs(f[3]!)).toBeLessThan(1e-3);
  });

  test('records samples with torque and energy columns and reports the LQR design', () => {
    const controller = createHybridSwingUpController(spec);
    expect(controller.design.stabilising).toBe(true);
    const result = simulateHybridSwingUp(controller, spec, [0.1, 0, 0, 0], { dt: 0.005, steps: 500, sampleEvery: 100 });
    expect(result.samples.length).toBe(5);
    for (const row of result.samples) {
      expect(row.length).toBe(8); // t, theta1, theta2, omega1, omega2, tau1, tau2, E
      expect(Number.isFinite(row[7]!)).toBe(true);
    }
  });

  test('controller resets to the pump phase and rejects underactuated modes', () => {
    const controller = createHybridSwingUpController(spec);
    simulateHybridSwingUp(controller, spec, [0.1, 0, 0, 0], { dt: 0.005, steps: 20_000 });
    expect(controller.phase()).toBe('capture');
    controller.reset();
    expect(controller.phase()).toBe('pump');
    expect(() =>
      createHybridSwingUpController({ ...spec, mode: 'acrobot' })
    ).toThrow(/full actuation/);
  });
});
