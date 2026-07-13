/**
 * The **Perron–Frobenius transfer operator** discretised by **Ulam's method** —
 * the set-oriented view of dynamics (Dellnitz–Junge / Froyland). Phase space is
 * partitioned into boxes; the operator's matrix P_{ij} is the fraction of box i
 * mapped into box j, estimated from a deterministic grid of test points. The
 * leading left eigenvector of the row-stochastic P (eigenvalue 1) is the
 * **invariant measure** μ — the statistical fingerprint of the attractor —
 * obtained by power iteration (no eigensolver needed). Dividing by the box width
 * gives the invariant density.
 *
 * This is the complement to trajectory-based diagnostics: rather than following
 * one orbit, it transports densities. It self-validates against closed forms —
 * the doubling map x ↦ 2x mod 1 gives the uniform (Lebesgue) measure, and the
 * fully-chaotic logistic map x ↦ 4x(1−x) gives the arcsine density
 * ρ(x) = 1/(π√(x(1−x))) (CDF F(x) = (2/π)·arcsin√x).
 *
 * Subdominant eigenvalues of P encode the **mixing rate** and almost-invariant /
 * coherent sets. `transferOperatorSpectrum` surfaces them via the general
 * non-symmetric eigensolver (`research/eigenGeneral`): the leading eigenvalue is 1
 * (the invariant measure), and the second-largest modulus |λ₂| is the
 * correlation-decay ratio per step, so the mixing rate is −ln|λ₂|.
 */
import { eigenvaluesGeneral } from '../research/eigenGeneral';
import type { Complex } from '../research/complexEig';

export interface UlamMatrix {
  /** Number of boxes. */
  boxes: number;
  /** Box centres (ascending). */
  boxCenters: number[];
  /** Box width (uniform partition). */
  boxWidth: number;
  /** Row-stochastic transition matrix, row-major boxes×boxes: P[i*boxes+j]. */
  transition: number[];
}

/**
 * Ulam transition matrix for a 1-D map on `[domain[0], domain[1]]` partitioned
 * into `boxes` equal cells, sampled with `samplesPerBox` deterministic interior
 * points. Images that leave the domain are dropped from that row's normalisation
 * (so a row with no surviving image is left as zeros).
 */
export function ulamTransitionMatrix1D(
  map: (x: number) => number,
  domain: readonly [number, number],
  boxes: number,
  samplesPerBox = 50
): UlamMatrix {
  if (!Number.isInteger(boxes) || boxes < 2) throw new Error('ulamTransitionMatrix1D: boxes must be an integer ≥ 2.');
  if (!Number.isInteger(samplesPerBox) || samplesPerBox < 1)
    throw new Error('ulamTransitionMatrix1D: samplesPerBox must be ≥ 1.');
  const [a, b] = domain;
  if (!(b > a)) throw new Error('ulamTransitionMatrix1D: domain must have b > a.');
  const width = (b - a) / boxes;

  const boxCenters = new Array<number>(boxes);
  for (let i = 0; i < boxes; i += 1) boxCenters[i] = a + (i + 0.5) * width;

  const transition = new Array<number>(boxes * boxes).fill(0);
  const boxOf = (x: number): number => {
    if (x < a || x > b) return -1;
    let idx = Math.floor((x - a) / width);
    if (idx === boxes) idx = boxes - 1; // x exactly at b
    return idx;
  };

  for (let i = 0; i < boxes; i += 1) {
    let hits = 0;
    for (let s = 0; s < samplesPerBox; s += 1) {
      const x = a + (i + (s + 0.5) / samplesPerBox) * width;
      const j = boxOf(map(x));
      if (j >= 0) {
        transition[i * boxes + j] = (transition[i * boxes + j] ?? 0) + 1;
        hits += 1;
      }
    }
    if (hits > 0) {
      for (let j = 0; j < boxes; j += 1) transition[i * boxes + j] = (transition[i * boxes + j] ?? 0) / hits;
    }
  }
  return { boxes, boxCenters, boxWidth: width, transition };
}

/**
 * Invariant measure (stationary distribution) of a row-stochastic transition
 * matrix: the leading left eigenvector μP = μ with μ ≥ 0, Σμ = 1, via power
 * iteration from the uniform distribution.
 */
export function invariantMeasure(
  transition: readonly number[],
  boxes: number,
  options: { iterations?: number; tolerance?: number } = {}
): number[] {
  if (transition.length < boxes * boxes) throw new Error('invariantMeasure: transition shorter than boxes².');
  const iterations = options.iterations ?? 2000;
  const tolerance = options.tolerance ?? 1e-14;
  let mu = new Array<number>(boxes).fill(1 / boxes);
  for (let it = 0; it < iterations; it += 1) {
    const next = new Array<number>(boxes).fill(0);
    for (let i = 0; i < boxes; i += 1) {
      const mi = mu[i] ?? 0;
      if (mi === 0) continue;
      const row = i * boxes;
      for (let j = 0; j < boxes; j += 1) next[j] = (next[j] ?? 0) + mi * (transition[row + j] ?? 0);
    }
    let sum = 0;
    for (let j = 0; j < boxes; j += 1) sum += next[j] ?? 0;
    if (sum > 0) for (let j = 0; j < boxes; j += 1) next[j] = (next[j] ?? 0) / sum;
    let diff = 0;
    for (let j = 0; j < boxes; j += 1) diff += Math.abs((next[j] ?? 0) - (mu[j] ?? 0));
    mu = next;
    if (diff < tolerance) break;
  }
  return mu;
}

export interface InvariantDensity {
  boxCenters: number[];
  /** Invariant measure per box (Σ = 1). */
  measure: number[];
  /** Invariant density = measure / boxWidth (∫ ≈ 1). */
  density: number[];
}

/** Convenience: the invariant density of a 1-D map via Ulam + power iteration. */
export function transferOperatorInvariantDensity(
  map: (x: number) => number,
  domain: readonly [number, number],
  boxes: number,
  samplesPerBox = 50
): InvariantDensity {
  const ulam = ulamTransitionMatrix1D(map, domain, boxes, samplesPerBox);
  const measure = invariantMeasure(ulam.transition, boxes);
  const density = measure.map((m) => m / ulam.boxWidth);
  return { boxCenters: ulam.boxCenters, measure, density };
}

export interface TransferOperatorSpectrum {
  /** Eigenvalues of P, sorted by descending modulus (the leading one is ≈ 1). */
  eigenvalues: Complex[];
  /** Moduli |λ_k|, aligned with `eigenvalues` (descending). */
  moduli: number[];
  /** Second-largest modulus |λ₂| — the per-step correlation-decay / mixing ratio. */
  subdominantModulus: number;
  /** Spectral gap 1 − |λ₂| (larger ⇒ faster relaxation to the invariant measure). */
  spectralGap: number;
  /** Mixing rate −ln|λ₂| per step (∞ when |λ₂| = 0). */
  mixingRate: number;
}

/**
 * Full spectrum of a transfer-operator (Ulam) transition matrix via the general
 * non-symmetric eigensolver. For a row-stochastic P the dominant eigenvalue is 1
 * (the invariant measure); the subdominant modulus |λ₂| sets the rate at which
 * densities relax to it. Validated against closed forms — a 2-state chain
 * [[1−a, a],[b, 1−b]] has eigenvalues {1, 1−a−b}, and a doubly-stochastic ring
 * random walk has the cosine spectrum {cos(2πk/N)}.
 */
export function transferOperatorSpectrum(transition: readonly number[], boxes: number): TransferOperatorSpectrum {
  if (!Number.isInteger(boxes) || boxes < 1)
    throw new Error('transferOperatorSpectrum: boxes must be a positive integer.');
  if (transition.length < boxes * boxes) throw new Error('transferOperatorSpectrum: transition shorter than boxes².');
  const matrix: number[][] = Array.from({ length: boxes }, (_, i) =>
    Array.from({ length: boxes }, (_, j) => transition[i * boxes + j] ?? 0)
  );
  const eigenvalues = eigenvaluesGeneral(matrix);
  eigenvalues.sort((p, q) => Math.hypot(q.re, q.im) - Math.hypot(p.re, p.im));
  const moduli = eigenvalues.map((z) => Math.hypot(z.re, z.im));
  const subdominantModulus = boxes >= 2 ? (moduli[1] ?? 0) : 0;
  return {
    eigenvalues,
    moduli,
    subdominantModulus,
    spectralGap: 1 - subdominantModulus,
    mixingRate: subdominantModulus > 0 ? -Math.log(subdominantModulus) : Number.POSITIVE_INFINITY
  };
}
