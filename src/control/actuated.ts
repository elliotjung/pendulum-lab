import type { PendulumParameters } from '../types/domain';
import type { StateVector } from '../physics/types';
import { MASS_MATRIX_SINGULARITY_THRESHOLD as DET_THRESHOLD } from '../physics/constants';
import { jacobianDouble } from '../physics/double';

/**
 * Actuated double-pendulum dynamics — the control-input extension of
 * `rhsDouble`. Joint torques enter the Euler-Lagrange equations as
 * generalised forces; everything else (mass matrix, Coriolis/gravity terms,
 * damping convention, singularity guard) mirrors `physics/double.ts` term by
 * term, and the τ = 0 case is pinned bitwise against `rhsDouble` in the tests.
 *
 * Torque convention: `tau = [τ1, τ2]` are *joint* torques — τ1 acts at the
 * pivot on link 1, τ2 acts at the elbow between link 1 and link 2. Because the
 * state uses absolute angles (θ1, θ2 both measured from the vertical), the
 * principle of virtual work maps joint torques to generalised forces as
 *
 *   Q_θ1 = τ1 − τ2,   Q_θ2 = τ2
 *
 * (δW = τ1 δθ1 + τ2 δ(θ2 − θ1)). The three actuation modes of the DFKI
 * `double_pendulum` benchmark are supported: `full` (both joints), `acrobot`
 * (elbow only — the harder underactuated case), `pendubot` (shoulder only).
 */
export type ActuationMode = 'full' | 'acrobot' | 'pendubot';

/** Upright (inverted) equilibrium in the absolute-angle chart. */
export const DOUBLE_UPRIGHT_STATE: readonly number[] = Object.freeze([Math.PI, Math.PI, 0, 0]);

/** Total energy of the upright equilibrium under the `energyDouble` convention (pivot at y = 0). */
export function uprightEnergyDouble(parameters: PendulumParameters): number {
  const { m1, m2, l1, l2, g } = parameters;
  return g * (m1 * l1 + m2 * (l1 + l2));
}

/** Zero the torque channel a given actuation mode cannot drive (in place). */
export function applyActuationMode(mode: ActuationMode, tau: Float64Array): Float64Array {
  if (mode === 'acrobot') tau[0] = 0;
  else if (mode === 'pendubot') tau[1] = 0;
  return tau;
}

export function rhsDoubleActuated(
  state: ArrayLike<number>,
  parameters: PendulumParameters,
  gamma: number,
  tau: ArrayLike<number>,
  out: StateVector
): StateVector {
  const t1 = Number(state[0] ?? 0);
  const t2 = Number(state[1] ?? 0);
  const w1 = Number(state[2] ?? 0);
  const w2 = Number(state[3] ?? 0);
  const tau1 = Number(tau[0] ?? 0);
  const tau2 = Number(tau[1] ?? 0);
  const { m1, m2, l1, l2, g } = parameters;
  const delta = t1 - t2;
  const sinDelta = Math.sin(delta);
  const cosDelta = Math.cos(delta);
  const m11 = (m1 + m2) * l1 * l1;
  const m12 = m2 * l1 * l2 * cosDelta;
  const m22 = m2 * l2 * l2;
  const det = m11 * m22 - m12 * m12;

  out[0] = w1;
  out[1] = w2;
  if (Math.abs(det) < DET_THRESHOLD) {
    out[2] = 0;
    out[3] = 0;
    return out;
  }

  const f1 = -m2 * l1 * l2 * sinDelta * w2 * w2 - (m1 + m2) * g * l1 * Math.sin(t1) - gamma * w1 + (tau1 - tau2);
  const f2 = m2 * l1 * l2 * sinDelta * w1 * w1 - m2 * g * l2 * Math.sin(t2) - gamma * w2 + tau2;
  out[2] = (m22 * f1 - m12 * f2) / det;
  out[3] = (-m12 * f1 + m11 * f2) / det;
  return out;
}

/**
 * Exact control Jacobian B(x) = ∂(rhs)/∂τ of `rhsDoubleActuated`, written
 * row-major into `b` (length 8, 4×2). Torques enter linearly through
 * M(q)⁻¹·S with S = [[1, −1], [0, 1]] (the joint-to-generalised-force map),
 * so B is closed form: rows 0-1 are zero, rows 2-3 are M⁻¹S. Verified against
 * central differences of `rhsDoubleActuated` in the tests.
 */
export function controlMatrixDouble(state: ArrayLike<number>, parameters: PendulumParameters, b: Float64Array): Float64Array {
  const t1 = Number(state[0] ?? 0);
  const t2 = Number(state[1] ?? 0);
  const { m1, m2, l1, l2 } = parameters;
  const cosDelta = Math.cos(t1 - t2);
  const m11 = (m1 + m2) * l1 * l1;
  const m12 = m2 * l1 * l2 * cosDelta;
  const m22 = m2 * l2 * l2;
  const det = m11 * m22 - m12 * m12;
  b.fill(0);
  if (Math.abs(det) < DET_THRESHOLD) return b;
  // M⁻¹ = (1/det)[[m22, −m12], [−m12, m11]]; columns of M⁻¹S below.
  b[4] = m22 / det; // ∂ω̇1/∂τ1
  b[5] = (-m22 - m12) / det; // ∂ω̇1/∂τ2
  b[6] = -m12 / det; // ∂ω̇2/∂τ1
  b[7] = (m12 + m11) / det; // ∂ω̇2/∂τ2
  return b;
}

/**
 * Exact state Jacobian ∂(rhsDoubleActuated)/∂x at fixed torque, row-major into
 * `jac` (length 16). Equals `jacobianDouble` plus the torque term's
 * configuration dependence: the applied generalised force Q = [τ1−τ2, τ2] is
 * constant, but its acceleration contribution M(q)⁻¹Q varies with q through
 * m12 = B·cos(θ1−θ2) and det(M). Differentiating the quotient N/det with
 * N2 = m22·Q1 − m12·Q2, N3 = −m12·Q1 + m11·Q2 adds only θ-column terms.
 * Verified against central differences of `rhsDoubleActuated` in the tests;
 * this closed form is what lets the iLQR discrete derivatives stay analytic.
 */
export function jacobianDoubleActuated(
  state: ArrayLike<number>,
  parameters: PendulumParameters,
  gamma: number,
  tau: ArrayLike<number>,
  jac: Float64Array
): Float64Array {
  jacobianDouble(state, parameters, gamma, jac);
  const q1 = Number(tau[0] ?? 0) - Number(tau[1] ?? 0);
  const q2 = Number(tau[1] ?? 0);
  if (q1 === 0 && q2 === 0) return jac;

  const t1 = Number(state[0] ?? 0);
  const t2 = Number(state[1] ?? 0);
  const { m1, m2, l1, l2 } = parameters;
  const delta = t1 - t2;
  const B = m2 * l1 * l2;
  const m11 = (m1 + m2) * l1 * l1;
  const m22 = m2 * l2 * l2;
  const m12 = B * Math.cos(delta);
  const det = m11 * m22 - m12 * m12;
  if (Math.abs(det) < DET_THRESHOLD) return jac; // rows 2,3 already zeroed by jacobianDouble

  const n2 = m22 * q1 - m12 * q2;
  const n3 = -m12 * q1 + m11 * q2;
  const det2 = det * det;
  const dm12dt1 = -B * Math.sin(delta); // ∂m12/∂θ1; ∂m12/∂θ2 = −∂m12/∂θ1
  for (const [col, dm12] of [[0, dm12dt1], [1, -dm12dt1]] as const) {
    const ddet = -2 * m12 * dm12;
    const dn2 = -dm12 * q2;
    const dn3 = -dm12 * q1;
    jac[8 + col] = (jac[8 + col] ?? 0) + (dn2 * det - n2 * ddet) / det2;
    jac[12 + col] = (jac[12 + col] ?? 0) + (dn3 * det - n3 * ddet) / det2;
  }
  return jac;
}

/** Wrap an angle to (−π, π]. */
export function wrapAngle(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  else if (a > Math.PI) a -= 2 * Math.PI;
  return a;
}
