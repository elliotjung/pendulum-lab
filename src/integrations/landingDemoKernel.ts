import type { PendulumParameters } from '../types/domain';
import { rhsDouble } from '../physics/double';

export const DEMO_KERNEL_VERSION = 'pendulum-demo-kernel/v3';

export interface LandingDemoParameters extends PendulumParameters {
  damping?: number;
}

export interface Rk4Work {
  k1: Float64Array;
  k2: Float64Array;
  k3: Float64Array;
  k4: Float64Array;
  tmp: Float64Array;
}

export function createRk4Work(): Rk4Work {
  return {
    k1: new Float64Array(4),
    k2: new Float64Array(4),
    k3: new Float64Array(4),
    k4: new Float64Array(4),
    tmp: new Float64Array(4)
  };
}

export function rhsDoubleInto(
  state: ArrayLike<number>,
  out: Float64Array,
  parameters: LandingDemoParameters
): Float64Array {
  const damping = Number.isFinite(parameters.damping) && parameters.damping! > 0 ? parameters.damping! : 0;
  return rhsDouble(state, parameters, damping, out);
}

function stageInto(state: ArrayLike<number>, derivative: ArrayLike<number>, scale: number, out: Float64Array): void {
  for (let index = 0; index < 4; index += 1) {
    out[index] = Number(state[index]) + Number(derivative[index]) * scale;
  }
}

export function rk4StepDouble(
  state: Float64Array,
  parameters: LandingDemoParameters,
  dt: number,
  work: Rk4Work
): Float64Array {
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError('rk4StepDouble: dt must be positive and finite');
  rhsDoubleInto(state, work.k1, parameters);
  stageInto(state, work.k1, dt * 0.5, work.tmp);
  rhsDoubleInto(work.tmp, work.k2, parameters);
  stageInto(state, work.k2, dt * 0.5, work.tmp);
  rhsDoubleInto(work.tmp, work.k3, parameters);
  stageInto(state, work.k3, dt, work.tmp);
  rhsDoubleInto(work.tmp, work.k4, parameters);
  for (let index = 0; index < 4; index += 1) {
    state[index] =
      state[index]! + (dt / 6) * (work.k1[index]! + 2 * work.k2[index]! + 2 * work.k3[index]! + work.k4[index]!);
  }
  return state;
}
