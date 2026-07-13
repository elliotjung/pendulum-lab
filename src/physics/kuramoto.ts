import type { StateVector } from './types';

/**
 * Phase-reduced oscillator networks for Kuramoto/Huygens synchronization.
 *
 * The state is the vector of oscillator phases.  With no adjacency matrix the
 * classic all-to-all mean-field model is used,
 *
 *   theta_i' = omega_i + (K/N) sum_j sin(theta_j-theta_i-alpha).
 *
 * A supplied non-negative adjacency matrix is normalized per row.  This keeps
 * `coupling` comparable between all-to-all, sparse, and non-local rings and
 * avoids increasing the effective K merely by adding neighbours.
 */
export interface KuramotoNetworkParameters {
  naturalFrequencies: readonly number[];
  coupling: number;
  /** Optional Sakaguchi phase lag alpha (radians). */
  phaseLag?: number;
  /** Optional row-major N x N non-negative coupling weights. */
  adjacency?: ArrayLike<number>;
}

export interface PhaseOrderParameter {
  /** Magnitude in [0, 1]. */
  magnitude: number;
  /** Collective phase atan2(Im z, Re z). */
  phase: number;
  real: number;
  imaginary: number;
}

function validateNetwork(parameters: KuramotoNetworkParameters, stateLength: number): number {
  const n = parameters.naturalFrequencies.length;
  if (n === 0) throw new Error('Kuramoto network requires at least one oscillator.');
  if (stateLength !== n) throw new Error(`Kuramoto phase length ${stateLength} does not match frequency length ${n}.`);
  if (!Number.isFinite(parameters.coupling)) throw new Error('Kuramoto coupling must be finite.');
  if (parameters.adjacency && parameters.adjacency.length !== n * n) {
    throw new Error(`Kuramoto adjacency must contain N^2=${n * n} entries.`);
  }
  for (let i = 0; i < n; i += 1) {
    if (!Number.isFinite(parameters.naturalFrequencies[i])) throw new Error(`Kuramoto frequency[${i}] must be finite.`);
  }
  if (parameters.adjacency) {
    for (let i = 0; i < n * n; i += 1) {
      const weight = Number(parameters.adjacency[i] ?? NaN);
      if (!Number.isFinite(weight) || weight < 0) throw new Error(`Kuramoto adjacency[${i}] must be finite and non-negative.`);
    }
  }
  return n;
}

/** Allocation-free Kuramoto/Sakaguchi network right-hand side. */
export function rhsKuramoto(
  phases: ArrayLike<number>,
  parameters: KuramotoNetworkParameters,
  out: StateVector
): StateVector {
  const n = validateNetwork(parameters, phases.length);
  if (out.length < n) throw new Error(`rhsKuramoto output length ${out.length} is shorter than N=${n}.`);
  const alpha = parameters.phaseLag ?? 0;
  const adjacency = parameters.adjacency;
  for (let i = 0; i < n; i += 1) {
    const thetaI = Number(phases[i] ?? 0);
    let interaction = 0;
    let weightSum = 0;
    for (let j = 0; j < n; j += 1) {
      const weight = adjacency ? Number(adjacency[i * n + j] ?? 0) : 1;
      if (weight === 0) continue;
      interaction += weight * Math.sin(Number(phases[j] ?? 0) - thetaI - alpha);
      weightSum += weight;
    }
    out[i] = Number(parameters.naturalFrequencies[i] ?? 0) +
      (weightSum > 0 ? parameters.coupling * interaction / weightSum : 0);
  }
  return out;
}

/** Global Kuramoto complex order parameter z = N^-1 sum exp(i theta_j). */
export function kuramotoOrderParameter(phases: ArrayLike<number>): PhaseOrderParameter {
  if (phases.length === 0) throw new Error('kuramotoOrderParameter requires at least one phase.');
  let real = 0;
  let imaginary = 0;
  for (let i = 0; i < phases.length; i += 1) {
    const theta = Number(phases[i] ?? 0);
    if (!Number.isFinite(theta)) throw new Error(`phase[${i}] must be finite.`);
    real += Math.cos(theta);
    imaginary += Math.sin(theta);
  }
  real /= phases.length;
  imaginary /= phases.length;
  return { magnitude: Math.min(1, Math.hypot(real, imaginary)), phase: Math.atan2(imaginary, real), real, imaginary };
}

/**
 * Per-node weighted local order parameter.  Rows with no neighbours return a
 * zero magnitude (and the node's own phase as a deterministic phase value).
 */
export function kuramotoLocalOrderParameters(
  phases: ArrayLike<number>,
  adjacency: ArrayLike<number>
): PhaseOrderParameter[] {
  const n = phases.length;
  if (n === 0) throw new Error('kuramotoLocalOrderParameters requires at least one phase.');
  if (adjacency.length !== n * n) throw new Error(`local-order adjacency must contain N^2=${n * n} entries.`);
  const result: PhaseOrderParameter[] = [];
  for (let i = 0; i < n; i += 1) {
    let real = 0;
    let imaginary = 0;
    let weightSum = 0;
    for (let j = 0; j < n; j += 1) {
      const weight = Number(adjacency[i * n + j] ?? NaN);
      if (!Number.isFinite(weight) || weight < 0) throw new Error(`local-order adjacency[${i},${j}] must be finite and non-negative.`);
      if (weight === 0) continue;
      const theta = Number(phases[j] ?? 0);
      real += weight * Math.cos(theta);
      imaginary += weight * Math.sin(theta);
      weightSum += weight;
    }
    if (weightSum === 0) {
      result.push({ magnitude: 0, phase: Number(phases[i] ?? 0), real: 0, imaginary: 0 });
    } else {
      real /= weightSum;
      imaginary /= weightSum;
      result.push({ magnitude: Math.min(1, Math.hypot(real, imaginary)), phase: Math.atan2(imaginary, real), real, imaginary });
    }
  }
  return result;
}

/** Symmetric non-local ring: each node couples to `radius` neighbours on each side. */
export function nonlocalRingAdjacency(n: number, radius: number): Float64Array {
  if (!Number.isInteger(n) || n < 2) throw new Error('nonlocalRingAdjacency: n must be an integer >= 2.');
  if (!Number.isInteger(radius) || radius < 1 || radius > Math.floor((n - 1) / 2)) {
    throw new Error(`nonlocalRingAdjacency: radius must be in [1, ${Math.floor((n - 1) / 2)}].`);
  }
  const adjacency = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let offset = 1; offset <= radius; offset += 1) {
      adjacency[i * n + ((i + offset) % n)] = 1;
      adjacency[i * n + ((i - offset + n) % n)] = 1;
    }
  }
  return adjacency;
}

/** Continuum Kuramoto threshold K_c = 2 / (pi g(omega_bar)). */
export function kuramotoCriticalCoupling(densityAtMeanFrequency: number): number {
  if (!(densityAtMeanFrequency > 0) || !Number.isFinite(densityAtMeanFrequency)) {
    throw new Error('kuramotoCriticalCoupling: densityAtMeanFrequency must be positive and finite.');
  }
  return 2 / (Math.PI * densityAtMeanFrequency);
}

/** Closed form for a Lorentzian frequency density with half-width Delta: K_c=2 Delta. */
export function kuramotoCriticalCouplingLorentzian(halfWidth: number): number {
  if (!(halfWidth > 0) || !Number.isFinite(halfWidth)) {
    throw new Error('kuramotoCriticalCouplingLorentzian: halfWidth must be positive and finite.');
  }
  return kuramotoCriticalCoupling(1 / (Math.PI * halfWidth));
}

/** Closed form for a Gaussian frequency density with standard deviation sigma. */
export function kuramotoCriticalCouplingGaussian(standardDeviation: number): number {
  if (!(standardDeviation > 0) || !Number.isFinite(standardDeviation)) {
    throw new Error('kuramotoCriticalCouplingGaussian: standardDeviation must be positive and finite.');
  }
  return kuramotoCriticalCoupling(1 / (Math.sqrt(2 * Math.PI) * standardDeviation));
}

export interface HuygensPhasePairParameters {
  frequencies: readonly [number, number];
  coupling: number;
  phaseLag?: number;
}

/**
 * Two-clock Huygens phase reduction.  For alpha=0 the phase difference obeys
 * Delta' = omega_2-omega_1 - 2K sin(Delta), giving a locked state whenever
 * |omega_2-omega_1| <= 2|K|.
 */
export function rhsHuygensPhasePair(
  phases: ArrayLike<number>,
  parameters: HuygensPhasePairParameters,
  out: StateVector
): StateVector {
  if (phases.length !== 2 || out.length < 2) throw new Error('rhsHuygensPhasePair requires two phases and a length-2 output.');
  return rhsKuramoto(phases, {
    naturalFrequencies: parameters.frequencies,
    coupling: parameters.coupling,
    ...(parameters.phaseLag === undefined ? {} : { phaseLag: parameters.phaseLag }),
    adjacency: [0, 1, 1, 0]
  }, out);
}

/** Stable locked phase difference theta_2-theta_1 for the zero-lag Huygens pair. */
export function huygensLockedPhaseDifference(parameters: HuygensPhasePairParameters): number | null {
  if (!(parameters.coupling > 0) || !Number.isFinite(parameters.coupling)) return null;
  const ratio = (parameters.frequencies[1] - parameters.frequencies[0]) / (2 * parameters.coupling);
  return Math.abs(ratio) <= 1 ? Math.asin(ratio) : null;
}
