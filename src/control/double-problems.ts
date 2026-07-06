import type { PendulumParameters } from '../types/domain';
import type { StateVector } from '../physics/types';
import { rk4Step } from '../physics/integrators';
import { controlMatrixDouble, jacobianDoubleActuated, rhsDoubleActuated, type ActuationMode } from './actuated';
import { actuatedChannels, matZeros } from './lqr';
import type { ControlledSystem, DiscreteDynamics, IlqrProblem } from './ilqr-types';
import { makeRk4StepDerivatives } from './rk4-derivatives';

export interface DoubleSwingUpSpec {
  parameters: PendulumParameters;
  gamma: number;
  dt: number;
  horizon: number;
  mode?: ActuationMode;
  /** Weights in actuated-channel space; sensible swing-up defaults otherwise. */
  Q?: number[][];
  R?: number[][];
  Qf?: number[][];
  goal?: readonly number[];
  torqueLimit?: number;
}

/**
 * One-RK4-step discrete map of the actuated double pendulum with zero-order-
 * hold torque on the actuated channels of `mode`.
 */
export function makeDoublePendulumStepMap(
  parameters: PendulumParameters,
  gamma: number,
  dt: number,
  mode: ActuationMode = 'full'
): DiscreteDynamics {
  const channels = actuatedChannels(mode);
  const tau = new Float64Array(2);
  const scratch = new Float64Array(4);
  const rhs = (s: StateVector, o: StateVector): void => {
    rhsDoubleActuated(s, parameters, gamma, tau, o);
  };
  return (x, u, out) => {
    tau.fill(0);
    for (let c = 0; c < channels.length; c += 1) tau[channels[c]!] = Number(u[c] ?? 0);
    for (let i = 0; i < 4; i += 1) scratch[i] = Number(x[i] ?? 0);
    rk4Step(scratch, dt, rhs, out);
  };
}

/**
 * The actuated double pendulum as a `ControlledSystem`: analytic state
 * Jacobian and closed-form control Jacobian on the actuated channels of `mode`.
 */
export function makeDoublePendulumControlledSystem(
  parameters: PendulumParameters,
  gamma: number,
  mode: ActuationMode = 'full'
): ControlledSystem {
  const channels = actuatedChannels(mode);
  const m = channels.length;
  const tau = new Float64Array(2);
  const bFull = new Float64Array(8);
  const spreadTau = (u: ArrayLike<number>): void => {
    tau.fill(0);
    for (let c = 0; c < m; c += 1) tau[channels[c]!] = Number(u[c] ?? 0);
  };
  return {
    n: 4,
    m,
    rhs(x, u, out) {
      spreadTau(u);
      rhsDoubleActuated(x, parameters, gamma, tau, out);
    },
    stateJacobian(x, u, jac) {
      spreadTau(u);
      jacobianDoubleActuated(x, parameters, gamma, tau, jac);
    },
    controlJacobian(x, _u, jac) {
      controlMatrixDouble(x, parameters, bFull);
      for (let i = 0; i < 4; i += 1) {
        for (let c = 0; c < m; c += 1) jac[i * m + c] = bFull[i * 2 + channels[c]!] ?? 0;
      }
    }
  };
}

const SWINGUP_Q_DIAG = [0.1, 0.1, 0.1, 0.1];

function diag(values: readonly number[]): number[][] {
  const m = matZeros(values.length, values.length);
  for (let i = 0; i < values.length; i += 1) m[i]![i] = values[i]!;
  return m;
}

/** Swing-up problem: hanging start [0,0,0,0] to upright goal [pi,pi,0,0]. */
export function makeDoubleSwingUpProblem(spec: DoubleSwingUpSpec): IlqrProblem {
  const mode = spec.mode ?? 'full';
  const m = actuatedChannels(mode).length;
  const problem: IlqrProblem = {
    dynamics: makeDoublePendulumStepMap(spec.parameters, spec.gamma, spec.dt, mode),
    n: 4,
    m,
    horizon: spec.horizon,
    x0: [0, 0, 0, 0],
    goal: [...(spec.goal ?? [Math.PI, Math.PI, 0, 0])],
    Q: spec.Q ?? diag(SWINGUP_Q_DIAG.map((v) => v * spec.dt)),
    R: spec.R ?? diag(new Array<number>(m).fill(0.1 * spec.dt)),
    Qf: spec.Qf ?? diag([100, 100, 10, 10]),
    derivatives: makeRk4StepDerivatives(makeDoublePendulumControlledSystem(spec.parameters, spec.gamma, mode), spec.dt)
  };
  if (spec.torqueLimit !== undefined) problem.torqueLimit = spec.torqueLimit;
  return problem;
}
