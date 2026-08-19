import type { StateVector } from './types';

/** Time-delayed feedback pendulum theta'' = f(theta,theta',t)+K(theta(t-tau)-theta(t)). */
export interface PyragasPendulumParameters {
  g: number;
  length: number;
  damping: number;
  feedbackGain: number;
  delay: number;
  driveAmplitude?: number;
  driveFrequency?: number;
}

export type PyragasHistory = (time: number) => readonly [number, number];

export interface PyragasDdeOptions {
  dt: number;
  duration: number;
  /** State history for t<0; defaults to the constant initial state. */
  history?: PyragasHistory;
  /** Decimation of returned samples; the internal delay tape still stores every step. */
  recordEvery?: number;
}

export interface PyragasDdeResult {
  times: number[];
  states: Array<readonly [number, number]>;
  feedback: number[];
  finalState: readonly [number, number];
  steps: number;
  method: 'method-of-steps-rk4-linear-history';
  caveat: string;
}

export interface PyragasDtRefinementResult {
  levels: Array<{
    dt: number;
    finalState: readonly [number, number];
    differenceFromPrevious: number | null;
    observedOrder: number | null;
  }>;
  converged: boolean;
  tolerance: number;
  caveat: string;
}

export interface PyragasDelayBoundaryRefinementOptions {
  dt: number;
  duration: number;
  delayCandidates: readonly number[];
  refinements?: number;
  tailFraction?: number;
  rmsThreshold?: number;
}

export interface PyragasDelayBoundaryRefinementResult {
  levels: Array<{
    dt: number;
    boundaryDelay: number | null;
    samples: Array<{ delay: number; tailRms: number; stable: boolean }>;
  }>;
  converged: boolean;
  caveat: string;
}

export function pyragasFeedback(current: number, delayed: number, gain: number): number {
  if (![current, delayed, gain].every(Number.isFinite)) throw new Error('Pyragas feedback inputs must be finite.');
  return gain * (delayed - current);
}

/** RHS at one time when the delayed state has already been interpolated. */
export function rhsPyragasPendulum(
  state: ArrayLike<number>,
  delayedState: ArrayLike<number>,
  time: number,
  parameters: PyragasPendulumParameters,
  out: StateVector
): StateVector {
  const theta = Number(state[0] ?? 0);
  const omega = Number(state[1] ?? 0);
  const delayedTheta = Number(delayedState[0] ?? 0);
  const driveAmplitude = parameters.driveAmplitude ?? 0;
  const driveFrequency = parameters.driveFrequency ?? 0;
  out[0] = omega;
  out[1] =
    -(parameters.g / parameters.length) * Math.sin(theta) -
    parameters.damping * omega +
    driveAmplitude * Math.cos(driveFrequency * time) +
    pyragasFeedback(theta, delayedTheta, parameters.feedbackGain);
  return out;
}

function validate(parameters: PyragasPendulumParameters, options: PyragasDdeOptions): void {
  if (!(parameters.length > 0) || !Number.isFinite(parameters.length))
    throw new Error('Pyragas pendulum length must be positive and finite.');
  if (!(parameters.g >= 0) || !Number.isFinite(parameters.g))
    throw new Error('Pyragas gravity must be finite and non-negative.');
  if (!(parameters.damping >= 0) || !Number.isFinite(parameters.damping))
    throw new Error('Pyragas damping must be finite and non-negative.');
  if (!Number.isFinite(parameters.feedbackGain)) throw new Error('Pyragas feedback gain must be finite.');
  if (!(parameters.delay > 0) || !Number.isFinite(parameters.delay))
    throw new Error('Pyragas delay must be positive and finite.');
  if (!(options.dt > 0) || !Number.isFinite(options.dt)) throw new Error('Pyragas dt must be positive and finite.');
  if (!(options.duration >= 0) || !Number.isFinite(options.duration))
    throw new Error('Pyragas duration must be finite and non-negative.');
  // Then every delayed RK stage lies in the already accepted history.  Smaller
  // delays need an implicit within-step interpolation, outside this explicit
  // method-of-steps contract.
  if (parameters.delay + 1e-15 < options.dt) throw new Error('Pyragas method-of-steps requires delay >= dt.');
  const recordEvery = options.recordEvery ?? 1;
  if (!Number.isInteger(recordEvery) || recordEvery < 1)
    throw new Error('Pyragas recordEvery must be a positive integer.');
}

/**
 * Fixed-grid method of steps with RK4 and linear interpolation of the accepted
 * delay tape.  Requiring tau>=dt makes every RK stage explicit and replayable.
 */
export function integratePyragasPendulumDde(
  initialState: readonly [number, number],
  parameters: PyragasPendulumParameters,
  options: PyragasDdeOptions
): PyragasDdeResult {
  validate(parameters, options);
  if (!initialState.every(Number.isFinite)) throw new Error('Pyragas initial state must be finite.');
  const recordEvery = options.recordEvery ?? 1;
  const history = options.history ?? (() => initialState);
  const state = Float64Array.from(initialState);
  const acceptedTimes: number[] = [0];
  const acceptedStates: Array<readonly [number, number]> = [[initialState[0], initialState[1]]];

  const delayedAt = (query: number): readonly [number, number] => {
    if (query < 0) {
      const value = history(query);
      if (!value.every(Number.isFinite)) throw new Error(`Pyragas history returned a non-finite state at t=${query}.`);
      return value;
    }
    const last = acceptedTimes.length - 1;
    if (query >= acceptedTimes[last]! - 1e-14) return acceptedStates[last]!;
    // Fixed grid allows a direct lower estimate; the small correction loops
    // also cover a shortened final step.
    let lo = Math.min(last - 1, Math.max(0, Math.floor(query / options.dt)));
    while (lo + 1 < last && acceptedTimes[lo + 1]! < query) lo += 1;
    while (lo > 0 && acceptedTimes[lo]! > query) lo -= 1;
    const hi = lo + 1;
    const t0 = acceptedTimes[lo]!;
    const t1 = acceptedTimes[hi]!;
    const fraction = t1 > t0 ? (query - t0) / (t1 - t0) : 0;
    const a = acceptedStates[lo]!;
    const b = acceptedStates[hi]!;
    return [a[0] + fraction * (b[0] - a[0]), a[1] + fraction * (b[1] - a[1])];
  };

  const derivative = (value: StateVector, time: number, out: StateVector): void => {
    rhsPyragasPendulum(value, delayedAt(time - parameters.delay), time, parameters, out);
  };
  const k1 = new Float64Array(2);
  const k2 = new Float64Array(2);
  const k3 = new Float64Array(2);
  const k4 = new Float64Array(2);
  const tmp = new Float64Array(2);
  const times: number[] = [0];
  const states: Array<readonly [number, number]> = [[state[0]!, state[1]!]];
  const feedback: number[] = [pyragasFeedback(state[0]!, delayedAt(-parameters.delay)[0], parameters.feedbackGain)];
  let t = 0;
  let steps = 0;
  while (t < options.duration - 1e-15) {
    const h = Math.min(options.dt, options.duration - t);
    derivative(state, t, k1);
    tmp[0] = state[0]! + 0.5 * h * k1[0]!;
    tmp[1] = state[1]! + 0.5 * h * k1[1]!;
    derivative(tmp, t + 0.5 * h, k2);
    tmp[0] = state[0]! + 0.5 * h * k2[0]!;
    tmp[1] = state[1]! + 0.5 * h * k2[1]!;
    derivative(tmp, t + 0.5 * h, k3);
    tmp[0] = state[0]! + h * k3[0]!;
    tmp[1] = state[1]! + h * k3[1]!;
    derivative(tmp, t + h, k4);
    state[0] = state[0]! + (h / 6) * (k1[0]! + 2 * k2[0]! + 2 * k3[0]! + k4[0]!);
    state[1] = state[1]! + (h / 6) * (k1[1]! + 2 * k2[1]! + 2 * k3[1]! + k4[1]!);
    t += h;
    steps += 1;
    acceptedTimes.push(t);
    acceptedStates.push([state[0]!, state[1]!]);
    if (steps % recordEvery === 0 || t >= options.duration - 1e-15) {
      times.push(t);
      states.push([state[0]!, state[1]!]);
      feedback.push(pyragasFeedback(state[0]!, delayedAt(t - parameters.delay)[0], parameters.feedbackGain));
    }
  }
  return {
    times,
    states,
    feedback,
    finalState: [state[0]!, state[1]!],
    steps,
    method: 'method-of-steps-rk4-linear-history',
    caveat:
      'Fixed-step explicit method of steps with linear delay interpolation; delay must be at least dt. Refine dt and the history function before quoting event times or stability boundaries.'
  };
}

/** Run a deterministic dt-halving study and report empirical convergence. */
export function pyragasDtRefinementStudy(
  initialState: readonly [number, number],
  parameters: PyragasPendulumParameters,
  options: Omit<PyragasDdeOptions, 'dt'> & { dt: number; refinements?: number; tolerance?: number }
): PyragasDtRefinementResult {
  const refinements = options.refinements ?? 3;
  const tolerance = options.tolerance ?? 1e-6;
  if (!Number.isInteger(refinements) || refinements < 1 || refinements > 10)
    throw new Error('Pyragas refinements must be an integer in [1, 10].');
  if (!(tolerance > 0) || !Number.isFinite(tolerance))
    throw new Error('Pyragas refinement tolerance must be positive and finite.');
  const levels: PyragasDtRefinementResult['levels'] = [];
  let previousDifference: number | null = null;
  for (let level = 0; level <= refinements; level += 1) {
    const dt = options.dt / 2 ** level;
    const result = integratePyragasPendulumDde(initialState, parameters, { ...options, dt });
    const previous = levels.at(-1)?.finalState;
    const difference = previous
      ? Math.max(Math.abs(result.finalState[0] - previous[0]), Math.abs(result.finalState[1] - previous[1]))
      : null;
    const observedOrder =
      difference !== null && difference > 0 && previousDifference !== null && previousDifference > 0
        ? Math.log2(previousDifference / difference)
        : null;
    levels.push({ dt, finalState: result.finalState, differenceFromPrevious: difference, observedOrder });
    if (difference !== null) previousDifference = difference;
  }
  return {
    levels,
    converged: (levels.at(-1)?.differenceFromPrevious ?? Infinity) <= tolerance,
    tolerance,
    caveat:
      'Convergence is based on final-state dt halving for one supplied history. Repeat across histories and inspect the full trajectory before claiming a delay-stability boundary.'
  };
}

/**
 * Repeat a delay sweep on progressively halved time steps. A candidate is
 * classified by the theta RMS over the recorded tail; the returned boundary is
 * evidence with an explicit resolution gate, not an analytic stability proof.
 */
export function pyragasDelayStabilityRefinementStudy(
  initialState: readonly [number, number],
  parameters: Omit<PyragasPendulumParameters, 'delay'>,
  options: PyragasDelayBoundaryRefinementOptions
): PyragasDelayBoundaryRefinementResult {
  const refinements = options.refinements ?? 2;
  const tailFraction = options.tailFraction ?? 0.25;
  const rmsThreshold = options.rmsThreshold ?? 0.05;
  if (!Number.isInteger(refinements) || refinements < 1 || refinements > 8)
    throw new Error('Pyragas boundary refinements must be an integer in [1, 8].');
  if (!(tailFraction > 0 && tailFraction <= 1)) throw new Error('Pyragas tailFraction must be in (0, 1].');
  if (!(rmsThreshold >= 0) || !Number.isFinite(rmsThreshold))
    throw new Error('Pyragas rmsThreshold must be finite and non-negative.');
  const delays = [...options.delayCandidates];
  if (delays.length < 2 || delays.some((delay) => !(delay > 0) || !Number.isFinite(delay)))
    throw new Error('Pyragas delayCandidates must contain at least two positive finite delays.');
  delays.sort((left, right) => left - right);
  const levels: PyragasDelayBoundaryRefinementResult['levels'] = [];
  for (let level = 0; level <= refinements; level += 1) {
    const dt = options.dt / 2 ** level;
    const samples = delays.map((delay) => {
      const result = integratePyragasPendulumDde(
        initialState,
        { ...parameters, delay },
        { dt, duration: options.duration }
      );
      const start = Math.max(0, Math.floor(result.states.length * (1 - tailFraction)));
      const tail = result.states.slice(start);
      const tailRms = Math.sqrt(tail.reduce((sum, state) => sum + state[0] ** 2, 0) / Math.max(1, tail.length));
      return { delay, tailRms, stable: tailRms <= rmsThreshold };
    });
    levels.push({ dt, boundaryDelay: samples.find((sample) => sample.stable)?.delay ?? null, samples });
  }
  const last = levels.at(-1)?.boundaryDelay;
  const previous = levels.at(-2)?.boundaryDelay;
  return {
    levels,
    converged: last !== undefined && last === previous,
    caveat:
      'Boundary classification uses a finite tail-RMS threshold on a discrete delay grid. Refine dt, delay spacing, duration, and history before interpreting the boundary physically.'
  };
}
