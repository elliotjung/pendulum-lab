import { MASS_MATRIX_SINGULARITY_THRESHOLD } from './constants';

export type LinearSolveFailureReason =
  'dimension-mismatch' | 'singular-matrix' | 'non-finite-input' | 'not-positive-definite';
export type LinearSolveFallbackPolicy = 'return-diagnostics' | 'throw';

export interface LinearSolveResult {
  ok: boolean;
  reason?: LinearSolveFailureReason;
  pivotIndex?: number;
  pivotAbs?: number;
  minPivotAbs?: number;
  maxPivotAbs?: number;
  matrixScale: number;
  rhsScale: number;
  conditionEstimate: number;
  residualNorm?: number;
  relativeResidual?: number;
  fallbackPolicy: LinearSolveFallbackPolicy;
}

export interface LinearSolveOptions {
  pivotTolerance?: number;
  /**
   * Compute ||Ax-b|| diagnostics against the original system. Disabled by
   * default to keep hot RHS loops allocation-free.
   */
  diagnostics?: boolean;
  /**
   * The solver never invents a physical fallback solution. By default it
   * returns diagnostics; callers may opt into throwing at the failure point.
   */
  fallbackPolicy?: LinearSolveFallbackPolicy;
}

function solveFailure(
  reason: LinearSolveFailureReason,
  matrixScale: number,
  rhsScale: number,
  fallbackPolicy: LinearSolveFallbackPolicy,
  pivotIndex?: number,
  pivotAbs?: number,
  minPivotAbs?: number,
  maxPivotAbs?: number
): LinearSolveResult {
  const result: LinearSolveResult = {
    ok: false,
    reason,
    matrixScale,
    rhsScale,
    conditionEstimate: Infinity,
    fallbackPolicy
  };
  if (pivotIndex !== undefined) result.pivotIndex = pivotIndex;
  if (pivotAbs !== undefined) result.pivotAbs = pivotAbs;
  if (minPivotAbs !== undefined) result.minPivotAbs = minPivotAbs;
  if (maxPivotAbs !== undefined) result.maxPivotAbs = maxPivotAbs;
  if (fallbackPolicy === 'throw') assertLinearSolve(result, 'solveLinearInPlace');
  return result;
}

function residualDiagnostics(
  originalA: Float64Array,
  originalB: Float64Array,
  solution: Float64Array,
  n: number,
  matrixScale: number,
  rhsScale: number
): Pick<LinearSolveResult, 'residualNorm' | 'relativeResidual'> {
  let residualNorm = 0;
  let solutionScale = 0;
  for (let r = 0; r < n; r += 1) {
    let ax = 0;
    for (let c = 0; c < n; c += 1) ax += (originalA[r * n + c] ?? 0) * (solution[c] ?? 0);
    residualNorm = Math.max(residualNorm, Math.abs(ax - (originalB[r] ?? 0)));
    solutionScale = Math.max(solutionScale, Math.abs(solution[r] ?? 0));
  }
  const denominator = Math.max(rhsScale, matrixScale * Math.max(1, solutionScale), Number.EPSILON);
  return { residualNorm, relativeResidual: residualNorm / denominator };
}

/**
 * Solve A x = b in place by Gauss-Jordan elimination with partial pivoting.
 * The matrix is row-major n*n; the solution is written back into b.
 */
export function solveLinearInPlace(
  a: Float64Array,
  b: Float64Array,
  n: number,
  options: LinearSolveOptions = {}
): LinearSolveResult {
  const fallbackPolicy = options.fallbackPolicy ?? 'return-diagnostics';
  if (a.length < n * n || b.length < n || n <= 0)
    return solveFailure('dimension-mismatch', Infinity, Infinity, fallbackPolicy);

  let scale = 0;
  for (let i = 0; i < n * n; i += 1) {
    const value = a[i] ?? 0;
    if (!Number.isFinite(value)) return solveFailure('non-finite-input', Infinity, Infinity, fallbackPolicy);
    scale = Math.max(scale, Math.abs(value));
  }
  let rhsScale = 0;
  for (let i = 0; i < n; i += 1) {
    const value = b[i] ?? 0;
    if (!Number.isFinite(value)) return solveFailure('non-finite-input', scale, Infinity, fallbackPolicy);
    rhsScale = Math.max(rhsScale, Math.abs(value));
  }
  const originalA = options.diagnostics ? new Float64Array(a.subarray(0, n * n)) : undefined;
  const originalB = options.diagnostics ? new Float64Array(b.subarray(0, n)) : undefined;

  const tolerance = options.pivotTolerance ?? MASS_MATRIX_SINGULARITY_THRESHOLD;
  const pivotFloor = Math.max(tolerance, scale * Number.EPSILON);
  let minPivot = Infinity;
  let maxPivot = 0;

  for (let c = 0; c < n; c += 1) {
    let pivot = c;
    for (let r = c + 1; r < n; r += 1) {
      if (Math.abs(a[r * n + c] ?? 0) > Math.abs(a[pivot * n + c] ?? 0)) pivot = r;
    }
    if (pivot !== c) {
      for (let k = 0; k < n; k += 1) {
        const tmp = a[c * n + k] ?? 0;
        a[c * n + k] = a[pivot * n + k] ?? 0;
        a[pivot * n + k] = tmp;
      }
      const tb = b[c] ?? 0;
      b[c] = b[pivot] ?? 0;
      b[pivot] = tb;
    }

    const diag = a[c * n + c] ?? 0;
    const pivotAbs = Math.abs(diag);
    if (pivotAbs < pivotFloor) {
      return solveFailure('singular-matrix', scale, rhsScale, fallbackPolicy, c, pivotAbs, minPivot, maxPivot);
    }
    minPivot = Math.min(minPivot, pivotAbs);
    maxPivot = Math.max(maxPivot, pivotAbs);

    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const factor = (a[r * n + c] ?? 0) / diag;
      if (factor === 0) continue;
      for (let k = c; k < n; k += 1) a[r * n + k] = (a[r * n + k] ?? 0) - factor * (a[c * n + k] ?? 0);
      b[r] = (b[r] ?? 0) - factor * (b[c] ?? 0);
    }
  }

  for (let i = 0; i < n; i += 1) b[i] = (b[i] ?? 0) / (a[i * n + i] ?? 1);
  const residual = originalA && originalB ? residualDiagnostics(originalA, originalB, b, n, scale, rhsScale) : {};
  return {
    ok: true,
    minPivotAbs: minPivot,
    maxPivotAbs: maxPivot,
    matrixScale: scale,
    rhsScale,
    conditionEstimate: minPivot > 0 && Number.isFinite(minPivot) ? maxPivot / minPivot : Infinity,
    fallbackPolicy,
    ...residual
  };
}

export interface CholeskyFactorResult {
  ok: boolean;
  minDiag: number;
  maxDiag: number;
  /** Column at which factorisation failed (matrix not positive definite). */
  failIndex?: number;
  /** The non-positive squared pivot encountered at `failIndex`. */
  failValue?: number;
}

/**
 * Cholesky-Crout factorisation A = L·Lᵀ of a symmetric positive-definite
 * matrix. Reads the lower triangle of `a` (row-major n×n, left untouched) and
 * writes L into `factor`. Exposed separately from {@link solveCholeskyInPlace}
 * so callers solving many right-hand sides against one matrix (e.g. the
 * column-by-column mass-matrix Jacobian assembly) factor exactly once.
 */
export function choleskyFactor(
  a: Float64Array,
  n: number,
  factor: Float64Array,
  pivotFloor: number = MASS_MATRIX_SINGULARITY_THRESHOLD
): CholeskyFactorResult {
  let minDiag = Infinity;
  let maxDiag = 0;
  for (let j = 0; j < n; j += 1) {
    let sum = a[j * n + j] ?? 0;
    for (let k = 0; k < j; k += 1) {
      const ljk = factor[j * n + k] ?? 0;
      sum -= ljk * ljk;
    }
    // sum is the squared diagonal pivot; an SPD matrix keeps it positive.
    if (!(sum > pivotFloor)) {
      return { ok: false, minDiag, maxDiag, failIndex: j, failValue: Math.abs(sum) };
    }
    const ljj = Math.sqrt(sum);
    factor[j * n + j] = ljj;
    minDiag = Math.min(minDiag, ljj);
    maxDiag = Math.max(maxDiag, ljj);
    for (let i = j + 1; i < n; i += 1) {
      let s = a[i * n + j] ?? 0;
      for (let k = 0; k < j; k += 1) s -= (factor[i * n + k] ?? 0) * (factor[j * n + k] ?? 0);
      factor[i * n + j] = s / ljj;
    }
  }
  return { ok: true, minDiag, maxDiag };
}

/** Solve L·Lᵀ x = b in place of `b` given a factor from {@link choleskyFactor}. */
export function choleskySolveFactored(factor: Float64Array, b: Float64Array, n: number): void {
  // Forward solve L y = b, then back solve Lᵀ x = y, both in place of b.
  for (let i = 0; i < n; i += 1) {
    let s = b[i] ?? 0;
    for (let k = 0; k < i; k += 1) s -= (factor[i * n + k] ?? 0) * (b[k] ?? 0);
    b[i] = s / (factor[i * n + i] ?? 1);
  }
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = b[i] ?? 0;
    for (let k = i + 1; k < n; k += 1) s -= (factor[k * n + i] ?? 0) * (b[k] ?? 0);
    b[i] = s / (factor[i * n + i] ?? 1);
  }
}

/**
 * Solve A x = b for a symmetric positive-definite A by Cholesky factorisation
 * (A = L·Lᵀ) followed by two triangular solves. Roughly 3× fewer floating-point
 * operations than Gauss-Jordan elimination and unconditionally backward stable
 * for SPD systems without any pivoting — the right solver for the chain /
 * spherical-chain mass matrices, which are SPD by construction.
 *
 * `a` (row-major n×n, only the lower triangle is read) is left untouched: the
 * factor is written into the caller-provided `factor` scratch buffer (length
 * ≥ n·n), so on a `not-positive-definite` failure the caller can fall back to
 * the pivoted general solver with the original matrix intact. The solution is
 * written into `b` only on success.
 */
export function solveCholeskyInPlace(
  a: Float64Array,
  b: Float64Array,
  n: number,
  factor: Float64Array,
  options: LinearSolveOptions = {}
): LinearSolveResult {
  const fallbackPolicy = options.fallbackPolicy ?? 'return-diagnostics';
  if (a.length < n * n || b.length < n || factor.length < n * n || n <= 0) {
    return solveFailure('dimension-mismatch', Infinity, Infinity, fallbackPolicy);
  }

  let scale = 0;
  for (let i = 0; i < n * n; i += 1) {
    const value = a[i] ?? 0;
    if (!Number.isFinite(value)) return solveFailure('non-finite-input', Infinity, Infinity, fallbackPolicy);
    scale = Math.max(scale, Math.abs(value));
  }
  let rhsScale = 0;
  for (let i = 0; i < n; i += 1) {
    const value = b[i] ?? 0;
    if (!Number.isFinite(value)) return solveFailure('non-finite-input', scale, Infinity, fallbackPolicy);
    rhsScale = Math.max(rhsScale, Math.abs(value));
  }

  const tolerance = options.pivotTolerance ?? MASS_MATRIX_SINGULARITY_THRESHOLD;
  const pivotFloor = Math.max(tolerance, scale * Number.EPSILON);

  const factored = choleskyFactor(a, n, factor, pivotFloor);
  if (!factored.ok) {
    return solveFailure(
      'not-positive-definite',
      scale,
      rhsScale,
      fallbackPolicy,
      factored.failIndex,
      factored.failValue,
      factored.minDiag,
      factored.maxDiag
    );
  }
  const { minDiag, maxDiag } = factored;

  const originalB = options.diagnostics ? new Float64Array(b.subarray(0, n)) : undefined;
  choleskySolveFactored(factor, b, n);

  const residual = originalB ? residualDiagnostics(a, originalB, b, n, scale, rhsScale) : {};
  return {
    ok: true,
    minPivotAbs: minDiag,
    maxPivotAbs: maxDiag,
    matrixScale: scale,
    rhsScale,
    // cond(A) ≈ (maxDiag / minDiag)² for the Cholesky factor's diagonal.
    conditionEstimate: minDiag > 0 && Number.isFinite(minDiag) ? (maxDiag / minDiag) ** 2 : Infinity,
    fallbackPolicy,
    ...residual
  };
}

export function assertLinearSolve(result: LinearSolveResult, context: string): void {
  if (result.ok) return;
  const detail =
    result.reason === 'singular-matrix'
      ? `pivot ${result.pivotIndex ?? '?'} = ${result.pivotAbs ?? 0}`
      : (result.reason ?? 'unknown');
  throw new Error(
    `${context}: linear solve failed (${detail}; condition ${result.conditionEstimate}; fallback ${result.fallbackPolicy})`
  );
}
