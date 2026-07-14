import type { Derivative, Jacobian } from '../physics/types';
import type { PendulumParameters } from '../types/domain';
import { rk4Step } from '../physics/integrators';
import { rhsDouble, jacobianDouble } from '../physics/double';
import { jacobiEigenSymmetric } from '../research/svd';
import { makeVariationalRhs } from './variational';
import { checkedWorkProduct, integrationStepCount, NUMERICAL_WORK_BUDGETS } from '../validation/numericalBudgets';

/**
 * Finite-Time Lyapunov Exponents (FTLE) and the flow-map gradient.
 *
 * Unlike the (asymptotic) Lyapunov spectrum, the FTLE is resolved in *both*
 * initial condition and a *finite* horizon T. It is the largest exponential
 * stretching rate of the flow map F_T over [0,T]:
 *
 *     σ_T(x₀) = (1/T) ln ‖∇F_T(x₀)‖₂ = (1/T) ln σ_max(M),
 *
 * where M = ∂x(T)/∂x(0) is the flow-map gradient (the state-transition /
 * monodromy matrix) and σ_max is its largest singular value, i.e. the square
 * root of the largest eigenvalue of the right Cauchy–Green tensor MᵀM. M is
 * obtained exactly by propagating the variational equation Ṁ = J(x(t)) M with
 * M(0) = I alongside the trajectory — reusing the same analytic Jacobian as the
 * Lyapunov spectrum, so there is no finite-difference error floor.
 *
 * Ridges of the FTLE field are Lagrangian Coherent Structures (LCS): the
 * transport barriers that organise the chaotic mixing of the double pendulum.
 */

export interface FtleOptions {
  /** Integration step. Default 0.01. */
  dt?: number;
}

export interface FlowMapGradient {
  /** ∂x(T)/∂x(0), n×n row-major (column j is the evolved j-th basis perturbation). */
  stm: Float64Array;
  n: number;
}

/**
 * Flow-map gradient M = ∂x(T)/∂x(0) obtained by propagating the variational
 * equation from an identity seed (no renormalization — valid for the modest T
 * used by FTLE, where the growth stays within float64 range).
 */
export function flowMapGradient(
  state0: ArrayLike<number>,
  rhs: Derivative,
  totalTime: number,
  options: FtleOptions = {},
  jacobian?: Jacobian
): FlowMapGradient {
  const n = state0.length;
  const dt = options.dt ?? 0.01;
  if (!Number.isInteger(n) || n < 1) throw new Error('flowMapGradient: state0 must contain at least one component.');
  if (n > NUMERICAL_WORK_BUDGETS.ftle.maxStateDimension) {
    throw new Error(
      `flowMapGradient: state dimension must not exceed ${NUMERICAL_WORK_BUDGETS.ftle.maxStateDimension}.`
    );
  }
  for (let i = 0; i < n; i += 1) {
    if (!Number.isFinite(Number(state0[i]))) {
      throw new Error('flowMapGradient: state0 components must be finite.');
    }
  }
  if (!Number.isFinite(totalTime) || totalTime < 0) {
    throw new Error('flowMapGradient: totalTime must be finite and non-negative.');
  }
  if (!(dt > 0) || !Number.isFinite(dt)) {
    throw new Error('flowMapGradient: dt must be positive and finite.');
  }
  const plannedSteps = integrationStepCount(totalTime, dt, 'flowMapGradient');
  if (plannedSteps > NUMERICAL_WORK_BUDGETS.ftle.maxStepsPerTrajectory) {
    throw new Error(
      `flowMapGradient: totalTime/dt must not exceed ${NUMERICAL_WORK_BUDGETS.ftle.maxStepsPerTrajectory} integration steps.`
    );
  }
  const fullSteps = Math.floor(totalTime / dt);
  const varRhs = makeVariationalRhs(rhs, n, n, jacobian);

  const aug = new Float64Array(n * (n + 1));
  const augOut = new Float64Array(aug.length);
  for (let i = 0; i < n; i += 1) aug[i] = Number(state0[i] ?? 0);
  // Identity seed: deviation j = e_j, so the evolved frame is exactly M.
  for (let j = 0; j < n; j += 1) aug[n + j * n + j] = 1;

  for (let s = 0; s < fullSteps; s += 1) {
    rk4Step(aug, dt, varRhs, augOut);
    aug.set(augOut);
  }
  // A final shortened step makes the propagated horizon exactly `totalTime`;
  // rounding the step count would otherwise integrate too far or stop early.
  const remainder = totalTime - fullSteps * dt;
  if (remainder > 0) {
    rk4Step(aug, remainder, varRhs, augOut);
    aug.set(augOut);
  }

  const stm = new Float64Array(n * n);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) stm[i * n + j] = aug[n + j * n + i] ?? 0;
  }
  return { stm, n };
}

/**
 * Largest singular value of an n×n row-major matrix from the largest eigenvalue
 * of the scaled Gram matrix MᵀM. A cyclic Jacobi eigensolve is used instead of
 * a single fixed-start power iteration: the latter can return the wrong singular
 * value when its start vector is orthogonal to the dominant right singular
 * vector. Scaling before forming the Gram matrix avoids avoidable overflow and
 * underflow for very large or small finite entries.
 */
export function largestSingularValue(M: Float64Array, n: number, iterations = 200): number {
  if (!Number.isInteger(n) || n < 1) throw new Error('largestSingularValue: n must be a positive integer.');
  if (M.length < n * n) throw new Error('largestSingularValue: matrix is shorter than n*n.');
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error('largestSingularValue: iterations must be a positive integer.');
  }

  let scale = 0;
  for (let i = 0; i < n * n; i += 1) {
    const value = M[i] ?? 0;
    if (!Number.isFinite(value)) throw new Error('largestSingularValue: matrix entries must be finite.');
    scale = Math.max(scale, Math.abs(value));
  }
  if (scale === 0) return 0;

  const gram = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; i += 1) {
    for (let j = i; j < n; j += 1) {
      let sum = 0;
      for (let row = 0; row < n; row += 1) {
        sum += ((M[row * n + i] ?? 0) / scale) * ((M[row * n + j] ?? 0) / scale);
      }
      gram[i * n + j] = sum;
      gram[j * n + i] = sum;
    }
  }
  const { values } = jacobiEigenSymmetric(gram, n, iterations, Number.EPSILON * n);
  return scale * Math.sqrt(Math.max(0, values[0] ?? 0));
}

/** Determinant of an n×n row-major matrix via Gaussian elimination with partial pivoting. */
export function determinant(M: Float64Array, n: number): number {
  const a = Float64Array.from(M);
  let det = 1;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    let best = Math.abs(a[col * n + col] ?? 0);
    for (let r = col + 1; r < n; r += 1) {
      const val = Math.abs(a[r * n + col] ?? 0);
      if (val > best) {
        best = val;
        pivot = r;
      }
    }
    if (best === 0) return 0;
    if (pivot !== col) {
      for (let c = 0; c < n; c += 1) {
        const tmp = a[col * n + c] ?? 0;
        a[col * n + c] = a[pivot * n + c] ?? 0;
        a[pivot * n + c] = tmp;
      }
      det = -det;
    }
    const diag = a[col * n + col] ?? 0;
    det *= diag;
    for (let r = col + 1; r < n; r += 1) {
      const factor = (a[r * n + col] ?? 0) / diag;
      if (factor === 0) continue;
      for (let c = col; c < n; c += 1) a[r * n + c] = (a[r * n + c] ?? 0) - factor * (a[col * n + c] ?? 0);
    }
  }
  return det;
}

/** Finite-time Lyapunov exponent σ_T(x₀) = (1/T) ln σ_max(∂x(T)/∂x(0)). */
export function finiteTimeLyapunov(
  state0: ArrayLike<number>,
  rhs: Derivative,
  totalTime: number,
  options: FtleOptions = {},
  jacobian?: Jacobian
): number {
  const { stm, n } = flowMapGradient(state0, rhs, totalTime, options, jacobian);
  const sigma = largestSingularValue(stm, n);
  return totalTime > 0 && sigma > 0 ? Math.log(sigma) / totalTime : 0;
}

export interface FtleFieldOptions {
  /** Grid cells per axis (the field is n×n). Default 60. */
  n?: number;
  /** Inclusive angle range [lo, hi] for both θ₁ and θ₂. Default [-3, 3]. */
  range?: [number, number];
  /** Finite horizon T. Default 3. */
  totalTime?: number;
  dt?: number;
}

export interface FtleField {
  /** Row-major FTLE values, length width*height. */
  values: Float64Array;
  width: number;
  height: number;
  min: number;
  max: number;
}

/**
 * FTLE field of the double pendulum over a grid of initial angles (θ₁, θ₂),
 * both released from rest. Ridges of this field are the Lagrangian Coherent
 * Structures of the (θ₁, θ₂) section.
 */
export function doublePendulumFtleField(params: PendulumParameters, options: FtleFieldOptions = {}): FtleField {
  const n = options.n ?? 60;
  const [lo, hi] = options.range ?? [-3, 3];
  const totalTime = options.totalTime ?? 3;
  const dt = options.dt ?? 0.01;
  if (!Number.isSafeInteger(n) || n < 2 || n > NUMERICAL_WORK_BUDGETS.ftle.maxGridResolution) {
    throw new Error(
      `doublePendulumFtleField: n must be an integer between 2 and ${NUMERICAL_WORK_BUDGETS.ftle.maxGridResolution}.`
    );
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo) || !Number.isFinite(hi - lo)) {
    throw new Error('doublePendulumFtleField: range endpoints must be finite and strictly increasing.');
  }
  if (!Number.isFinite(totalTime) || totalTime < 0) {
    throw new Error('doublePendulumFtleField: totalTime must be finite and non-negative.');
  }
  if (!(dt > 0) || !Number.isFinite(dt)) {
    throw new Error('doublePendulumFtleField: dt must be positive and finite.');
  }
  const stepsPerTrajectory = integrationStepCount(totalTime, dt, 'doublePendulumFtleField');
  if (stepsPerTrajectory > NUMERICAL_WORK_BUDGETS.ftle.maxStepsPerTrajectory) {
    throw new Error(
      `doublePendulumFtleField: totalTime/dt must not exceed ${NUMERICAL_WORK_BUDGETS.ftle.maxStepsPerTrajectory} integration steps.`
    );
  }
  const totalWork = checkedWorkProduct([n, n, stepsPerTrajectory], 'doublePendulumFtleField');
  if (totalWork > NUMERICAL_WORK_BUDGETS.ftle.maxGridTrajectorySteps) {
    throw new Error(
      `doublePendulumFtleField: requested grid exceeds the ${NUMERICAL_WORK_BUDGETS.ftle.maxGridTrajectorySteps}-step work budget.`
    );
  }
  const rhs: Derivative = (s, o) => {
    rhsDouble(s, params, 0, o);
  };
  const jacobian: Jacobian = (s, j) => {
    jacobianDouble(s, params, 0, j);
  };

  const values = new Float64Array(n * n);
  let min = Infinity;
  let max = -Infinity;
  const state0 = new Float64Array(4);
  for (let iy = 0; iy < n; iy += 1) {
    const theta2 = lo + ((hi - lo) * iy) / (n - 1);
    for (let ix = 0; ix < n; ix += 1) {
      const theta1 = lo + ((hi - lo) * ix) / (n - 1);
      state0[0] = theta1;
      state0[1] = theta2;
      state0[2] = 0;
      state0[3] = 0;
      const f = finiteTimeLyapunov(state0, rhs, totalTime, { dt }, jacobian);
      values[iy * n + ix] = f;
      if (f < min) min = f;
      if (f > max) max = f;
    }
  }
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;
  return { values, width: n, height: n, min, max };
}
