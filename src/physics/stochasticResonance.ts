import { gaussianSampler } from './stochastic';

/**
 * Stochastic resonance (SR) — the counter-intuitive phenomenon where adding the
 * *right amount* of noise to a nonlinear system maximises its response to a weak
 * periodic signal. It is the mechanism behind thermal-noise-assisted detection
 * in bistable electronic devices (Schmitt triggers, comparators, SQUIDs), and
 * the same Langevin machinery the engine already carries (`gaussian sampler`,
 * Euler–Maruyama) drives it here.
 *
 * Canonical model: the overdamped quartic double well U(x) = −x²/2 + x⁴/4 (wells
 * at x = ±1, barrier ΔU = 1/4) under a sub-threshold periodic drive and additive
 * white noise, an Itô SDE
 *
 *     dx = (x − x³ + A cos Ωt) dt + σ dW.
 *
 * With A below the static switching threshold A_c = √(4/27) ≈ 0.385 the drive
 * alone never flips the state between wells; noise of intensity D = σ²/2 enables
 * Kramers hops at rate r_K ∝ exp(−ΔU/D). When 2 r_K ≈ Ω the hops phase-lock to
 * the drive and the spectral response peaks — an *interior* maximum of the
 * response-vs-noise curve, the defining SR signature.
 *
 * Everything is seeded (via the engine's `gaussianSampler`), so a given seed
 * reproduces the trajectory and its statistics bit-for-bit.
 */
export interface BistableSrParameters {
  /** Sub-threshold periodic drive amplitude A (recommend A < 0.385). */
  amplitude: number;
  /** Drive angular frequency Ω (> 0). */
  driveOmega: number;
  /** Noise strength σ (≥ 0); the noise intensity is D = σ²/2. */
  sigma: number;
  /** Integration time step (> 0). */
  dt: number;
  /** Full drive periods integrated and measured (> 0). */
  periods: number;
  /** Drive periods discarded as transient before measuring. Default 2. */
  transientPeriods?: number;
  /** PRNG seed. */
  seed: number;
  /** Initial position; default −1 (left well). */
  x0?: number;
}

export interface SrResponse {
  /**
   * Spectral response amplitude at the drive frequency,
   * Q = (2/T)·|∫ x(t) e^{−iΩt} dt| over the measurement window — the standard SR
   * "response amplitude" that traces the inverted-U against σ.
   */
  responseAmplitude: number;
  /** Squared first Fourier coefficient |∫ x e^{−iΩt} dt|² (∝ power at Ω). */
  signalPower: number;
  /** Fraction of measurement steps spent in the right (x > 0) well. */
  rightWellFraction: number;
  /** Inter-well transitions (sign changes of x) over the measurement window. */
  transitions: number;
  sigma: number;
}

/**
 * Integrate the bistable SR model once (Euler–Maruyama) and measure the spectral
 * response at the drive frequency. Deterministic for a given seed.
 */
export function stochasticResonanceResponse(params: BistableSrParameters): SrResponse {
  const { amplitude: A, driveOmega: omega, sigma, dt, periods, seed } = params;
  if (!(dt > 0)) throw new Error('stochasticResonanceResponse: dt must be positive');
  if (!(omega > 0)) throw new Error('stochasticResonanceResponse: driveOmega must be positive');
  if (!(periods > 0)) throw new Error('stochasticResonanceResponse: periods must be positive');
  if (!(sigma >= 0)) throw new Error('stochasticResonanceResponse: sigma must be non-negative');
  const transientPeriods = params.transientPeriods ?? 2;
  const x0 = params.x0 ?? -1;
  const period = (2 * Math.PI) / omega;
  const transientSteps = Math.max(0, Math.round((transientPeriods * period) / dt));
  const measureSteps = Math.max(1, Math.round((periods * period) / dt));
  const gaussian = gaussianSampler(seed);
  const sqrtDt = Math.sqrt(dt);

  let x = x0;
  let t = 0;
  for (let i = 0; i < transientSteps; i += 1) {
    const drift = x - x * x * x + A * Math.cos(omega * t);
    x = x + drift * dt + sigma * sqrtDt * gaussian();
    t += dt;
  }

  let ic = 0;
  let is = 0;
  let rightSteps = 0;
  let transitions = 0;
  let prevSign = x >= 0 ? 1 : -1;
  for (let i = 0; i < measureSteps; i += 1) {
    const drift = x - x * x * x + A * Math.cos(omega * t);
    x = x + drift * dt + sigma * sqrtDt * gaussian();
    t += dt;
    ic += x * Math.cos(omega * t) * dt;
    is += x * Math.sin(omega * t) * dt;
    if (x > 0) rightSteps += 1;
    const sign = x >= 0 ? 1 : -1;
    if (sign !== prevSign) {
      transitions += 1;
      prevSign = sign;
    }
  }

  const tMeas = measureSteps * dt;
  return {
    responseAmplitude: (2 / tMeas) * Math.hypot(ic, is),
    signalPower: ic * ic + is * is,
    rightWellFraction: rightSteps / measureSteps,
    transitions,
    sigma
  };
}

/**
 * Sweep the noise strength σ and return the ensemble-averaged SR response at each
 * value — the inverted-U "stochastic-resonance curve". Each σ is averaged over
 * `realizations` independent seeded runs (seed + r), which is what the SR
 * response amplitude is defined as. The maximum sitting at an *interior* σ is the
 * resonance.
 */
export function stochasticResonanceCurve(
  base: Omit<BistableSrParameters, 'sigma'>,
  sigmas: readonly number[],
  realizations = 1
): SrResponse[] {
  if (!(realizations >= 1)) throw new Error('stochasticResonanceCurve: realizations must be >= 1');
  return sigmas.map((sigma) => {
    let ampSum = 0;
    let powSum = 0;
    let rightSum = 0;
    let transSum = 0;
    for (let r = 0; r < realizations; r += 1) {
      const res = stochasticResonanceResponse({ ...base, sigma, seed: base.seed + r });
      ampSum += res.responseAmplitude;
      powSum += res.signalPower;
      rightSum += res.rightWellFraction;
      transSum += res.transitions;
    }
    return {
      responseAmplitude: ampSum / realizations,
      signalPower: powSum / realizations,
      rightWellFraction: rightSum / realizations,
      transitions: transSum / realizations,
      sigma
    };
  });
}
