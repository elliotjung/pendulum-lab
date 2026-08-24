import type { EnergyBreakdown, PendulumParameters } from '../types/domain';

export interface CompoundDoubleReferenceMassMatrix {
  m11: number;
  m12: number;
  m22: number;
  determinant: number;
}

interface Vector2 {
  x: number;
  y: number;
}

function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

function validate(
  state: ArrayLike<number>,
  parameters: PendulumParameters,
  minimumStateLength: number,
  operation: string,
  gamma?: number
): void {
  if (!Number.isSafeInteger(state.length) || state.length < minimumStateLength) {
    throw new RangeError(`${operation}: expected at least ${minimumStateLength} state components.`);
  }
  for (let index = 0; index < minimumStateLength; index += 1) {
    if (!Number.isFinite(Number(state[index]))) throw new RangeError(`${operation}: state must be finite.`);
  }
  for (const [name, value] of [
    ['m1', parameters.m1],
    ['m2', parameters.m2],
    ['l1', parameters.l1],
    ['l2', parameters.l2]
  ] as const) {
    if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`${operation}: ${name} must be positive.`);
  }
  if (!(parameters.g >= 0) || !Number.isFinite(parameters.g)) {
    throw new RangeError(`${operation}: g must be non-negative and finite.`);
  }
  if (gamma !== undefined && !Number.isFinite(gamma)) throw new RangeError(`${operation}: gamma must be finite.`);
}

function kinematicColumns(
  theta1: number,
  theta2: number,
  parameters: PendulumParameters
): {
  rod1Theta1: Vector2;
  rod2Theta1: Vector2;
  rod2Theta2: Vector2;
} {
  return {
    rod1Theta1: {
      x: 0.5 * parameters.l1 * Math.cos(theta1),
      y: 0.5 * parameters.l1 * Math.sin(theta1)
    },
    rod2Theta1: {
      x: parameters.l1 * Math.cos(theta1),
      y: parameters.l1 * Math.sin(theta1)
    },
    rod2Theta2: {
      x: 0.5 * parameters.l2 * Math.cos(theta2),
      y: 0.5 * parameters.l2 * Math.sin(theta2)
    }
  };
}

/**
 * Independent Cartesian-Jacobian reference for the inertia matrix. This does
 * not reuse the production matrix formula: each COM translation contributes
 * m J^T J and each rod contributes I_cm to its own angular coordinate.
 */
export function compoundDoubleReferenceMassMatrix(
  state: ArrayLike<number>,
  parameters: PendulumParameters
): CompoundDoubleReferenceMassMatrix {
  validate(state, parameters, 2, 'compoundDoubleReferenceMassMatrix');
  const theta1 = Number(state[0]);
  const theta2 = Number(state[1]);
  const columns = kinematicColumns(theta1, theta2, parameters);
  const inertia1Center = (parameters.m1 * parameters.l1 * parameters.l1) / 12;
  const inertia2Center = (parameters.m2 * parameters.l2 * parameters.l2) / 12;
  const m11 =
    parameters.m1 * dot(columns.rod1Theta1, columns.rod1Theta1) +
    inertia1Center +
    parameters.m2 * dot(columns.rod2Theta1, columns.rod2Theta1);
  const m12 = parameters.m2 * dot(columns.rod2Theta1, columns.rod2Theta2);
  const m22 = parameters.m2 * dot(columns.rod2Theta2, columns.rod2Theta2) + inertia2Center;
  return { m11, m12, m22, determinant: m11 * m22 - m12 * m12 };
}

/** Reference energy assembled directly from Cartesian COM positions/velocities. */
export function compoundDoubleReferenceEnergy(
  state: ArrayLike<number>,
  parameters: PendulumParameters
): EnergyBreakdown {
  validate(state, parameters, 4, 'compoundDoubleReferenceEnergy');
  const theta1 = Number(state[0]);
  const theta2 = Number(state[1]);
  const omega1 = Number(state[2]);
  const omega2 = Number(state[3]);
  const columns = kinematicColumns(theta1, theta2, parameters);
  const velocity1 = {
    x: columns.rod1Theta1.x * omega1,
    y: columns.rod1Theta1.y * omega1
  };
  const velocity2 = {
    x: columns.rod2Theta1.x * omega1 + columns.rod2Theta2.x * omega2,
    y: columns.rod2Theta1.y * omega1 + columns.rod2Theta2.y * omega2
  };
  const inertia1Center = (parameters.m1 * parameters.l1 * parameters.l1) / 12;
  const inertia2Center = (parameters.m2 * parameters.l2 * parameters.l2) / 12;
  const KE =
    0.5 * parameters.m1 * dot(velocity1, velocity1) +
    0.5 * inertia1Center * omega1 * omega1 +
    0.5 * parameters.m2 * dot(velocity2, velocity2) +
    0.5 * inertia2Center * omega2 * omega2;
  const y1Center = -0.5 * parameters.l1 * Math.cos(theta1);
  const y2Center = -parameters.l1 * Math.cos(theta1) - 0.5 * parameters.l2 * Math.cos(theta2);
  const PE = parameters.g * (parameters.m1 * y1Center + parameters.m2 * y2Center);
  return { total: KE + PE, KE, PE };
}

/**
 * Independent Cartesian virtual-work reference RHS.
 *
 * For each COM, a = J qdd + b. The reference builds M from m J^T J + I_cm,
 * projects the Cartesian acceleration bias b and gravity through J^T, then
 * solves M qdd = Q_gravity + Q_damping - sum(m J^T b). This route is
 * algebraically independent of the production Euler-Lagrange closed form.
 */
export function rhsCompoundDoubleReference(
  state: ArrayLike<number>,
  parameters: PendulumParameters,
  gamma = 0,
  out = new Float64Array(4)
): Float64Array {
  validate(state, parameters, 4, 'rhsCompoundDoubleReference', gamma);
  if (out.length < 4) throw new RangeError('rhsCompoundDoubleReference: output must contain at least 4 components.');
  const theta1 = Number(state[0]);
  const theta2 = Number(state[1]);
  const omega1 = Number(state[2]);
  const omega2 = Number(state[3]);
  const columns = kinematicColumns(theta1, theta2, parameters);
  const matrix = compoundDoubleReferenceMassMatrix(state, parameters);

  const bias1 = {
    x: -0.5 * parameters.l1 * Math.sin(theta1) * omega1 * omega1,
    y: 0.5 * parameters.l1 * Math.cos(theta1) * omega1 * omega1
  };
  const bias2 = {
    x: -parameters.l1 * Math.sin(theta1) * omega1 * omega1 - 0.5 * parameters.l2 * Math.sin(theta2) * omega2 * omega2,
    y: parameters.l1 * Math.cos(theta1) * omega1 * omega1 + 0.5 * parameters.l2 * Math.cos(theta2) * omega2 * omega2
  };
  const inertialBias1 = parameters.m1 * dot(columns.rod1Theta1, bias1) + parameters.m2 * dot(columns.rod2Theta1, bias2);
  const inertialBias2 = parameters.m2 * dot(columns.rod2Theta2, bias2);
  const gravityForce1 = -parameters.g * (parameters.m1 * columns.rod1Theta1.y + parameters.m2 * columns.rod2Theta1.y);
  const gravityForce2 = -parameters.g * parameters.m2 * columns.rod2Theta2.y;
  const force1 = gravityForce1 - inertialBias1 - gamma * omega1;
  const force2 = gravityForce2 - inertialBias2 - gamma * omega2;
  if (!(matrix.determinant > 0) || !Number.isFinite(matrix.determinant)) {
    throw new RangeError('rhsCompoundDoubleReference: mass matrix must be finite and positive definite.');
  }
  const alpha1 = (matrix.m22 * force1 - matrix.m12 * force2) / matrix.determinant;
  const alpha2 = (-matrix.m12 * force1 + matrix.m11 * force2) / matrix.determinant;
  if (![alpha1, alpha2].every(Number.isFinite)) {
    throw new RangeError('rhsCompoundDoubleReference: acceleration must remain finite.');
  }
  out[0] = omega1;
  out[1] = omega2;
  out[2] = alpha1;
  out[3] = alpha2;
  return out;
}
