import type { Derivative, StateVector } from './types';

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
}

export interface AdaptiveControllerOptions {
  absTol?: number;
  relTol?: number;
  minDt?: number;
  maxDt?: number;
  safety?: number;
  /** Embedded method order used for the error exponent (default 5). */
  order?: number;
  /**
   * Step-size controller. `basic` is the classical elementary controller
   * (default, byte-identical to the historical behaviour). `pi` adds the
   * proportional memory term of Gustafsson's PI controller, which damps the
   * accept/reject oscillation ("chattering") near stability boundaries —
   * e.g. sweeping the driven pendulum across the Melnikov threshold.
   */
  controller?: StepControllerKind;
  /** Override the per-order PI(D) exponents; defaults to PI4.2 for `pi`. */
  controllerCoefficients?: StepControllerCoefficients;
}

export interface AdaptiveStepOutcome {
  accepted: boolean;
  /** Step size that was attempted. */
  dt: number;
  /** Suggested step size for the next attempt. */
  nextDt: number;
  /** Normalised error (target is <= 1). */
  errorNorm: number;
  y: StateVector;
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
function dormandPrinceStages(state: StateVector, dt: number, rhs: Derivative): { k: StateVector[]; y: StateVector; error: number } {
  const n = state.length;
  const k: StateVector[] = Array.from({ length: 7 }, () => new Float64Array(n));
  const tmp = new Float64Array(n);
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
  const y = new Float64Array(n);
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
    error = Math.max(error, Math.abs(dt * (sum5 - sum4)));
  }
  return { k, y, error };
}

/**
 * One Dormand-Prince 5(4) step. Returns the 5th-order solution and an absolute
 * infinity-norm error estimate (difference between the 5th and 4th order
 * solutions). Does not mutate `state`.
 */
export function dormandPrince54Step(state: StateVector, dt: number, rhs: Derivative): EmbeddedStepResult {
  const { y, error } = dormandPrinceStages(state, dt, rhs);
  return { y, error };
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
export function dormandPrince54StepDense(state: StateVector, dt: number, rhs: Derivative): DenseStepResult {
  const n = state.length;
  const { k, y, error } = dormandPrinceStages(state, dt, rhs);
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
    interpolate(theta: number, out: StateVector): StateVector {
      const oneMinus = 1 - theta;
      for (let i = 0; i < n; i += 1) {
        out[i] = Number(r1[i] ?? 0) + theta * (Number(r2[i] ?? 0) + oneMinus * (Number(r3[i] ?? 0) + theta * (Number(r4[i] ?? 0) + oneMinus * Number(r5[i] ?? 0))));
      }
      return out;
    }
  };
}

// Tsitouras 5(4) Butcher tableau (Tsitouras 2011, Comput. Math. Appl. 62;
// the non-stiff default pair of DifferentialEquations.jl). Like Dormand-Prince
// it is FSAL (the 7th stage row equals the 5th-order weights), but the free
// parameters were re-optimised so the leading truncation-error coefficients
// are smaller — same seven stages, measurably tighter error at equal dt.
const TS_A: readonly (readonly number[])[] = [
  [],
  [0.161],
  [-0.008480655492356989, 0.335480655492357],
  [2.8971530571054935, -6.359448489975075, 4.3622954328695815],
  [5.325864828439257, -11.748883564062828, 7.4955393428898365, -0.09249506636175525],
  [5.86145544294642, -12.92096931784711, 8.159367898576159, -0.071584973281401, -0.028269050394068383],
  [0.09646076681806523, 0.01, 0.4798896504144996, 1.379008574103742, -3.290069515436081, 2.324710524099774]
];
// 5th-order solution weights (== 7th stage row, FSAL).
const TS_B5 = [0.09646076681806523, 0.01, 0.4798896504144996, 1.379008574103742, -3.290069515436081, 2.324710524099774, 0];
// Error weights btilde = b - bhat (5th minus embedded 4th order), transcribed
// from the reference implementation; a transcription error here collapses the
// measured convergence order, which the reference-validation suite pins.
const TS_BTILDE = [
  -0.00178001105222577714,
  -0.0008164344596567469,
  0.007880878010261995,
  -0.1447110071732629,
  0.5823571654525552,
  -0.45808210592918697,
  0.015151515151515152
];

/**
 * One Tsitouras 5(4) step. Returns the 5th-order solution and an absolute
 * infinity-norm error estimate from the embedded 4th-order weights. Does not
 * mutate `state`. Adopted from the method DifferentialEquations.jl ships as
 * its recommended non-stiff default (`Tsit5`).
 */
export function tsitouras54Step(state: StateVector, dt: number, rhs: Derivative): EmbeddedStepResult {
  const n = state.length;
  const k: StateVector[] = Array.from({ length: 7 }, () => new Float64Array(n));
  const tmp = new Float64Array(n);
  for (let s = 0; s < 7; s += 1) {
    if (s === 0) {
      rhs(state, k[0]!);
      continue;
    }
    const a = TS_A[s]!;
    for (let i = 0; i < n; i += 1) {
      let acc = 0;
      for (let j = 0; j < a.length; j += 1) acc += a[j]! * Number(k[j]![i] ?? 0);
      tmp[i] = Number(state[i] ?? 0) + dt * acc;
    }
    rhs(tmp, k[s]!);
  }
  const y = new Float64Array(n);
  let error = 0;
  for (let i = 0; i < n; i += 1) {
    let sum5 = 0;
    let sumErr = 0;
    for (let s = 0; s < 7; s += 1) {
      const ki = Number(k[s]![i] ?? 0);
      sum5 += TS_B5[s]! * ki;
      sumErr += TS_BTILDE[s]! * ki;
    }
    y[i] = Number(state[i] ?? 0) + dt * sum5;
    error = Math.max(error, Math.abs(dt * sumErr));
  }
  return { y, error };
}

export type StepControllerKind = 'basic' | 'pi';

/**
 * Exponents (per unit of method order p) of the generalised controller
 * factor = safety · err^(−kI/p) · errPrev^(kP/p) · errPrev2^(−kD/p).
 * kI = 1, kP = kD = 0 is the elementary controller; the PI4.2 choice
 * kI = 0.7, kP = 0.4 (Gustafsson; Hairer & Wanner II.4) damps step-size
 * oscillation. A derivative term kD can be supplied for a full PID.
 */
export interface StepControllerCoefficients {
  kI: number;
  kP: number;
  kD?: number;
}

export interface StepController {
  /**
   * Step-size factor for the next attempt. Error memory advances only on
   * accepted steps; after a rejection the factor is capped at 1 so the step
   * can never grow off a failure.
   */
  factor(errorNorm: number, accepted: boolean): number;
  reset(): void;
}

const PI42: StepControllerCoefficients = { kI: 0.7, kP: 0.4 };

export function createStepController(options: {
  kind?: StepControllerKind;
  order?: number;
  safety?: number;
  minFactor?: number;
  maxFactor?: number;
  coefficients?: StepControllerCoefficients;
} = {}): StepController {
  const order = options.order ?? 5;
  const safety = options.safety ?? 0.9;
  const minFactor = options.minFactor ?? 0.2;
  const maxFactor = options.maxFactor ?? 5;
  const kind = options.kind ?? 'basic';
  const co = options.coefficients ?? (kind === 'pi' ? PI42 : { kI: 1, kP: 0 });
  const ERR_FLOOR = 1e-12; // keeps the memory powers finite on exact steps
  let prev = 1;
  let prev2 = 1;
  return {
    factor(errorNorm: number, accepted: boolean): number {
      const err = Math.max(errorNorm, ERR_FLOOR);
      let raw = errorNorm === 0
        ? maxFactor
        : safety * err ** (-co.kI / order) * prev ** (co.kP / order) * prev2 ** (-(co.kD ?? 0) / order);
      if (!accepted) raw = Math.min(raw, 1);
      if (accepted) {
        prev2 = prev;
        prev = err;
      }
      return Math.min(maxFactor, Math.max(minFactor, raw));
    },
    reset(): void {
      prev = 1;
      prev2 = 1;
    }
  };
}

/** Mixed abs/rel normalised error: target is ≤ 1 (shared by all controllers). */
function normalisedError(state: StateVector, y: StateVector, error: number, absTol: number, relTol: number): number {
  let errorNorm = 0;
  for (let i = 0; i < state.length; i += 1) {
    const scale = absTol + relTol * Math.max(Math.abs(Number(state[i] ?? 0)), Math.abs(Number(y[i] ?? 0)));
    errorNorm = Math.max(errorNorm, error / scale);
  }
  return errorNorm;
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
  options: AdaptiveControllerOptions = {}
): AdaptiveStepOutcome {
  const absTol = options.absTol ?? 1e-8;
  const relTol = options.relTol ?? 1e-6;
  const minDt = options.minDt ?? 1e-9;
  const maxDt = options.maxDt ?? 1;
  const safety = options.safety ?? 0.9;
  const order = options.order ?? 5;

  const { y, error } = dormandPrince54Step(state, dt, rhs);
  // Normalise: error / (absTol + relTol * max(|y_old|, |y_new|)).
  const errorNorm = normalisedError(state, y, error, absTol, relTol);
  const accepted = errorNorm <= 1 || dt <= minDt;
  const exponent = 1 / order;
  const raw = errorNorm === 0 ? 5 : safety * errorNorm ** -exponent;
  const factor = Math.min(5, Math.max(0.2, raw));
  const nextDt = Math.min(maxDt, Math.max(minDt, dt * factor));
  return { accepted, dt, nextDt, errorNorm, y };
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
): { y: StateVector; accepted: number; rejected: number; steps: number } {
  const y = new Float64Array(state0);
  let t = 0;
  let dt = options.initialDt ?? Math.min(options.maxDt ?? 1e-2, 1e-2);
  let accepted = 0;
  let rejected = 0;
  let guard = 0;
  const maxIterations = 10_000_000;
  // The stateful PI(D) controller path; `basic`/unset keeps the historical
  // memoryless adaptiveStep behaviour bit for bit.
  const controller = options.controller && options.controller !== 'basic'
    ? createStepController({
        kind: options.controller,
        order: options.order ?? 5,
        safety: options.safety ?? 0.9,
        ...(options.controllerCoefficients ? { coefficients: options.controllerCoefficients } : {})
      })
    : undefined;
  const absTol = options.absTol ?? 1e-8;
  const relTol = options.relTol ?? 1e-6;
  const minDt = options.minDt ?? 1e-9;
  const maxDt = options.maxDt ?? 1;
  while (t < duration && guard < maxIterations) {
    guard += 1;
    if (t + dt > duration) dt = duration - t;
    if (controller) {
      const { y: yNew, error } = dormandPrince54Step(y, dt, rhs);
      const errorNorm = normalisedError(y, yNew, error, absTol, relTol);
      const ok = errorNorm <= 1 || dt <= minDt;
      const factor = controller.factor(errorNorm, ok);
      const nextDt = Math.min(maxDt, Math.max(minDt, dt * factor));
      if (ok) {
        y.set(yNew);
        t += dt;
        accepted += 1;
      } else {
        rejected += 1;
      }
      dt = nextDt;
      continue;
    }
    const outcome = adaptiveStep(y, dt, rhs, options);
    if (outcome.accepted) {
      y.set(outcome.y);
      t += outcome.dt;
      accepted += 1;
      dt = outcome.nextDt;
    } else {
      rejected += 1;
      dt = outcome.nextDt;
    }
  }
  return { y, accepted, rejected, steps: accepted + rejected };
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
export function bulirschStoerStep(state: StateVector, H: number, rhs: Derivative, kMax = 6): EmbeddedStepResult {
  const stages = Math.min(Math.max(2, kMax), GBS_SEQUENCE.length);
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
  for (let i = 0; i < n; i += 1) error = Math.max(error, Math.abs(Number(best[i] ?? 0) - Number(lower[i] ?? 0)));
  return { y: new Float64Array(best), error };
}
