/**
 * Optimal control of the actuated double pendulum: controlled dynamics with
 * DFKI-benchmark actuation modes (full / acrobot / pendubot), upright LQR
 * balancing (Van Loan discretisation + Riccati value iteration), energy-
 * shaping swing-up with an LQR capture gate, and iLQR trajectory optimisation
 * for the underactuated swing-up. Design rationale and provenance:
 * `docs/control-module.md`.
 */
export {
  DOUBLE_UPRIGHT_STATE,
  applyActuationMode,
  controlMatrixDouble,
  rhsDoubleActuated,
  uprightEnergyDouble,
  wrapAngle
} from './actuated';
export type { ActuationMode } from './actuated';

export {
  actuatedChannels,
  designUprightLqr,
  discretizeLinear,
  lqrLyapunovLevel,
  lqrTorque,
  matExp,
  solveDare
} from './lqr';
export type { DareOptions, DareResult, LqrControllerOptions, LqrDesign, LqrSpec } from './lqr';

export {
  DEFAULT_SWINGUP_GAINS,
  createHybridSwingUpController,
  energyPumpTorque,
  simulateHybridSwingUp
} from './swingup';
export type {
  ControlledSimOptions,
  ControlledSimResult,
  HybridSwingUpController,
  SwingUpGains,
  SwingUpPhase
} from './swingup';

export { ilqrSolve, makeDoublePendulumStepMap, makeDoubleSwingUpProblem } from './ilqr';
export type {
  DiscreteDynamics,
  DoubleSwingUpSpec,
  IlqrOptions,
  IlqrProblem,
  IlqrResult
} from './ilqr';
