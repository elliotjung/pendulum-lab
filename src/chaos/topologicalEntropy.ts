/**
 * **Topological entropy** h_top — the exponential growth rate of distinguishable
 * orbits, the canonical scalar measure of "how chaotic" a system is. For a
 * subshift of finite type (a topological Markov chain) with 0/1 transition
 * matrix A, the number of admissible length-n words grows like ρ(A)ⁿ, so by
 * Parry's formula
 *
 *     h_top = log ρ(A),
 *
 * the logarithm of the Perron–Frobenius eigenvalue (spectral radius) of A. For a
 * non-negative matrix ρ(A) is the dominant eigenvalue and is obtained by **power
 * iteration — no general eigensolver needed** — which is what this module does
 * (the same tool used by the transfer-operator module, here applied to the
 * topological 0/1 matrix instead of the row-stochastic one).
 *
 * It self-validates against closed forms:
 *   • full 2-shift  A = [[1,1],[1,1]]      → h = log 2 (exactly);
 *   • golden-mean shift (forbid "11") A = [[1,1],[1,0]] → h = log φ, φ the golden
 *     ratio (Perron eigenvalue φ = (1+√5)/2 from λ² = λ + 1);
 *   • full k-shift (all-ones k×k)          → h = log k.
 *
 * For a piecewise-monotone interval map the same machinery applies through the
 * topological covering matrix A_{ij} = 1 ⇔ f(I_i) ⊇ I_j on a Markov partition
 * {I_i}: the full tent map x ↦ 1 − |2x − 1| then returns log 2 on dyadic grids.
 * (Uniform grids are Markov only for special slopes; the doubling map is
 * discontinuous at box edges, so its covering matrix is supplied directly rather
 * than sampled — see the tests.)
 */

export interface PerronResult {
  /** Spectral radius ρ(A) (the Perron–Frobenius eigenvalue). */
  spectralRadius: number;
  /** Dominant non-negative eigenvector, normalised to unit ℓ¹ norm. */
  eigenvector: number[];
  /** Power-iteration steps taken. */
  iterations: number;
  /** Whether the eigenvalue ratio converged within tolerance. */
  converged: boolean;
}

export interface TopologicalEntropyResult {
  /** Topological entropy h = log ρ(A) (−∞ for the empty system ρ = 0). */
  entropy: number;
  /** Perron eigenvalue ρ(A) = word-growth rate per step. */
  spectralRadius: number;
  /** Dominant eigenvector (ℓ¹-normalised). */
  eigenvector: number[];
  iterations: number;
  converged: boolean;
}

/**
 * Spectral radius ρ(A) of a square non-negative matrix `A` (array of rows) via
 * power iteration from the uniform positive vector. For an irreducible primitive
 * A the ℓ¹ ratio ‖A v‖₁ / ‖v‖₁ → ρ; for an imprimitive (periodic) A that ratio
 * can oscillate, so the returned radius falls back to the Gelfand geometric mean
 * (∏ sₖ)^{1/steps} → ρ, which converges regardless.
 */
export function perronEigenvalue(
  matrix: readonly (readonly number[])[],
  options: { iterations?: number; tolerance?: number } = {}
): PerronResult {
  const n = matrix.length;
  if (n === 0) throw new Error('perronEigenvalue: matrix must be non-empty.');
  for (let i = 0; i < n; i += 1) {
    const row = matrix[i]!;
    if (row.length !== n) throw new Error('perronEigenvalue: matrix must be square.');
    for (let j = 0; j < n; j += 1) {
      if (!((row[j] ?? 0) >= 0)) throw new Error('perronEigenvalue: entries must be non-negative.');
    }
  }
  const maxIterations = options.iterations ?? 10000;
  const tolerance = options.tolerance ?? 1e-13;

  let v = new Array<number>(n).fill(1 / n); // unit ℓ¹ norm, strictly positive start
  let lambda = 0;
  let prev = Number.NaN;
  let logSum = 0; // Σ log sₖ — accumulated growth for the Gelfand fallback
  let steps = 0;
  let converged = false;
  let it = 0;
  for (; it < maxIterations; it += 1) {
    const w = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i += 1) {
      const vi = v[i] ?? 0;
      if (vi === 0) continue;
      const row = matrix[i]!;
      for (let j = 0; j < n; j += 1) w[j] = (w[j] ?? 0) + vi * (row[j] ?? 0);
    }
    let s = 0;
    for (let j = 0; j < n; j += 1) s += w[j] ?? 0; // ‖A v‖₁ (w ≥ 0)
    if (s === 0) {
      lambda = 0;
      converged = true;
      it += 1;
      break;
    }
    lambda = s; // = ‖A v‖₁ / ‖v‖₁ since v carries unit ℓ¹ norm
    logSum += Math.log(s);
    steps += 1;
    for (let j = 0; j < n; j += 1) w[j] = (w[j] ?? 0) / s;
    v = w;
    if (Number.isFinite(prev) && Math.abs(lambda - prev) < tolerance) {
      converged = true;
      it += 1;
      break;
    }
    prev = lambda;
  }
  const spectralRadius = converged ? lambda : Math.exp(logSum / Math.max(steps, 1));
  return { spectralRadius, eigenvector: v, iterations: it, converged };
}

/**
 * Topological entropy h = log ρ(A) of a subshift of finite type given its square
 * non-negative transition matrix `transition` (array of rows; entries are the
 * number of edges, usually 0/1).
 */
export function subshiftEntropy(
  transition: readonly (readonly number[])[],
  options: { iterations?: number; tolerance?: number } = {}
): TopologicalEntropyResult {
  const p = perronEigenvalue(transition, options);
  const entropy = p.spectralRadius > 0 ? Math.log(p.spectralRadius) : Number.NEGATIVE_INFINITY;
  return {
    entropy,
    spectralRadius: p.spectralRadius,
    eigenvector: p.eigenvector,
    iterations: p.iterations,
    converged: p.converged
  };
}

/**
 * Topological covering matrix of a continuous 1-D map on `[domain[0], domain[1]]`
 * partitioned into `boxes` equal cells: A_{ij} = 1 ⇔ f(I_i) ⊇ I_j, where the
 * image f(I_i) is the interval [min, max] of `map` over box i (a continuous map
 * sends the connected box to a connected interval). The image is sampled at the
 * two endpoints plus `samplesPerBox` interior points, so a unimodal box whose
 * extremum is interior is captured. Returned as an array of 0/1 rows.
 *
 * The covering relation gives the exact topological entropy only on a Markov
 * partition (image edges land on box edges); uniform grids are Markov for the
 * full tent map on dyadic box counts. Discontinuous maps (e.g. the doubling map)
 * are *not* suitable here — feed their covering matrix to `subshiftEntropy`.
 */
export function coveringTransitionMatrix1D(
  map: (x: number) => number,
  domain: readonly [number, number],
  boxes: number,
  samplesPerBox = 64
): number[][] {
  if (!Number.isInteger(boxes) || boxes < 2)
    throw new Error('coveringTransitionMatrix1D: boxes must be an integer ≥ 2.');
  if (!Number.isInteger(samplesPerBox) || samplesPerBox < 1)
    throw new Error('coveringTransitionMatrix1D: samplesPerBox must be ≥ 1.');
  const [a, b] = domain;
  if (!(b > a)) throw new Error('coveringTransitionMatrix1D: domain must have b > a.');
  const width = (b - a) / boxes;
  const tol = width * 1e-6;

  const lo = new Array<number>(boxes).fill(Infinity);
  const hi = new Array<number>(boxes).fill(-Infinity);
  for (let i = 0; i < boxes; i += 1) {
    const left = a + i * width;
    const right = a + (i + 1) * width;
    let mn = Infinity;
    let mx = -Infinity;
    const observe = (x: number): void => {
      const y = map(x);
      if (y < mn) mn = y;
      if (y > mx) mx = y;
    };
    observe(left);
    observe(right);
    for (let s = 0; s < samplesPerBox; s += 1) observe(left + ((s + 0.5) / samplesPerBox) * width);
    lo[i] = mn;
    hi[i] = mx;
  }

  const matrix: number[][] = Array.from({ length: boxes }, () => new Array<number>(boxes).fill(0));
  for (let i = 0; i < boxes; i += 1) {
    const li = lo[i] ?? Infinity;
    const hiI = hi[i] ?? -Infinity;
    const rowI = matrix[i]!;
    for (let j = 0; j < boxes; j += 1) {
      const leftJ = a + j * width;
      const rightJ = a + (j + 1) * width;
      if (li <= leftJ + tol && hiI >= rightJ - tol) rowI[j] = 1;
    }
  }
  return matrix;
}

/**
 * Topological entropy of a continuous piecewise-monotone 1-D map via its covering
 * matrix on a `boxes`-cell uniform partition of `domain`. Exact on a Markov
 * partition (e.g. the full tent map on a dyadic box count → log 2).
 */
export function topologicalEntropy1D(
  map: (x: number) => number,
  domain: readonly [number, number],
  boxes: number,
  samplesPerBox = 64,
  options: { iterations?: number; tolerance?: number } = {}
): TopologicalEntropyResult {
  const matrix = coveringTransitionMatrix1D(map, domain, boxes, samplesPerBox);
  return subshiftEntropy(matrix, options);
}
