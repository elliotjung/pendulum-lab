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
  /** Refine the reference once more to estimate its discretisation band (default true). */
  estimateReferenceUncertainty?: boolean;
}

export interface ShadowingSample {
  time: number;
  separation: number;
  referenceUncertainty: number;
  lowerBound: number;
  upperBound: number;
}

export interface ShadowingResult {
  /** First time max|x_test - x_ref| exceeds `threshold`, or Infinity within T. */
  horizon: number;
  /** First time the upper error-band edge exceeds threshold. */
  possibleHorizon: number;
  /** First time the lower error-band edge exceeds threshold. */
  certifiedHorizon: number;
  threshold: number;
  /** Max-norm separation at the final time. */
  finalSeparation: number;
  finalReferenceUncertainty: number;
  /** Divergence history for plotting/export. */
  series: ShadowingSample[];
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
    const diagnostics = {};
    step(method, state, dt, rhs, out, { previousError, diagnostics });
    if ('accepted' in diagnostics && diagnostics.accepted === false) {
      throw new Error(`shadowingHorizon: ${method} implicit step did not converge.`);
    }
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
  const estimateReferenceUncertainty = options.estimateReferenceUncertainty ?? true;
  const { T, threshold } = options;

  if (!Number.isSafeInteger(state0.length) || state0.length < 1) {
    throw new RangeError('shadowingHorizon: state0 must contain at least one component.');
  }
  for (let i = 0; i < state0.length; i += 1) {
    if (!Number.isFinite(Number(state0[i]))) throw new RangeError('shadowingHorizon: state0 must be finite.');
  }
  if (!(dt > 0) || !Number.isFinite(dt) || !(referenceDt > 0) || !Number.isFinite(referenceDt)) {
    throw new RangeError('shadowingHorizon: dt and referenceDt must be positive and finite.');
  }
  if (!Number.isFinite(T) || T < 0 || !Number.isFinite(threshold) || !(threshold > 0)) {
    throw new RangeError('shadowingHorizon: T must be non-negative and threshold positive (both finite).');
  }
  if (!Number.isSafeInteger(sampleEvery) || sampleEvery < 1) {
    throw new RangeError('shadowingHorizon: sampleEvery must be a positive safe integer.');
  }
  const plannedSteps = Math.ceil(T / dt);
  if (!Number.isSafeInteger(plannedSteps) || plannedSteps > 10_000_000) {
    throw new RangeError('shadowingHorizon: requested integration exceeds 10,000,000 outer steps.');
  }

  const n = state0.length;
  const test = new Float64Array(n);
  const ref = new Float64Array(n);
  const refFine = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    test[i] = Number(state0[i] ?? 0);
    ref[i] = Number(state0[i] ?? 0);
    refFine[i] = Number(state0[i] ?? 0);
  }
  const testOut = new Float64Array(n);
  const refOut = new Float64Array(n);
  const refFineOut = new Float64Array(n);

  const testStepper = makeStepper(method);
  const refStepper = makeStepper(referenceMethod);
  // Advance the reference in the same outer ticks as the test, but with finer
  // sub-steps, so both are sampled on the identical time grid.
  const series: ShadowingSample[] = [];
  let horizon = Infinity;
  let possibleHorizon = Infinity;
  let certifiedHorizon = Infinity;
  let separation = 0;
  let referenceUncertainty = 0;
  let time = 0;

  for (let i = 0; i < plannedSteps; i += 1) {
    const h = Math.min(dt, T - time);
    if (!(h > 0)) break;
    testStepper(test, h, rhs, testOut);
    test.set(testOut);
    const refSubSteps = Math.max(1, Math.ceil(h / referenceDt));
    advance(refStepper, ref, h, refSubSteps, rhs, refOut);
    const fineSubSteps = estimateReferenceUncertainty ? 2 * refSubSteps : refSubSteps;
    advance(refStepper, refFine, h, fineSubSteps, rhs, refFineOut);

    separation = 0;
    referenceUncertainty = 0;
    for (let k = 0; k < n; k += 1) {
      separation = Math.max(separation, Math.abs((test[k] ?? 0) - (refFine[k] ?? 0)));
      referenceUncertainty = Math.max(referenceUncertainty, Math.abs((ref[k] ?? 0) - (refFine[k] ?? 0)));
    }
    time = i === plannedSteps - 1 ? T : time + h;
    const lowerBound = Math.max(0, separation - referenceUncertainty);
    const upperBound = separation + referenceUncertainty;
    if (horizon === Infinity && separation > threshold) horizon = time;
    if (possibleHorizon === Infinity && upperBound > threshold) possibleHorizon = time;
    if (certifiedHorizon === Infinity && lowerBound > threshold) certifiedHorizon = time;
    if (i % sampleEvery === 0 || i === plannedSteps - 1) {
      series.push({ time, separation, referenceUncertainty, lowerBound, upperBound });
    }
  }

  return {
    horizon,
    possibleHorizon,
    certifiedHorizon,
    threshold,
    finalSeparation: separation,
    finalReferenceUncertainty: referenceUncertainty,
    series,
    settings: {
      dt,
      T,
      threshold,
      referenceDt,
      sampleEvery,
      estimateReferenceUncertainty,
      method,
      referenceMethod
    }
  };
}
