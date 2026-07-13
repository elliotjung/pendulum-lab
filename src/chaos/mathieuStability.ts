/**
 * **Mathieu / parametric-resonance stability diagram** — the (δ, ε) map of
 * Arnold tongues for the Mathieu equation ẍ + (δ + ε cos t) x = 0, computed by
 * sweeping the linear Floquet solver (`floquetLinearSpectrum`) over a parameter
 * grid. This is the headless computational core of a parametric-resonance chart
 * (the kind a Kapitza-pendulum or driven-lattice UI would plot): every cell runs
 * one monodromy/Floquet-multiplier evaluation, and the orbit is unstable exactly
 * where a multiplier leaves the unit circle.
 *
 * The Mathieu coefficient matrix A(t) = [[0, 1], [−(δ + ε cos t), 0]] has
 * tr A ≡ 0, so the flow is Hamiltonian: det M = 1 and the two Floquet multipliers
 * form a reciprocal pair (ρ, 1/ρ). Stability is therefore a clean dichotomy —
 * both multipliers on the unit circle (bounded, |ρ| = 1) versus a real
 * reciprocal pair (one |ρ| > 1, exponential parametric growth). The instability
 * tongues emanate from δ = (n/2)² = ¼, 1, 9/4, … on the ε = 0 axis; the principal
 * tongue at δ = ¼ opens for any ε > 0, which the sweep reproduces.
 *
 * The underlying single-point physics is already pinned in
 * `tests/floquet-linear.test.ts`; this module adds the 2-D sweep, its tongue
 * classification, and the closed-form tongue-tip locations.
 */
import { floquetLinearSpectrum, type FloquetLinearResult } from './floquetLinear';

const MATHIEU_PERIOD = 2 * Math.PI;

/** Coefficient matrix A(t) of the Mathieu system for given (δ, ε). */
export function mathieuCoefficient(delta: number, epsilon: number): (t: number) => number[][] {
  return (t: number) => [
    [0, 1],
    [-(delta + epsilon * Math.cos(t)), 0]
  ];
}

export interface MathieuOptions {
  /** RK4 substeps over one period in the monodromy integration. Default 2000. */
  steps?: number;
  /** Tolerance on the spectral radius for the stable/unstable verdict. Default 5e-3. */
  stabilityTolerance?: number;
}

/** Full linear-Floquet result (monodromy, multipliers, det, stability) at (δ, ε). */
export function mathieuFloquet(delta: number, epsilon: number, options: MathieuOptions = {}): FloquetLinearResult {
  return floquetLinearSpectrum(mathieuCoefficient(delta, epsilon), MATHIEU_PERIOD, 2, {
    steps: options.steps ?? 2000,
    stabilityTolerance: options.stabilityTolerance ?? 5e-3
  });
}

export interface MathieuStabilityCell {
  delta: number;
  epsilon: number;
  /** Spectral radius max|ρ_k| of the monodromy (1 ⇒ stable, > 1 ⇒ unstable). */
  spectralRadius: number;
  /** |det M − 1| — the Liouville/Hamiltonian check (≈ 0 to integration accuracy). */
  determinantDrift: number;
  /** Stable iff the spectral radius is within tolerance of 1. */
  stable: boolean;
}

export interface MathieuStabilityDiagramSpec {
  /** δ axis [min, max]. */
  deltaRange: [number, number];
  /** ε axis [min, max]. */
  epsilonRange: [number, number];
  /** δ samples (≥ 2). Default 40. */
  deltaSamples?: number;
  /** ε samples (≥ 2). Default 40. */
  epsilonSamples?: number;
  /** Floquet options forwarded to every cell. */
  options?: MathieuOptions;
}

export interface MathieuStabilityDiagram {
  /** δ grid coordinates. */
  deltas: number[];
  /** ε grid coordinates. */
  epsilons: number[];
  /** Cells row-major over (ε index outer, δ index inner). */
  cells: MathieuStabilityCell[];
  /** Stable flags aligned with `cells` (compact mask for plotting). */
  stableMask: boolean[];
  /** Fraction of grid cells classified unstable. */
  unstableFraction: number;
}

function linspace(min: number, max: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 2)
    throw new Error('mathieuStabilityDiagram: sample counts must be integers ≥ 2.');
  return Array.from({ length: count }, (_, i) => min + ((max - min) * i) / (count - 1));
}

/**
 * Sweep the Mathieu Floquet stability over a (δ, ε) grid, returning the Arnold-
 * tongue map: each cell's spectral radius, Liouville drift and stable flag.
 */
export function mathieuStabilityDiagram(spec: MathieuStabilityDiagramSpec): MathieuStabilityDiagram {
  const deltas = linspace(spec.deltaRange[0], spec.deltaRange[1], spec.deltaSamples ?? 40);
  const epsilons = linspace(spec.epsilonRange[0], spec.epsilonRange[1], spec.epsilonSamples ?? 40);
  const cells: MathieuStabilityCell[] = [];
  const stableMask: boolean[] = [];
  let unstable = 0;
  for (const epsilon of epsilons) {
    for (const delta of deltas) {
      const result = mathieuFloquet(delta, epsilon, spec.options);
      const cell: MathieuStabilityCell = {
        delta,
        epsilon,
        spectralRadius: result.spectralRadius,
        determinantDrift: Math.abs(result.determinant - 1),
        stable: result.stable
      };
      cells.push(cell);
      stableMask.push(cell.stable);
      if (!cell.stable) unstable += 1;
    }
  }
  return { deltas, epsilons, cells, stableMask, unstableFraction: cells.length > 0 ? unstable / cells.length : 0 };
}

/**
 * Closed-form tongue-tip locations δ = (n/2)² on the ε = 0 axis (parametric
 * resonance at half-integer multiples of the natural frequency), n = 1…count.
 */
export function mathieuTongueTips(count: number): number[] {
  if (!Number.isInteger(count) || count < 1) throw new Error('mathieuTongueTips: count must be a positive integer.');
  return Array.from({ length: count }, (_, i) => ((i + 1) / 2) ** 2);
}
