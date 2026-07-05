import type { DrivenParameters } from '../physics/driven';
import { rhsDriven } from '../physics/driven';
import { melnikovCriticalAmplitude } from './melnikov';
import { maximalLyapunov, type LyapunovSettings } from './lyapunov';

/**
 * Basin-conditioned chaos onset for the damped driven pendulum - the safe
 * extension of the Melnikov-vs-period-doubling flagship: instead of asking
 * "when does THE trajectory go chaotic" (one initial condition), it asks
 * "at what drive amplitude does a given FRACTION of an initial-condition
 * region sustain chaos", measured with the finite-time maximal Lyapunov
 * exponent per grid point.
 *
 * Claim boundary: the analytic Melnikov threshold A_c marks the homoclinic
 * TANGLE (transient chaos, fractal basin boundaries); a sustained chaotic
 * attractor appears above it. The basin-conditioned onset therefore sits at
 * or above A_c, and depends explicitly on the sampled region, the horizon and
 * the lambda threshold - all of which are reported, never implied.
 */

export interface BasinOnsetOptions {
  /** Grid points per axis over the (theta, omega) initial-condition region. */
  gridSize?: number;
  thetaRange?: [number, number];
  omegaRange?: [number, number];
  /** A grid point counts as chaotic when lambda_max exceeds this (per unit time). */
  lambdaThreshold?: number;
  /** Finite-time Lyapunov settings (dt, steps, transientSteps, ...). */
  lyapunov?: Partial<LyapunovSettings>;
}

interface ResolvedBasinOnsetOptions {
  gridSize: number;
  thetaRange: [number, number];
  omegaRange: [number, number];
  lambdaThreshold: number;
  lyapunov: Partial<LyapunovSettings>;
}

export interface BasinChaoticFraction {
  amplitude: number;
  /** Fraction of grid initial conditions with lambda_max above the threshold. */
  chaoticFraction: number;
  chaoticCount: number;
  total: number;
  /** Per-grid-point finite-time lambda_max estimates (row-major over the grid). */
  lambdas: number[];
}

export interface BasinConditionedOnsetResult {
  fractionTarget: number;
  /** Midpoint of the final amplitude bracket. */
  onsetAmplitude: number;
  bracket: [number, number];
  melnikovAmplitude: number;
  /** Onset relative to the analytic tangle threshold (expected >= 1). */
  onsetToMelnikovRatio: number;
  evaluations: BasinChaoticFraction[];
  options: ResolvedBasinOnsetOptions;
  caveat: string;
}

function resolveOptions(options: BasinOnsetOptions): ResolvedBasinOnsetOptions {
  return {
    gridSize: options.gridSize ?? 4,
    thetaRange: options.thetaRange ?? [-2.4, 2.4],
    omegaRange: options.omegaRange ?? [-1.5, 1.5],
    lambdaThreshold: options.lambdaThreshold ?? 0.02,
    lyapunov: { dt: 0.02, steps: 12_000, transientSteps: 3_000, renormEvery: 10, ...options.lyapunov }
  };
}

/**
 * Chaotic fraction of the initial-condition grid at one drive amplitude.
 * Deterministic for fixed options (seeded Lyapunov perturbations).
 */
export function basinChaoticFraction(
  parameters: DrivenParameters,
  amplitude: number,
  options: BasinOnsetOptions = {}
): BasinChaoticFraction {
  const resolved = resolveOptions(options);
  const p: DrivenParameters = { ...parameters, driveAmplitude: amplitude };
  const rhs = (state: ArrayLike<number>, out: Float64Array | number[]): void => {
    rhsDriven(state, p, out as Float64Array);
  };
  const { gridSize, thetaRange, omegaRange, lambdaThreshold } = resolved;
  const lambdas: number[] = [];
  let chaoticCount = 0;
  for (let i = 0; i < gridSize; i += 1) {
    for (let j = 0; j < gridSize; j += 1) {
      const theta = thetaRange[0] + ((i + 0.5) / gridSize) * (thetaRange[1] - thetaRange[0]);
      const omega = omegaRange[0] + ((j + 0.5) / gridSize) * (omegaRange[1] - omegaRange[0]);
      const { lambdaMax } = maximalLyapunov([theta, omega, 0], rhs, resolved.lyapunov);
      lambdas.push(lambdaMax);
      if (lambdaMax > lambdaThreshold) chaoticCount += 1;
    }
  }
  const total = gridSize * gridSize;
  return { amplitude, chaoticFraction: chaoticCount / total, chaoticCount, total, lambdas };
}

/**
 * Bisect the drive amplitude at which the basin-conditioned chaotic fraction
 * crosses `fractionTarget`. The bracket must straddle the crossing
 * (fraction(lo) < target <= fraction(hi)) or the function throws - onset
 * without a verified bracket would be a fabricated number.
 */
export function basinConditionedOnset(
  parameters: DrivenParameters,
  bracket: [number, number],
  fractionTarget = 0.25,
  options: BasinOnsetOptions = {},
  maxIterations = 6
): BasinConditionedOnsetResult {
  if (!(bracket[0] > 0 && bracket[1] > bracket[0])) {
    throw new Error('basinConditionedOnset: bracket must satisfy 0 < lo < hi.');
  }
  if (!(fractionTarget > 0 && fractionTarget < 1)) {
    throw new Error('basinConditionedOnset: fractionTarget must lie in (0, 1).');
  }
  const resolved = resolveOptions(options);
  const evaluations: BasinChaoticFraction[] = [];
  const evaluate = (amplitude: number): BasinChaoticFraction => {
    const result = basinChaoticFraction(parameters, amplitude, options);
    evaluations.push(result);
    return result;
  };
  let [lo, hi] = bracket;
  const atLo = evaluate(lo);
  const atHi = evaluate(hi);
  if (!(atLo.chaoticFraction < fractionTarget && atHi.chaoticFraction >= fractionTarget)) {
    throw new Error(
      `basinConditionedOnset: bracket does not straddle the target - fraction(${lo})=${atLo.chaoticFraction}, fraction(${hi})=${atHi.chaoticFraction}, target=${fractionTarget}.`
    );
  }
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const mid = 0.5 * (lo + hi);
    const atMid = evaluate(mid);
    if (atMid.chaoticFraction >= fractionTarget) hi = mid;
    else lo = mid;
  }
  const onsetAmplitude = 0.5 * (lo + hi);
  const melnikovAmplitude = melnikovCriticalAmplitude(parameters);
  return {
    fractionTarget,
    onsetAmplitude,
    bracket: [lo, hi],
    melnikovAmplitude,
    onsetToMelnikovRatio: melnikovAmplitude > 0 ? onsetAmplitude / melnikovAmplitude : Number.POSITIVE_INFINITY,
    evaluations,
    options: resolved,
    caveat: `Finite-time lambda classifier (dt=${resolved.lyapunov.dt}, steps=${resolved.lyapunov.steps}, threshold=${resolved.lambdaThreshold}) on a ${resolved.gridSize}x${resolved.gridSize} grid over theta ${resolved.thetaRange[0]}..${resolved.thetaRange[1]}, omega ${resolved.omegaRange[0]}..${resolved.omegaRange[1]}. The onset is conditioned on this region, horizon and threshold; the Melnikov A_c below it bounds the homoclinic tangle, not the sustained attractor.`
  };
}
