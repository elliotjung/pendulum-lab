/**
 * Multifractal analysis — the generalized (Rényi) dimensions D_q and the f(α)
 * singularity spectrum. Where the correlation dimension reports a single number,
 * a multifractal measure needs a whole spectrum: D_q is non-increasing in q,
 * with D_0 the box-counting (capacity) dimension, D_1 the information dimension,
 * and D_2 the correlation dimension. The f(α) spectrum is the Legendre transform
 * of the mass exponent τ(q) = (q-1)D_q and characterises the interwoven scaling
 * of strong- and weak-measure regions — the same framework used for strange
 * attractors, turbulence, and rough device surfaces.
 *
 * Z(q,ε) = Σ_i p_i^q ∼ ε^{τ(q)}, so τ(q) is the slope of log Z vs log ε and
 * D_q = τ(q)/(q-1) (q≠1); D_1 is the slope of Σ p_i log p_i vs log ε.
 */
export interface ScaleMeasure {
  /** Box size ε (> 0). */
  epsilon: number;
  /** Probabilities p_i of the occupied boxes at this scale (Σ p_i = 1). */
  probabilities: number[];
}

export interface GeneralizedDimensions {
  q: number[];
  /** Generalized (Rényi) dimension D_q at each q. */
  Dq: number[];
  /** Mass exponent τ(q) = (q-1)·D_q at each q. */
  tau: number[];
  /** R² of the log Z vs log ε fit at each q (closeness to clean scaling). */
  rSquared: number[];
}

function leastSquares(x: readonly number[], y: readonly number[]): { slope: number; rSquared: number } {
  const m = x.length;
  const sx = x.reduce((a, v) => a + v, 0);
  const sy = y.reduce((a, v) => a + v, 0);
  const sxx = x.reduce((a, v) => a + v * v, 0);
  const sxy = x.reduce((a, v, i) => a + v * y[i]!, 0);
  const denom = m * sxx - sx * sx;
  const slope = denom !== 0 ? (m * sxy - sx * sy) / denom : NaN;
  const intercept = (sy - slope * sx) / m;
  const yMean = sy / m;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < m; i += 1) {
    ssRes += (y[i]! - (slope * x[i]! + intercept)) ** 2;
    ssTot += (y[i]! - yMean) ** 2;
  }
  return { slope, rSquared: ssTot > 0 ? 1 - ssRes / ssTot : 1 };
}

/**
 * Generalized dimensions from per-scale box measures. For each q, fits the
 * scaling of the partition function across the supplied scales. q = 1 uses the
 * information form Σ p_i log p_i. Needs ≥ 2 scales.
 */
export function renyiDimensions(scales: readonly ScaleMeasure[], qs: readonly number[]): GeneralizedDimensions {
  if (scales.length < 2) throw new Error('renyiDimensions: need at least 2 scales');
  const logEps = scales.map((s) => Math.log(s.epsilon));
  const q: number[] = [];
  const Dq: number[] = [];
  const tau: number[] = [];
  const rSquared: number[] = [];
  for (const qv of qs) {
    let slope: number;
    let r2: number;
    if (Math.abs(qv - 1) < 1e-9) {
      // Information dimension: Σ p_i ln p_i ~ D_1 · ln ε.
      const ys = scales.map((s) => s.probabilities.reduce((a, p) => a + (p > 0 ? p * Math.log(p) : 0), 0));
      ({ slope, rSquared: r2 } = leastSquares(logEps, ys));
      q.push(qv);
      Dq.push(slope);
      tau.push(0);
      rSquared.push(r2);
    } else {
      const ys = scales.map((s) => Math.log(s.probabilities.reduce((a, p) => a + Math.pow(p, qv), 0)));
      ({ slope, rSquared: r2 } = leastSquares(logEps, ys));
      q.push(qv);
      tau.push(slope);
      Dq.push(slope / (qv - 1));
      rSquared.push(r2);
    }
  }
  return { q, Dq, tau, rSquared };
}

/**
 * Occupied-box probabilities for a point cloud at box size ε. Boxes are the
 * regular ε-grid offset from each coordinate's minimum; only non-empty boxes
 * are returned (their counts normalised to sum to 1).
 */
export function boxProbabilities(points: readonly (readonly number[])[], epsilon: number): number[] {
  if (!(epsilon > 0)) throw new Error('boxProbabilities: epsilon must be positive');
  const n = points.length;
  if (n === 0) return [];
  const dim = points[0]!.length;
  const mins = new Array<number>(dim).fill(Infinity);
  for (const p of points) for (let d = 0; d < dim; d += 1) mins[d] = Math.min(mins[d]!, p[d] ?? 0);
  const counts = new Map<string, number>();
  for (const p of points) {
    let key = '';
    for (let d = 0; d < dim; d += 1) key += `${Math.floor(((p[d] ?? 0) - mins[d]!) / epsilon)},`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.values(), (c) => c / n);
}

export interface GeneralizedDimensionOptions {
  /** q values to evaluate. Default integers/halves from 0 to 5 plus 1. */
  qs?: number[];
  /** Box sizes ε. Default 6 log-spaced sizes spanning the data extent. */
  boxSizes?: number[];
}

/** Generalized dimensions of a point cloud via multi-scale box counting. */
export function generalizedDimensions(
  points: readonly (readonly number[])[],
  options: GeneralizedDimensionOptions = {}
): GeneralizedDimensions {
  if (points.length < 10) throw new Error('generalizedDimensions: need at least 10 points');
  const dim = points[0]!.length;
  const qs = options.qs ?? [0, 1, 2, 3, 4, 5];
  let boxSizes = options.boxSizes;
  if (!boxSizes) {
    let extent = 0;
    for (let d = 0; d < dim; d += 1) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of points) {
        lo = Math.min(lo, p[d] ?? 0);
        hi = Math.max(hi, p[d] ?? 0);
      }
      extent = Math.max(extent, hi - lo);
    }
    // extent/2 … extent/16: kept coarse enough that boxes stay populated, since
    // box counts saturate at N once ε falls below ~N^(-1/d) and bias D_q low.
    boxSizes = [];
    for (let i = 0; i < 6; i += 1) boxSizes.push(extent / Math.pow(2, 1 + i * 0.6));
  }
  const scales: ScaleMeasure[] = boxSizes.map((epsilon) => ({
    epsilon,
    probabilities: boxProbabilities(points, epsilon)
  }));
  return renyiDimensions(scales, qs);
}

export interface SingularitySpectrum {
  q: number[];
  /** Hölder exponent α(q) = dτ/dq. */
  alpha: number[];
  /** Singularity spectrum f(α) = qα - τ(q). */
  f: number[];
}

/**
 * f(α) singularity spectrum via the Legendre transform of τ(q): α = dτ/dq
 * (central differences on the q-grid), f = qα - τ. The q-grid must be sorted
 * ascending with ≥ 3 points.
 */
export function singularitySpectrum(result: Pick<GeneralizedDimensions, 'q' | 'tau'>): SingularitySpectrum {
  const { q, tau } = result;
  if (q.length < 3) throw new Error('singularitySpectrum: need at least 3 q values');
  const alpha: number[] = [];
  const f: number[] = [];
  for (let i = 0; i < q.length; i += 1) {
    let a: number;
    if (i === 0) a = (tau[1]! - tau[0]!) / (q[1]! - q[0]!);
    else if (i === q.length - 1) a = (tau[i]! - tau[i - 1]!) / (q[i]! - q[i - 1]!);
    else a = (tau[i + 1]! - tau[i - 1]!) / (q[i + 1]! - q[i - 1]!);
    alpha.push(a);
    f.push(q[i]! * a - tau[i]!);
  }
  return { q: [...q], alpha, f };
}

/**
 * Analytic per-scale measures of the binomial multiplicative cascade on [0,1]
 * (left/right multipliers p and 1-p) at levels `levels`. A canonical
 * multifractal with closed-form D_q = log2(p^q + (1-p)^q)/(1-q) — used to
 * validate {@link renyiDimensions}.
 */
export function binomialCascadeScales(p: number, levels: readonly number[]): ScaleMeasure[] {
  if (!(p > 0 && p < 1)) throw new Error('binomialCascadeScales: p must be in (0,1)');
  const binom = (n: number, k: number): number => {
    let c = 1;
    for (let i = 0; i < k; i += 1) c = (c * (n - i)) / (i + 1);
    return c;
  };
  return levels.map((n) => {
    const probabilities: number[] = [];
    for (let k = 0; k <= n; k += 1) {
      const prob = Math.pow(p, n - k) * Math.pow(1 - p, k);
      const multiplicity = Math.round(binom(n, k));
      for (let m = 0; m < multiplicity; m += 1) probabilities.push(prob);
    }
    return { epsilon: Math.pow(2, -n), probabilities };
  });
}
