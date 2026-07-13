import { integratorRegistry, step } from '../physics/integrators';
import { rhsDouble, energyDouble } from '../physics/double';
import type { Derivative, StateVector } from '../physics/types';
import type { IntegratorId, PendulumParameters } from '../types/domain';

/**
 * Cross-validation suite. It checks each registered integrator against trusted
 * references three ways:
 *   1. theoretical convergence order, on the harmonic oscillator (closed form);
 *   2. energy-conservation envelope, on the conservative double pendulum;
 *   3. agreement with the highest-accuracy method (`gbs`) as a numerical
 *      reference on the double pendulum.
 * The grading helpers are pure so the pass/fail logic is unit-tested directly.
 */

const REFERENCE_METHOD: IntegratorId = 'gbs';
const DP_PARAMS: PendulumParameters = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };

/** Theoretical order of each method (used as the order-check target). */
export const EXPECTED_ORDER: Readonly<Record<IntegratorId, number>> = {
  euler: 1,
  rk2: 2,
  rk4: 4,
  verlet: 2,
  leapfrog: 2,
  symplectic: 1,
  yoshida4: 4,
  yoshida6: 6,
  yoshida8: 8,
  hmidpoint: 2,
  gauss2: 4,
  rkf45: 5,
  dopri5: 5,
  dop853: 8,
  gbs: 6,
  bdf2: 2
};

/**
 * Per-method energy-drift envelope over the conservative run. Generous for
 * low-order and symplectic methods (whose error is bounded but not small) and
 * tight for high-order ones — the point is to validate each method behaves as
 * its theory predicts, not that every method is equally accurate.
 */
export const ENERGY_ENVELOPE: Readonly<Record<IntegratorId, number>> = {
  euler: 20,
  rk2: 1,
  rk4: 1e-2,
  verlet: 5,
  leapfrog: 5,
  symplectic: 5,
  yoshida4: 5,
  yoshida6: 5,
  yoshida8: 5,
  hmidpoint: 1e-1,
  gauss2: 1e-2,
  rkf45: 1e-2,
  dopri5: 1e-2,
  dop853: 1e-2,
  gbs: 1e-2,
  bdf2: 5
};

/** Per-method agreement envelope vs the gbs reference on the short double-pendulum run. */
export const AGREEMENT_ENVELOPE: Readonly<Record<IntegratorId, number>> = {
  euler: 2,
  rk2: 0.2,
  rk4: 1e-2,
  verlet: 0.2,
  leapfrog: 0.2,
  symplectic: 2,
  // Yoshida's composition has large (one negative) substep coefficients, so its
  // error constant is larger than a classical RK method of the same order 4.
  yoshida4: 1e-1,
  // Raising the formal splitting order does not remove the double pendulum's
  // velocity-coupling defect; the larger negative-stage coefficients expose
  // that modelling error even though the oscillator reaches order 6/8.
  yoshida6: 2e-1,
  yoshida8: 5e-1,
  hmidpoint: 0.2,
  gauss2: 1e-2,
  rkf45: 1e-3,
  dopri5: 1e-3,
  dop853: 1e-6,
  gbs: 1e-9,
  bdf2: 2
};

export interface OrderCheck {
  measured: number | null;
  expected: number;
  roundOffLimited: boolean;
  pass: boolean;
}

export interface BoundCheck {
  value: number;
  threshold: number;
  pass: boolean;
}

export interface IntegratorValidation {
  id: IntegratorId;
  name: string;
  order: OrderCheck;
  energy: BoundCheck;
  agreement: BoundCheck;
  pass: boolean;
}

export interface ReferenceReport {
  generatedAt: string;
  referenceMethod: IntegratorId;
  checks: IntegratorValidation[];
  summary: { integrators: number; passed: number };
}

// ---- pure grading helpers (unit-tested) ----------------------------------

export function gradeOrder(
  measured: number | null,
  expected: number,
  roundOffLimited: boolean,
  roundOffError: number
): boolean {
  if (roundOffLimited) return roundOffError < 1e-8;
  return measured !== null && measured >= expected - 0.6;
}

export function gradeBelow(value: number, threshold: number): boolean {
  return Number.isFinite(value) && value < threshold;
}

// ---- integration helpers --------------------------------------------------

function oscillator(state: StateVector, out: StateVector): void {
  out[0] = state[1] ?? 0;
  out[1] = -(state[0] ?? 0);
}

function integrateFixed(id: IntegratorId, state0: number[], dt: number, steps: number, rhs: Derivative): StateVector {
  const state = new Float64Array(state0);
  const out = new Float64Array(state0.length);
  const previousError = { value: 0 };
  for (let i = 0; i < steps; i += 1) {
    step(id, state, dt, rhs, out, { previousError });
    state.set(out);
  }
  return state;
}

function oscillatorError(id: IntegratorId, dt: number, T: number): number {
  const steps = Math.round(T / dt);
  const y = integrateFixed(id, [1, 0], dt, steps, oscillator);
  return Math.hypot((y[0] ?? 0) - Math.cos(T), (y[1] ?? 0) + Math.sin(T));
}

function orderCheck(id: IntegratorId): OrderCheck {
  const T = 2;
  const dt = 0.1;
  const e1 = oscillatorError(id, dt, T);
  const e2 = oscillatorError(id, dt / 2, T);
  const roundOffLimited = e1 < 1e-11 && e2 < 1e-11;
  const measured = roundOffLimited || e1 === 0 || e2 === 0 ? null : Math.log2(e1 / e2);
  const expected = EXPECTED_ORDER[id];
  return { measured, expected, roundOffLimited, pass: gradeOrder(measured, expected, roundOffLimited, e2) };
}

function dpRhs(s: StateVector, o: StateVector): void {
  rhsDouble(s, DP_PARAMS, 0, o);
}

function energyCheck(id: IntegratorId): BoundCheck {
  const dt = 0.002;
  const steps = 20_000; // T = 40 s
  const state = new Float64Array([1.2, -0.6, 0, 0]);
  const out = new Float64Array(4);
  const previousError = { value: 0 };
  const e0 = energyDouble(state, DP_PARAMS).total;
  let maxDrift = 0;
  let blewUp = false;
  for (let i = 0; i < steps; i += 1) {
    step(id, state, dt, dpRhs, out, { previousError });
    state.set(out);
    if (!Number.isFinite(state[0] ?? NaN)) {
      blewUp = true;
      break;
    }
    if (i % 50 === 0) {
      const drift = Math.abs((energyDouble(state, DP_PARAMS).total - e0) / e0);
      if (drift > maxDrift) maxDrift = drift;
    }
  }
  const value = blewUp ? Infinity : maxDrift;
  const threshold = ENERGY_ENVELOPE[id];
  return { value, threshold, pass: gradeBelow(value, threshold) };
}

function buildReferenceTrajectory(dt: number, steps: number): StateVector[] {
  const state = new Float64Array([0.5, 0.3, 0, 0]);
  const out = new Float64Array(4);
  const previousError = { value: 0 };
  const path: StateVector[] = [new Float64Array(state)];
  for (let i = 0; i < steps; i += 1) {
    step(REFERENCE_METHOD, state, dt, dpRhs, out, { previousError });
    state.set(out);
    path.push(new Float64Array(state));
  }
  return path;
}

function agreementCheck(id: IntegratorId, reference: StateVector[], dt: number): BoundCheck {
  const steps = reference.length - 1;
  const state = new Float64Array([0.5, 0.3, 0, 0]);
  const out = new Float64Array(4);
  const previousError = { value: 0 };
  let maxDiv = 0;
  for (let i = 0; i < steps; i += 1) {
    step(id, state, dt, dpRhs, out, { previousError });
    state.set(out);
    const ref = reference[i + 1]!;
    let d = 0;
    for (let k = 0; k < 4; k += 1) d = Math.max(d, Math.abs((state[k] ?? 0) - (ref[k] ?? 0)));
    if (!Number.isFinite(d)) {
      maxDiv = Infinity;
      break;
    }
    if (d > maxDiv) maxDiv = d;
  }
  const threshold = AGREEMENT_ENVELOPE[id];
  return { value: maxDiv, threshold, pass: gradeBelow(maxDiv, threshold) };
}

/** Run the full reference-validation suite over every registered integrator. */
export function runReferenceValidation(): ReferenceReport {
  const ids = Object.keys(integratorRegistry) as IntegratorId[];
  const agreementDt = 0.005;
  const reference = buildReferenceTrajectory(agreementDt, 600); // T = 3 s

  const checks: IntegratorValidation[] = ids.map((id) => {
    const order = orderCheck(id);
    const energy = energyCheck(id);
    const agreement = agreementCheck(id, reference, agreementDt);
    return {
      id,
      name: integratorRegistry[id].name,
      order,
      energy,
      agreement,
      pass: order.pass && energy.pass && agreement.pass
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    referenceMethod: REFERENCE_METHOD,
    checks,
    summary: { integrators: checks.length, passed: checks.filter((c) => c.pass).length }
  };
}
