import type { StateVector } from '../physics/types';

export type DiscreteDynamics = (x: ArrayLike<number>, u: ArrayLike<number>, out: Float64Array) => void;

/** Fill fx (n by n) and fu (n by m) with the step-map Jacobians at (x, u). */
export type StepDerivatives = (x: ArrayLike<number>, u: ArrayLike<number>, fx: number[][], fu: number[][]) => void;

/**
 * A continuous controlled system xdot = f(x, u) with analytic Jacobians -
 * everything `makeRk4StepDerivatives` needs to differentiate the RK4 step map
 * exactly instead of by finite differences.
 */
export interface ControlledSystem {
  n: number;
  m: number;
  rhs(x: ArrayLike<number>, u: ArrayLike<number>, out: StateVector): void;
  /** df/dx at fixed u, row-major n by n. */
  stateJacobian(x: ArrayLike<number>, u: ArrayLike<number>, jac: Float64Array): void;
  /** df/du at fixed x, row-major n by m. */
  controlJacobian(x: ArrayLike<number>, u: ArrayLike<number>, jac: Float64Array): void;
}

export interface IlqrProblem {
  dynamics: DiscreteDynamics;
  n: number;
  m: number;
  /** Number of control knots N; states run 0..N. */
  horizon: number;
  x0: readonly number[];
  goal: readonly number[];
  /** Running state cost (n by n), running control cost (m by m), terminal cost (n by n). */
  Q: number[][];
  R: number[][];
  Qf: number[][];
  /** Initial control sequence (horizon by m); defaults to zeros. */
  uInit?: readonly (readonly number[])[];
  /** Symmetric clamp |u_i| <= torqueLimit applied inside every rollout. */
  torqueLimit?: number;
  /**
   * Analytic step-map Jacobians. When present the backward pass uses these
   * instead of central differences - machine-precision and cheaper.
   */
  derivatives?: StepDerivatives;
}

export interface IlqrOptions {
  maxIterations?: number;
  /** Relative cost-decrease threshold that declares convergence. */
  costTolerance?: number;
  regInit?: number;
  regMin?: number;
  regMax?: number;
  regFactor?: number;
  lineSearchBacktracks?: number;
  /** Central-difference step for the dynamics derivatives. */
  fdStep?: number;
}

export interface IlqrResult {
  /** Optimised states (horizon+1 vectors of length n). */
  xs: Float64Array[];
  /** Optimised controls (horizon vectors of length m). */
  us: Float64Array[];
  cost: number;
  /** Accepted-iteration costs, non-increasing, starting at the initial rollout. */
  costHistory: number[];
  iterations: number;
  converged: boolean;
  /** Final Levenberg-Marquardt regularisation. */
  regularization: number;
  /** Infinity-norm of the final feedforward step (first-order optimality proxy). */
  gradientNorm: number;
}
