import type { EnergyBreakdown } from '../types/domain';
import type { StateVector } from './types';

/**
 * Elastic ("spring") pendulum: a bob on a Hookean spring swinging in a plane.
 * A conservative two-degree-of-freedom system whose radial/angular coupling is
 * a clean nonlinear-dynamics demonstrator.
 *
 * Generalized coordinates q = [r, theta], velocities v = [rDot, thetaDot], so
 * the state [r, theta, rDot, thetaDot] is splittable for symplectic integrators.
 *
 *   rDot'     = r * thetaDot^2 - (k / m) * (r - restLength) + g * cos(theta)
 *   thetaDot' = (-2 * rDot * thetaDot - g * sin(theta)) / r
 */
export interface SpringPendulumParameters {
  mass: number;
  /** Spring stiffness. */
  stiffness: number;
  /** Natural (unstretched) spring length. */
  restLength: number;
  g: number;
}

const R_FLOOR = 1e-9;

export function rhsSpring(
  state: ArrayLike<number>,
  parameters: SpringPendulumParameters,
  out: StateVector
): StateVector {
  const r = Number(state[0] ?? 0);
  const theta = Number(state[1] ?? 0);
  const rDot = Number(state[2] ?? 0);
  const thetaDot = Number(state[3] ?? 0);
  const { mass, stiffness, restLength, g } = parameters;
  const rSafe = Math.abs(r) < R_FLOOR ? (r < 0 ? -R_FLOOR : R_FLOOR) : r;
  out[0] = rDot;
  out[1] = thetaDot;
  out[2] = r * thetaDot * thetaDot - (stiffness / mass) * (r - restLength) + g * Math.cos(theta);
  out[3] = (-2 * rDot * thetaDot - g * Math.sin(theta)) / rSafe;
  return out;
}

export function energySpring(state: ArrayLike<number>, parameters: SpringPendulumParameters): EnergyBreakdown {
  const r = Number(state[0] ?? 0);
  const theta = Number(state[1] ?? 0);
  const rDot = Number(state[2] ?? 0);
  const thetaDot = Number(state[3] ?? 0);
  const { mass, stiffness, restLength, g } = parameters;
  const KE = 0.5 * mass * (rDot * rDot + r * r * thetaDot * thetaDot);
  const stretch = r - restLength;
  const PE = 0.5 * stiffness * stretch * stretch - mass * g * r * Math.cos(theta);
  return { total: KE + PE, KE, PE };
}
