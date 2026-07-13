/**
 * Grassberger–Procaccia correlation dimension D₂ — a direct, attractor-geometry
 * estimate of fractal dimension from sampled points (or a delay-embedded time
 * series). It complements the Kaplan–Yorke (Lyapunov) dimension already in the
 * engine: KY infers dimension from the Lyapunov spectrum, GP measures it from
 * how the number of close pairs scales with radius, so agreement between the two
 * is an independent cross-check of a chaotic attractor's dimension.
 *
 * The correlation sum
 *   C(r) = (#{ (i,j): i<j, |xᵢ - xⱼ| ≤ r }) / (#pairs)
 * scales as C(r) ∝ r^{D₂} in an intermediate "scaling region", so D₂ is the
 * slope of log C(r) vs log r there.
 */
export interface CorrelationDimensionOptions {
  /** Number of log-spaced radii sampled between the smallest and largest pair distance. Default 32. */
  radiusCount?: number;
  /**
   * Lower C(r) bound of the scaling band used for the slope fit. Default 0.01.
   * Fitting at small r avoids the edge-effect flattening that biases D₂ low.
   */
  fitLowFraction?: number;
  /** Upper C(r) bound of the scaling band used for the slope fit. Default 0.1. */
  fitHighFraction?: number;
  /** Theiler window: include pair (i,j) only if |i-j| > w (removes temporal correlation). Default 0. */
  theilerWindow?: number;
}

export interface CorrelationDimensionResult {
  /** Estimated correlation dimension D₂ (slope of log C vs log r in the scaling band). */
  dimension: number;
  /** Coefficient of determination R² of the linear fit (closeness to a clean power law). */
  rSquared: number;
  /** Radii sampled. */
  radii: number[];
  /** Correlation sums C(r) at each radius. */
  correlationSums: number[];
  /** [rLow, rHigh] window actually used for the fit. */
  fitRange: [number, number];
  /** Number of (i<j) pairs used (after the Theiler window). */
  pairs: number;
}

/**
 * Delay (Takens) embedding of a scalar series into `dimension`-vector points
 * xᵢ = [s_i, s_{i+τ}, …, s_{i+(dimension-1)τ}].
 */
export function delayEmbed(series: readonly number[], dimension: number, tau = 1): number[][] {
  if (!Number.isInteger(dimension) || dimension < 1)
    throw new Error('delayEmbed: dimension must be a positive integer');
  if (!Number.isInteger(tau) || tau < 1) throw new Error('delayEmbed: tau must be a positive integer');
  const count = series.length - (dimension - 1) * tau;
  if (count < 1) throw new Error('delayEmbed: series too short for the requested embedding');
  const out: number[][] = [];
  for (let i = 0; i < count; i += 1) {
    const v = new Array<number>(dimension);
    for (let d = 0; d < dimension; d += 1) v[d] = series[i + d * tau] ?? 0;
    out.push(v);
  }
  return out;
}

function euclidean(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let d = 0; d < a.length; d += 1) {
    const diff = (a[d] ?? 0) - (b[d] ?? 0);
    s += diff * diff;
  }
  return Math.sqrt(s);
}

/** Correlation sum C(r): fraction of point pairs (i<j, |i-j|>theilerWindow) within radius r. */
export function correlationSum(points: readonly (readonly number[])[], r: number, theilerWindow = 0): number {
  const n = points.length;
  let within = 0;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (j - i <= theilerWindow) continue;
      total += 1;
      if (euclidean(points[i]!, points[j]!) <= r) within += 1;
    }
  }
  return total > 0 ? within / total : 0;
}

/**
 * Estimate the correlation dimension D₂ from a point cloud. Computes every
 * pairwise distance once (O(N²)), sorts them, then evaluates C(r) on a
 * log-spaced radius grid by binary search and fits the slope in the scaling
 * band. Use ≲ a few thousand points.
 */
export function correlationDimension(
  points: readonly (readonly number[])[],
  options: CorrelationDimensionOptions = {}
): CorrelationDimensionResult {
  const n = points.length;
  if (n < 10) throw new Error('correlationDimension: need at least 10 points');
  const radiusCount = options.radiusCount ?? 32;
  const cLo = options.fitLowFraction ?? 0.01;
  const cHi = options.fitHighFraction ?? 0.1;
  const w = options.theilerWindow ?? 0;

  const dists: number[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (j - i <= w) continue;
      dists.push(euclidean(points[i]!, points[j]!));
    }
  }
  if (dists.length < 3) throw new Error('correlationDimension: too few pairs after the Theiler window');
  dists.sort((a, b) => a - b);
  const total = dists.length;
  const dMin = dists.find((d) => d > 0) ?? dists[total - 1]!;
  const dMax = dists[total - 1]!;
  if (!(dMax > 0)) throw new Error('correlationDimension: all points coincide');

  // C(r) via count of distances ≤ r (binary search on the sorted distances).
  const countLeq = (r: number): number => {
    let lo = 0;
    let hi = total;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (dists[mid]! <= r) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const radii: number[] = [];
  const correlationSums: number[] = [];
  const logRMin = Math.log(dMin);
  const logRMax = Math.log(dMax);
  for (let i = 0; i < radiusCount; i += 1) {
    const r = Math.exp(logRMin + ((logRMax - logRMin) * i) / (radiusCount - 1));
    radii.push(r);
    correlationSums.push(countLeq(r) / total);
  }

  // Least-squares slope of log C vs log r over the scaling band cLo ≤ C ≤ cHi.
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < radiusCount; i += 1) {
    const c = correlationSums[i]!;
    if (c >= cLo && c <= cHi) {
      xs.push(Math.log(radii[i]!));
      ys.push(Math.log(c));
    }
  }
  // Fall back to the middle third of the grid if the band is too sparse.
  if (xs.length < 3) {
    xs.length = 0;
    ys.length = 0;
    const a = Math.floor(radiusCount / 3);
    const b = Math.ceil((2 * radiusCount) / 3);
    for (let i = a; i < b; i += 1) {
      const c = correlationSums[i]!;
      if (c > 0) {
        xs.push(Math.log(radii[i]!));
        ys.push(Math.log(c));
      }
    }
  }

  const m = xs.length;
  const sx = xs.reduce((u, v) => u + v, 0);
  const sy = ys.reduce((u, v) => u + v, 0);
  const sxx = xs.reduce((u, v) => u + v * v, 0);
  const sxy = xs.reduce((u, v, i) => u + v * ys[i]!, 0);
  const denom = m * sxx - sx * sx;
  const slope = denom !== 0 ? (m * sxy - sx * sy) / denom : NaN;
  const intercept = (sy - slope * sx) / m;
  // R² of the fit.
  const yMean = sy / m;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < m; i += 1) {
    const pred = slope * xs[i]! + intercept;
    ssRes += (ys[i]! - pred) ** 2;
    ssTot += (ys[i]! - yMean) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 1;

  return {
    dimension: slope,
    rSquared,
    radii,
    correlationSums,
    fitRange: [Math.exp(xs[0] ?? logRMin), Math.exp(xs[m - 1] ?? logRMax)],
    pairs: total
  };
}
