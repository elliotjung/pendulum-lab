import type { Derivative, StateVector } from '../physics/types';
import type { IntegratorId } from '../types/domain';
import { step } from '../physics/integrators';

/**
 * Empirical convergence-order verification by Richardson self-convergence.
 *
 * An integrator's declared order (rk4 → 4, etc.) is a claim until it is measured.
 * Rather than relying on an exact solution (which the chaotic double pendulum
 * does not have in closed form), we exploit the fact that for a method of order
 * p the global error scales as C·dt^p. The difference between solutions at dt and
 * dt/2 therefore scales the same way, so
 *
 *     ‖y(dt) − y(dt/2)‖ / ‖y(dt/2) − y(dt/4)‖ ≈ 2^p
 *
 * and p ≈ log2 of that ratio. This needs no analytic reference and is the
 * standard way to certify "the numerics are actually the order we claim". The
 * comparison must be made over a fixed time horizon short enough that the
 * trajectory is still in the asymptotic (smooth) regime, not yet dominated by
 * chaotic saturation or floating-point round-off.
 */

export interface ConvergenceOptions {
  /** Coarsest step size; each refinement halves it. */
  baseDt: number;
  /** Fixed integration horizon, reproduced exactly at every step size. */
  totalTime: number;
  /** Number of halvings; the estimate uses the finest consecutive pair. Default 3. */
  refinements?: number;
}

export interface ConvergenceResult {
  method: IntegratorId;
  /** Empirical order from the finest consecutive (dt, dt/2) self-difference pair. */
  estimatedOrder: number;
  /** Per-refinement self-differences ‖y(dt_k) − y(dt_{k+1})‖, coarse → fine. */
  selfDifferences: { dt: number; difference: number }[];
  /** Order estimate at each consecutive pair (log2 of successive difference ratios). */
  orderEstimates: number[];
}

/** Integrate `state0` to `totalTime` with a fixed `dt`, returning the final state. */
function integrateFixed(
  method: IntegratorId,
  rhs: Derivative,
  state0: ArrayLike<number>,
  dt: number,
  totalTime: number
): Float64Array {
  const n = state0.length;
  let current = new Float64Array(n);
  let next = new Float64Array(n);
  for (let i = 0; i < n; i += 1) current[i] = Number(state0[i] ?? 0);
  const options = { previousError: { value: 0 } };
  const steps = Math.round(totalTime / dt);
  for (let s = 0; s < steps; s += 1) {
    step(method, current, dt, rhs, next, options);
    const swap = current;
    current = next;
    next = swap;
  }
  return current;
}

function l2Difference(a: StateVector, b: StateVector): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += (Number(a[i] ?? 0) - Number(b[i] ?? 0)) ** 2;
  return Math.sqrt(sum);
}

/**
 * Measure the empirical convergence order of `method` on the system `rhs`.
 * Produces solutions at baseDt, baseDt/2, … and reports the order implied by the
 * successive self-differences.
 */
export function empiricalOrder(
  method: IntegratorId,
  rhs: Derivative,
  state0: ArrayLike<number>,
  options: ConvergenceOptions
): ConvergenceResult {
  const refinements = options.refinements ?? 3;
  const solutions: { dt: number; y: Float64Array }[] = [];
  for (let k = 0; k <= refinements; k += 1) {
    const dt = options.baseDt / 2 ** k;
    solutions.push({ dt, y: integrateFixed(method, rhs, state0, dt, options.totalTime) });
  }

  const selfDifferences: { dt: number; difference: number }[] = [];
  for (let k = 0; k < solutions.length - 1; k += 1) {
    selfDifferences.push({
      dt: solutions[k]!.dt,
      difference: l2Difference(solutions[k]!.y, solutions[k + 1]!.y)
    });
  }

  const orderEstimates: number[] = [];
  for (let k = 0; k < selfDifferences.length - 1; k += 1) {
    const coarse = selfDifferences[k]!.difference;
    const fine = selfDifferences[k + 1]!.difference;
    orderEstimates.push(fine > 0 ? Math.log2(coarse / fine) : Number.NaN);
  }

  const finite = orderEstimates.filter((value) => Number.isFinite(value));
  const estimatedOrder = finite.length > 0 ? finite[finite.length - 1]! : Number.NaN;

  return { method, estimatedOrder, selfDifferences, orderEstimates };
}
