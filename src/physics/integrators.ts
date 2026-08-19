import type { IntegratorId } from '../types/domain';
import type { Derivative, StateVector, StepOptions } from './types';
import { dormandPrince54Step, bulirschStoerStep } from './adaptive';
import { trBdf2Step } from './stiff';
import { implicitMidpointNewton } from './implicitDiagnostics';
import { dop853Step, rkf45Step } from './embeddedIntegrators';
import { integratorRegistry } from './integratorRegistry';
import {
  acquireIntegratorScratch as ensureScratch,
  releaseIntegratorScratch as releaseScratch
} from './integratorScratch';

export { integratorRegistry };
export { dop853Step, rkf45Step } from './embeddedIntegrators';

/** Validate every direct public stepping entry point, not just `step(...)`. */
function validateDirectStepInput(
  state: StateVector,
  dt: number,
  rhs: Derivative,
  out: StateVector,
  operation: string
): number {
  const n = state.length;
  if (!Number.isSafeInteger(n) || n < 1 || out.length < n) {
    throw new RangeError(`${operation}: state/output dimensions must match a positive state dimension.`);
  }
  if (!Number.isFinite(dt)) throw new RangeError(`${operation}: dt must be finite.`);
  if (typeof rhs !== 'function') throw new TypeError(`${operation}: rhs must be a function.`);
  for (let i = 0; i < n; i += 1) {
    if (!Number.isFinite(state[i])) throw new RangeError(`${operation}: state[${i}] must be finite.`);
  }
  return n;
}

/**
 * A zero-length fixed step is a valid identity map.  Event refinement probes
 * the left endpoint with `tau = 0`; treating that probe as an invalid step
 * breaks otherwise valid Poincare and bifurcation calculations.  Validate all
 * inputs first, then avoid evaluating the RHS so the identity is exact and
 * cannot surface an irrelevant derivative failure.
 */
function completeZeroStep(
  state: StateVector,
  out: StateVector,
  options?: StepOptions,
  solver: 'explicit' | 'fixed-point' | 'newton' = 'explicit'
): StateVector {
  out.set(state);
  if (!options) return out;
  if (options.previousError) options.previousError.value = 0;
  if (options.errorComponents) options.errorComponents.fill(0, 0, state.length);
  if (options.diagnostics) {
    options.diagnostics.solver = solver;
    options.diagnostics.iterations = 0;
    options.diagnostics.residualNorm = 0;
    options.diagnostics.converged = true;
    options.diagnostics.accepted = true;
    options.diagnostics.retryable = false;
    delete options.diagnostics.failureReason;
    delete options.diagnostics.errorCode;
    delete options.diagnostics.suggestedDt;
    delete options.diagnostics.conditionEstimate;
  }
  return out;
}

function validateDirectStepOptions(options: StepOptions, n: number, operation: string): void {
  if (options.tolerance !== undefined && (!(options.tolerance > 0) || !Number.isFinite(options.tolerance))) {
    throw new RangeError(`${operation}: tolerance must be positive and finite.`);
  }
  if (options.errorComponents && options.errorComponents.length < n) {
    throw new RangeError(`${operation}: errorComponents must have at least state.length entries.`);
  }
  if (options.jacobian !== undefined && typeof options.jacobian !== 'function') {
    throw new TypeError(`${operation}: jacobian must be a function when supplied.`);
  }
  if (options.diagnostics !== undefined && (typeof options.diagnostics !== 'object' || options.diagnostics === null)) {
    throw new TypeError(`${operation}: diagnostics must be an object when supplied.`);
  }
  if (
    options.previousError !== undefined &&
    (typeof options.previousError !== 'object' ||
      options.previousError === null ||
      !Object.hasOwn(options.previousError, 'value'))
  ) {
    throw new TypeError(`${operation}: previousError must be an object with a value field when supplied.`);
  }
}

function addScaled(dst: StateVector, a: StateVector, k: number, b: StateVector, n: number): void {
  for (let i = 0; i < n; i += 1) dst[i] = Number(a[i] ?? 0) + k * Number(b[i] ?? 0);
}

/**
 * Evaluate the acceleration block of a second-order system encoded as
 * y = [q (first half), v (second half)] with rhs(y) = [v, a(q, v)].
 * Writes a(q, v) into `accOut` (length half). Returns the half length.
 */
function evalAcceleration(
  rhs: Derivative,
  q: ArrayLike<number>,
  v: ArrayLike<number>,
  half: number,
  scratchState: StateVector,
  scratchDeriv: StateVector,
  accOut: StateVector
): void {
  for (let i = 0; i < half; i += 1) {
    scratchState[i] = Number(q[i] ?? 0);
    scratchState[half + i] = Number(v[i] ?? 0);
  }
  rhs(scratchState, scratchDeriv);
  for (let i = 0; i < half; i += 1) accOut[i] = Number(scratchDeriv[half + i] ?? 0);
}

function isSplittable(n: number): boolean {
  return n > 0 && n % 2 === 0;
}

export function eulerStep(state: StateVector, dt: number, rhs: Derivative, out: StateVector): StateVector {
  const n = validateDirectStepInput(state, dt, rhs, out, 'eulerStep');
  if (dt === 0) return completeZeroStep(state, out);
  const scratch = ensureScratch(n);
  const k1 = scratch[0]!;
  try {
    rhs(state, k1);
    for (let i = 0; i < n; i += 1) out[i] = Number(state[i] ?? 0) + dt * Number(k1[i] ?? 0);
    return out;
  } finally {
    releaseScratch(scratch);
  }
}

export function rk2Step(state: StateVector, dt: number, rhs: Derivative, out: StateVector): StateVector {
  const n = validateDirectStepInput(state, dt, rhs, out, 'rk2Step');
  if (dt === 0) return completeZeroStep(state, out);
  const scratch = ensureScratch(n);
  const k1 = scratch[0]!;
  const k2 = scratch[1]!;
  const tmp = scratch[2]!;
  try {
    rhs(state, k1);
    addScaled(tmp, state, 0.5 * dt, k1, n);
    rhs(tmp, k2);
    for (let i = 0; i < n; i += 1) out[i] = Number(state[i] ?? 0) + dt * Number(k2[i] ?? 0);
    return out;
  } finally {
    releaseScratch(scratch);
  }
}

export function rk4Step(state: StateVector, dt: number, rhs: Derivative, out: StateVector): StateVector {
  const n = validateDirectStepInput(state, dt, rhs, out, 'rk4Step');
  if (dt === 0) return completeZeroStep(state, out);
  const scratch = ensureScratch(n);
  const k1 = scratch[0]!;
  const k2 = scratch[1]!;
  const k3 = scratch[2]!;
  const k4 = scratch[3]!;
  const tmp = scratch[4]!;
  try {
    rhs(state, k1);
    addScaled(tmp, state, 0.5 * dt, k1, n);
    rhs(tmp, k2);
    addScaled(tmp, state, 0.5 * dt, k2, n);
    rhs(tmp, k3);
    addScaled(tmp, state, dt, k3, n);
    rhs(tmp, k4);
    for (let i = 0; i < n; i += 1) {
      out[i] =
        Number(state[i] ?? 0) +
        (dt / 6) * (Number(k1[i] ?? 0) + 2 * Number(k2[i] ?? 0) + 2 * Number(k3[i] ?? 0) + Number(k4[i] ?? 0));
    }
    return out;
  } finally {
    releaseScratch(scratch);
  }
}

export function implicitMidpointStep(
  state: StateVector,
  dt: number,
  rhs: Derivative,
  out: StateVector,
  options: StepOptions = {}
): StateVector {
  const n = validateDirectStepInput(state, dt, rhs, out, 'implicitMidpointStep');
  validateDirectStepOptions(options, n, 'implicitMidpointStep');
  if (dt === 0) return completeZeroStep(state, out, options, 'fixed-point');
  const exactJacobian = options.jacobian ?? rhs.jacobian;
  if (exactJacobian) {
    const newtonOptions: { tolerance?: number; maxIterations: number } = { maxIterations: 25 };
    if (options.tolerance !== undefined) newtonOptions.tolerance = options.tolerance;
    const report = implicitMidpointNewton(state, dt, rhs, exactJacobian, newtonOptions);
    out.set(report.state);
    if (options.previousError) options.previousError.value = report.residualNorm;
    if (options.diagnostics) {
      options.diagnostics.solver = 'newton';
      options.diagnostics.iterations = report.iterations;
      options.diagnostics.residualNorm = report.residualNorm;
      options.diagnostics.conditionEstimate = report.conditionEstimate;
      options.diagnostics.converged = report.converged;
      options.diagnostics.accepted = report.converged;
      options.diagnostics.retryable = report.retryable;
      if (report.errorCode) options.diagnostics.errorCode = report.errorCode;
      else delete options.diagnostics.errorCode;
      if (report.suggestedDt !== undefined) options.diagnostics.suggestedDt = report.suggestedDt;
      else delete options.diagnostics.suggestedDt;
      if (report.failureReason) options.diagnostics.failureReason = report.failureReason;
      else delete options.diagnostics.failureReason;
    }
    return out;
  }
  const scratch = ensureScratch(n);
  const k = scratch[0]!;
  const mid = scratch[1]!;
  const trial = scratch[2]!;
  const tolerance = options.tolerance ?? 1e-10;
  let residual = Infinity;
  let iterations = 0;
  let converged = false;
  let failureReason: string | undefined;
  try {
    trial.set(state);
    for (let iter = 0; iter < 10; iter += 1) {
      iterations = iter + 1;
      for (let i = 0; i < n; i += 1) mid[i] = 0.5 * (Number(state[i] ?? 0) + Number(trial[i] ?? 0));
      rhs(mid, k);
      residual = 0;
      for (let i = 0; i < n; i += 1) {
        const next = Number(state[i] ?? 0) + dt * Number(k[i] ?? 0);
        residual = Math.max(residual, Math.abs(next - Number(trial[i] ?? 0)));
        trial[i] = next;
      }
      if (!Number.isFinite(residual)) {
        failureReason = 'non-finite-input';
        break;
      }
      if (residual < tolerance) {
        converged = true;
        break;
      }
    }
    if (!converged && !failureReason) failureReason = 'max-iterations';
    // Fail closed: an unconverged iterate is diagnostic evidence, not a state
    // the caller is allowed to advance as if it were a valid implicit solution.
    out.set(converged ? trial : state);
    if (options.previousError) options.previousError.value = residual;
    if (options.diagnostics) {
      options.diagnostics.solver = 'fixed-point';
      options.diagnostics.iterations = iterations;
      options.diagnostics.residualNorm = residual;
      options.diagnostics.converged = converged;
      options.diagnostics.accepted = converged;
      options.diagnostics.retryable = !converged && failureReason === 'max-iterations';
      if (converged) {
        delete options.diagnostics.errorCode;
        delete options.diagnostics.suggestedDt;
      } else {
        options.diagnostics.errorCode =
          failureReason === 'non-finite-input' ? 'NON_FINITE_INPUT' : 'IMPLICIT_SOLVER_DID_NOT_CONVERGE';
        if (failureReason === 'max-iterations') options.diagnostics.suggestedDt = Math.abs(dt) / 2;
        else delete options.diagnostics.suggestedDt;
      }
      if (failureReason) options.diagnostics.failureReason = failureReason;
      else delete options.diagnostics.failureReason;
      delete options.diagnostics.conditionEstimate;
    }
    return out;
  } finally {
    releaseScratch(scratch);
  }
}

/**
 * Semi-implicit (symplectic) Euler for second-order systems split as
 * y = [q, v]. Updates v first using a(q, v) then advances q with the new v.
 * First order, but preserves phase-space structure far better than explicit
 * Euler. Falls back to explicit Euler when the state is not splittable.
 */
export function symplecticEulerStep(state: StateVector, dt: number, rhs: Derivative, out: StateVector): StateVector {
  const n = validateDirectStepInput(state, dt, rhs, out, 'symplecticEulerStep');
  if (dt === 0) return completeZeroStep(state, out);
  if (!isSplittable(n)) return eulerStep(state, dt, rhs, out);
  const half = n / 2;
  const scratch = ensureScratch(n);
  const ss = scratch[0]!;
  const sd = scratch[1]!;
  const acc = scratch[2]!;
  const q = state.subarray(0, half);
  const v = state.subarray(half, n);
  try {
    evalAcceleration(rhs, q, v, half, ss, sd, acc);
    for (let i = 0; i < half; i += 1) {
      const vNew = Number(v[i] ?? 0) + dt * Number(acc[i] ?? 0);
      out[half + i] = vNew;
      out[i] = Number(q[i] ?? 0) + dt * vNew;
    }
    return out;
  } finally {
    releaseScratch(scratch);
  }
}

/**
 * Velocity-Verlet ("leapfrog") kick-drift-kick for y = [q, v]. Second order.
 * Strictly symplectic only when a depends on q alone; for the velocity-coupled
 * pendulum it is a separable approximation (see registry stability notes).
 */
export function leapfrogStep(state: StateVector, dt: number, rhs: Derivative, out: StateVector): StateVector {
  const n = validateDirectStepInput(state, dt, rhs, out, 'leapfrogStep');
  if (dt === 0) return completeZeroStep(state, out);
  if (!isSplittable(n)) return rk2Step(state, dt, rhs, out);
  const half = n / 2;
  const scratch = ensureScratch(n);
  const ss = scratch[0]!;
  const sd = scratch[1]!;
  const acc = scratch[2]!;
  const qHalf = scratch[3]!;
  const vHalf = scratch[4]!;
  const q = state.subarray(0, half);
  const v = state.subarray(half, n);
  try {
    evalAcceleration(rhs, q, v, half, ss, sd, acc);
    for (let i = 0; i < half; i += 1) {
      vHalf[i] = Number(v[i] ?? 0) + 0.5 * dt * Number(acc[i] ?? 0);
      qHalf[i] = Number(q[i] ?? 0) + dt * Number(vHalf[i] ?? 0);
    }
    evalAcceleration(rhs, qHalf, vHalf, half, ss, sd, acc);
    for (let i = 0; i < half; i += 1) {
      out[i] = Number(qHalf[i] ?? 0);
      out[half + i] = Number(vHalf[i] ?? 0) + 0.5 * dt * Number(acc[i] ?? 0);
    }
    return out;
  } finally {
    releaseScratch(scratch);
  }
}

// Yoshida's fourth-order symmetric composition coefficients.
const YOSHIDA_W1 = 1 / (2 - Math.cbrt(2));
const YOSHIDA_W0 = -Math.cbrt(2) * YOSHIDA_W1;

/**
 * Fourth-order symplectic integrator built from a triple Yoshida composition
 * of the leapfrog step. Order 4 by construction; symplectic claims inherit the
 * leapfrog separability caveat.
 */
export function yoshida4Step(state: StateVector, dt: number, rhs: Derivative, out: StateVector): StateVector {
  const n = validateDirectStepInput(state, dt, rhs, out, 'yoshida4Step');
  if (dt === 0) return completeZeroStep(state, out);
  if (!isSplittable(n)) return rk4Step(state, dt, rhs, out);
  const scratch = ensureScratch(n, 2);
  const [a, b] = scratch as [Float64Array, Float64Array];
  try {
    a.set(state);
    leapfrogStep(a, YOSHIDA_W1 * dt, rhs, b);
    leapfrogStep(b, YOSHIDA_W0 * dt, rhs, a);
    leapfrogStep(a, YOSHIDA_W1 * dt, rhs, out);
    return out;
  } finally {
    releaseScratch(scratch);
  }
}

type SymmetricStepper = (state: StateVector, dt: number, rhs: Derivative, out: StateVector) => StateVector;

/**
 * Raise a symmetric method of even order p to order p+2 using Yoshida's
 * triple jump S(z1 h) S(z0 h) S(z1 h), where
 * z1=1/(2-2^(1/(p+1))) and z0=-2^(1/(p+1)) z1.
 */
function yoshidaTripleJump(
  base: SymmetricStepper,
  baseOrder: number,
  state: StateVector,
  dt: number,
  rhs: Derivative,
  out: StateVector
): StateVector {
  const n = validateDirectStepInput(state, dt, rhs, out, 'yoshidaTripleJump');
  if (dt === 0) return completeZeroStep(state, out);
  const root = 2 ** (1 / (baseOrder + 1));
  const z1 = 1 / (2 - root);
  const z0 = -root * z1;
  const scratch = ensureScratch(n, 2);
  const [a, b] = scratch as [Float64Array, Float64Array];
  try {
    base(state, z1 * dt, rhs, a);
    base(a, z0 * dt, rhs, b);
    base(b, z1 * dt, rhs, out);
    return out;
  } finally {
    releaseScratch(scratch);
  }
}

/** Sixth-order symmetric Yoshida composition of the leapfrog split. */
export function yoshida6Step(state: StateVector, dt: number, rhs: Derivative, out: StateVector): StateVector {
  if (!isSplittable(state.length)) return rk4Step(state, dt, rhs, out);
  return yoshidaTripleJump(yoshida4Step, 4, state, dt, rhs, out);
}

/** Eighth-order symmetric Yoshida composition (27 leapfrog substeps). */
export function yoshida8Step(state: StateVector, dt: number, rhs: Derivative, out: StateVector): StateVector {
  if (!isSplittable(state.length)) return rk4Step(state, dt, rhs, out);
  return yoshidaTripleJump(yoshida6Step, 6, state, dt, rhs, out);
}

/**
 * Generic s-stage Gauss-Legendre implicit Runge-Kutta step solved by fixed-point
 * iteration on the stage derivatives. The 2-stage tableau is order 4, the
 * 3-stage tableau order 6; both are symplectic and A-stable for canonical
 * systems. `options.previousError` receives the final fixed-point residual.
 */
function gaussLegendreStep(
  a: readonly (readonly number[])[],
  b: readonly number[],
  state: StateVector,
  dt: number,
  rhs: Derivative,
  out: StateVector,
  options: StepOptions
): StateVector {
  const n = validateDirectStepInput(state, dt, rhs, out, 'gaussLegendreStep');
  validateDirectStepOptions(options, n, 'gaussLegendreStep');
  if (dt === 0) return completeZeroStep(state, out, options, 'fixed-point');
  const s = b.length;
  const tolerance = options.tolerance ?? 1e-12;
  const scratch = ensureScratch(n, s + 2);
  const k = scratch;
  const stage = scratch[s]!;
  // Seed each stage derivative with f(state) so iteration starts sensibly.
  rhs(state, stage);
  for (let i = 0; i < s; i += 1) k[i]!.set(stage);
  let residual = Infinity;
  let iterations = 0;
  let converged = false;
  let nonFinite = false;
  const knew = scratch[s + 1]!;
  for (let iter = 0; iter < 50 && residual > tolerance; iter += 1) {
    iterations = iter + 1;
    residual = 0;
    for (let i = 0; i < s; i += 1) {
      for (let m = 0; m < n; m += 1) {
        let acc = 0;
        for (let j = 0; j < s; j += 1) acc += a[i]![j]! * Number(k[j]![m] ?? 0);
        stage[m] = Number(state[m] ?? 0) + dt * acc;
      }
      rhs(stage, knew);
      for (let m = 0; m < n; m += 1) {
        if (!Number.isFinite(knew[m])) nonFinite = true;
        residual = Math.max(residual, Math.abs(knew[m]! - Number(k[i]![m] ?? 0)));
      }
      k[i]!.set(knew);
      if (nonFinite) break;
    }
    if (nonFinite) break;
    converged = residual <= tolerance;
  }
  if (converged) {
    for (let m = 0; m < n; m += 1) {
      let acc = 0;
      for (let i = 0; i < s; i += 1) acc += b[i]! * Number(k[i]![m] ?? 0);
      out[m] = Number(state[m] ?? 0) + dt * acc;
    }
  } else {
    out.set(state);
  }
  if (options.previousError) options.previousError.value = residual;
  if (options.diagnostics) {
    options.diagnostics.solver = 'fixed-point';
    options.diagnostics.iterations = iterations;
    options.diagnostics.residualNorm = residual;
    options.diagnostics.converged = converged;
    options.diagnostics.accepted = converged;
    options.diagnostics.retryable = !nonFinite;
    if (converged) {
      delete options.diagnostics.failureReason;
      delete options.diagnostics.errorCode;
      delete options.diagnostics.suggestedDt;
    } else {
      options.diagnostics.failureReason = nonFinite ? 'non-finite-input' : 'max-iterations';
      options.diagnostics.errorCode = nonFinite ? 'NON_FINITE_INPUT' : 'IMPLICIT_SOLVER_DID_NOT_CONVERGE';
      if (!nonFinite) options.diagnostics.suggestedDt = Math.abs(dt) / 2;
    }
    delete options.diagnostics.conditionEstimate;
  }
  releaseScratch(scratch);
  return out;
}

const SQRT3 = Math.sqrt(3);
const GL4_A: readonly (readonly number[])[] = [
  [1 / 4, 1 / 4 - SQRT3 / 6],
  [1 / 4 + SQRT3 / 6, 1 / 4]
];
const GL4_B = [1 / 2, 1 / 2];

const SQRT15 = Math.sqrt(15);
const GL6_A: readonly (readonly number[])[] = [
  [5 / 36, 2 / 9 - SQRT15 / 15, 5 / 36 - SQRT15 / 30],
  [5 / 36 + SQRT15 / 24, 2 / 9, 5 / 36 - SQRT15 / 24],
  [5 / 36 + SQRT15 / 30, 2 / 9 + SQRT15 / 15, 5 / 36]
];
const GL6_B = [5 / 18, 4 / 9, 5 / 18];

export function gaussLegendre4Step(
  state: StateVector,
  dt: number,
  rhs: Derivative,
  out: StateVector,
  options: StepOptions = {}
): StateVector {
  return gaussLegendreStep(GL4_A, GL4_B, state, dt, rhs, out, options);
}

export function gaussLegendre6Step(
  state: StateVector,
  dt: number,
  rhs: Derivative,
  out: StateVector,
  options: StepOptions = {}
): StateVector {
  return gaussLegendreStep(GL6_A, GL6_B, state, dt, rhs, out, options);
}

export function step(
  method: IntegratorId,
  state: StateVector,
  dt: number,
  rhs: Derivative,
  out: StateVector,
  options: StepOptions = {}
): StateVector {
  const n = validateDirectStepInput(state, dt, rhs, out, 'step');
  validateDirectStepOptions(options, n, 'step');
  if (!Object.hasOwn(integratorRegistry, method)) {
    throw new RangeError(`step: unsupported integrator method ${String(method)}.`);
  }
  if (dt === 0) return completeZeroStep(state, out, options);
  switch (method) {
    case 'euler':
      return eulerStep(state, dt, rhs, out);
    case 'rk2':
      return rk2Step(state, dt, rhs, out);
    case 'hmidpoint':
      return implicitMidpointStep(state, dt, rhs, out, options);
    case 'gauss2':
      return gaussLegendre4Step(state, dt, rhs, out, options);
    case 'symplectic':
      return symplecticEulerStep(state, dt, rhs, out);
    case 'verlet':
      return leapfrogStep(state, dt, rhs, out);
    case 'leapfrog':
      return leapfrogStep(state, dt, rhs, out);
    case 'yoshida4':
      return yoshida4Step(state, dt, rhs, out);
    case 'yoshida6':
      return yoshida6Step(state, dt, rhs, out);
    case 'yoshida8':
      return yoshida8Step(state, dt, rhs, out);
    case 'rkf45':
      return rkf45Step(state, dt, rhs, out, options);
    case 'dopri5': {
      const result = dormandPrince54Step(state, dt, rhs);
      out.set(result.y);
      if (options.previousError) options.previousError.value = result.error;
      if (options.errorComponents)
        options.errorComponents.set(result.errorComponents.subarray(0, options.errorComponents.length));
      return out;
    }
    case 'dop853':
      return dop853Step(state, dt, rhs, out, options);
    case 'gbs': {
      const result = bulirschStoerStep(state, dt, rhs);
      out.set(result.y);
      if (options.previousError) options.previousError.value = result.error;
      if (options.errorComponents)
        options.errorComponents.set(result.errorComponents.subarray(0, options.errorComponents.length));
      return out;
    }
    case 'bdf2':
      return trBdf2Step(state, dt, rhs, out, options);
    case 'rk4':
      return rk4Step(state, dt, rhs, out);
    default:
      throw new RangeError(`step: unsupported integrator method ${String(method)}.`);
  }
}
