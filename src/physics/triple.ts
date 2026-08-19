import type { PendulumParameters } from '../types/domain';
import { MASS_MATRIX_SINGULARITY_THRESHOLD } from './constants';
import { PhysicsEvaluationError, assertFiniteScalar, assertFiniteVector, assertPositiveFinite } from './errors';
import { solveCholeskyInPlace, type LinearSolveResult } from './linearSolve';
import type { StateVector } from './types';

/** Reusable buffers for the 3x3 SPD mass-matrix solve. */
export interface TripleRhsWorkspace {
  matrix: Float64Array;
  force: Float64Array;
  factor: Float64Array;
  solution: Float64Array;
  /** Diagnostics from the most recent solve (including failures). */
  lastSolve?: LinearSolveResult;
}

export function createTripleRhsWorkspace(): TripleRhsWorkspace {
  return {
    matrix: new Float64Array(9),
    force: new Float64Array(3),
    factor: new Float64Array(9),
    solution: new Float64Array(3)
  };
}

// Each JS realm executes physics synchronously; a module-local default removes
// the historical allocation on every RHS call. Re-entrant/custom consumers can
// pass their own workspace explicitly.
const DEFAULT_WORKSPACE = createTripleRhsWorkspace();

function validateTripleInputs(
  state: ArrayLike<number>,
  parameters: Required<PendulumParameters>,
  gamma: number,
  out: StateVector,
  workspace: TripleRhsWorkspace
): void {
  const operation = 'rhsTriple';
  assertFiniteVector(state, 6, operation);
  if (out.length < 6) {
    throw new PhysicsEvaluationError('INVALID_DIMENSION', `${operation}: output must contain at least 6 components`, {
      operation,
      retryable: false,
      expectedMinimumLength: 6,
      actualLength: out.length
    });
  }
  for (const key of ['m1', 'm2', 'm3', 'l1', 'l2', 'l3'] as const) {
    assertPositiveFinite(parameters[key], key, operation);
  }
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
  if (
    workspace.matrix.length < 9 ||
    workspace.force.length < 3 ||
    workspace.factor.length < 9 ||
    workspace.solution.length < 3
  ) {
    throw new PhysicsEvaluationError('INVALID_DIMENSION', `${operation}: workspace buffers are undersized`, {
      operation,
      retryable: false
    });
  }
}

export function rhsTriple(
  state: ArrayLike<number>,
  parameters: Required<PendulumParameters>,
  gamma: number,
  out: StateVector,
  workspace: TripleRhsWorkspace = DEFAULT_WORKSPACE
): StateVector {
  validateTripleInputs(state, parameters, gamma, out, workspace);
  const t1 = Number(state[0]);
  const t2 = Number(state[1]);
  const t3 = Number(state[2]);
  const w1 = Number(state[3]);
  const w2 = Number(state[4]);
  const w3 = Number(state[5]);
  const { m1, m2, m3, l1, l2, l3, g } = parameters;
  const d12 = t1 - t2;
  const d23 = t2 - t3;
  const d13 = t1 - t3;
  const { matrix, force, factor, solution } = workspace;

  const m11 = (m1 + m2 + m3) * l1 * l1;
  const m12 = (m2 + m3) * l1 * l2 * Math.cos(d12);
  const m13 = m3 * l1 * l3 * Math.cos(d13);
  const m22 = (m2 + m3) * l2 * l2;
  const m23 = m3 * l2 * l3 * Math.cos(d23);
  const m33 = m3 * l3 * l3;
  const f1 =
    -(m2 + m3) * l1 * l2 * Math.sin(d12) * w2 * w2 -
    m3 * l1 * l3 * Math.sin(d13) * w3 * w3 -
    (m1 + m2 + m3) * g * l1 * Math.sin(t1) -
    gamma * w1;
  const f2 =
    (m2 + m3) * l1 * l2 * Math.sin(d12) * w1 * w1 -
    m3 * l2 * l3 * Math.sin(d23) * w3 * w3 -
    (m2 + m3) * g * l2 * Math.sin(t2) -
    gamma * w2;
  const f3 =
    m3 * l1 * l3 * Math.sin(d13) * w1 * w1 +
    m3 * l2 * l3 * Math.sin(d23) * w2 * w2 -
    m3 * g * l3 * Math.sin(t3) -
    gamma * w3;

  matrix[0] = m11;
  matrix[1] = m12;
  matrix[2] = m13;
  matrix[3] = m12;
  matrix[4] = m22;
  matrix[5] = m23;
  matrix[6] = m13;
  matrix[7] = m23;
  matrix[8] = m33;
  force[0] = f1;
  force[1] = f2;
  force[2] = f3;

  let matrixScale = 0;
  for (let i = 0; i < 9; i += 1) matrixScale = Math.max(matrixScale, Math.abs(matrix[i] ?? 0));
  const solve = solveCholeskyInPlace(matrix, force, 3, factor, {
    // A relative floor prevents a harmless change of units from changing the
    // singular/not-singular decision.
    pivotTolerance: matrixScale * MASS_MATRIX_SINGULARITY_THRESHOLD,
    solutionScratch: solution
  });
  workspace.lastSolve = solve;
  if (!solve.ok) {
    throw new PhysicsEvaluationError('SINGULAR_MASS_MATRIX', 'rhsTriple: mass-matrix solve failed', {
      operation: 'rhsTriple',
      retryable: false,
      suggestedAction: 'Use strictly positive, comparably scaled masses and lengths.',
      solve
    });
  }
  if (![force[0], force[1], force[2]].every(Number.isFinite)) {
    throw new PhysicsEvaluationError('NON_FINITE_INPUT', 'rhsTriple: acceleration overflowed', {
      operation: 'rhsTriple',
      retryable: false,
      suggestedAction: 'Reduce the state magnitude or rescale the physical parameters.',
      solve
    });
  }

  // Publish only after the solve succeeds; callers never receive fabricated
  // zero accelerations or a partially updated derivative.
  out[0] = w1;
  out[1] = w2;
  out[2] = w3;
  out[3] = force[0];
  out[4] = force[1];
  out[5] = force[2];
  return out;
}
