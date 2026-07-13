import type { Derivative, Jacobian } from './types';
import { IMPLICIT_SOLVE_TOLERANCE } from './constants';
import { solveLinearInPlace } from './linearSolve';

/**
 * Newton-solved implicit midpoint rule with full convergence instrumentation.
 *
 * The production `implicitMidpointStep` uses a fixed-point (Picard) iteration,
 * which is fast and allocation-free but converges only when dt·‖∂f/∂y‖ < 1 and
 * reports just a final residual. This variant performs a true Newton solve of
 *   G(y) = y - yₙ - dt·f((yₙ+y)/2) = 0,   G'(y) = I - (dt/2)·J_mid,
 * using a supplied analytic Jacobian, and records the per-iteration residual /
 * step history plus the ∞-norm condition number κ(I - (dt/2)J_mid) of the
 * Newton matrix — the honest stiffness/conditioning diagnostic that tells you
 * when the implicit solve is near-singular rather than hiding it.
 */
export interface NewtonStepRecord {
  /** 1-based iteration index. */
  iteration: number;
  /** ‖G(y)‖_∞ at the start of the iteration (the residual being reduced). */
  residualNorm: number;
  /** ‖Δy‖_∞ of the Newton update applied this iteration (0 if converged first). */
  stepNorm: number;
}

export type ImplicitMidpointFailureReason = 'non-finite-input' | 'singular-newton-matrix' | 'max-iterations';

export interface ImplicitMidpointReport {
  /** Whether the residual fell below tolerance within the iteration budget. */
  converged: boolean;
  /** Number of residual evaluations performed (= history length). */
  iterations: number;
  /** ‖G(y)‖_∞ at the accepted iterate. */
  finalResidual: number;
  /** Alias used by UI/API diagnostics: ‖G(y)‖_∞ at the accepted iterate. */
  residualNorm: number;
  /** Per-iteration convergence record (quadratic for Newton near the root). */
  history: NewtonStepRecord[];
  /** κ_∞(I - (dt/2)J_mid) at the accepted iterate; ≥ 1, → 1 as dt → 0, ∞ if singular. */
  conditionNumber: number;
  /** Alias used by UI/API diagnostics: κ_∞(I - (dt/2)J_mid). */
  conditionEstimate: number;
  /** Present when the Newton solve did not converge. */
  failureReason?: ImplicitMidpointFailureReason;
  /** The accepted next state y_{n+1}. */
  state: Float64Array;
}

export interface ImplicitMidpointNewtonOptions {
  /** Residual tolerance (∞-norm of G). Default IMPLICIT_SOLVE_TOLERANCE. */
  tolerance?: number;
  /** Maximum Newton iterations. Default 25. */
  maxIterations?: number;
}

/** ∞-norm condition number κ = ‖M‖_∞·‖M⁻¹‖_∞ (M⁻¹ formed column-by-column; small n). */
export function newtonMatrixConditionNumber(m: Float64Array, n: number): number {
  let normM = 0;
  for (let r = 0; r < n; r += 1) {
    let rowSum = 0;
    for (let c = 0; c < n; c += 1) rowSum += Math.abs(m[r * n + c] ?? 0);
    normM = Math.max(normM, rowSum);
  }
  // Accumulate row sums of |M⁻¹| by solving M·col = e_j for each unit vector.
  const rowAbsSum = new Float64Array(n);
  const work = new Float64Array(n * n);
  const rhs = new Float64Array(n);
  for (let j = 0; j < n; j += 1) {
    work.set(m.subarray(0, n * n));
    rhs.fill(0);
    rhs[j] = 1;
    const result = solveLinearInPlace(work, rhs, n);
    if (!result.ok) return Infinity;
    for (let i = 0; i < n; i += 1) rowAbsSum[i] = (rowAbsSum[i] ?? 0) + Math.abs(rhs[i] ?? 0);
  }
  let normMinv = 0;
  for (let i = 0; i < n; i += 1) normMinv = Math.max(normMinv, rowAbsSum[i] ?? 0);
  return normM * normMinv;
}

export function implicitMidpointNewton(
  state: ArrayLike<number>,
  dt: number,
  rhs: Derivative,
  jacobian: Jacobian,
  options: ImplicitMidpointNewtonOptions = {}
): ImplicitMidpointReport {
  const n = state.length;
  const tolerance = options.tolerance ?? IMPLICIT_SOLVE_TOLERANCE;
  const maxIterations = options.maxIterations ?? 25;

  const y0 = Float64Array.from(state as ArrayLike<number>);
  const y = Float64Array.from(y0);
  const mid = new Float64Array(n);
  const fmid = new Float64Array(n);
  const g = new Float64Array(n);
  const jac = new Float64Array(n * n);
  const newtonMatrix = new Float64Array(n * n);
  const rhsVec = new Float64Array(n);

  const history: NewtonStepRecord[] = [];
  let converged = false;
  let finalResidual = Infinity;
  let failureReason: ImplicitMidpointFailureReason | undefined;

  if (![dt, tolerance, maxIterations].every(Number.isFinite) || n === 0) {
    failureReason = 'non-finite-input';
    return {
      converged,
      iterations: 0,
      finalResidual,
      residualNorm: finalResidual,
      history,
      conditionNumber: Infinity,
      conditionEstimate: Infinity,
      failureReason,
      state: y
    };
  }

  for (let iter = 1; iter <= maxIterations; iter += 1) {
    for (let i = 0; i < n; i += 1) mid[i] = 0.5 * ((y0[i] ?? 0) + (y[i] ?? 0));
    rhs(mid, fmid);
    let residual = 0;
    for (let i = 0; i < n; i += 1) {
      g[i] = (y[i] ?? 0) - (y0[i] ?? 0) - dt * (fmid[i] ?? 0);
      residual = Math.max(residual, Math.abs(g[i] ?? 0));
    }
    const record: NewtonStepRecord = { iteration: iter, residualNorm: residual, stepNorm: 0 };
    history.push(record);
    finalResidual = residual;
    if (!Number.isFinite(residual)) {
      failureReason = 'non-finite-input';
      break;
    }
    if (residual < tolerance) {
      converged = true;
      break;
    }
    // Newton matrix M = I - (dt/2)·J(mid); solve M·Δ = -G.
    jacobian(mid, jac);
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        newtonMatrix[r * n + c] = (r === c ? 1 : 0) - 0.5 * dt * (jac[r * n + c] ?? 0);
      }
      rhsVec[r] = -(g[r] ?? 0);
    }
    const solve = solveLinearInPlace(newtonMatrix, rhsVec, n);
    if (!solve.ok) {
      failureReason = solve.reason === 'non-finite-input' ? 'non-finite-input' : 'singular-newton-matrix';
      break;
    }
    let stepNorm = 0;
    for (let i = 0; i < n; i += 1) {
      y[i] = (y[i] ?? 0) + (rhsVec[i] ?? 0);
      stepNorm = Math.max(stepNorm, Math.abs(rhsVec[i] ?? 0));
    }
    record.stepNorm = stepNorm;
  }
  if (!converged && !failureReason) failureReason = 'max-iterations';

  // Condition number of the Newton matrix at the accepted iterate.
  for (let i = 0; i < n; i += 1) mid[i] = 0.5 * ((y0[i] ?? 0) + (y[i] ?? 0));
  jacobian(mid, jac);
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      newtonMatrix[r * n + c] = (r === c ? 1 : 0) - 0.5 * dt * (jac[r * n + c] ?? 0);
    }
  }
  const conditionNumber = newtonMatrixConditionNumber(newtonMatrix, n);

  return {
    converged,
    iterations: history.length,
    finalResidual,
    residualNorm: finalResidual,
    history,
    conditionNumber,
    conditionEstimate: conditionNumber,
    ...(failureReason ? { failureReason } : {}),
    state: y
  };
}
