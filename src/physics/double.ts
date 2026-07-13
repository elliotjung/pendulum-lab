import type { EnergyBreakdown, PendulumParameters } from '../types/domain';
import type { StateVector } from './types';
import { MASS_MATRIX_SINGULARITY_THRESHOLD as DET_THRESHOLD } from './constants';

export function rhsDouble(
  state: ArrayLike<number>,
  parameters: PendulumParameters,
  gamma: number,
  out: StateVector
): StateVector {
  const t1 = Number(state[0] ?? 0);
  const t2 = Number(state[1] ?? 0);
  const w1 = Number(state[2] ?? 0);
  const w2 = Number(state[3] ?? 0);
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

  const f1 = -m2 * l1 * l2 * sinDelta * w2 * w2 - (m1 + m2) * g * l1 * Math.sin(t1) - gamma * w1;
  const f2 = m2 * l1 * l2 * sinDelta * w1 * w1 - m2 * g * l2 * Math.sin(t2) - gamma * w2;
  out[2] = (m22 * f1 - m12 * f2) / det;
  out[3] = (-m12 * f1 + m11 * f2) / det;
  return out;
}

/**
 * Exact analytic Jacobian J[i][j] = d(out_i)/d(state_j) of `rhsDouble`, written
 * row-major into `jac` (length 16, 4x4). This is differentiated in closed form
 * rather than by finite differencing, so the tangent-space flow used by the
 * Lyapunov spectrum, SALI and FLI is accurate to machine precision instead of
 * the ~1e-7 floor of a divided difference. Verified against a central-difference
 * Jacobian in the test suite.
 *
 * State is [theta1, theta2, omega1, omega2]. Rows 0,1 are trivially [.,.,1,0] /
 * [.,.,0,1]. Rows 2,3 come from differentiating out2 = N2/det, out3 = N3/det
 * with the quotient rule, where N2 = m22*f1 - m12*f2, N3 = -m12*f1 + m11*f2.
 */
export function jacobianDouble(
  state: ArrayLike<number>,
  parameters: PendulumParameters,
  gamma: number,
  jac: Float64Array
): Float64Array {
  const t1 = Number(state[0] ?? 0);
  const t2 = Number(state[1] ?? 0);
  const w1 = Number(state[2] ?? 0);
  const w2 = Number(state[3] ?? 0);
  const { m1, m2, l1, l2, g } = parameters;
  const delta = t1 - t2;
  const sinD = Math.sin(delta);
  const cosD = Math.cos(delta);

  const m11 = (m1 + m2) * l1 * l1; // constant
  const m22 = m2 * l2 * l2; // constant
  const B = m2 * l1 * l2; // coefficient of cos/sin(delta) in m12 and the forces
  const m12 = B * cosD;
  const det = m11 * m22 - m12 * m12;

  // Row 0,1: d(theta_i)/dx = e_{omega_i}.
  jac[0] = 0;
  jac[1] = 0;
  jac[2] = 1;
  jac[3] = 0;
  jac[4] = 0;
  jac[5] = 0;
  jac[6] = 0;
  jac[7] = 1;

  if (Math.abs(det) < DET_THRESHOLD) {
    for (let i = 8; i < 16; i += 1) jac[i] = 0;
    return jac;
  }

  const f1 = -B * sinD * w2 * w2 - (m1 + m2) * g * l1 * Math.sin(t1) - gamma * w1;
  const f2 = B * sinD * w1 * w1 - m2 * g * l2 * Math.sin(t2) - gamma * w2;
  const N2 = m22 * f1 - m12 * f2;
  const N3 = -m12 * f1 + m11 * f2;
  const det2 = det * det;

  // Partials w.r.t. [t1, t2, w1, w2], indexed 0..3.
  // m12 = B cos(delta): d/dt1 = -B sinD, d/dt2 = +B sinD.
  const dm12 = [-B * sinD, B * sinD, 0, 0];
  // det = m11 m22 - m12^2: ddet = -2 m12 dm12.
  const ddet = [-2 * m12 * dm12[0]!, -2 * m12 * dm12[1]!, 0, 0];
  // f1 = -B sinD w2^2 - (m1+m2) g l1 sin t1 - gamma w1.
  const df1 = [-B * cosD * w2 * w2 - (m1 + m2) * g * l1 * Math.cos(t1), B * cosD * w2 * w2, -gamma, -2 * B * sinD * w2];
  // f2 = B sinD w1^2 - m2 g l2 sin t2 - gamma w2.
  const df2 = [B * cosD * w1 * w1, -B * cosD * w1 * w1 - m2 * g * l2 * Math.cos(t2), 2 * B * sinD * w1, -gamma];

  for (let j = 0; j < 4; j += 1) {
    const dN2 = m22 * df1[j]! - (dm12[j]! * f2 + m12 * df2[j]!);
    const dN3 = -(dm12[j]! * f1 + m12 * df1[j]!) + m11 * df2[j]!;
    jac[8 + j] = (dN2 * det - N2 * ddet[j]!) / det2; // d(out2)/dx_j
    jac[12 + j] = (dN3 * det - N3 * ddet[j]!) / det2; // d(out3)/dx_j
  }
  return jac;
}

export function energyDouble(state: ArrayLike<number>, parameters: PendulumParameters): EnergyBreakdown {
  const t1 = Number(state[0] ?? 0);
  const t2 = Number(state[1] ?? 0);
  const w1 = Number(state[2] ?? 0);
  const w2 = Number(state[3] ?? 0);
  const { m1, m2, l1, l2, g } = parameters;
  const y1 = -l1 * Math.cos(t1);
  const y2 = y1 - l2 * Math.cos(t2);
  const v1sq = l1 * l1 * w1 * w1;
  const v2sq = l1 * l1 * w1 * w1 + l2 * l2 * w2 * w2 + 2 * l1 * l2 * w1 * w2 * Math.cos(t1 - t2);
  const KE = 0.5 * m1 * v1sq + 0.5 * m2 * v2sq;
  const PE = g * (m1 * y1 + m2 * y2);
  return { total: KE + PE, KE, PE };
}
