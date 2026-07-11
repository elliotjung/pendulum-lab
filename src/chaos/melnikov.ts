import type { DrivenParameters } from '../physics/driven';
import type { DuffingParameters } from '../physics/duffing';

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

/*
 * ---- Duffing double well ---------------------------------------------------
 *
 * Same first-order machinery for the second canonical system,
 * x'' = −δ x' − α x − β x³ + Γ cos(ωt) with a symmetric double well
 * (α < 0, β > 0; write a = −α > 0). The unperturbed homoclinic pair is
 *
 *     x₀(t) = ±√(2a/β) sech(√a t),   v₀(t) = ∓√(2a/β)·√a·sech(√a t)tanh(√a t),
 *
 * and the Melnikov integral evaluates in closed form with
 * ∫ sech²u tanh²u du = 2/3 and ∫ sech u tanh u sin(Ωu) du = πΩ sech(πΩ/2):
 *
 *     M(t₀) = ±√(2a/β)·(πω/√a)·sech(πω/(2√a))·Γ sin(ωt₀) − (4δ a^{3/2})/(3β).
 *
 * Simple zeros — a transverse homoclinic tangle — exist iff
 *
 *     Γ > Γ_c = 4 δ a² cosh(πω/(2√a)) / (3πω √(2aβ)),
 *
 * which reduces to the textbook Γ_c = (2√2/3)·δ cosh(πω/2)/(πω) at a = β = 1
 * (Guckenheimer & Holmes §4.5). The same scope caveat as the pendulum applies:
 * first-order in (δ, Γ), a guide rather than an exact onset at moderate damping.
 */

/** Closed-form Duffing double-well critical drive Γ_c (requires α < 0, β > 0). */
export function melnikovCriticalAmplitudeDuffing(p: Pick<DuffingParameters, 'damping' | 'linearStiffness' | 'cubicStiffness' | 'driveFrequency'>): number {
  const a = -p.linearStiffness;
  const beta = p.cubicStiffness;
  if (!(a > 0) || !(beta > 0)) {
    throw new Error(`melnikovCriticalAmplitudeDuffing: needs a double well (α < 0, β > 0); got α=${p.linearStiffness}, β=${beta}`);
  }
  const omega = p.driveFrequency;
  return (4 * p.damping * a * a * Math.cosh((Math.PI * omega) / (2 * Math.sqrt(a)))) / (3 * Math.PI * omega * Math.sqrt(2 * a * beta));
}

/**
 * The Duffing Melnikov function by direct Simpson quadrature along the
 * analytic separatrix — the independent brute-force check of the closed form,
 * mirroring `melnikovFunctionNumeric` for the pendulum.
 */
export function melnikovFunctionNumericDuffing(
  tau0: number,
  p: Pick<DuffingParameters, 'damping' | 'linearStiffness' | 'cubicStiffness' | 'driveAmplitude' | 'driveFrequency'>,
  options: { halfWidth?: number; intervals?: number } = {}
): number {
  const a = -p.linearStiffness;
  const beta = p.cubicStiffness;
  if (!(a > 0) || !(beta > 0)) {
    throw new Error('melnikovFunctionNumericDuffing: needs a double well (α < 0, β > 0).');
  }
  const sqrtA = Math.sqrt(a);
  const amp = Math.sqrt((2 * a) / beta);
  const L = options.halfWidth ?? 40 / sqrtA;
  const n = 2 * Math.max(1, Math.round((options.intervals ?? 80000) / 2));
  const h = (2 * L) / n;
  const integrand = (t: number): number => {
    const u = sqrtA * t;
    const sech = 1 / Math.cosh(u);
    const v = -amp * sqrtA * sech * Math.tanh(u); // v₀(t) on the +branch
    return v * (p.driveAmplitude * Math.cos(p.driveFrequency * (t + tau0)) - p.damping * v);
  };
  let sum = integrand(-L) + integrand(L);
  for (let i = 1; i < n; i += 1) {
    sum += integrand(-L + i * h) * (i % 2 === 1 ? 4 : 2);
  }
  return (sum * h) / 3;
}
