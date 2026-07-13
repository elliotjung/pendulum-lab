import type { Derivative, StateVector } from '../physics/types';
import type { IntegratorId } from '../types/domain';
import { rk4Step, step } from '../physics/integrators';

/**
 * Shadowing / reproducibility horizon.
 *
 * A chaotic trajectory computed in finite precision diverges from the true
 * orbit at the maximal Lyapunov rate, so "the double pendulum is chaotic" is
 * only a defensible, quantitative claim if we also say *for how long* a given
 * integration can be trusted. This measures that: it advances two solutions of
 * the same system from identical initial conditions — a `test` configuration
 * and a high-accuracy `reference` configuration — and reports the first time
 * their state separation exceeds a tolerance (the shadowing horizon), together
 * with the divergence series.
 *
 * The reference defaults to Gragg-Bulirsch-Stoer at a fine step, which acts as
 * an in-precision ground truth; comparing the production integrator against it
 * turns numerical trust into a number rather than an assumption.
 */

export interface ShadowingOptions {
  /** Step size of the integrator under test. */
  dt: number;
  /** Total integration time. */
  T: number;
  /** Separation (max-norm over the state) that defines "no longer shadowing". */
  threshold: number;
  /** Integrator under test (defaults to rk4). */
  method?: IntegratorId;
  /** Reference integrator (defaults to gbs). */
  referenceMethod?: IntegratorId;
  /** Reference step size; defaults to dt/8 for a finer, more accurate orbit. */
  referenceDt?: number;
  /** Record one divergence sample every `sampleEvery` test steps. */
  sampleEvery?: number;
}

export interface ShadowingResult {
  /** First time max|x_test - x_ref| exceeds `threshold`, or Infinity within T. */
  horizon: number;
  threshold: number;
  /** Max-norm separation at the final time. */
  finalSeparation: number;
  /** Divergence history for plotting/export. */
  series: { time: number; separation: number }[];
  settings: Required<Omit<ShadowingOptions, 'method' | 'referenceMethod'>> & {
    method: IntegratorId;
    referenceMethod: IntegratorId;
  };
}

type Stepper = (state: StateVector, dt: number, rhs: Derivative, out: StateVector) => void;

function makeStepper(method: IntegratorId): Stepper {
  if (method === 'rk4') return rk4Step;
  const previousError = { value: 0 };
  return (state, dt, rhs, out) => {
    step(method, state, dt, rhs, out, { previousError });
  };
}

/** Advance `state` by total time `dt` using `subSteps` sub-steps of `stepper`. */
function advance(
  stepper: Stepper,
  state: StateVector,
  dt: number,
  subSteps: number,
  rhs: Derivative,
  out: StateVector
): void {
  const h = dt / subSteps;
  for (let s = 0; s < subSteps; s += 1) {
    stepper(state, h, rhs, out);
    state.set(out);
  }
}

export function shadowingHorizon(
  state0: ArrayLike<number>,
  rhs: Derivative,
  options: ShadowingOptions
): ShadowingResult {
  const method = options.method ?? 'rk4';
  const referenceMethod = options.referenceMethod ?? 'gbs';
  const dt = options.dt;
  const referenceDt = options.referenceDt ?? dt / 8;
  const sampleEvery = options.sampleEvery ?? 1;
  const { T, threshold } = options;

  const n = state0.length;
  const test = new Float64Array(n);
  const ref = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    test[i] = Number(state0[i] ?? 0);
    ref[i] = Number(state0[i] ?? 0);
  }
  const testOut = new Float64Array(n);
  const refOut = new Float64Array(n);

  const testStepper = makeStepper(method);
  const refStepper = makeStepper(referenceMethod);
  // Advance the reference in the same outer ticks as the test, but with finer
  // sub-steps, so both are sampled on the identical time grid.
  const refSubSteps = Math.max(1, Math.round(dt / referenceDt));

  const steps = Math.max(1, Math.round(T / dt));
  const series: { time: number; separation: number }[] = [];
  let horizon = Infinity;
  let separation = 0;

  for (let i = 0; i < steps; i += 1) {
    testStepper(test, dt, rhs, testOut);
    test.set(testOut);
    advance(refStepper, ref, dt, refSubSteps, rhs, refOut);

    separation = 0;
    for (let k = 0; k < n; k += 1) separation = Math.max(separation, Math.abs((test[k] ?? 0) - (ref[k] ?? 0)));
    const time = (i + 1) * dt;
    if (horizon === Infinity && separation > threshold) horizon = time;
    if (i % sampleEvery === 0 || i === steps - 1) series.push({ time, separation });
  }

  return {
    horizon,
    threshold,
    finalSeparation: separation,
    series,
    settings: { dt, T, threshold, referenceDt, sampleEvery, method, referenceMethod }
  };
}
