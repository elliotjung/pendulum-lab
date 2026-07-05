/**
 * Optimal control of actuated pendulums: controlled dynamics with
 * DFKI-benchmark actuation modes (full / acrobot / pendubot) plus the planar
 * N-chain, upright LQR balancing (Van Loan discretisation + Riccati value
 * iteration), energy-shaping swing-up with an LQR capture gate, and iLQR
 * trajectory optimisation with analytic RK4 chain-rule derivatives and an
 * exact box-constrained backward pass. Design rationale and provenance:
 * `docs/control-module.md`.
 */
export {
  DOUBLE_UPRIGHT_STATE,
  applyActuationMode,
  controlMatrixDouble,
  jacobianDoubleActuated,
  rhsDoubleActuated,
  uprightEnergyDouble,
  wrapAngle
} from './actuated';
export type { ActuationMode } from './actuated';

export {
  controlMatrixChain,
  jacobianChainActuated,
  rhsChainActuated,
  uprightChainState,
  uprightEnergyChain
} from './actuatedChain';

export {
  actuatedChannels,
  designChainUprightLqr,
  designUprightLqr,
  discretizeLinear,
  lqrChainTorque,
  lqrLyapunovLevel,
  lqrTorque,
  matExp,
  solveDare
} from './lqr';
export type {
  ChainLqrDesign,
  ChainLqrSpec,
  DareOptions,
  DareResult,
  LqrControllerOptions,
  LqrDesign,
  LqrSpec
} from './lqr';

export {
  DEFAULT_SWINGUP_GAINS,
  autoCaptureLevel,
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

export {
  boxQpSolve,
  ilqrSolve,
  ilqrSolveAsync,
  makeDoublePendulumControlledSystem,
  makeDoublePendulumStepMap,
  makeDoubleSwingUpProblem,
  makeRk4StepDerivatives
} from './ilqr';
export type {
  ControlledSystem,
  DiscreteDynamics,
  DoubleSwingUpSpec,
  IlqrAsyncOptions,
  IlqrOptions,
  IlqrProblem,
  IlqrResult,
  StepDerivatives
} from './ilqr';
