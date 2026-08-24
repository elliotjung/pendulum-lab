import type { EnergyBreakdown, PendulumParameters } from '../types/domain';
import { MASS_MATRIX_SINGULARITY_THRESHOLD as DET_THRESHOLD } from './constants';
import { PhysicsEvaluationError, assertFiniteScalar, assertFiniteVector, assertPositiveFinite } from './errors';
import type { Derivative, StateVector } from './types';

/** Symmetric 2 x 2 inertia matrix for two serial uniform rods. */
export interface CompoundDoubleMassMatrix {
  m11: number;
  m12: number;
  m22: number;
  determinant: number;
}

export interface CompoundDoubleMassMatrixDiagnostics extends CompoundDoubleMassMatrix {
  /** |det(M / ||M||max)|; invariant under a uniform rescaling of mass/length units. */
  relativeDeterminant: number;
  matrixScale: number;
  positiveDefinite: boolean;
  singular: boolean;
}

function validateParameters(parameters: PendulumParameters, operation: string): void {
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
}

function validateDynamicsInputs(
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
  validateParameters(parameters, operation);
  assertFiniteScalar(gamma, 'gamma', operation);
}

function massMatrixUnchecked(theta1: number, theta2: number, parameters: PendulumParameters): CompoundDoubleMassMatrix {
  const { m1, m2, l1, l2 } = parameters;
  const m11 = (m1 / 3 + m2) * l1 * l1;
  const m12 = 0.5 * m2 * l1 * l2 * Math.cos(theta1 - theta2);
  const m22 = (m2 * l2 * l2) / 3;
  return { m11, m12, m22, determinant: m11 * m22 - m12 * m12 };
}

/**
 * Inertia matrix derived from Cartesian COM Jacobians plus each rod's
 * I_cm = m L^2 / 12. Angles are absolute and measured from downward vertical.
 */
export function compoundDoubleMassMatrix(
  state: ArrayLike<number>,
  parameters: PendulumParameters
): CompoundDoubleMassMatrix {
  assertFiniteVector(state, 2, 'compoundDoubleMassMatrix');
  validateParameters(parameters, 'compoundDoubleMassMatrix');
  const matrix = massMatrixUnchecked(Number(state[0]), Number(state[1]), parameters);
  if (![matrix.m11, matrix.m12, matrix.m22].every(Number.isFinite)) {
    throw new PhysicsEvaluationError('NON_FINITE_INPUT', 'compoundDoubleMassMatrix: mass matrix overflowed', {
      operation: 'compoundDoubleMassMatrix',
      retryable: false,
      suggestedAction: 'Use finite parameters whose squared length/mass products fit in float64.'
    });
  }
  return matrix;
}

export function compoundDoubleMassMatrixDiagnostics(
  state: ArrayLike<number>,
  parameters: PendulumParameters
): CompoundDoubleMassMatrixDiagnostics {
  const matrix = compoundDoubleMassMatrix(state, parameters);
  const matrixScale = Math.max(Math.abs(matrix.m11), Math.abs(matrix.m12), Math.abs(matrix.m22));
  if (!(matrixScale > 0) || !Number.isFinite(matrixScale)) {
    throw new PhysicsEvaluationError('NON_FINITE_INPUT', 'compoundDoubleMassMatrixDiagnostics: invalid matrix scale', {
      operation: 'compoundDoubleMassMatrixDiagnostics',
      retryable: false,
      matrixScale
    });
  }
  const a = matrix.m11 / matrixScale;
  const b = matrix.m12 / matrixScale;
  const c = matrix.m22 / matrixScale;
  const scaledDeterminant = a * c - b * b;
  const relativeDeterminant = Math.abs(scaledDeterminant);
  const positiveDefinite = a > 0 && c > 0 && scaledDeterminant > 0;
  return {
    ...matrix,
    relativeDeterminant,
    matrixScale,
    positiveDefinite,
    singular: !positiveDefinite || !Number.isFinite(relativeDeterminant) || relativeDeterminant <= DET_THRESHOLD
  };
}

function assertUsableMassMatrix(
  state: ArrayLike<number>,
  parameters: PendulumParameters,
  operation: string
): CompoundDoubleMassMatrixDiagnostics {
  const diagnostics = compoundDoubleMassMatrixDiagnostics(state, parameters);
  if (diagnostics.singular) {
    throw new PhysicsEvaluationError(
      'SINGULAR_MASS_MATRIX',
      `${operation}: compound-double-pendulum mass matrix is singular or ill-scaled`,
      {
        operation,
        retryable: false,
        suggestedAction: 'Use strictly positive, comparably scaled rod masses and lengths.',
        ...diagnostics,
        relativeThreshold: DET_THRESHOLD
      }
    );
  }
  return diagnostics;
}

/**
 * Euler-Lagrange RHS for two serial uniform rods.
 *
 * The first COM is at (l1/2)e(theta1); the second is at
 * l1 e(theta1) + (l2/2)e(theta2). Translational COM kinetic energy is combined
 * with I_cm = m L^2/12, never with a hinge inertia, so no kinetic term is
 * counted twice.
 */
export function rhsCompoundDouble(
  state: ArrayLike<number>,
  parameters: PendulumParameters,
  gamma: number,
  out: StateVector
): StateVector {
  validateDynamicsInputs(state, parameters, gamma, out.length, 'rhsCompoundDouble');
  const theta1 = Number(state[0]);
  const theta2 = Number(state[1]);
  const omega1 = Number(state[2]);
  const omega2 = Number(state[3]);
  const { m1, m2, l1, l2, g } = parameters;
  const delta = theta1 - theta2;
  const sinDelta = Math.sin(delta);
  const coupling = 0.5 * m2 * l1 * l2;
  const gravity1 = (m1 / 2 + m2) * g * l1;
  const gravity2 = 0.5 * m2 * g * l2;
  const diagnostics = assertUsableMassMatrix(state, parameters, 'rhsCompoundDouble');
  const { m11, m12, m22, matrixScale } = diagnostics;

  // M(theta) alpha = f. Linear damping is a generalized hinge torque.
  const f1 = -coupling * sinDelta * omega2 * omega2 - gravity1 * Math.sin(theta1) - gamma * omega1;
  const f2 = coupling * sinDelta * omega1 * omega1 - gravity2 * Math.sin(theta2) - gamma * omega2;
  const a = m11 / matrixScale;
  const b = m12 / matrixScale;
  const c = m22 / matrixScale;
  const determinant = a * c - b * b;
  const u = f1 / matrixScale;
  const v = f2 / matrixScale;
  const alpha1 = (c * u - b * v) / determinant;
  const alpha2 = (-b * u + a * v) / determinant;
  if (![alpha1, alpha2].every(Number.isFinite)) {
    throw new PhysicsEvaluationError('NON_FINITE_INPUT', 'rhsCompoundDouble: acceleration overflowed', {
      operation: 'rhsCompoundDouble',
      retryable: false,
      suggestedAction: 'Reduce the state magnitude or rescale the physical parameters.',
      ...diagnostics
    });
  }

  out[0] = omega1;
  out[1] = omega2;
  out[2] = alpha1;
  out[3] = alpha2;
  return out;
}

/** Mechanical energy from COM translation plus rotation about each COM. */
export function energyCompoundDouble(state: ArrayLike<number>, parameters: PendulumParameters): EnergyBreakdown {
  validateDynamicsInputs(state, parameters, 0, 4, 'energyCompoundDouble');
  const theta1 = Number(state[0]);
  const theta2 = Number(state[1]);
  const omega1 = Number(state[2]);
  const omega2 = Number(state[3]);
  const { m1, m2, l1, l2, g } = parameters;
  const cosDelta = Math.cos(theta1 - theta2);

  const v1CenterSquared = 0.25 * l1 * l1 * omega1 * omega1;
  const v2CenterSquared =
    l1 * l1 * omega1 * omega1 + 0.25 * l2 * l2 * omega2 * omega2 + l1 * l2 * cosDelta * omega1 * omega2;
  const inertia1Center = (m1 * l1 * l1) / 12;
  const inertia2Center = (m2 * l2 * l2) / 12;
  const translational = 0.5 * m1 * v1CenterSquared + 0.5 * m2 * v2CenterSquared;
  const rotational = 0.5 * inertia1Center * omega1 * omega1 + 0.5 * inertia2Center * omega2 * omega2;
  const KE = translational + rotational;

  const y1Center = -0.5 * l1 * Math.cos(theta1);
  const y2Center = -l1 * Math.cos(theta1) - 0.5 * l2 * Math.cos(theta2);
  const PE = g * (m1 * y1Center + m2 * y2Center);
  const total = KE + PE;
  if (![KE, PE, total].every(Number.isFinite)) {
    throw new PhysicsEvaluationError('NON_FINITE_INPUT', 'energyCompoundDouble: energy overflowed', {
      operation: 'energyCompoundDouble',
      retryable: false,
      suggestedAction: 'Reduce the state magnitude or rescale the physical parameters.'
    });
  }
  return { total, KE, PE };
}

/** Build a reusable derivative for fixed- and adaptive-step integrators. */
export function createCompoundDoublePendulumDerivative(parameters: PendulumParameters, gamma = 0): Derivative {
  validateDynamicsInputs([0, 0, 0, 0], parameters, gamma, 4, 'createCompoundDoublePendulumDerivative');
  return (state, out): void => {
    rhsCompoundDouble(state, parameters, gamma, out);
  };
}
