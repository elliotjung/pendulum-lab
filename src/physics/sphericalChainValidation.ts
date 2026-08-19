import type { SphericalChainWorkspace } from './sphericalChain';
import { PhysicsEvaluationError, assertFiniteVector } from './errors';

export const SPHERICAL_CHAIN_FRAME_STRIDE = 14;

export function assertSphericalChainWorkspace(workspace: SphericalChainWorkspace, n: number, operation: string): void {
  const dof = 2 * n;
  if (
    workspace.n !== n ||
    workspace.dof !== dof ||
    workspace.suffix.length < n ||
    workspace.matrix.length < dof * dof ||
    workspace.force.length < dof ||
    workspace.factor.length < dof * dof ||
    workspace.frames.length < SPHERICAL_CHAIN_FRAME_STRIDE * n
  ) {
    throw new PhysicsEvaluationError(
      'INVALID_DIMENSION',
      `${operation}: workspace buffers do not match chain length ${n}`,
      {
        operation,
        retryable: false,
        expectedDimension: n,
        workspaceDimension: workspace.n
      }
    );
  }
}

export function assertSphericalChainState(state: ArrayLike<number>, n: number, operation: string): void {
  assertFiniteVector(state, 4 * n, operation);
}

export function assertFiniteSphericalChainResult(value: number, operation: string): void {
  if (!Number.isFinite(value)) {
    throw new PhysicsEvaluationError('NON_FINITE_INPUT', `${operation}: result overflowed`, {
      operation,
      retryable: false,
      suggestedAction: 'Reduce the state magnitude or rescale the physical parameters.'
    });
  }
}
