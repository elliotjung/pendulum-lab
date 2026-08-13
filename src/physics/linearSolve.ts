import { MASS_MATRIX_SINGULARITY_THRESHOLD } from './constants';

export type LinearSolveFailureReason =
  'dimension-mismatch' | 'singular-matrix' | 'non-finite-input' | 'non-finite-output' | 'not-positive-definite';
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
  maxPivotAbs?: number,
  context: string = 'solveLinearInPlace'
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
  if (fallbackPolicy === 'throw') assertLinearSolve(result, context);
  return result;
}

function choleskyFailure(
  reason: LinearSolveFailureReason,
  matrixScale: number,
  rhsScale: number,
  fallbackPolicy: LinearSolveFallbackPolicy,
  pivotIndex?: number,
  pivotAbs?: number,
  minPivotAbs?: number,
  maxPivotAbs?: number
): LinearSolveResult {
  return solveFailure(
    reason,
    matrixScale,
    rhsScale,
    fallbackPolicy,
    pivotIndex,
    pivotAbs,
    minPivotAbs,
    maxPivotAbs,
    'solveCholeskyInPlace'
  );
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

function symmetricLowerResidualDiagnostics(
  lowerA: Float64Array,
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
    for (let c = 0; c < n; c += 1) {
      const value = r >= c ? lowerA[r * n + c] : lowerA[c * n + r];
      ax += (value ?? 0) * (solution[c] ?? 0);
    }
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
  if (fallbackPolicy !== 'return-diagnostics' && fallbackPolicy !== 'throw') {
    throw new RangeError('solveLinearInPlace: fallbackPolicy is unsupported');
  }
  if (!Number.isSafeInteger(n) || n <= 0 || n > Math.floor(Math.sqrt(Number.MAX_SAFE_INTEGER))) {
    return solveFailure('dimension-mismatch', Infinity, Infinity, fallbackPolicy);
  }
  if (a.length < n * n || b.length < n) return solveFailure('dimension-mismatch', Infinity, Infinity, fallbackPolicy);

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
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError('solveLinearInPlace: pivotTolerance must be finite and non-negative');
  }
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
    if (!Number.isFinite(diag)) {
      return solveFailure('non-finite-output', scale, rhsScale, fallbackPolicy, c, Math.abs(diag), minPivot, maxPivot);
    }
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

  for (let i = 0; i < n; i += 1) {
    b[i] = (b[i] ?? 0) / (a[i * n + i] ?? 1);
    if (!Number.isFinite(b[i])) {
      return solveFailure(
        'non-finite-output',
        scale,
        rhsScale,
        fallbackPolicy,
        i,
        Math.abs(b[i] ?? Infinity),
        minPivot,
        maxPivot
      );
    }
  }
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

function float64RegionsOverlap(
  left: Float64Array,
  leftElements: number,
  right: Float64Array,
  rightElements: number
): boolean {
  if (left.buffer !== right.buffer) return false;
  const leftStart = left.byteOffset;
  const leftEnd = leftStart + leftElements * Float64Array.BYTES_PER_ELEMENT;
  const rightStart = right.byteOffset;
  const rightEnd = rightStart + rightElements * Float64Array.BYTES_PER_ELEMENT;
  return leftStart < rightEnd && rightStart < leftEnd;
}

function assertDistinctCholeskyRegions(
  caller: string,
  a: Float64Array,
  b: Float64Array | undefined,
  factor: Float64Array,
  n: number
): void {
  const matrixElements = n * n;
  if (float64RegionsOverlap(a, matrixElements, factor, matrixElements)) {
    throw new RangeError(`${caller}: matrix and factor work regions must not overlap.`);
  }
  if (b) {
    if (float64RegionsOverlap(a, matrixElements, b, n)) {
      throw new RangeError(`${caller}: matrix and rhs work regions must not overlap.`);
    }
    if (float64RegionsOverlap(factor, matrixElements, b, n)) {
      throw new RangeError(`${caller}: factor and rhs work regions must not overlap.`);
    }
  }
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
  if (!Number.isSafeInteger(n) || n < 1 || a.length < n * n || factor.length < n * n) {
    throw new RangeError('choleskyFactor: matrix and factor dimensions must match a positive safe order');
  }
  assertDistinctCholeskyRegions('choleskyFactor', a, undefined, factor, n);
  if (!Number.isFinite(pivotFloor) || pivotFloor < 0) {
    throw new RangeError('choleskyFactor: pivotFloor must be finite and non-negative');
  }
  let minDiag = Infinity;
  let maxDiag = 0;
  for (let j = 0; j < n; j += 1) {
    let sum = a[j * n + j] ?? 0;
    for (let k = 0; k < j; k += 1) {
      const ljk = factor[j * n + k] ?? 0;
      sum -= ljk * ljk;
    }
    // sum is the squared diagonal pivot; an SPD matrix keeps it positive.
    if (!Number.isFinite(sum) || !(sum > pivotFloor)) {
      return { ok: false, minDiag, maxDiag, failIndex: j, failValue: Math.abs(sum) };
    }
    const ljj = Math.sqrt(sum);
    factor[j * n + j] = ljj;
    minDiag = Math.min(minDiag, ljj);
    maxDiag = Math.max(maxDiag, ljj);
    for (let i = j + 1; i < n; i += 1) {
      let s = a[i * n + j] ?? 0;
      for (let k = 0; k < j; k += 1) s -= (factor[i * n + k] ?? 0) * (factor[j * n + k] ?? 0);
      const value = s / ljj;
      if (!Number.isFinite(value)) {
        return { ok: false, minDiag, maxDiag, failIndex: j, failValue: Math.abs(value) };
      }
      factor[i * n + j] = value;
    }
  }
  return { ok: true, minDiag, maxDiag };
}

/** Solve L·Lᵀ x = b in place of `b` given a factor from {@link choleskyFactor}. */
export function choleskySolveFactored(factor: Float64Array, b: Float64Array, n: number): void {
  if (!Number.isSafeInteger(n) || n < 1 || factor.length < n * n || b.length < n) {
    throw new RangeError('choleskySolveFactored: factor and rhs dimensions must match a positive safe order');
  }
  if (float64RegionsOverlap(factor, n * n, b, n)) {
    throw new RangeError('choleskySolveFactored: factor and rhs work regions must not overlap');
  }
  for (let i = 0; i < n; i += 1) {
    if (!Number.isFinite(b[i])) throw new TypeError(`choleskySolveFactored: rhs[${i}] must be finite`);
    for (let k = 0; k <= i; k += 1) {
      if (!Number.isFinite(factor[i * n + k])) {
        throw new TypeError(`choleskySolveFactored: lower factor[${i},${k}] must be finite`);
      }
    }
  }
  // Solve in a private vector and publish only after both triangular passes
  // succeed, so an arithmetic failure never leaves a partially rewritten rhs.
  const solution = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const diagonal = factor[i * n + i];
    if (!Number.isFinite(diagonal) || !(diagonal! > 0)) {
      throw new RangeError(`choleskySolveFactored: factor diagonal ${i} must be positive and finite`);
    }
    let s = b[i] ?? 0;
    for (let k = 0; k < i; k += 1) s -= (factor[i * n + k] ?? 0) * (solution[k] ?? 0);
    solution[i] = s / (factor[i * n + i] ?? 1);
    if (!Number.isFinite(solution[i])) throw new RangeError(`choleskySolveFactored: forward solve overflowed at ${i}`);
  }
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = solution[i] ?? 0;
    for (let k = i + 1; k < n; k += 1) s -= (factor[k * n + i] ?? 0) * (solution[k] ?? 0);
    solution[i] = s / (factor[i * n + i] ?? 1);
    if (!Number.isFinite(solution[i])) throw new RangeError(`choleskySolveFactored: backward solve overflowed at ${i}`);
  }
  b.set(solution, 0);
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
  if (fallbackPolicy !== 'return-diagnostics' && fallbackPolicy !== 'throw') {
    throw new RangeError('solveCholeskyInPlace: fallbackPolicy is unsupported');
  }
  if (
    !Number.isSafeInteger(n) ||
    n <= 0 ||
    n > Math.floor(Math.sqrt(Number.MAX_SAFE_INTEGER)) ||
    a.length < n * n ||
    b.length < n ||
    factor.length < n * n
  ) {
    return choleskyFailure('dimension-mismatch', Infinity, Infinity, fallbackPolicy);
  }
  assertDistinctCholeskyRegions('solveCholeskyInPlace', a, b, factor, n);

  let scale = 0;
  // Cholesky consumes only the lower triangle; upper entries are deliberately
  // ignored so callers may use lower-packed workspace matrices as documented.
  for (let row = 0; row < n; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      const value = a[row * n + column] ?? 0;
      if (!Number.isFinite(value)) return choleskyFailure('non-finite-input', Infinity, Infinity, fallbackPolicy);
      scale = Math.max(scale, Math.abs(value));
    }
  }
  let rhsScale = 0;
  for (let i = 0; i < n; i += 1) {
    const value = b[i] ?? 0;
    if (!Number.isFinite(value)) return choleskyFailure('non-finite-input', scale, Infinity, fallbackPolicy);
    rhsScale = Math.max(rhsScale, Math.abs(value));
  }

  const tolerance = options.pivotTolerance ?? MASS_MATRIX_SINGULARITY_THRESHOLD;
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError('solveCholeskyInPlace: pivotTolerance must be finite and non-negative');
  }
  const pivotFloor = Math.max(tolerance, scale * Number.EPSILON);

  const factored = choleskyFactor(a, n, factor, pivotFloor);
  if (!factored.ok) {
    return choleskyFailure(
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
  try {
    choleskySolveFactored(factor, b, n);
  } catch {
    return choleskyFailure('non-finite-output', scale, rhsScale, fallbackPolicy);
  }
  for (let i = 0; i < n; i += 1) {
    if (!Number.isFinite(b[i])) return choleskyFailure('non-finite-output', scale, rhsScale, fallbackPolicy);
  }

  const residual = originalB ? symmetricLowerResidualDiagnostics(a, originalB, b, n, scale, rhsScale) : {};
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
