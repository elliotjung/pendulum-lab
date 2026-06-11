export type LinearSolveFailureReason = 'dimension-mismatch' | 'singular-matrix' | 'non-finite-input';

export interface LinearSolveResult {
  ok: boolean;
  reason?: LinearSolveFailureReason;
  pivotIndex?: number;
  pivotAbs?: number;
  conditionEstimate: number;
}

export interface LinearSolveOptions {
  pivotTolerance?: number;
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
  if (a.length < n * n || b.length < n || n <= 0) return { ok: false, reason: 'dimension-mismatch', conditionEstimate: Infinity };

  let scale = 0;
  for (let i = 0; i < n * n; i += 1) {
    const value = a[i] ?? 0;
    if (!Number.isFinite(value)) return { ok: false, reason: 'non-finite-input', conditionEstimate: Infinity };
    scale = Math.max(scale, Math.abs(value));
  }
  for (let i = 0; i < n; i += 1) {
    const value = b[i] ?? 0;
    if (!Number.isFinite(value)) return { ok: false, reason: 'non-finite-input', conditionEstimate: Infinity };
  }

  const tolerance = options.pivotTolerance ?? 1e-14;
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
      return {
        ok: false,
        reason: 'singular-matrix',
        pivotIndex: c,
        pivotAbs,
        conditionEstimate: Infinity
      };
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
  return {
    ok: true,
    conditionEstimate: minPivot > 0 && Number.isFinite(minPivot) ? maxPivot / minPivot : Infinity
  };
}

export function assertLinearSolve(result: LinearSolveResult, context: string): void {
  if (result.ok) return;
  const detail = result.reason === 'singular-matrix'
    ? `pivot ${result.pivotIndex ?? '?'} = ${result.pivotAbs ?? 0}`
    : result.reason ?? 'unknown';
  throw new Error(`${context}: linear solve failed (${detail})`);
}
