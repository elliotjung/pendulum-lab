import { assertUint32Seed, gaussianSampler } from './stochasticSteppers';
import {
  assertUsableIntegrationStep,
  checkedWorkProduct,
  integrationStepCount,
  NUMERICAL_WORK_BUDGETS
} from '../validation/numericalBudgets';

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

interface ValidatedSrParameters {
  amplitude: number;
  driveOmega: number;
  sigma: number;
  dt: number;
  periods: number;
  transientPeriods: number;
  seed: number;
  x0: number;
  transientSteps: number;
  measureSteps: number;
  totalSteps: number;
  phaseStep: number;
}

function roundedStepCount(span: number, dt: number, minimum: number, caller: string): number {
  // The public routine historically rounds to the nearest step. Use the shared
  // ceiling helper for finite/safe-ratio validation while preserving that
  // scientific sampling contract.
  integrationStepCount(span, dt, caller);
  const count = Math.max(minimum, Math.round(span / dt));
  if (!Number.isSafeInteger(count)) throw new RangeError(`${caller}: derived step count must be a safe integer.`);
  return count;
}

function validateSrParameters(params: BistableSrParameters, caller: string): ValidatedSrParameters {
  if (params === null || typeof params !== 'object') throw new TypeError(`${caller}: parameters must be an object.`);
  const amplitude = params.amplitude;
  const driveOmega = params.driveOmega;
  const sigma = params.sigma;
  const dt = params.dt;
  const periods = params.periods;
  const transientPeriods = params.transientPeriods ?? 2;
  const seed = params.seed;
  const x0 = params.x0 ?? -1;

  if (!Number.isFinite(amplitude)) throw new TypeError(`${caller}: amplitude must be finite.`);
  if (!(driveOmega > 0) || !Number.isFinite(driveOmega)) {
    throw new RangeError(`${caller}: driveOmega must be positive and finite.`);
  }
  if (!(sigma >= 0) || !Number.isFinite(sigma)) {
    throw new RangeError(`${caller}: sigma must be non-negative and finite.`);
  }
  assertUsableIntegrationStep(dt, caller);
  if (!(periods > 0) || !Number.isFinite(periods)) {
    throw new RangeError(`${caller}: periods must be positive and finite.`);
  }
  if (!(transientPeriods >= 0) || !Number.isFinite(transientPeriods)) {
    throw new RangeError(`${caller}: transientPeriods must be non-negative and finite.`);
  }
  if (!Number.isFinite(x0)) throw new TypeError(`${caller}: x0 must be finite.`);
  assertUint32Seed(seed, caller);

  const period = (2 * Math.PI) / driveOmega;
  if (!(period > 0) || !Number.isFinite(period)) {
    throw new RangeError(`${caller}: the derived drive period must be positive and finite.`);
  }
  const transientSteps = roundedStepCount(transientPeriods * period, dt, 0, caller);
  const measureSteps = roundedStepCount(periods * period, dt, 1, caller);
  const totalSteps = transientSteps + measureSteps;
  if (!Number.isSafeInteger(totalSteps))
    throw new RangeError(`${caller}: total step count must be safely representable.`);
  if (totalSteps > NUMERICAL_WORK_BUDGETS.stochasticResonance.maxStepsPerResponse) {
    throw new RangeError(
      `${caller}: response work exceeds ${NUMERICAL_WORK_BUDGETS.stochasticResonance.maxStepsPerResponse} integration steps.`
    );
  }
  const phaseStep = driveOmega * dt;
  if (!Number.isFinite(phaseStep)) throw new RangeError(`${caller}: driveOmega * dt must be finite.`);

  return {
    amplitude,
    driveOmega,
    sigma,
    dt,
    periods,
    transientPeriods,
    seed,
    x0,
    transientSteps,
    measureSteps,
    totalSteps,
    phaseStep
  };
}

/**
 * Integrate the bistable SR model once (Euler–Maruyama) and measure the spectral
 * response at the drive frequency. Deterministic for a given seed.
 */
export function stochasticResonanceResponse(params: BistableSrParameters): SrResponse {
  const caller = 'stochasticResonanceResponse';
  const validated = validateSrParameters(params, caller);
  const { amplitude: A, sigma, dt, seed, x0, transientSteps, measureSteps, phaseStep } = validated;
  const gaussian = gaussianSampler(seed);
  const sqrtDt = Math.sqrt(dt);

  let x = x0;
  let phase = 0;
  for (let i = 0; i < transientSteps; i += 1) {
    const drift = x - x * x * x + A * Math.cos(phase);
    x = x + drift * dt + sigma * sqrtDt * gaussian();
    if (!Number.isFinite(x)) throw new Error(`${caller}: trajectory became non-finite during the transient.`);
    phase = (phase + phaseStep) % (2 * Math.PI);
  }

  let ic = 0;
  let is = 0;
  let rightSteps = 0;
  let transitions = 0;
  let prevSign = x >= 0 ? 1 : -1;
  for (let i = 0; i < measureSteps; i += 1) {
    const drift = x - x * x * x + A * Math.cos(phase);
    x = x + drift * dt + sigma * sqrtDt * gaussian();
    if (!Number.isFinite(x)) throw new Error(`${caller}: trajectory became non-finite during measurement.`);
    phase = (phase + phaseStep) % (2 * Math.PI);
    ic += x * Math.cos(phase) * dt;
    is += x * Math.sin(phase) * dt;
    if (!Number.isFinite(ic) || !Number.isFinite(is)) {
      throw new Error(`${caller}: spectral accumulation became non-finite.`);
    }
    if (x > 0) rightSteps += 1;
    const sign = x >= 0 ? 1 : -1;
    if (sign !== prevSign) {
      transitions += 1;
      prevSign = sign;
    }
  }

  const tMeas = measureSteps * dt;
  const response: SrResponse = {
    responseAmplitude: (2 / tMeas) * Math.hypot(ic, is),
    signalPower: ic * ic + is * is,
    rightWellFraction: rightSteps / measureSteps,
    transitions,
    sigma
  };
  if (
    !Number.isFinite(tMeas) ||
    tMeas <= 0 ||
    !Number.isFinite(response.responseAmplitude) ||
    !Number.isFinite(response.signalPower)
  ) {
    throw new Error(`${caller}: response statistics became non-finite.`);
  }
  return response;
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
  const caller = 'stochasticResonanceCurve';
  const budget = NUMERICAL_WORK_BUDGETS.stochasticResonance;
  if (!Number.isSafeInteger(realizations) || realizations < 1) {
    throw new Error(`${caller}: realizations must be a positive safe integer`);
  }
  if (realizations > budget.maxCurveResponses) {
    throw new RangeError(`${caller}: realizations exceed ${budget.maxCurveResponses}.`);
  }
  if (!Array.isArray(sigmas)) throw new TypeError(`${caller}: sigmas must be an array.`);
  if (sigmas.length > budget.maxNoiseLevels) {
    throw new RangeError(`${caller}: noise-level count exceeds ${budget.maxNoiseLevels}.`);
  }
  const sigmaValues = Array.from({ length: sigmas.length }, (_, index) => {
    const sigma = sigmas[index];
    if (!Object.hasOwn(sigmas, index) || typeof sigma !== 'number' || sigma < 0 || !Number.isFinite(sigma)) {
      throw new RangeError(`${caller}: sigmas[${index}] must be present, non-negative, and finite.`);
    }
    return sigma;
  });
  const validatedBase = validateSrParameters({ ...base, sigma: 0 }, caller);
  const responseCount = checkedWorkProduct([sigmaValues.length, realizations], caller);
  if (responseCount > budget.maxCurveResponses) {
    throw new RangeError(`${caller}: response count exceeds ${budget.maxCurveResponses}.`);
  }
  const totalIntegrationSteps = checkedWorkProduct([responseCount, validatedBase.totalSteps], caller);
  if (totalIntegrationSteps > budget.maxCurveIntegrationSteps) {
    throw new RangeError(`${caller}: curve work exceeds ${budget.maxCurveIntegrationSteps} integration steps.`);
  }
  const normalizedBase: Omit<BistableSrParameters, 'sigma'> = {
    amplitude: validatedBase.amplitude,
    driveOmega: validatedBase.driveOmega,
    dt: validatedBase.dt,
    periods: validatedBase.periods,
    transientPeriods: validatedBase.transientPeriods,
    seed: validatedBase.seed,
    x0: validatedBase.x0
  };
  return sigmaValues.map((sigma) => {
    let ampSum = 0;
    let powSum = 0;
    let rightSum = 0;
    let transSum = 0;
    for (let r = 0; r < realizations; r += 1) {
      const res = stochasticResonanceResponse({
        ...normalizedBase,
        sigma,
        seed: (normalizedBase.seed + r) >>> 0
      });
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
