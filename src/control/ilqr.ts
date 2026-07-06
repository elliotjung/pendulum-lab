/**
 * iLQR public facade. The implementation is split by responsibility so the
 * optimal-control stack can keep growing without turning this compatibility
 * import path into a monolith.
 */
export { boxQpSolve } from './box-qp';
export { ilqrSolve } from './solver-core';
export { ilqrSolveAsync } from './async-runner';
export {
  makeDoublePendulumControlledSystem,
  makeDoublePendulumStepMap,
  makeDoubleSwingUpProblem
} from './double-problems';
export { makeRk4StepDerivatives } from './rk4-derivatives';
export type {
  ControlledSystem,
  DiscreteDynamics,
  IlqrOptions,
  IlqrProblem,
  IlqrResult,
  StepDerivatives
} from './ilqr-types';
export type { IlqrAsyncOptions } from './async-runner';
export type { DoubleSwingUpSpec } from './double-problems';
