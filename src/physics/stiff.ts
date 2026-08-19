import type { Derivative, Jacobian, StateVector, StepOptions } from './types';
import { solveLinearInPlace } from './linearSolve';
import { IMPLICIT_SOLVE_TOLERANCE } from './constants';

/**
 * TR-BDF2: a self-starting, L-stable, second-order implicit solver. Both
 * implicit stages are Newton-solved and fail closed: on any non-convergence the
 * output remains the previous state and diagnostics provide a retryable code.
 */

const GAMMA = 2 - Math.SQRT2;
const C1 = 1 / (GAMMA * (2 - GAMMA));
const C0 = (1 - GAMMA) ** 2 / (GAMMA * (2 - GAMMA));
const CF = (1 - GAMMA) / (2 - GAMMA);
const CENTRAL_DIFFERENCE_SCALE = Math.cbrt(Number.EPSILON);

interface StiffWorkspace {
  dimension: number;
  jac: Float64Array;
  f: StateVector;
  plusState: StateVector;
  minusState: StateVector;
  fPlus: StateVector;
  fMinus: StateVector;
  residual: StateVector;
  delta: StateVector;
  fn: StateVector;
  trapBase: StateVector;
  y1: StateVector;
  bdfBase: StateVector;
  y2: StateVector;
}

function createStiffWorkspace(n: number): StiffWorkspace {
  const vector = (): Float64Array => new Float64Array(n);
  return {
    dimension: n,
    jac: new Float64Array(n * n),
    f: vector(),
    plusState: vector(),
    minusState: vector(),
    fPlus: vector(),
    fMinus: vector(),
    residual: vector(),
    delta: vector(),
    fn: vector(),
    trapBase: vector(),
    y1: vector(),
    bdfBase: vector(),
    y2: vector()
  };
}

const WORKSPACES = new Map<number, StiffWorkspace>();

function workspaceFor(n: number): StiffWorkspace {
  const existing = WORKSPACES.get(n);
  if (existing) return existing;
  const created = createStiffWorkspace(n);
  WORKSPACES.set(n, created);
  return created;
}

function finiteVector(values: ArrayLike<number>, n: number): boolean {
  for (let i = 0; i < n; i += 1) if (!Number.isFinite(Number(values[i]))) return false;
  return true;
}

/** A validated fixed zero-step is an exact identity map and never evaluates RHS. */
function completeZeroStep(state: StateVector, out: StateVector, options: StepOptions): StateVector {
  out.set(state);
  if (options.previousError) options.previousError.value = 0;
  if (options.errorComponents) options.errorComponents.fill(0, 0, state.length);
  if (options.diagnostics) {
    options.diagnostics.solver = 'newton';
    options.diagnostics.iterations = 0;
    options.diagnostics.residualNorm = 0;
    options.diagnostics.converged = true;
    options.diagnostics.accepted = true;
    options.diagnostics.retryable = false;
    delete options.diagnostics.failureReason;
    delete options.diagnostics.errorCode;
    delete options.diagnostics.suggestedDt;
    delete options.diagnostics.conditionEstimate;
  }
  return out;
}

/** Central-difference fallback; exact/AD model Jacobians are preferred. */
function numericalJacobian(rhs: Derivative, y: StateVector, jac: Float64Array, work: StiffWorkspace): boolean {
  const n = y.length;
  for (let j = 0; j < n; j += 1) {
    const yj = Number(y[j]);
    const eps = CENTRAL_DIFFERENCE_SCALE * Math.max(1, Math.abs(yj));
    work.plusState.set(y);
    work.minusState.set(y);
    work.plusState[j] = yj + eps;
    work.minusState[j] = yj - eps;
    rhs(work.plusState, work.fPlus);
    rhs(work.minusState, work.fMinus);
    if (!finiteVector(work.fPlus, n) || !finiteVector(work.fMinus, n)) return false;
    const inv = 0.5 / eps;
    for (let i = 0; i < n; i += 1) jac[i * n + j] = (Number(work.fPlus[i]) - Number(work.fMinus[i])) * inv;
  }
  return finiteVector(jac, n * n);
}

type StageFailure = 'non-finite-rhs' | 'non-finite-jacobian' | 'singular-newton-matrix' | 'max-iterations';

interface StageReport {
  converged: boolean;
  iterations: number;
  residualNorm: number;
  failureReason?: StageFailure;
}

function newtonStage(
  rhs: Derivative,
  base: StateVector,
  coef: number,
  h: number,
  y: StateVector,
  tolerance: number,
  work: StiffWorkspace,
  jacobian?: Jacobian
): StageReport {
  const n = y.length;
  let residualNorm = Infinity;
  let iterations = 0;
  for (let iter = 0; iter < 25; iter += 1) {
    iterations = iter + 1;
    rhs(y, work.f);
    if (!finiteVector(work.f, n)) {
      return { converged: false, iterations, residualNorm: Infinity, failureReason: 'non-finite-rhs' };
    }
    residualNorm = 0;
    for (let i = 0; i < n; i += 1) {
      work.residual[i] = Number(y[i]) - Number(base[i]) - coef * h * Number(work.f[i]);
      residualNorm = Math.max(residualNorm, Math.abs(Number(work.residual[i])));
    }
    if (residualNorm <= tolerance) return { converged: true, iterations, residualNorm };

    if (jacobian) {
      jacobian(y, work.jac);
      if (!finiteVector(work.jac, n * n)) {
        return { converged: false, iterations, residualNorm, failureReason: 'non-finite-jacobian' };
      }
    } else if (!numericalJacobian(rhs, y, work.jac, work)) {
      return { converged: false, iterations, residualNorm, failureReason: 'non-finite-jacobian' };
    }
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        work.jac[i * n + j] = (i === j ? 1 : 0) - coef * h * Number(work.jac[i * n + j]);
      }
      work.delta[i] = -Number(work.residual[i]);
    }
    const solve = solveLinearInPlace(work.jac, work.delta, n);
    if (!solve.ok) {
      return { converged: false, iterations, residualNorm, failureReason: 'singular-newton-matrix' };
    }
    for (let i = 0; i < n; i += 1) y[i] = Number(y[i]) + Number(work.delta[i]);
    if (!finiteVector(y, n)) {
      return { converged: false, iterations, residualNorm: Infinity, failureReason: 'non-finite-rhs' };
    }
  }
  return { converged: false, iterations, residualNorm, failureReason: 'max-iterations' };
}

export function trBdf2Step(
  state: StateVector,
  dt: number,
  rhs: Derivative,
  out: StateVector,
  options: StepOptions = {}
): StateVector {
  const n = state.length;
  const tolerance = options.tolerance ?? IMPLICIT_SOLVE_TOLERANCE;
  if (!Number.isSafeInteger(n) || n < 1 || out.length < n) {
    throw new RangeError('trBdf2Step: state/output dimensions must match a positive state dimension.');
  }
  if (!finiteVector(state, n)) throw new RangeError('trBdf2Step: state components must be finite.');
  if (!Number.isFinite(dt)) throw new RangeError('trBdf2Step: dt must be finite.');
  if (typeof rhs !== 'function') throw new TypeError('trBdf2Step: rhs must be a function.');
  if (!(tolerance > 0) || !Number.isFinite(tolerance)) {
    throw new RangeError('trBdf2Step: tolerance must be positive and finite.');
  }
  if (dt === 0) return completeZeroStep(state, out, options);

  const work = workspaceFor(n);
  const jacobian = options.jacobian ?? rhs.jacobian;
  rhs(state, work.fn);
  let stage1: StageReport;
  let stage2: StageReport | undefined;
  if (!finiteVector(work.fn, n)) {
    stage1 = { converged: false, iterations: 0, residualNorm: Infinity, failureReason: 'non-finite-rhs' };
  } else {
    for (let i = 0; i < n; i += 1) {
      work.trapBase[i] = Number(state[i]) + ((GAMMA * dt) / 2) * Number(work.fn[i]);
    }
    work.y1.set(state);
    stage1 = newtonStage(rhs, work.trapBase, GAMMA / 2, dt, work.y1, tolerance, work, jacobian);
    if (stage1.converged) {
      for (let i = 0; i < n; i += 1) {
        work.bdfBase[i] = C1 * Number(work.y1[i]) - C0 * Number(state[i]);
      }
      work.y2.set(work.y1);
      stage2 = newtonStage(rhs, work.bdfBase, CF, dt, work.y2, tolerance, work, jacobian);
    }
  }

  const converged = stage1.converged && stage2?.converged === true;
  const residualNorm = Math.max(stage1.residualNorm, stage2?.residualNorm ?? 0);
  out.set(converged ? work.y2 : state);
  if (options.previousError) options.previousError.value = residualNorm;
  if (options.diagnostics) {
    const failure = stage2?.failureReason ?? stage1.failureReason;
    options.diagnostics.solver = 'newton';
    options.diagnostics.iterations = stage1.iterations + (stage2?.iterations ?? 0);
    options.diagnostics.residualNorm = residualNorm;
    options.diagnostics.converged = converged;
    options.diagnostics.accepted = converged;
    options.diagnostics.retryable = !converged && failure !== 'non-finite-rhs' && failure !== 'non-finite-jacobian';
    if (converged) {
      delete options.diagnostics.failureReason;
      delete options.diagnostics.errorCode;
      delete options.diagnostics.suggestedDt;
    } else {
      options.diagnostics.failureReason = failure ?? 'max-iterations';
      options.diagnostics.errorCode =
        failure === 'singular-newton-matrix'
          ? 'SINGULAR_NEWTON_MATRIX'
          : failure === 'non-finite-rhs' || failure === 'non-finite-jacobian'
            ? 'NON_FINITE_INPUT'
            : 'IMPLICIT_SOLVER_DID_NOT_CONVERGE';
      if (options.diagnostics.retryable) options.diagnostics.suggestedDt = Math.abs(dt) / 2;
      else delete options.diagnostics.suggestedDt;
    }
    delete options.diagnostics.conditionEstimate;
  }
  return out;
}
