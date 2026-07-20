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
 * the engine: angles first, then angular velocities — [θ1, θ2, ω1, ω2] for a
 * double pendulum and [θ1, θ2, θ3, ω1, ω2, ω3] for a triple pendulum.
 */
export class PoincareAccumulator {
  private static readonly MAX_CAPACITY = 100_000;
  private readonly points: Point2D[] = [];
  private pointStart = 0;
  private orderedPoints: readonly Point2D[] | null = null;
  private prev: Float64Array | null = null;
  private cap: number;
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
    this.cap = PoincareAccumulator.validCapacity(cap);
    this.direction = direction;
  }

  private static validCapacity(cap: number): number {
    if (!Number.isFinite(cap) || !Number.isSafeInteger(cap) || cap > PoincareAccumulator.MAX_CAPACITY) {
      throw new RangeError(
        `PoincareAccumulator capacity must be a safe integer up to ${PoincareAccumulator.MAX_CAPACITY}.`
      );
    }
    return Math.max(1, cap);
  }

  /** Number of recorded section points. */
  get size(): number {
    return this.points.length;
  }

  get capacity(): number {
    return this.cap;
  }

  /**
   * Retarget the retention cap (quality profiles expose this as a user-facing
   * memory budget). Shrinking drops the oldest points immediately; growing
   * keeps everything already recorded.
   */
  setCapacity(cap: number): void {
    const nextCapacity = PoincareAccumulator.validCapacity(cap);
    const retained = this.list().slice(-nextCapacity);
    this.cap = nextCapacity;
    this.points.length = 0;
    this.points.push(...retained);
    this.pointStart = 0;
    this.orderedPoints = this.points;
  }

  policy(): { capacity: number; direction: 'rising' | 'falling' | 'both'; refined: boolean } {
    return {
      capacity: this.cap,
      direction: this.direction,
      refined: Boolean(this.refineRhs && this.refineDt > 0)
    };
  }

  list(): readonly Point2D[] {
    if (this.pointStart === 0) return this.points;
    this.orderedPoints ??= [...this.points.slice(this.pointStart), ...this.points.slice(0, this.pointStart)];
    return this.orderedPoints;
  }

  toFloat32Pairs(): Float32Array {
    const points = this.list();
    const out = new Float32Array(points.length * 2);
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i]!;
      out[i * 2] = p.x;
      out[i * 2 + 1] = p.y;
    }
    return out;
  }

  clear(): void {
    this.points.length = 0;
    this.pointStart = 0;
    this.orderedPoints = null;
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
  private refineCrossing(previous: Float64Array, sectionAngle: number): Point2D | null {
    const dt = this.refineDt;
    this.ensureWork(previous.length);
    const scratch = this.refineScratch;
    const thetaAt = (tau: number): number => {
      if (tau <= 0) return previous[0]! - sectionAngle;
      this.rk4Into(previous, tau, scratch);
      return scratch[0]! - sectionAngle;
    };
    let lo = 0;
    let hi = dt;
    let fLo = thetaAt(lo);
    let fHi = thetaAt(hi);
    if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;
    let tau = hi;
    let residual = fHi;
    for (let iter = 0; iter < 32; iter += 1) {
      const secant = hi - fHi * ((hi - lo) / (fHi - fLo));
      tau = Number.isFinite(secant) && secant > lo && secant < hi ? secant : (lo + hi) / 2;
      residual = thetaAt(tau);
      if (!Number.isFinite(residual)) return null;
      if (Math.abs(residual) <= 1e-11 || hi - lo <= Math.max(1e-12, dt * 1e-10)) break;
      if (fLo * residual <= 0) {
        hi = tau;
        fHi = residual;
      } else {
        lo = tau;
        fLo = residual;
      }
    }
    if (Math.abs(residual) > 1e-8) return null;
    thetaAt(tau);
    const velocityOffset = scratch.length / 2;
    return { x: scratch[1]!, y: scratch[velocityOffset + 1]! };
  }

  /**
   * Push one state. Returns the new section point when this step crossed the
   * section, otherwise null.
   */
  push(state: ArrayLike<number>): Point2D | null {
    const length = state.length;
    if (length < 4 || length % 2 !== 0) {
      this.prev = null;
      return null;
    }
    if (!this.prev || this.prev.length !== length) {
      this.prev = new Float64Array(length);
      this.copyStateInto(this.prev, state);
      return null;
    }

    const t1 = Number(state[0] ?? 0);
    const velocityOffset = length / 2;
    const w1 = Number(state[velocityOffset] ?? 0);
    const previous = this.prev;
    const t1Prev = previous[0]!;
    // Treat every 2π-equivalent θ1 section as the same physical crossing so
    // rotating trajectories are not lost after their first revolution.
    const turn = Math.PI * 2;
    const risingSection = (Math.floor(t1Prev / turn) + 1) * turn;
    const fallingSection = (Math.ceil(t1Prev / turn) - 1) * turn;
    const rising = t1 > t1Prev && risingSection <= t1 && w1 > 0;
    const falling = t1 < t1Prev && fallingSection >= t1 && w1 < 0;
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
    const sectionAngle = rising ? risingSection : fallingSection;
    const denom = t1 - t1Prev;
    const frac = denom === 0 ? 0 : (sectionAngle - t1Prev) / denom;

    let point: Point2D | null = null;
    if (this.refineRhs && this.refineDt > 0) {
      point = this.refineCrossing(previous, sectionAngle);
    }
    if (!point) {
      const t2 = previous[1]! + frac * (Number(state[1] ?? 0) - previous[1]!);
      const w2 =
        previous[velocityOffset + 1]! + frac * (Number(state[velocityOffset + 1] ?? 0) - previous[velocityOffset + 1]!);
      point = { x: t2, y: w2 };
    }
    if (this.points.length < this.cap) this.points.push(point);
    else {
      this.points[this.pointStart] = point;
      this.pointStart = (this.pointStart + 1) % this.cap;
    }
    this.orderedPoints = null;
    this.copyStateInto(previous, state);
    return point;
  }
}
