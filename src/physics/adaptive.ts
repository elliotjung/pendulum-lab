import type { Derivative, StateVector } from './types';
import {
  createStepController,
  normalisedError,
  resolveAdaptiveOptions,
  validateEmbeddedStepInput,
  type AdaptiveControllerOptions
} from './adaptiveController';
export { createStepController } from './adaptiveController';
export type {
  AdaptiveControllerOptions,
  ComponentTolerance,
  StepController,
  StepControllerCoefficients,
  StepControllerKind
} from './adaptiveController';

/**
 * Adaptive step-size numerics: an embedded Dormand-Prince 5(4) pair, a PI
 * step-size controller, and Richardson extrapolation. These are framework
 * pieces consumed by adaptive solvers and validation harnesses; they operate
 * on generic first-order systems y' = f(y) and never mutate their inputs.
 */

export interface EmbeddedStepResult {
  /** Advanced state (5th-order solution for Dormand-Prince). */
  y: StateVector;
  /** Scaled error estimate (infinity norm of high minus low order solution). */
  error: number;
  /** Absolute local error estimate per state component. */
  errorComponents: StateVector;
}

/** Reusable Dormand-Prince stage buffers for high-frequency/adaptive runs. */
export interface AdaptiveWorkspace {
  readonly dimension: number;
  readonly stages: StateVector[];
  readonly tmp: StateVector;
  readonly output: StateVector;
  readonly errorComponents: StateVector;
}

export function createAdaptiveWorkspace(dimension: number): AdaptiveWorkspace {
  if (!Number.isSafeInteger(dimension) || dimension < 1) {
    throw new RangeError('createAdaptiveWorkspace: dimension must be a positive safe integer.');
  }
  return {
    dimension,
    stages: Array.from({ length: 7 }, () => new Float64Array(dimension)),
    tmp: new Float64Array(dimension),
    output: new Float64Array(dimension),
    errorComponents: new Float64Array(dimension)
  };
}

export interface AdaptiveStepOutcome {
  accepted: boolean;
  /** Step size that was attempted. */
  dt: number;
  /** Suggested step size for the next attempt. */
  nextDt: number;
  /** Normalised error (target is <= 1). */
  errorNorm: number;
  /** Component-wise local error estimates used to form `errorNorm`. */
  errorComponents: StateVector;
  y: StateVector;
  failureReason?: 'minimum-step-tolerance' | 'non-finite-error';
}

export interface AdaptiveAcceptedStep {
  index: number;
  startTime: number;
  endTime: number;
  dt: number;
  errorNorm: number;
}

export type AdaptiveTerminationReason =
  'target-reached' | 'iteration-budget-exhausted' | 'minimum-step-tolerance' | 'non-finite-error';

export interface AdaptiveIntegrationResult {
  y: StateVector;
  accepted: number;
  rejected: number;
  steps: number;
  finalTime: number;
  targetTime: number;
  reachedTarget: boolean;
  terminationReason: AdaptiveTerminationReason;
  /** Exact accepted controller decisions required for deterministic replay. */
  acceptedSteps: AdaptiveAcceptedStep[];
  finalSuggestedDt: number;
}

// Dormand-Prince 5(4) Butcher tableau (the method underlying MATLAB ode45).
const DP_C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const DP_A: readonly (readonly number[])[] = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]
];
// 5th-order solution weights (== 7th stage row, FSAL) and 4th-order weights.
const DP_B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
const DP_B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

void DP_C; // tableau nodes retained for documentation/extension

/** Shared stage computation for the plain and dense Dormand-Prince steps. */
function dormandPrinceStages(
  state: StateVector,
  dt: number,
  rhs: Derivative,
  workspace: AdaptiveWorkspace
): { k: StateVector[]; y: StateVector; error: number; errorComponents: StateVector } {
  const n = state.length;
  if (workspace.dimension !== n || workspace.stages.length < 7) {
    throw new RangeError('dormandPrince54Step: workspace dimension does not match state.');
  }
  const k = workspace.stages;
  const tmp = workspace.tmp;
  for (let s = 0; s < 7; s += 1) {
    if (s === 0) {
      rhs(state, k[0]!);
      continue;
    }
    const a = DP_A[s]!;
    for (let i = 0; i < n; i += 1) {
      let acc = 0;
      for (let j = 0; j < a.length; j += 1) acc += a[j]! * Number(k[j]![i] ?? 0);
      tmp[i] = Number(state[i] ?? 0) + dt * acc;
    }
    rhs(tmp, k[s]!);
  }
  const y = workspace.output;
  const errorComponents = workspace.errorComponents;
  let error = 0;
  for (let i = 0; i < n; i += 1) {
    let sum5 = 0;
    let sum4 = 0;
    for (let s = 0; s < 7; s += 1) {
      const ki = Number(k[s]![i] ?? 0);
      sum5 += DP_B5[s]! * ki;
      sum4 += DP_B4[s]! * ki;
    }
    y[i] = Number(state[i] ?? 0) + dt * sum5;
    const componentError = Math.abs(dt * (sum5 - sum4));
    errorComponents[i] = componentError;
    error = Math.max(error, componentError);
  }
  return { k, y, error, errorComponents };
}

/**
 * One Dormand-Prince 5(4) step. Returns the 5th-order solution and an absolute
 * infinity-norm error estimate (difference between the 5th and 4th order
 * solutions). Does not mutate `state`.
 */
export function dormandPrince54Step(
  state: StateVector,
  dt: number,
  rhs: Derivative,
  workspace?: AdaptiveWorkspace
): EmbeddedStepResult {
  validateEmbeddedStepInput(state, dt, 'dormandPrince54Step');
  const work = workspace ?? createAdaptiveWorkspace(state.length);
  const { y, error, errorComponents } = dormandPrinceStages(state, dt, rhs, work);
  // Caller-supplied workspaces opt into reusable result buffers. The default
  // preserves the historical ownership contract (fresh result arrays).
  return workspace
    ? { y, error, errorComponents }
    : { y: new Float64Array(y), error, errorComponents: new Float64Array(errorComponents) };
}

export interface DenseStepResult extends EmbeddedStepResult {
  /**
   * Evaluate the continuous extension at θ ∈ [0, 1] (fraction of the step),
   * writing the interpolated state into `out`. Fourth-order accurate across
   * the whole step — the standard tool for event localisation: one polynomial
   * evaluation per root-finder probe instead of a re-integration.
   */
  interpolate(theta: number, out: StateVector): StateVector;
}

// Dense-output weights for the 5th rcont polynomial (Hairer, Nørsett & Wanner,
// DOPRI5). Validated in tests by the O(h⁵) interpolation-convergence check,
// which a transcription error would degrade to a lower order.
const DP_D = [
  -12715105075 / 11282082432,
  0,
  87487479700 / 32700410799,
  -10690763975 / 1880347072,
  701980252875 / 199316789632,
  -1453857185 / 822651844,
  69997945 / 29380423
];

/**
 * Dormand-Prince 5(4) step with dense output: identical advance and error
 * estimate to {@link dormandPrince54Step}, plus a 4th-order interpolant over
 * the step built from the same seven stages (no extra RHS evaluations).
 */
export function dormandPrince54StepDense(
  state: StateVector,
  dt: number,
  rhs: Derivative,
  workspace?: AdaptiveWorkspace
): DenseStepResult {
  validateEmbeddedStepInput(state, dt, 'dormandPrince54StepDense');
  const n = state.length;
  const work = workspace ?? createAdaptiveWorkspace(n);
  const staged = dormandPrinceStages(state, dt, rhs, work);
  const { k, error } = staged;
  const y = new Float64Array(staged.y);
  const errorComponents = new Float64Array(staged.errorComponents);
  // rcont1..5 of Hairer's contd5: u(θ) = r1 + θ(r2 + (1−θ)(r3 + θ(r4 + (1−θ)r5))).
  const r1 = new Float64Array(state);
  const r2 = new Float64Array(n);
  const r3 = new Float64Array(n);
  const r4 = new Float64Array(n);
  const r5 = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const ydiff = Number(y[i] ?? 0) - Number(state[i] ?? 0);
    const bspl = dt * Number(k[0]![i] ?? 0) - ydiff;
    r2[i] = ydiff;
    r3[i] = bspl;
    r4[i] = ydiff - dt * Number(k[6]![i] ?? 0) - bspl;
    let acc = 0;
    for (let s = 0; s < 7; s += 1) acc += DP_D[s]! * Number(k[s]![i] ?? 0);
    r5[i] = dt * acc;
  }
  return {
    y,
    error,
    errorComponents,
    interpolate(theta: number, out: StateVector): StateVector {
      const oneMinus = 1 - theta;
      for (let i = 0; i < n; i += 1) {
        out[i] =
          Number(r1[i] ?? 0) +
          theta *
            (Number(r2[i] ?? 0) +
              oneMinus * (Number(r3[i] ?? 0) + theta * (Number(r4[i] ?? 0) + oneMinus * Number(r5[i] ?? 0))));
      }
      return out;
    }
  };
}

/**
 * Embedded-pair adaptive step with a standard error-per-step controller.
 * Computes a candidate step, normalises its error against a mixed abs/rel
 * tolerance, decides acceptance, and proposes the next step size.
 */
export function adaptiveStep(
  state: StateVector,
  dt: number,
  rhs: Derivative,
  options: AdaptiveControllerOptions = {},
  workspace?: AdaptiveWorkspace
): AdaptiveStepOutcome {
  validateEmbeddedStepInput(state, dt, 'adaptiveStep');
  const resolved = resolveAdaptiveOptions(options, state.length, 'adaptiveStep');
  if (options.maxDt !== undefined && dt > resolved.maxDt) {
    throw new RangeError('adaptiveStep: dt must not exceed an explicitly configured maxDt.');
  }
  const { y, errorComponents } = dormandPrince54Step(state, dt, rhs, workspace);
  const errorNorm = normalisedError(state, y, errorComponents, resolved.absTol, resolved.relTol);
  const accepted = Number.isFinite(errorNorm) && errorNorm <= 1;
  const exponent = 1 / resolved.order;
  const raw = errorNorm === 0 ? resolved.maxFactor : resolved.safety * errorNorm ** -exponent;
  const factor = Math.min(
    resolved.maxFactor,
    Math.max(resolved.minFactor, Number.isFinite(raw) ? raw : resolved.minFactor)
  );
  const nextDt = Math.min(resolved.maxDt, Math.max(resolved.minDt, dt * factor));
  const failureReason = !Number.isFinite(errorNorm)
    ? 'non-finite-error'
    : !accepted && dt <= resolved.minDt * (1 + 8 * Number.EPSILON)
      ? 'minimum-step-tolerance'
      : undefined;
  return {
    accepted,
    dt,
    nextDt,
    errorNorm,
    errorComponents,
    y,
    ...(failureReason ? { failureReason } : {})
  };
}

/**
 * Integrate from t=0 to `duration` with automatic step-size control. Returns the
 * final state along with the number of accepted and rejected steps — useful for
 * adaptive-vs-fixed benchmarking and reproducibility metadata.
 */
export function integrateAdaptive(
  state0: StateVector,
  duration: number,
  rhs: Derivative,
  options: AdaptiveControllerOptions & { initialDt?: number } = {}
): AdaptiveIntegrationResult {
  if (!Number.isFinite(duration) || duration < 0) {
    throw new RangeError('integrateAdaptive: duration must be finite and non-negative.');
  }
  if (!Number.isSafeInteger(state0.length) || state0.length < 1) {
    throw new RangeError('integrateAdaptive: state must contain at least one component.');
  }
  for (let i = 0; i < state0.length; i += 1) {
    if (!Number.isFinite(state0[i])) throw new RangeError('integrateAdaptive: state components must be finite.');
  }
  const resolved = resolveAdaptiveOptions(options, state0.length, 'integrateAdaptive');
  const y = new Float64Array(state0);
  let t = 0;
  let dt = options.initialDt ?? Math.min(resolved.maxDt, 1e-2);
  if (!(dt >= resolved.minDt && dt <= resolved.maxDt) || !Number.isFinite(dt)) {
    throw new RangeError('integrateAdaptive: initialDt must be finite and within [minDt, maxDt].');
  }
  let accepted = 0;
  let rejected = 0;
  let guard = 0;
  const acceptedSteps: AdaptiveAcceptedStep[] = [];
  let terminationReason: AdaptiveTerminationReason = duration === 0 ? 'target-reached' : 'iteration-budget-exhausted';
  const workspace = createAdaptiveWorkspace(state0.length);
  // The stateful PI(D) controller path; `basic`/unset keeps the historical
  // memoryless adaptiveStep behaviour bit for bit.
  const controller =
    options.controller && options.controller !== 'basic'
      ? createStepController({
          kind: options.controller,
          order: resolved.order,
          safety: resolved.safety,
          minFactor: resolved.minFactor,
          maxFactor: resolved.maxFactor,
          ...(options.controllerCoefficients ? { coefficients: options.controllerCoefficients } : {})
        })
      : undefined;
  while (t < duration && guard < resolved.maxIterations) {
    guard += 1;
    if (t + dt > duration) dt = duration - t;
    if (controller) {
      const { y: yNew, errorComponents } = dormandPrince54Step(y, dt, rhs, workspace);
      const errorNorm = normalisedError(y, yNew, errorComponents, resolved.absTol, resolved.relTol);
      const ok = Number.isFinite(errorNorm) && errorNorm <= 1;
      const factor = controller.factor(errorNorm, ok);
      const nextDt = Math.min(resolved.maxDt, Math.max(resolved.minDt, dt * factor));
      if (ok) {
        const startTime = t;
        y.set(yNew);
        t = startTime + dt;
        if (duration - t <= Math.max(Number.EPSILON * Math.max(1, duration) * 8, resolved.minDt * 1e-6)) t = duration;
        accepted += 1;
        acceptedSteps.push({ index: accepted - 1, startTime, endTime: t, dt, errorNorm });
      } else {
        rejected += 1;
        if (!Number.isFinite(errorNorm)) {
          terminationReason = 'non-finite-error';
          break;
        }
        if (dt <= resolved.minDt * (1 + 8 * Number.EPSILON)) {
          terminationReason = 'minimum-step-tolerance';
          break;
        }
      }
      dt = nextDt;
      continue;
    }
    const outcome = adaptiveStep(y, dt, rhs, { ...options, maxDt: resolved.maxDt }, workspace);
    if (outcome.accepted) {
      const startTime = t;
      y.set(outcome.y);
      t = startTime + outcome.dt;
      if (duration - t <= Math.max(Number.EPSILON * Math.max(1, duration) * 8, resolved.minDt * 1e-6)) t = duration;
      accepted += 1;
      acceptedSteps.push({ index: accepted - 1, startTime, endTime: t, dt: outcome.dt, errorNorm: outcome.errorNorm });
      dt = outcome.nextDt;
    } else {
      rejected += 1;
      dt = outcome.nextDt;
      if (outcome.failureReason) {
        terminationReason = outcome.failureReason;
        break;
      }
    }
  }
  const reachedTarget = t === duration;
  if (reachedTarget) terminationReason = 'target-reached';
  else if (guard >= resolved.maxIterations && terminationReason === 'iteration-budget-exhausted') {
    terminationReason = 'iteration-budget-exhausted';
  }
  return {
    y,
    accepted,
    rejected,
    steps: accepted + rejected,
    finalTime: t,
    targetTime: duration,
    reachedTarget,
    terminationReason,
    acceptedSteps,
    finalSuggestedDt: dt
  };
}

/** Replay a previously exported accepted-step sequence without rerunning the controller. */
export function replayAcceptedSteps(
  state0: StateVector,
  rhs: Derivative,
  acceptedSteps: readonly AdaptiveAcceptedStep[]
): { y: StateVector; finalTime: number } {
  if (!Number.isSafeInteger(state0.length) || state0.length < 1) {
    throw new RangeError('replayAcceptedSteps: state must contain at least one component.');
  }
  const y = new Float64Array(state0);
  for (let i = 0; i < y.length; i += 1) {
    if (!Number.isFinite(y[i])) throw new RangeError('replayAcceptedSteps: state must be finite.');
  }
  const workspace = createAdaptiveWorkspace(y.length);
  let time = 0;
  for (let index = 0; index < acceptedSteps.length; index += 1) {
    const accepted = acceptedSteps[index]!;
    if (
      accepted.index !== index ||
      !Number.isFinite(accepted.startTime) ||
      !Number.isFinite(accepted.endTime) ||
      !(accepted.dt > 0) ||
      !Number.isFinite(accepted.dt) ||
      Math.abs(accepted.startTime - time) > 32 * Number.EPSILON * Math.max(1, Math.abs(time)) ||
      Math.abs(accepted.endTime - accepted.startTime - accepted.dt) >
        32 * Number.EPSILON * Math.max(1, Math.abs(accepted.endTime))
    ) {
      throw new RangeError(`replayAcceptedSteps: invalid/non-contiguous metadata at step ${index}.`);
    }
    const advanced = dormandPrince54Step(y, accepted.dt, rhs, workspace);
    y.set(advanced.y);
    time = accepted.endTime;
  }
  return { y, finalTime: time };
}

export type FixedStepper = (state: StateVector, dt: number, rhs: Derivative, out: StateVector) => StateVector;

/**
 * Richardson extrapolation of a fixed-step integrator. Takes one step of size
 * `dt` and two steps of size `dt/2`, then combines them to cancel the leading
 * error term, yielding an order p+1 estimate and a per-step error estimate.
 *
 * @param order The classical order p of the base integrator.
 */
export function richardsonStep(
  stepper: FixedStepper,
  order: number,
  state: StateVector,
  dt: number,
  rhs: Derivative
): { y: StateVector; error: number } {
  const n = state.length;
  const coarse = new Float64Array(n);
  stepper(state, dt, rhs, coarse);

  const halfA = new Float64Array(n);
  const fine = new Float64Array(n);
  stepper(state, dt / 2, rhs, halfA);
  stepper(halfA, dt / 2, rhs, fine);

  const factor = 2 ** order;
  const y = new Float64Array(n);
  let error = 0;
  for (let i = 0; i < n; i += 1) {
    // Extrapolated estimate cancels the O(dt^p) term.
    y[i] = (factor * Number(fine[i] ?? 0) - Number(coarse[i] ?? 0)) / (factor - 1);
    error = Math.max(error, Math.abs(Number(fine[i] ?? 0) - Number(coarse[i] ?? 0)) / (factor - 1));
  }
  return { y, error };
}

/**
 * Gragg's modified-midpoint rule: advance from `state` over a macro-step `H`
 * using `nSub` symmetric substeps. The symmetry gives an error expansion in
 * even powers of the substep size, which is what makes polynomial
 * extrapolation so effective. Does not mutate `state`.
 */
function modifiedMidpoint(state: StateVector, H: number, nSub: number, rhs: Derivative): StateVector {
  const n = state.length;
  const h = H / nSub;
  const ymPrev = new Float64Array(state);
  const ym = new Float64Array(n);
  const f = new Float64Array(n);
  rhs(ymPrev, f);
  for (let i = 0; i < n; i += 1) ym[i] = Number(ymPrev[i] ?? 0) + h * Number(f[i] ?? 0);
  const next = new Float64Array(n);
  for (let m = 1; m < nSub; m += 1) {
    rhs(ym, f);
    for (let i = 0; i < n; i += 1) next[i] = Number(ymPrev[i] ?? 0) + 2 * h * Number(f[i] ?? 0);
    ymPrev.set(ym);
    ym.set(next);
  }
  rhs(ym, f);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) out[i] = 0.5 * (Number(ym[i] ?? 0) + Number(ymPrev[i] ?? 0) + h * Number(f[i] ?? 0));
  return out;
}

// Substep counts for the extrapolation sequence (Bulirsch sequence start).
const GBS_SEQUENCE = [2, 4, 6, 8, 10, 12, 14, 16];

/**
 * Gragg-Bulirsch-Stoer extrapolation step. Runs the modified-midpoint rule with
 * an increasing number of substeps and applies polynomial (Richardson)
 * extrapolation in the squared substep size to reach very high order from a
 * single macro-step `H`. All extrapolation weights are *computed* from the
 * substep ratios — there is no hand-transcribed Butcher tableau to get wrong.
 *
 * Returns the best extrapolated estimate plus an infinity-norm error estimate
 * (difference between the two highest extrapolation orders). `kMax` controls how
 * many sequence entries are used (effective order grows with kMax).
 */
export interface BulirschStoerStepResult extends EmbeddedStepResult {
  extrapolationDepth: number;
  effectiveOrder: number;
}

export function bulirschStoerStep(state: StateVector, H: number, rhs: Derivative, kMax = 6): BulirschStoerStepResult {
  validateEmbeddedStepInput(state, H, 'bulirschStoerStep');
  if (!Number.isSafeInteger(kMax) || kMax < 2 || kMax > GBS_SEQUENCE.length) {
    throw new RangeError(`bulirschStoerStep: kMax must be a safe integer in [2, ${GBS_SEQUENCE.length}].`);
  }
  const stages = kMax;
  const n = state.length;
  const table: StateVector[][] = [];
  for (let k = 0; k < stages; k += 1) {
    const row: StateVector[] = [];
    row.push(modifiedMidpoint(state, H, GBS_SEQUENCE[k]!, rhs));
    for (let j = 1; j <= k; j += 1) {
      const ratio = (GBS_SEQUENCE[k]! / GBS_SEQUENCE[k - j]!) ** 2;
      const prev = row[j - 1]!;
      const upLeft = table[k - 1]![j - 1]!;
      const next = new Float64Array(n);
      for (let i = 0; i < n; i += 1) {
        next[i] = Number(prev[i] ?? 0) + (Number(prev[i] ?? 0) - Number(upLeft[i] ?? 0)) / (ratio - 1);
      }
      row.push(next);
    }
    table.push(row);
  }
  const best = table[stages - 1]![stages - 1]!;
  const lower = table[stages - 1]![stages - 2] ?? best;
  let error = 0;
  const errorComponents = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    errorComponents[i] = Math.abs(Number(best[i] ?? 0) - Number(lower[i] ?? 0));
    error = Math.max(error, errorComponents[i] ?? 0);
  }
  return {
    y: new Float64Array(best),
    error,
    errorComponents,
    extrapolationDepth: stages,
    effectiveOrder: 2 * stages
  };
}
