import { gaussianSampler } from './stochastic';
import { duffingDoubleWell, type DuffingParameters } from './duffing';

/**
 * Kramers escape rate — the noise-activated hopping rate of a particle out of a
 * metastable well over a barrier. It is the dynamical heart of thermally
 * activated *failure*: the semiconductor-reliability laws for electromigration,
 * NBTI and hot-carrier degradation are all Arrhenius rates r = r₀·exp(-E_a/k_BT)
 * with exactly this structure, so the same formula that times a double-well
 * pendulum's noise-driven flips times a device's mean-time-to-failure.
 *
 * In the overdamped (Smoluchowski / high-friction) regime, for the Langevin
 * equation dx = -U'(x) dt + σ dW with diffusion D = σ²/2 ("k_BT"), the escape
 * rate from a well of curvature U''(x_min) = ω₀² over a barrier of curvature
 * |U''(x_b)| = ω_b² and height ΔU is
 *
 *   r_K = (ω₀ ω_b) / (2π) · exp(-ΔU / D).
 *
 * The Arrhenius *exponent* ΔU/D is asymptotically exact; the prefactor is a
 * high-barrier approximation, so Monte-Carlo escape rates match the exponent
 * tightly and the prefactor only to within a small factor at moderate barriers.
 */
export interface OverdampedRateSpec {
  /** Well angular frequency ω₀ = √(U''(x_min)) (> 0). */
  wellFrequency: number;
  /** Barrier angular frequency ω_b = √(|U''(x_b)|) (> 0). */
  barrierFrequency: number;
  /** Barrier height ΔU = U(x_b) - U(x_min) (> 0). */
  barrierHeight: number;
  /** Diffusion D = σ²/2, the "thermal energy" k_BT of the overdamped Langevin SDE (> 0). */
  diffusion: number;
}

/** Overdamped (Smoluchowski) Kramers escape rate r = (ω₀ ω_b)/(2π)·exp(-ΔU/D). */
export function kramersRateOverdamped(spec: OverdampedRateSpec): number {
  const { wellFrequency, barrierFrequency, barrierHeight, diffusion } = spec;
  if (!(diffusion > 0)) throw new Error('kramersRateOverdamped: diffusion D must be positive');
  if (!(barrierHeight > 0)) throw new Error('kramersRateOverdamped: barrierHeight must be positive');
  return ((wellFrequency * barrierFrequency) / (2 * Math.PI)) * Math.exp(-barrierHeight / diffusion);
}

/** Mean first-passage (escape) time, the reciprocal of the Kramers rate. */
export function kramersMeanFirstPassage(spec: OverdampedRateSpec): number {
  return 1 / kramersRateOverdamped(spec);
}

/**
 * Kramers escape rate for a Duffing double well (α < 0, β > 0) at diffusion D,
 * reading ω₀ = √(-2α), ω_b = √(-α), ΔU = α²/(4β) from {@link duffingDoubleWell}.
 * Connects the deterministic Duffing potential to its noise-activated hopping.
 */
export function duffingKramersRate(
  parameters: Pick<DuffingParameters, 'linearStiffness' | 'cubicStiffness'>,
  diffusion: number
): number {
  const well = duffingDoubleWell(parameters);
  return kramersRateOverdamped({
    wellFrequency: well.wellFrequency,
    barrierFrequency: well.barrierFrequency,
    barrierHeight: well.barrierHeight,
    diffusion
  });
}

/**
 * Arrhenius mean-time-to-failure MTTF = (1/r₀)·exp(E_a / k_BT) — the
 * reliability-engineering face of Kramers escape (E_a ↔ barrier ΔU, k_BT ↔
 * diffusion D, attempt rate r₀ ↔ ω₀ω_b/2π). Used to map activated device
 * degradation onto the same exponential law.
 */
export function arrheniusMTTF(attemptRate: number, activationEnergy: number, kT: number): number {
  if (!(attemptRate > 0)) throw new Error('arrheniusMTTF: attemptRate must be positive');
  if (!(kT > 0)) throw new Error('arrheniusMTTF: kT must be positive');
  return (1 / attemptRate) * Math.exp(activationEnergy / kT);
}

export interface QuarticEscapeSpec {
  /** Noise amplitude σ in dx = (x - x³) dt + σ dW for U(x) = -x²/2 + x⁴/4. */
  sigma: number;
  /** Time step (> 0). */
  dt: number;
  /** Independent seeded realizations to average (≥ 1). */
  realizations: number;
  /** PRNG seed (realization r uses seed + r). */
  seed: number;
  /** First-passage threshold; default 0 (the barrier top). */
  threshold?: number;
  /** Start position; default -1 (left well bottom). */
  x0?: number;
  /** Per-realization step cap; default 4,000,000. */
  maxSteps?: number;
}

export interface QuarticEscapeResult {
  /** Empirical mean first-passage time to the threshold, averaged over escapees. */
  meanFirstPassage: number;
  /** Empirical escape rate 1/⟨τ⟩. */
  rate: number;
  /** Number of realizations that escaped within the step cap. */
  escaped: number;
  realizations: number;
}

/**
 * Monte-Carlo cross-check of the Kramers rate for the canonical quartic well
 * U(x) = -x²/2 + x⁴/4 (the same SDE that drives stochastic resonance, with no
 * periodic drive). Integrates the overdamped Langevin equation with
 * Euler–Maruyama from the left well and records the first-passage time to the
 * barrier, averaged over seeded realizations. Deterministic for a given seed.
 */
export function simulateQuarticEscape(spec: QuarticEscapeSpec): QuarticEscapeResult {
  const { sigma, dt, realizations, seed } = spec;
  if (!(sigma > 0)) throw new Error('simulateQuarticEscape: sigma must be positive');
  if (!(dt > 0)) throw new Error('simulateQuarticEscape: dt must be positive');
  if (!(realizations >= 1)) throw new Error('simulateQuarticEscape: realizations must be >= 1');
  const threshold = spec.threshold ?? 0;
  const x0 = spec.x0 ?? -1;
  const maxSteps = spec.maxSteps ?? 4_000_000;
  const sqrtDt = Math.sqrt(dt);
  let passageSum = 0;
  let escaped = 0;
  for (let r = 0; r < realizations; r += 1) {
    const gaussian = gaussianSampler(seed + r);
    let x = x0;
    for (let i = 1; i <= maxSteps; i += 1) {
      x = x + (x - x * x * x) * dt + sigma * sqrtDt * gaussian();
      if (x >= threshold) {
        passageSum += i * dt;
        escaped += 1;
        break;
      }
    }
  }
  const meanFirstPassage = escaped > 0 ? passageSum / escaped : Infinity;
  return {
    meanFirstPassage,
    rate: 1 / meanFirstPassage,
    escaped,
    realizations
  };
}
