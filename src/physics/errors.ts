/** Stable machine-readable failure codes for public physics entry points. */
export type PhysicsErrorCode =
  | 'INVALID_DIMENSION'
  | 'NON_FINITE_INPUT'
  | 'INVALID_PARAMETER'
  | 'SINGULAR_MASS_MATRIX'
  | 'ADAPTIVE_TOLERANCE_UNATTAINABLE'
  | 'IMPLICIT_SOLVER_DID_NOT_CONVERGE';

export interface PhysicsErrorDetails {
  readonly operation: string;
  readonly retryable: boolean;
  readonly suggestedAction?: string;
  readonly [key: string]: unknown;
}

/**
 * Error used when a numerical kernel cannot produce a physically meaningful
 * result.  Callers can branch on `code` instead of parsing a message, while the
 * ordinary `Error` inheritance keeps existing try/catch integrations working.
 */
export class PhysicsEvaluationError extends Error {
  override readonly name = 'PhysicsEvaluationError';

  constructor(
    readonly code: PhysicsErrorCode,
    message: string,
    readonly details: PhysicsErrorDetails
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function assertFiniteVector(values: ArrayLike<number>, minimumLength: number, operation: string): void {
  if (!Number.isSafeInteger(values.length) || values.length < minimumLength) {
    throw new PhysicsEvaluationError(
      'INVALID_DIMENSION',
      `${operation}: expected at least ${minimumLength} components`,
      {
        operation,
        retryable: false,
        expectedMinimumLength: minimumLength,
        actualLength: values.length
      }
    );
  }
  for (let i = 0; i < minimumLength; i += 1) {
    if (!Number.isFinite(Number(values[i]))) {
      throw new PhysicsEvaluationError(
        'NON_FINITE_INPUT',
        `${operation}: component ${i} must be finite (non-finite input)`,
        {
          operation,
          retryable: false,
          component: i,
          value: values[i]
        }
      );
    }
  }
}

export function assertPositiveFinite(value: number, label: string, operation: string): void {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new PhysicsEvaluationError('INVALID_PARAMETER', `${operation}: ${label} must be positive and finite`, {
      operation,
      retryable: false,
      parameter: label,
      value
    });
  }
}

export function assertFiniteScalar(value: number, label: string, operation: string): void {
  if (!Number.isFinite(value)) {
    throw new PhysicsEvaluationError('NON_FINITE_INPUT', `${operation}: ${label} must be finite`, {
      operation,
      retryable: false,
      parameter: label,
      value
    });
  }
}

/**
 * Dense mass-matrix kernels are deliberately bounded at the public boundary.
 * Their workspaces contain O(n²) buffers and their direct solvers have O(n³)
 * cost, so accepting an arbitrary user-supplied dimension can turn a malformed
 * import into an allocation or main-thread denial of service.  Larger systems
 * belong in the dedicated sparse/GPU pipelines rather than these dense APIs.
 */
export const MAX_DENSE_PHYSICS_DIMENSION = 128;

export function assertDensePhysicsDimension(value: number, label: string, operation: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_DENSE_PHYSICS_DIMENSION) {
    throw new PhysicsEvaluationError(
      'INVALID_DIMENSION',
      `${operation}: ${label} must be a safe integer in [1, ${MAX_DENSE_PHYSICS_DIMENSION}]`,
      {
        operation,
        retryable: false,
        parameter: label,
        value,
        maximum: MAX_DENSE_PHYSICS_DIMENSION
      }
    );
  }
}

export function assertOutputVector(out: ArrayLike<number>, minimumLength: number, operation: string): void {
  if (!Number.isSafeInteger(out.length) || out.length < minimumLength) {
    throw new PhysicsEvaluationError(
      'INVALID_DIMENSION',
      `${operation}: output must contain at least ${minimumLength} components`,
      {
        operation,
        retryable: false,
        expectedMinimumLength: minimumLength,
        actualLength: out.length
      }
    );
  }
}

export function assertNonNegativeFinite(value: number, label: string, operation: string): void {
  if (!(value >= 0) || !Number.isFinite(value)) {
    throw new PhysicsEvaluationError('INVALID_PARAMETER', `${operation}: ${label} must be non-negative and finite`, {
      operation,
      retryable: false,
      parameter: label,
      value
    });
  }
}
