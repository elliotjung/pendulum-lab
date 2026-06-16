import type { Derivative, StateVector } from '../physics/types';
import type { IntegratorId } from '../types/domain';
import { step } from '../physics/integrators';

/**
 * Structure preservation on long conservative runs — quantifying *bounded* vs
 * *secular* energy drift across integrators.
 *
 * A non-symmetric explicit method (rk4, dopri) accumulates a slow, monotone
 * energy error: over thousands of periods the relative drift grows roughly
 * linearly in time (secular). A *time-symmetric* / symplectic method (the
 * implicit-midpoint `hmidpoint` and the 2-stage Gauss collocation `gauss2`,
 * already available through the shared {@link step} dispatch and the chain
 * integrators' `method` option) has, for a reversible system, an energy error
 * that merely *oscillates* within a bounded band with no secular trend — the
 * defining benefit of a structure-preserving integrator on conservative
 * dynamics. (For the chains in (θ, ω) coordinates the mechanism is the method's
 * time-reversibility rather than strict canonical symplecticity, which would
 * require (q, p) coordinates; the bounded-drift consequence is the same and is
 * what this module measures.)
 *
 * This is the long-time analogue of the per-step `empiricalOrder` certification:
 * it turns "use a symplectic integrator for long runs" from advice into a
 * measured, falsifiable number.
 */

export interface EnergyDriftProfileOptions {
  method: IntegratorId;
  /** Right-hand side ẏ = f(y). */
  rhs: Derivative;
  /** Total mechanical energy of a state (the conserved quantity). */
  energy: (state: StateVector) => number;
  initialState: ArrayLike<number>;
  dt: number;
  /** Total integration time (many oscillation periods). */
  totalTime: number;
  /** Number of equally spaced drift samples (≥ 3). Default 16. */
  samples?: number;
  /** Implicit-solver tolerance forwarded to {@link step}. Default 1e-12. */
  tolerance?: number;
}

export interface EnergyDriftProfile {
  method: IntegratorId;
  /** Relative energy drift (E(t) − E₀)/|E₀| at each sample time. */
  drift: number[];
  times: number[];
  /** max_t |relative drift|. */
  maxAbsDrift: number;
  /** Least-squares slope of relative drift vs time. */
  secularSlope: number;
  /** |slope · totalTime| — the secular component accumulated over the whole run. */
  secularComponent: number;
  /** R² of the linear drift-vs-time fit: ≈1 for a monotone trend, low for a bounded oscillation. */
  trendR2: number;
  /**
   * True when the drift is a monotone trend (secular) rather than a bounded
   * oscillation: a well-fit line (high R²) whose accumulated change dominates
   * the band. A bounded oscillation fails the R² test even if its slope is noisy.
   */
  secular: boolean;
  method_note: string;
}

/** Ordinary-least-squares slope and R² of y vs x. */
function linearFit(xs: readonly number[], ys: readonly number[]): { slope: number; r2: number } {
  const n = xs.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) {
    mx += xs[i]!;
    my += ys[i]!;
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const r2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  return { slope, r2 };
}

/**
 * Integrate a conservative system for `totalTime` with the chosen integrator and
 * report the relative-energy-drift profile, classified as bounded or secular.
 */
export function energyDriftProfile(options: EnergyDriftProfileOptions): EnergyDriftProfile {
  const samples = Math.max(3, options.samples ?? 16);
  const tolerance = options.tolerance ?? 1e-12;
  const n = options.initialState.length;
  const state = Float64Array.from({ length: n }, (_, i) => Number(options.initialState[i] ?? 0)) as StateVector;
  const out = new Float64Array(n) as StateVector;
  const energy0 = options.energy(state);
  const denom = Math.abs(energy0) || 1;

  const totalSteps = Math.max(samples, Math.round(options.totalTime / options.dt));
  const sampleEvery = Math.floor(totalSteps / samples);
  const stepOptions = { previousError: { value: 0 }, tolerance };

  const drift: number[] = [];
  const times: number[] = [];
  for (let i = 0; i < totalSteps; i += 1) {
    step(options.method, state, options.dt, options.rhs, out, stepOptions);
    state.set(out);
    if ((i + 1) % sampleEvery === 0 && drift.length < samples) {
      drift.push((options.energy(state) - energy0) / denom);
      times.push((i + 1) * options.dt);
    }
  }

  let maxAbsDrift = 0;
  for (const d of drift) maxAbsDrift = Math.max(maxAbsDrift, Math.abs(d));
  const { slope: secularSlope, r2: trendR2 } = linearFit(times, drift);
  const secularComponent = Math.abs(secularSlope) * options.totalTime;
  // Secular = a well-fit monotone trend whose accumulated change dominates the band.
  // A bounded oscillation has a low R², so a noisy slope alone never trips this.
  const secular = maxAbsDrift > 0 && trendR2 >= 0.75 && secularComponent >= 0.5 * maxAbsDrift;

  return {
    method: options.method,
    drift,
    times,
    maxAbsDrift,
    secularSlope,
    secularComponent,
    trendR2,
    secular,
    method_note: secular
      ? 'Secular drift: a monotone energy trend dominates — the integrator is not structure-preserving on this conservative run.'
      : 'Bounded drift: the energy error oscillates within a band with no secular trend — structure-preserving behaviour.'
  };
}
