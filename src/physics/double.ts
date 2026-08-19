import type { EnergyBreakdown, PendulumParameters } from '../types/domain';
import type { Derivative, StateVector } from './types';
import { MASS_MATRIX_SINGULARITY_THRESHOLD as DET_THRESHOLD } from './constants';
import { PhysicsEvaluationError, assertFiniteScalar, assertFiniteVector, assertPositiveFinite } from './errors';

export interface DoubleMassMatrixDiagnostics {
  determinant: number;
  /** |det(M / ||M||max)|; invariant under a uniform rescaling of mass/length units. */
  relativeDeterminant: number;
  matrixScale: number;
  singular: boolean;
}

function validateDoubleInputs(
  state: ArrayLike<number>,
  parameters: PendulumParameters,
  gamma: number,
  outLength: number,
  operation: string
): void {
  assertFiniteVector(state, 4, operation);
  if (outLength < 4) {
    throw new PhysicsEvaluationError('INVALID_DIMENSION', `${operation}: output must contain at least 4 components`, {
      operation,
      retryable: false,
      expectedMinimumLength: 4,
      actualLength: outLength
    });
  }
  assertPositiveFinite(parameters.m1, 'm1', operation);
  assertPositiveFinite(parameters.m2, 'm2', operation);
  assertPositiveFinite(parameters.l1, 'l1', operation);
  assertPositiveFinite(parameters.l2, 'l2', operation);
  assertFiniteScalar(parameters.g, 'g', operation);
  if (parameters.g < 0) {
    throw new PhysicsEvaluationError('INVALID_PARAMETER', `${operation}: g must be non-negative`, {
      operation,
      retryable: false,
      parameter: 'g',
      value: parameters.g
    });
  }
  assertFiniteScalar(gamma, 'gamma', operation);
}

export function doubleMassMatrixDiagnostics(
  state: ArrayLike<number>,
  parameters: PendulumParameters
): DoubleMassMatrixDiagnostics {
  assertFiniteVector(state, 2, 'doubleMassMatrixDiagnostics');
  assertPositiveFinite(parameters.m1, 'm1', 'doubleMassMatrixDiagnostics');
  assertPositiveFinite(parameters.m2, 'm2', 'doubleMassMatrixDiagnostics');
  assertPositiveFinite(parameters.l1, 'l1', 'doubleMassMatrixDiagnostics');
  assertPositiveFinite(parameters.l2, 'l2', 'doubleMassMatrixDiagnostics');
  const delta = Number(state[0]) - Number(state[1]);
  const m11 = (parameters.m1 + parameters.m2) * parameters.l1 * parameters.l1;
  const m12 = parameters.m2 * parameters.l1 * parameters.l2 * Math.cos(delta);
  const m22 = parameters.m2 * parameters.l2 * parameters.l2;
  const matrixScale = Math.max(Math.abs(m11), Math.abs(m22));
  if (!(matrixScale > 0) || ![m11, m12, m22, matrixScale].every(Number.isFinite)) {
    throw new PhysicsEvaluationError('NON_FINITE_INPUT', 'doubleMassMatrixDiagnostics: mass matrix overflowed', {
      operation: 'doubleMassMatrixDiagnostics',
      retryable: false,
      suggestedAction: 'Use finite parameters whose squared length/mass products fit in float64.',
      matrixScale
    });
  }
  const a = m11 / matrixScale;
  const b = m12 / matrixScale;
  const c = m22 / matrixScale;
  const relativeDeterminant = Math.abs(a * c - b * b);
  return {
    determinant: m11 * m22 - m12 * m12,
    relativeDeterminant,
    matrixScale,
    singular: !Number.isFinite(relativeDeterminant) || relativeDeterminant <= DET_THRESHOLD
  };
}

function assertUsableDoubleMassMatrix(
  state: ArrayLike<number>,
  parameters: PendulumParameters,
  operation: string
): DoubleMassMatrixDiagnostics {
  const diagnostics = doubleMassMatrixDiagnostics(state, parameters);
  if (diagnostics.singular) {
    throw new PhysicsEvaluationError('SINGULAR_MASS_MATRIX', `${operation}: double-pendulum mass matrix is singular`, {
      operation,
      retryable: false,
      suggestedAction: 'Use strictly positive, comparably scaled masses and lengths.',
      ...diagnostics,
      relativeThreshold: DET_THRESHOLD
    });
  }
  return diagnostics;
}

export function rhsDouble(
  state: ArrayLike<number>,
  parameters: PendulumParameters,
  gamma: number,
  out: StateVector
): StateVector {
  validateDoubleInputs(state, parameters, gamma, out.length, 'rhsDouble');
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
  const diagnostics = assertUsableDoubleMassMatrix(state, parameters, 'rhsDouble');
  const scale = diagnostics.matrixScale;
  const sm11 = m11 / scale;
  const sm12 = m12 / scale;
  const sm22 = m22 / scale;
  const det = sm11 * sm22 - sm12 * sm12;

  const f1 = -m2 * l1 * l2 * sinDelta * w2 * w2 - (m1 + m2) * g * l1 * Math.sin(t1) - gamma * w1;
  const f2 = m2 * l1 * l2 * sinDelta * w1 * w1 - m2 * g * l2 * Math.sin(t2) - gamma * w2;
  const sf1 = f1 / scale;
  const sf2 = f2 / scale;
  const a1 = (sm22 * sf1 - sm12 * sf2) / det;
  const a2 = (-sm12 * sf1 + sm11 * sf2) / det;
  if (![a1, a2].every(Number.isFinite)) {
    throw new PhysicsEvaluationError('NON_FINITE_INPUT', 'rhsDouble: acceleration overflowed', {
      operation: 'rhsDouble',
      retryable: false,
      suggestedAction: 'Reduce the state magnitude or rescale the physical parameters.',
      ...diagnostics
    });
  }
  out[0] = w1;
  out[1] = w2;
  out[2] = a1;
  out[3] = a2;
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
  validateDoubleInputs(state, parameters, gamma, jac.length >= 16 ? 4 : 0, 'jacobianDouble');
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
  const diagnostics = assertUsableDoubleMassMatrix(state, parameters, 'jacobianDouble');
  const scale = diagnostics.matrixScale;
  const sm11 = m11 / scale;
  const sm12 = m12 / scale;
  const sm22 = m22 / scale;
  const det = sm11 * sm22 - sm12 * sm12;

  // Row 0,1: d(theta_i)/dx = e_{omega_i}.
  jac[0] = 0;
  jac[1] = 0;
  jac[2] = 1;
  jac[3] = 0;
  jac[4] = 0;
  jac[5] = 0;
  jac[6] = 0;
  jac[7] = 1;

  const f1 = -B * sinD * w2 * w2 - (m1 + m2) * g * l1 * Math.sin(t1) - gamma * w1;
  const f2 = B * sinD * w1 * w1 - m2 * g * l2 * Math.sin(t2) - gamma * w2;
  const sf1 = f1 / scale;
  const sf2 = f2 / scale;
  const N2 = sm22 * sf1 - sm12 * sf2;
  const N3 = -sm12 * sf1 + sm11 * sf2;
  const det2 = det * det;

  // Partials w.r.t. [t1, t2, w1, w2], indexed 0..3.
  // m12 = B cos(delta): d/dt1 = -B sinD, d/dt2 = +B sinD.
  const dm12 = [(-B * sinD) / scale, (B * sinD) / scale, 0, 0];
  // det = m11 m22 - m12^2: ddet = -2 m12 dm12.
  const ddet = [-2 * sm12 * dm12[0]!, -2 * sm12 * dm12[1]!, 0, 0];
  // f1 = -B sinD w2^2 - (m1+m2) g l1 sin t1 - gamma w1.
  const df1 = [
    (-B * cosD * w2 * w2 - (m1 + m2) * g * l1 * Math.cos(t1)) / scale,
    (B * cosD * w2 * w2) / scale,
    -gamma / scale,
    (-2 * B * sinD * w2) / scale
  ];
  // f2 = B sinD w1^2 - m2 g l2 sin t2 - gamma w2.
  const df2 = [
    (B * cosD * w1 * w1) / scale,
    (-B * cosD * w1 * w1 - m2 * g * l2 * Math.cos(t2)) / scale,
    (2 * B * sinD * w1) / scale,
    -gamma / scale
  ];

  for (let j = 0; j < 4; j += 1) {
    const dN2 = sm22 * df1[j]! - (dm12[j]! * sf2 + sm12 * df2[j]!);
    const dN3 = -(dm12[j]! * sf1 + sm12 * df1[j]!) + sm11 * df2[j]!;
    jac[8 + j] = (dN2 * det - N2 * ddet[j]!) / det2; // d(out2)/dx_j
    jac[12 + j] = (dN3 * det - N3 * ddet[j]!) / det2; // d(out3)/dx_j
  }
  return jac;
}

export function energyDouble(state: ArrayLike<number>, parameters: PendulumParameters): EnergyBreakdown {
  validateDoubleInputs(state, parameters, 0, 4, 'energyDouble');
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

/** Build a reusable RHS carrying its exact Jacobian for Newton/tangent consumers. */
export function createDoublePendulumDerivative(parameters: PendulumParameters, gamma = 0): Derivative {
  // Validate once at construction as well as at evaluation, so configuration
  // errors are reported before a long integration starts.
  validateDoubleInputs([0, 0, 0, 0], parameters, gamma, 4, 'createDoublePendulumDerivative');
  const derivative: Derivative = (state, out): void => {
    rhsDouble(state, parameters, gamma, out);
  };
  derivative.jacobian = (state, jac): void => {
    jacobianDouble(state, parameters, gamma, jac);
  };
  derivative.jacobianProvenance = 'analytic-model';
  return derivative;
}
