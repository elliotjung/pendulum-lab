import type { DrivenParameters } from '../physics/driven';

/**
 * Melnikov analysis of the damped driven pendulum — the *analytic* chaos
 * threshold, complementing the numerical detectors (Lyapunov, 0–1 test, RQA).
 *
 * Non-dimensionalise θ̈ = −ω₀² sin θ − γ θ̇ + A cos(ωt) with τ = ω₀ t
 * (ω₀² = g/l):
 *
 *     θ'' + sin θ = ε[ −δ θ' + f cos(Ω τ) ],   δ = γ/ω₀,  f = A/ω₀²,  Ω = ω/ω₀.
 *
 * The unperturbed separatrix is θ₀(τ) = 2 arctan(sinh τ), θ₀'(τ) = 2 sech τ.
 * The Melnikov function along it evaluates in closed form:
 *
 *     M(τ₀) = ∫ θ₀'(τ) [ −δ θ₀'(τ) + f cos(Ω(τ + τ₀)) ] dτ
 *           = −8δ + 2π f sech(πΩ/2) cos(Ω τ₀),
 *
 * using ∫ 4 sech² = 8 and ∫ 2 sech τ cos(Ωτ) dτ = 2π sech(πΩ/2) (the odd sine
 * part vanishes). Simple zeros — transverse homoclinic intersection, hence a
 * Smale-horseshoe tangle — exist iff 2π f sech(πΩ/2) > 8δ, i.e.
 *
 *     A > A_c = (4 γ ω₀ / π) cosh(π ω / (2 ω₀)).
 *
 * Scope: M is the first-order term of a perturbation expansion, so A_c is
 * asymptotically exact only for small damping/forcing; at moderate γ it is a
 * guide, not an exact onset. The tangle it predicts produces transient chaos
 * and fractal basin boundaries — a sustained chaotic *attractor* generally
 * appears somewhat above A_c (e.g. via the period-doubling cascade).
 */

export interface MelnikovScaled {
  /** Natural frequency ω₀ = √(g/l). */
  omega0: number;
  /** Scaled damping δ = γ/ω₀. */
  delta: number;
  /** Scaled drive amplitude f = A/ω₀². */
  f: number;
  /** Scaled drive frequency Ω = ω/ω₀. */
  Omega: number;
}

export interface MelnikovVerdict extends MelnikovScaled {
  /** Critical drive amplitude A_c in the original (unscaled) units. */
  criticalAmplitude: number;
  /** A / A_c — > 1 predicts a homoclinic tangle. */
  amplitudeRatio: number;
  /** Whether the Melnikov function has simple zeros (transverse intersection). */
  predictsHomoclinicTangle: boolean;
}

/** Scaled (non-dimensional) parameters of the driven pendulum. */
export function melnikovScaled(p: DrivenParameters): MelnikovScaled {
  const omega0 = Math.sqrt(p.g / p.length);
  return {
    omega0,
    delta: p.damping / omega0,
    f: p.driveAmplitude / (omega0 * omega0),
    Omega: p.driveFrequency / omega0
  };
}

/** Closed-form critical drive amplitude A_c = (4γω₀/π)·cosh(πω/(2ω₀)). */
export function melnikovCriticalAmplitude(p: DrivenParameters): number {
  const omega0 = Math.sqrt(p.g / p.length);
  return ((4 * p.damping * omega0) / Math.PI) * Math.cosh((Math.PI * p.driveFrequency) / (2 * omega0));
}

/** Closed-form Melnikov function M(τ₀) = −8δ + 2πf·sech(πΩ/2)·cos(Ωτ₀) (scaled time). */
export function melnikovFunction(tau0: number, p: DrivenParameters): number {
  const { delta, f, Omega } = melnikovScaled(p);
  return -8 * delta + 2 * Math.PI * f * (1 / Math.cosh((Math.PI * Omega) / 2)) * Math.cos(Omega * tau0);
}

/**
 * The same Melnikov integral evaluated by direct quadrature along the analytic
 * separatrix (Simpson's rule on τ ∈ [−L, L]; the sech² weight decays like
 * e^{−2|τ|}, so L = 40 is far beyond round-off). This is an independent check
 * of the closed form — analytic special-function identities vs brute-force
 * numerical integration.
 */
export function melnikovFunctionNumeric(
  tau0: number,
  p: DrivenParameters,
  options: { halfWidth?: number; intervals?: number } = {}
): number {
  const { delta, f, Omega } = melnikovScaled(p);
  const L = options.halfWidth ?? 40;
  // Simpson needs an even interval count.
  const n = 2 * Math.max(1, Math.round((options.intervals ?? 80000) / 2));
  const h = (2 * L) / n;
  const integrand = (tau: number): number => {
    const v = 2 / Math.cosh(tau); // θ₀'(τ)
    return v * (-delta * v + f * Math.cos(Omega * (tau + tau0)));
  };
  let sum = integrand(-L) + integrand(L);
  for (let i = 1; i < n; i += 1) {
    sum += integrand(-L + i * h) * (i % 2 === 1 ? 4 : 2);
  }
  return (sum * h) / 3;
}

/** Full verdict: scaled parameters, A_c, and whether a homoclinic tangle is predicted. */
export function melnikovVerdict(p: DrivenParameters): MelnikovVerdict {
  const scaled = melnikovScaled(p);
  const criticalAmplitude = melnikovCriticalAmplitude(p);
  const amplitudeRatio = criticalAmplitude > 0 ? p.driveAmplitude / criticalAmplitude : Number.POSITIVE_INFINITY;
  return {
    ...scaled,
    criticalAmplitude,
    amplitudeRatio,
    predictsHomoclinicTangle: p.driveAmplitude > criticalAmplitude
  };
}
