import type { Point2D } from '../viz/poincare';
import type { Derivative } from '../physics/types';

/**
 * Collects Poincaré-section points for the Lab panel. The section condition is a
 * rising zero-crossing of θ₁ (θ₁ = 0, θ̇₁ > 0); at each crossing it records
 * (θ₂, ω₂).
 *
 * Crossing localisation has two tiers:
 * - default: linear interpolation between the two bracketing steps;
 * - with `setRefiner(rhs, dt)`: true event refinement — the crossing instant is
 *   root-found on the flow itself (RK4 sub-steps from the bracketing state,
 *   secant iteration on θ₁(τ)), so the recorded point sits on the section to
 *   ~1e-10 rather than O(dt²).
 *
 * Feed it the full state each integration step via `push`. State layout matches
 * the engine: [θ1, θ2, ω1, ω2, …].
 */
export class PoincareAccumulator {
  private readonly points: Point2D[] = [];
  private prev: Float64Array | null = null;
  private readonly cap: number;
  private readonly direction: 'rising' | 'falling' | 'both';
  private refineRhs: Derivative | null = null;
  private refineDt = 0;
  private workDim = 0;
  private k1 = new Float64Array(0);
  private k2 = new Float64Array(0);
  private k3 = new Float64Array(0);
  private k4 = new Float64Array(0);
  private tmp = new Float64Array(0);
  private refineScratch = new Float64Array(0);

  constructor(cap = 4000, direction: 'rising' | 'falling' | 'both' = 'rising') {
    this.cap = Math.max(1, cap);
    this.direction = direction;
  }

  /** Number of recorded section points. */
  get size(): number {
    return this.points.length;
  }

  get capacity(): number {
    return this.cap;
  }

  policy(): { capacity: number; direction: 'rising' | 'falling' | 'both'; refined: boolean } {
    return {
      capacity: this.cap,
      direction: this.direction,
      refined: Boolean(this.refineRhs && this.refineDt > 0)
    };
  }

  list(): readonly Point2D[] {
    return this.points;
  }

  toFloat32Pairs(): Float32Array {
    const out = new Float32Array(this.points.length * 2);
    for (let i = 0; i < this.points.length; i += 1) {
      const p = this.points[i]!;
      out[i * 2] = p.x;
      out[i * 2 + 1] = p.y;
    }
    return out;
  }

  clear(): void {
    this.points.length = 0;
    this.prev = null;
  }

  /**
   * Enable event refinement: `rhs` must be the same vector field that produced
   * the pushed states and `dt` the step between consecutive `push` calls.
   * Pass `null` to fall back to linear interpolation.
   */
  setRefiner(rhs: Derivative | null, dt = 0): void {
    this.refineRhs = rhs;
    this.refineDt = dt;
  }

  private ensureWork(dim: number): void {
    if (this.workDim === dim) return;
    this.workDim = dim;
    this.k1 = new Float64Array(dim);
    this.k2 = new Float64Array(dim);
    this.k3 = new Float64Array(dim);
    this.k4 = new Float64Array(dim);
    this.tmp = new Float64Array(dim);
    this.refineScratch = new Float64Array(dim);
  }

  private copyStateInto(target: Float64Array, state: ArrayLike<number>): void {
    for (let i = 0; i < target.length; i += 1) target[i] = state[i] ?? 0;
  }

  /** One RK4 step of size h from `from` into `out` using the refiner RHS. */
  private rk4Into(from: Float64Array, h: number, out: Float64Array): void {
    const rhs = this.refineRhs!;
    const n = from.length;
    this.ensureWork(n);
    const { k1, k2, k3, k4, tmp } = this;
    rhs(from, k1);
    for (let i = 0; i < n; i += 1) tmp[i] = from[i]! + (h / 2) * k1[i]!;
    rhs(tmp, k2);
    for (let i = 0; i < n; i += 1) tmp[i] = from[i]! + (h / 2) * k2[i]!;
    rhs(tmp, k3);
    for (let i = 0; i < n; i += 1) tmp[i] = from[i]! + h * k3[i]!;
    rhs(tmp, k4);
    for (let i = 0; i < n; i += 1) out[i] = from[i]! + (h / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!);
  }

  /**
   * Root-find θ₁(τ) = 0 for τ ∈ (0, dt] starting from the bracketing state.
   * Secant iteration with the linear-interpolation estimate as the seed; each
   * evaluation integrates the actual flow, so the result converges to the true
   * crossing of the numerical trajectory.
   */
  private refineCrossing(previous: Float64Array, linearFrac: number): Point2D | null {
    const dt = this.refineDt;
    this.ensureWork(previous.length);
    const scratch = this.refineScratch;
    const thetaAt = (tau: number): number => {
      if (tau <= 0) return previous[0]!;
      this.rk4Into(previous, tau, scratch);
      return scratch[0]!;
    };
    let tau0 = 0;
    let f0 = previous[0]!;
    let tau1 = Math.min(dt, Math.max(1e-12, linearFrac * dt));
    let f1 = thetaAt(tau1);
    for (let iter = 0; iter < 8 && Math.abs(f1) > 1e-12; iter += 1) {
      const denom = f1 - f0;
      if (denom === 0) break;
      const next = Math.min(dt, Math.max(0, tau1 - f1 * ((tau1 - tau0) / denom)));
      tau0 = tau1;
      f0 = f1;
      tau1 = next;
      f1 = thetaAt(tau1);
    }
    if (!Number.isFinite(f1)) return null;
    // `scratch` holds the state at tau1 (thetaAt evaluated it last).
    return { x: scratch[1]!, y: scratch[3]! };
  }

  /**
   * Push one state. Returns the new section point when this step crossed the
   * section, otherwise null.
   */
  push(state: ArrayLike<number>): Point2D | null {
    const length = state.length;
    if (!this.prev || this.prev.length !== length) {
      this.prev = new Float64Array(length);
      this.copyStateInto(this.prev, state);
      return null;
    }

    const t1 = Number(state[0] ?? 0);
    const w1 = Number(state[2] ?? 0);
    const previous = this.prev;
    const t1Prev = previous[0]!;
    // Rising crossing of θ1 = 0 (θ̇1 > 0): previous below 0, current at/above 0.
    const rising = t1Prev < 0 && t1 >= 0 && w1 > 0;
    const falling = t1Prev > 0 && t1 <= 0 && w1 < 0;
    if (this.direction === 'rising' && !rising) {
      this.copyStateInto(previous, state);
      return null;
    }
    if (this.direction === 'falling' && !falling) {
      this.copyStateInto(previous, state);
      return null;
    }
    if (this.direction === 'both' && !rising && !falling) {
      this.copyStateInto(previous, state);
      return null;
    }

    // Linear interpolation factor to the zero crossing.
    const denom = t1 - t1Prev;
    const frac = denom === 0 ? 0 : -t1Prev / denom;

    let point: Point2D | null = null;
    if (this.refineRhs && this.refineDt > 0) {
      point = this.refineCrossing(previous, frac);
    }
    if (!point) {
      const t2 = previous[1]! + frac * (Number(state[1] ?? 0) - previous[1]!);
      const w2 = previous[3]! + frac * (Number(state[3] ?? 0) - previous[3]!);
      point = { x: t2, y: w2 };
    }
    this.points.push(point);
    if (this.points.length > this.cap) this.points.splice(0, this.points.length - this.cap);
    this.copyStateInto(previous, state);
    return point;
  }
}
