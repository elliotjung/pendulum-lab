import type { Derivative } from '../physics/types';
import { rk4Step } from '../physics/integrators';
import { mulberry32 } from '../chaos/variational';

/**
 * Incremental maximal-Lyapunov estimator (Benettin two-trajectory method) for
 * the live Lab λ panel. A shadow trajectory is integrated alongside the
 * reference; every `renormEvery` steps their separation is measured, its log
 * growth accumulated, and the shadow rescaled back to the initial separation.
 *
 * Unlike the batch `maximalLyapunov`, this version is driven one step at a time
 * by whatever loop owns the reference trajectory, so it produces a running
 * estimate and convergence curve in real time.
 */
export class LyapunovEstimator {
  private static readonly MAX_DIMENSION = 256;
  private static readonly MAX_HISTORY = 10_000;
  private readonly shadow: Float64Array;
  private readonly out: Float64Array;
  private readonly convergence: number[] = [];
  private convergenceStart = 0;
  private convergenceCache: number[] | null = null;
  private logSum = 0;
  private elapsed = 0;
  private counter = 0;
  private started = false;

  constructor(
    private readonly rhs: Derivative,
    private readonly dim: number,
    private readonly dt: number,
    private readonly d0 = 1e-8,
    private readonly renormEvery = 10,
    private readonly seed = 0x9e37
  ) {
    if (typeof rhs !== 'function') throw new TypeError('Lyapunov rhs must be a function');
    if (!Number.isSafeInteger(dim) || dim < 1 || dim > LyapunovEstimator.MAX_DIMENSION) {
      throw new RangeError(`Lyapunov dimension must be a safe integer in [1, ${LyapunovEstimator.MAX_DIMENSION}]`);
    }
    if (!Number.isFinite(dt) || dt <= 0 || dt > 1) throw new RangeError('Lyapunov dt must be finite and in (0, 1]');
    if (!Number.isFinite(d0) || d0 <= 0) throw new RangeError('Lyapunov d0 must be finite and greater than zero');
    if (!Number.isSafeInteger(renormEvery) || renormEvery < 1 || renormEvery > 1_000_000) {
      throw new RangeError('Lyapunov renormEvery must be a safe integer in [1, 1000000]');
    }
    if (!Number.isSafeInteger(seed)) throw new RangeError('Lyapunov seed must be a safe integer');
    this.shadow = new Float64Array(dim);
    this.out = new Float64Array(dim);
  }

  private validatedReference(reference: ArrayLike<number>): void {
    if (!Number.isSafeInteger(reference.length) || reference.length !== this.dim) {
      throw new RangeError(`Lyapunov reference must contain exactly ${this.dim} values`);
    }
    for (let i = 0; i < this.dim; i += 1) {
      if (!Object.hasOwn(reference, i) || !Number.isFinite(reference[i])) {
        throw new RangeError(`Lyapunov reference must be dense and finite at index ${i}`);
      }
    }
  }

  private appendConvergence(value: number): void {
    if (this.convergence.length < LyapunovEstimator.MAX_HISTORY) this.convergence.push(value);
    else {
      this.convergence[this.convergenceStart] = value;
      this.convergenceStart = (this.convergenceStart + 1) % LyapunovEstimator.MAX_HISTORY;
    }
    this.convergenceCache = null;
  }

  /** Seed the shadow a distance d0 from the reference along a random direction. */
  reset(reference: ArrayLike<number>): void {
    this.validatedReference(reference);
    const rng = mulberry32(this.seed);
    const dir = new Float64Array(this.dim);
    let norm = 0;
    for (let i = 0; i < this.dim; i += 1) {
      const v = rng() - 0.5;
      dir[i] = v;
      norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < this.dim; i += 1) this.shadow[i] = Number(reference[i] ?? 0) + (this.d0 / norm) * dir[i]!;
    this.logSum = 0;
    this.elapsed = 0;
    this.counter = 0;
    this.convergence.length = 0;
    this.convergenceStart = 0;
    this.convergenceCache = null;
    this.started = true;
  }

  /** Advance the shadow one reference step; renormalize on schedule. */
  step(reference: ArrayLike<number>): void {
    this.validatedReference(reference);
    if (!this.started) this.reset(reference);
    rk4Step(this.shadow, this.dt, this.rhs, this.out);
    for (let i = 0; i < this.dim; i += 1) {
      if (!Number.isFinite(this.out[i]))
        throw new Error(`Lyapunov integrator produced a non-finite value at index ${i}`);
    }
    this.shadow.set(this.out);
    this.counter += 1;
    if (this.counter < this.renormEvery) return;
    this.counter = 0;

    const differences = new Float64Array(this.dim);
    for (let i = 0; i < this.dim; i += 1) {
      const diff = this.shadow[i]! - Number(reference[i] ?? 0);
      differences[i] = diff;
    }
    const d = Math.hypot(...differences);
    if (!Number.isFinite(d)) throw new Error('Lyapunov separation became non-finite');
    if (d <= Number.MIN_VALUE) {
      this.shadow.set(reference);
      this.shadow[0] = Number(reference[0]) + this.d0;
      return;
    }
    this.logSum += Math.log(d / this.d0);
    this.elapsed += this.renormEvery * this.dt;
    const estimate = this.logSum / this.elapsed;
    if (!Number.isFinite(estimate)) throw new Error('Lyapunov estimate became non-finite');
    this.appendConvergence(estimate);
    const scale = this.d0 / d;
    for (let i = 0; i < this.dim; i += 1) {
      const ref = Number(reference[i] ?? 0);
      this.shadow[i] = ref + scale * (this.shadow[i]! - ref);
    }
  }

  /** Current running estimate of the maximal Lyapunov exponent. */
  value(): number {
    return this.elapsed > 0 ? this.logSum / this.elapsed : 0;
  }

  /** Convergence curve (one entry per renormalization). */
  history(): readonly number[] {
    if (this.convergenceStart === 0) return this.convergence;
    if (!this.convergenceCache) {
      this.convergenceCache = this.convergence
        .slice(this.convergenceStart)
        .concat(this.convergence.slice(0, this.convergenceStart));
    }
    return this.convergenceCache;
  }
}
