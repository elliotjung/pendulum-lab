import { gaussianSampler } from './stochastic';
import { duffingDoubleWell, type DuffingParameters } from './duffing';
import {
  assertUsableIntegrationStep,
  checkedWorkProduct,
  NUMERICAL_WORK_BUDGETS
} from '../validation/numericalBudgets';

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
  if (!Number.isFinite(wellFrequency) || !(wellFrequency > 0)) {
    throw new Error('kramersRateOverdamped: wellFrequency must be finite and positive');
  }
  if (!Number.isFinite(barrierFrequency) || !(barrierFrequency > 0)) {
    throw new Error('kramersRateOverdamped: barrierFrequency must be finite and positive');
  }
  if (!Number.isFinite(diffusion) || !(diffusion > 0)) {
    throw new Error('kramersRateOverdamped: diffusion D must be finite and positive');
  }
  if (!Number.isFinite(barrierHeight) || !(barrierHeight > 0)) {
    throw new Error('kramersRateOverdamped: barrierHeight must be finite and positive');
  }
  // Stay in the log domain so finite extremes saturate honestly to 0/Infinity
  // instead of producing the indeterminate arithmetic Infinity * 0 = NaN.
  const logRate =
    Math.log(wellFrequency) + Math.log(barrierFrequency) - Math.log(2 * Math.PI) - barrierHeight / diffusion;
  return Math.exp(logRate);
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
  if (!Number.isFinite(attemptRate) || !(attemptRate > 0)) {
    throw new Error('arrheniusMTTF: attemptRate must be finite and positive');
  }
  if (!Number.isFinite(activationEnergy)) throw new Error('arrheniusMTTF: activationEnergy must be finite');
  if (!Number.isFinite(kT) || !(kT > 0)) throw new Error('arrheniusMTTF: kT must be finite and positive');
  // exp(E/kT - log(r0)) avoids multiplying underflow and overflow endpoints.
  return Math.exp(activationEnergy / kT - Math.log(attemptRate));
}

export interface QuarticEscapeSpec {
  /** Noise amplitude σ in dx = (x - x³) dt + σ dW for U(x) = -x²/2 + x⁴/4. */
  sigma: number;
  /** Time step (> 0). */
  dt: number;
  /** Independent seeded realizations to average (≥ 1). */
  realizations: number;
  /** Uint32 PRNG seed (realization r uses a wrapped derived seed). */
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
  const budget = NUMERICAL_WORK_BUDGETS.quarticEscape;
  if (!Number.isFinite(sigma) || !(sigma > 0))
    throw new Error('simulateQuarticEscape: sigma must be finite and positive');
  assertUsableIntegrationStep(dt, 'simulateQuarticEscape');
  if (!Number.isSafeInteger(realizations) || realizations < 1 || realizations > budget.maxRealizations) {
    throw new RangeError(
      `simulateQuarticEscape: realizations must be a safe integer in [1, ${budget.maxRealizations}]`
    );
  }
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError('simulateQuarticEscape: seed must be a uint32 integer');
  }
  const threshold = spec.threshold ?? 0;
  const x0 = spec.x0 ?? -1;
  const maxSteps = spec.maxSteps ?? 4_000_000;
  if (!Number.isFinite(threshold)) throw new TypeError('simulateQuarticEscape: threshold must be finite');
  if (!Number.isFinite(x0)) throw new TypeError('simulateQuarticEscape: x0 must be finite');
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > budget.maxSteps) {
    throw new RangeError(`simulateQuarticEscape: maxSteps must be a safe integer in [1, ${budget.maxSteps}]`);
  }
  const totalStepBudget = checkedWorkProduct([realizations, maxSteps], 'simulateQuarticEscape');
  if (totalStepBudget > budget.maxTotalSteps) {
    throw new RangeError(`simulateQuarticEscape: total work exceeds ${budget.maxTotalSteps} integration steps`);
  }
  if (x0 >= threshold) {
    return { meanFirstPassage: 0, rate: Number.POSITIVE_INFINITY, escaped: realizations, realizations };
  }
  const sqrtDt = Math.sqrt(dt);
  let passageSum = 0;
  let escaped = 0;
  for (let r = 0; r < realizations; r += 1) {
    const gaussian = gaussianSampler((seed + r) >>> 0);
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
