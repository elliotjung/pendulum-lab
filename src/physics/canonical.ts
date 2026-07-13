import type { EnergyBreakdown, PendulumParameters } from '../types/domain';
import { energyDouble } from './double';
import { MASS_MATRIX_SINGULARITY_THRESHOLD } from './constants';

export interface CanonicalState {
  q1: number;
  q2: number;
  p1: number;
  p2: number;
}

export interface MassMatrix2 {
  m11: number;
  m12: number;
  m22: number;
  det: number;
}

export interface ImplicitMidpointStats {
  residual: number;
  iterations: number;
  converged: boolean;
}

export interface CanonicalStepResult {
  state: Float64Array;
  stats: ImplicitMidpointStats;
}

const DET_THRESHOLD = MASS_MATRIX_SINGULARITY_THRESHOLD;

export function doubleMassMatrix(q1: number, q2: number, parameters: PendulumParameters): MassMatrix2 {
  const delta = q1 - q2;
  const m11 = (parameters.m1 + parameters.m2) * parameters.l1 * parameters.l1;
  const m12 = parameters.m2 * parameters.l1 * parameters.l2 * Math.cos(delta);
  const m22 = parameters.m2 * parameters.l2 * parameters.l2;
  return { m11, m12, m22, det: m11 * m22 - m12 * m12 };
}

export function momentumToOmega(
  canonical: ArrayLike<number>,
  parameters: PendulumParameters,
  out = new Float64Array(4)
): Float64Array {
  const q1 = Number(canonical[0] ?? 0);
  const q2 = Number(canonical[1] ?? 0);
  const p1 = Number(canonical[2] ?? 0);
  const p2 = Number(canonical[3] ?? 0);
  const matrix = doubleMassMatrix(q1, q2, parameters);
  out[0] = q1;
  out[1] = q2;
  if (Math.abs(matrix.det) < DET_THRESHOLD) {
    out[2] = 0;
    out[3] = 0;
    return out;
  }
  out[2] = (matrix.m22 * p1 - matrix.m12 * p2) / matrix.det;
  out[3] = (-matrix.m12 * p1 + matrix.m11 * p2) / matrix.det;
  return out;
}

export function omegaToMomentum(
  thetaOmega: ArrayLike<number>,
  parameters: PendulumParameters,
  out = new Float64Array(4)
): Float64Array {
  const q1 = Number(thetaOmega[0] ?? 0);
  const q2 = Number(thetaOmega[1] ?? 0);
  const w1 = Number(thetaOmega[2] ?? 0);
  const w2 = Number(thetaOmega[3] ?? 0);
  const matrix = doubleMassMatrix(q1, q2, parameters);
  out[0] = q1;
  out[1] = q2;
  out[2] = matrix.m11 * w1 + matrix.m12 * w2;
  out[3] = matrix.m12 * w1 + matrix.m22 * w2;
  return out;
}

export function canonicalHamiltonian(canonical: ArrayLike<number>, parameters: PendulumParameters): EnergyBreakdown {
  const thetaOmega = momentumToOmega(canonical, parameters);
  return energyDouble(thetaOmega, parameters);
}

/**
 * Exact analytic gradient of the canonical Hamiltonian H(q, p) = 1/2 p^T M(q)^-1 p + V(q).
 *
 * Because M(q)^-1 p = omega, the momentum derivatives are simply the angular
 * velocities: dH/dp = omega. For the coordinate derivatives,
 *   dH/dq_i = -1/2 omega^T (dM/dq_i) omega + dV/dq_i,
 * and only m12 = m2 l1 l2 cos(q1-q2) depends on q, so dM/dq has a single
 * off-diagonal entry. Working the algebra through gives the closed forms below.
 * This replaces a central-difference gradient, making `implicitMidpointCanonical`
 * a genuine (not merely approximate) symplectic integrator of the true
 * Hamiltonian vector field. Verified against finite differences in the tests.
 */
export function hamiltonianGradient(
  canonical: ArrayLike<number>,
  parameters: PendulumParameters,
  out = new Float64Array(4)
): Float64Array {
  const q1 = Number(canonical[0] ?? 0);
  const q2 = Number(canonical[1] ?? 0);
  const { m1, m2, l1, l2, g } = parameters;
  const omega = momentumToOmega(canonical, parameters);
  const w1 = omega[2] ?? 0;
  const w2 = omega[3] ?? 0;
  const sinDelta = Math.sin(q1 - q2);
  const coupling = m2 * l1 * l2 * sinDelta * w1 * w2;

  // dH/dq
  out[0] = coupling + (m1 + m2) * g * l1 * Math.sin(q1);
  out[1] = -coupling + m2 * g * l2 * Math.sin(q2);
  // dH/dp = omega
  out[2] = w1;
  out[3] = w2;
  return out;
}

export function canonicalRhs(
  canonical: ArrayLike<number>,
  parameters: PendulumParameters,
  gamma: number,
  out = new Float64Array(4)
): Float64Array {
  const grad = hamiltonianGradient(canonical, parameters);
  const thetaOmega = momentumToOmega(canonical, parameters);
  out[0] = grad[2] ?? 0;
  out[1] = grad[3] ?? 0;
  out[2] = -(grad[0] ?? 0) - gamma * Number(thetaOmega[2] ?? 0);
  out[3] = -(grad[1] ?? 0) - gamma * Number(thetaOmega[3] ?? 0);
  return out;
}

export function implicitMidpointCanonical(
  canonical: ArrayLike<number>,
  dt: number,
  parameters: PendulumParameters,
  gamma: number,
  tolerance = 1e-10,
  maxIterations = 12
): CanonicalStepResult {
  const y0 = new Float64Array([
    Number(canonical[0] ?? 0),
    Number(canonical[1] ?? 0),
    Number(canonical[2] ?? 0),
    Number(canonical[3] ?? 0)
  ]);
  const trial = new Float64Array(y0);
  const mid = new Float64Array(4);
  const rhs = new Float64Array(4);
  let residual = Infinity;
  let iterations = 0;

  for (; iterations < maxIterations; iterations += 1) {
    for (let i = 0; i < 4; i += 1) mid[i] = 0.5 * ((y0[i] ?? 0) + (trial[i] ?? 0));
    canonicalRhs(mid, parameters, gamma, rhs);
    residual = 0;
    for (let i = 0; i < 4; i += 1) {
      const next = (y0[i] ?? 0) + dt * (rhs[i] ?? 0);
      residual = Math.max(residual, Math.abs(next - (trial[i] ?? 0)));
      trial[i] = next;
    }
    if (residual <= tolerance) break;
  }

  return {
    state: trial,
    stats: {
      residual,
      iterations: iterations + 1,
      converged: Number.isFinite(residual) && residual <= tolerance
    }
  };
}

export function canonicalStepThetaOmega(
  thetaOmega: ArrayLike<number>,
  dt: number,
  parameters: PendulumParameters,
  gamma: number,
  out = new Float64Array(4)
): { state: Float64Array; stats: ImplicitMidpointStats } {
  const canonical = omegaToMomentum(thetaOmega, parameters);
  const result = implicitMidpointCanonical(canonical, dt, parameters, gamma);
  momentumToOmega(result.state, parameters, out);
  return { state: out, stats: result.stats };
}
