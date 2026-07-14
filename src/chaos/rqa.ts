/**
 * Recurrence Quantification Analysis (RQA) of a scalar time series
 * (Eckmann–Kamphorst–Ruelle recurrence plots, 1987; Marwan, Romano, Thiel &
 * Kurths quantification, Phys. Rep. 2007).
 *
 * Like the 0–1 test, this is a *non-variational* chaos/structure diagnostic: it
 * works purely on an observable time series — no Jacobian, no deviation vector —
 * so its verdict is independent of the Lyapunov/tangent-space pipeline. The
 * series is time-delay embedded into an m-dimensional phase space, and the
 * recurrence matrix R_ij = Θ(ε − ‖x_i − x_j‖) records which embedded states
 * revisit each other's ε-neighbourhood. The geometry of that matrix yields:
 *
 *  - RR   recurrence rate (density of recurrence points),
 *  - DET  determinism (fraction of recurrence points on diagonal lines ≥ lMin) —
 *         high for deterministic/periodic signals, low for noise,
 *  - LAM  laminarity (fraction on vertical lines ≥ vMin) — flags laminar states,
 *  - Lmax longest diagonal line (excluding the line of identity); DIV = 1/Lmax
 *         is a finite-size proxy for the largest Lyapunov exponent,
 *  - Lmean mean diagonal line length,
 *  - ENTR Shannon entropy of the diagonal line-length distribution (complexity),
 *  - TT   trapping time (mean vertical line length).
 *
 * The threshold ε can be given directly or fixed indirectly by a target
 * recurrence rate (ε is then the matching quantile of the pairwise distances),
 * which is the recommended, scale-free way to compare different signals.
 */

import { checkedWorkProduct, NUMERICAL_WORK_BUDGETS } from '../validation/numericalBudgets';

export interface RqaOptions {
  /** Embedding dimension m. Default 1 (raw series). */
  dimension?: number;
  /** Embedding delay τ in samples. Default 1. */
  delay?: number;
  /** Recurrence threshold ε. If omitted, chosen from `targetRecurrenceRate`. */
  epsilon?: number;
  /** Target recurrence rate in (0,1) used to pick ε when `epsilon` is omitted. Default 0.1. */
  targetRecurrenceRate?: number;
  /** Minimum diagonal line length counted as a line. Default 2. */
  lMin?: number;
  /** Minimum vertical line length counted as a line. Default 2. */
  vMin?: number;
  /** Theiler window: exclude |i−j| ≤ theiler from diagonal statistics (LOI bias). Default 1. */
  theiler?: number;
}

interface NormalizedRqaOptions {
  dimension: number;
  delay: number;
  epsilon: number | undefined;
  targetRecurrenceRate: number;
  lMin: number;
  vMin: number;
  theiler: number;
}

function safeIntegerOption(name: string, value: number, minimum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be a safe integer greater than or equal to ${minimum}`);
  }
  return value;
}

function normalizeOptions(options: RqaOptions): NormalizedRqaOptions {
  const dimension = safeIntegerOption('dimension', options.dimension ?? 1, 1);
  const delay = safeIntegerOption('delay', options.delay ?? 1, 1);
  const lMin = safeIntegerOption('lMin', options.lMin ?? 2, 1);
  const vMin = safeIntegerOption('vMin', options.vMin ?? 2, 1);
  const theiler = safeIntegerOption('theiler', options.theiler ?? 1, 0);
  const epsilon = options.epsilon;
  if (epsilon !== undefined && (!Number.isFinite(epsilon) || epsilon < 0)) {
    throw new RangeError('epsilon must be finite and non-negative');
  }
  const targetRecurrenceRate = options.targetRecurrenceRate ?? 0.1;
  if (!Number.isFinite(targetRecurrenceRate) || targetRecurrenceRate <= 0 || targetRecurrenceRate >= 1) {
    throw new RangeError('targetRecurrenceRate must be finite and in (0,1)');
  }
  return { dimension, delay, epsilon, targetRecurrenceRate, lMin, vMin, theiler };
}

function validateSeries(series: readonly number[]): void {
  for (let i = 0; i < series.length; i += 1) {
    if (!Number.isFinite(series[i])) throw new TypeError(`series[${i}] must be finite`);
  }
}

/**
 * Preflight the dense O(N^2) recurrence calculation before allocating its
 * embedding, pair-distance list, or recurrence matrix.
 */
function assertDenseRqaBudget(seriesLength: number, m: number, tau: number): number {
  const lagSpan = (m - 1) * tau;
  // JavaScript arrays are much shorter than MAX_SAFE_INTEGER, so an unsafe lag
  // product necessarily means the requested embedding contains no points.
  const count = !Number.isSafeInteger(lagSpan) || lagSpan >= seriesLength ? 0 : seriesLength - lagSpan;
  if (count > NUMERICAL_WORK_BUDGETS.rqa.maxEmbeddedPoints) {
    throw new RangeError(`RQA: embedded point count must not exceed ${NUMERICAL_WORK_BUDGETS.rqa.maxEmbeddedPoints}.`);
  }
  const embeddingCells = checkedWorkProduct([count, m], 'RQA');
  if (embeddingCells > NUMERICAL_WORK_BUDGETS.rqa.maxEmbeddingCells) {
    throw new RangeError(
      `RQA: embedding exceeds the ${NUMERICAL_WORK_BUDGETS.rqa.maxEmbeddingCells}-cell memory budget.`
    );
  }
  const denseCells = checkedWorkProduct([count, count], 'RQA');
  if (denseCells > NUMERICAL_WORK_BUDGETS.rqa.maxDenseMatrixCells) {
    throw new RangeError(
      `RQA: recurrence matrix exceeds the ${NUMERICAL_WORK_BUDGETS.rqa.maxDenseMatrixCells}-cell memory budget.`
    );
  }
  const distanceWork = checkedWorkProduct([denseCells, m], 'RQA');
  if (distanceWork > NUMERICAL_WORK_BUDGETS.rqa.maxDistanceComponentEvaluations) {
    throw new RangeError(
      `RQA: distance scan exceeds the ${NUMERICAL_WORK_BUDGETS.rqa.maxDistanceComponentEvaluations}-component work budget.`
    );
  }
  return count;
}

export interface RqaResult {
  /** Recurrence rate RR ∈ [0,1]. */
  recurrenceRate: number;
  /** Determinism DET ∈ [0,1]: fraction of recurrence points on diagonals ≥ lMin. */
  determinism: number;
  /** Laminarity LAM ∈ [0,1]: fraction of recurrence points on verticals ≥ vMin. */
  laminarity: number;
  /** Longest diagonal line length (excluding the line of identity). */
  longestDiagonal: number;
  /** Divergence DIV = 1 / longestDiagonal (finite-size λ proxy). */
  divergence: number;
  /** Mean diagonal line length (over lines ≥ lMin). */
  meanDiagonal: number;
  /** Shannon entropy of the diagonal line-length distribution (lines ≥ lMin), in nats. */
  entropy: number;
  /** Trapping time: mean vertical line length (over lines ≥ vMin). */
  trappingTime: number;
  /** The threshold ε actually used. */
  epsilon: number;
  /** Number of embedded points N (series length minus (m−1)τ). */
  embeddedLength: number;
}

/** Time-delay embed a scalar series into ℝ^m with delay τ. Returns N×m row-major. */
function embed(series: readonly number[], m: number, tau: number): { points: Float64Array; count: number } {
  const count = series.length - (m - 1) * tau;
  if (count <= 0) return { points: new Float64Array(0), count: 0 };
  const points = new Float64Array(count * m);
  for (let i = 0; i < count; i += 1) {
    for (let d = 0; d < m; d += 1) points[i * m + d] = series[i + d * tau] ?? 0;
  }
  return { points, count };
}

/** Euclidean distance between embedded points i and j (each length m). */
function distance(points: Float64Array, i: number, j: number, m: number): number {
  let s = 0;
  const bi = i * m;
  const bj = j * m;
  for (let d = 0; d < m; d += 1) {
    const diff = (points[bi + d] ?? 0) - (points[bj + d] ?? 0);
    s += diff * diff;
  }
  return Math.sqrt(s);
}

/** Choose ε as the quantile of off-diagonal pairwise distances matching `targetRr`. */
function thresholdForRate(points: Float64Array, count: number, m: number, targetRr: number): number {
  const dists: number[] = [];
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) dists.push(distance(points, i, j, m));
  }
  if (dists.length === 0) return 0;
  dists.sort((a, b) => a - b);
  const q = Math.min(1, Math.max(0, targetRr));
  const idx = Math.min(dists.length - 1, Math.floor(q * dists.length));
  return dists[idx] ?? 0;
}

export interface RecurrenceMatrix {
  /** Row-major recurrence matrix R (size×size), 1 = recurrence (incl. the LOI). */
  matrix: Uint8Array;
  size: number;
  /** Threshold ε used to build the matrix. */
  epsilon: number;
}

/**
 * Build the recurrence matrix for a series under the same embedding/threshold
 * rules as {@link recurrenceQuantification} — the visual companion to the scalar
 * RQA measures (the "recurrence plot"). For identical `series` and `options` the
 * threshold (and hence the matrix) is identical to what the quantification used.
 */
export function recurrenceMatrix(series: readonly number[], options: RqaOptions = {}): RecurrenceMatrix {
  const normalized = normalizeOptions(options);
  assertDenseRqaBudget(series.length, normalized.dimension, normalized.delay);
  validateSeries(series);
  const m = normalized.dimension;
  const tau = normalized.delay;
  const { points, count } = embed(series, m, tau);
  if (count < 1) return { matrix: new Uint8Array(0), size: 0, epsilon: 0 };
  const epsilon = normalized.epsilon ?? thresholdForRate(points, count, m, normalized.targetRecurrenceRate);
  const matrix = new Uint8Array(count * count);
  for (let i = 0; i < count; i += 1) {
    matrix[i * count + i] = 1;
    for (let j = i + 1; j < count; j += 1) {
      if (distance(points, i, j, m) <= epsilon) {
        matrix[i * count + j] = 1;
        matrix[j * count + i] = 1;
      }
    }
  }
  return { matrix, size: count, epsilon };
}

/**
 * Run RQA on a scalar series. The series should be sampled on the attractor
 * (discard a transient first) and be a few hundred points or more for the line
 * statistics to be meaningful.
 */
export function recurrenceQuantification(series: readonly number[], options: RqaOptions = {}): RqaResult {
  const normalized = normalizeOptions(options);
  assertDenseRqaBudget(series.length, normalized.dimension, normalized.delay);
  validateSeries(series);
  const m = normalized.dimension;
  const tau = normalized.delay;
  const lMin = normalized.lMin;
  const vMin = normalized.vMin;
  const theiler = normalized.theiler;

  const { points, count } = embed(series, m, tau);
  const empty: RqaResult = {
    recurrenceRate: 0,
    determinism: 0,
    laminarity: 0,
    longestDiagonal: 0,
    divergence: 0,
    meanDiagonal: 0,
    entropy: 0,
    trappingTime: 0,
    epsilon: 0,
    embeddedLength: count
  };
  if (count < 2) return empty;

  const epsilon = normalized.epsilon ?? thresholdForRate(points, count, m, normalized.targetRecurrenceRate);

  // Recurrence matrix (symmetric); store densely for the line scans.
  const R = new Uint8Array(count * count);
  let recurrencePoints = 0;
  for (let i = 0; i < count; i += 1) {
    R[i * count + i] = 1; // line of identity
    for (let j = i + 1; j < count; j += 1) {
      if (distance(points, i, j, m) <= epsilon) {
        R[i * count + j] = 1;
        R[j * count + i] = 1;
        recurrencePoints += 2;
      }
    }
  }
  const recurrenceRate = recurrencePoints / (count * count - count); // exclude LOI cells

  // Diagonal line-length histogram (skip the Theiler band around the LOI).
  const diagHist = new Map<number, number>();
  for (let offset = theiler + 1; offset < count; offset += 1) {
    // Diagonal i, j=i+offset (upper triangle); the matrix is symmetric so this
    // doubles each physical line — fine, the ratios are unaffected.
    let run = 0;
    for (let i = 0; i + offset < count; i += 1) {
      if (R[i * count + (i + offset)] === 1) {
        run += 1;
      } else if (run > 0) {
        diagHist.set(run, (diagHist.get(run) ?? 0) + 1);
        run = 0;
      }
    }
    if (run > 0) diagHist.set(run, (diagHist.get(run) ?? 0) + 1);
  }

  // Vertical line-length histogram (full matrix, excluding the LOI cell).
  const vertHist = new Map<number, number>();
  for (let col = 0; col < count; col += 1) {
    let run = 0;
    for (let row = 0; row < count; row += 1) {
      const isRec = R[row * count + col] === 1 && row !== col;
      if (isRec) {
        run += 1;
      } else if (run > 0) {
        vertHist.set(run, (vertHist.get(run) ?? 0) + 1);
        run = 0;
      }
    }
    if (run > 0) vertHist.set(run, (vertHist.get(run) ?? 0) + 1);
  }

  // Diagonal-based measures.
  let diagPointsAll = 0;
  let diagPointsLines = 0;
  let diagLineCount = 0;
  let longestDiagonal = 0;
  for (const [len, cnt] of diagHist) {
    diagPointsAll += len * cnt;
    if (len > longestDiagonal) longestDiagonal = len;
    if (len >= lMin) {
      diagPointsLines += len * cnt;
      diagLineCount += cnt;
    }
  }
  const determinism = diagPointsAll > 0 ? diagPointsLines / diagPointsAll : 0;
  const meanDiagonal = diagLineCount > 0 ? diagPointsLines / diagLineCount : 0;

  // Shannon entropy of the diagonal line-length distribution (lines ≥ lMin).
  let entropy = 0;
  if (diagLineCount > 0) {
    for (const [len, cnt] of diagHist) {
      if (len < lMin) continue;
      const p = cnt / diagLineCount;
      if (p > 0) entropy -= p * Math.log(p);
    }
  }

  // Vertical-based measures (LAM, TT).
  let vertPointsAll = 0;
  let vertPointsLines = 0;
  let vertLineCount = 0;
  for (const [len, cnt] of vertHist) {
    vertPointsAll += len * cnt;
    if (len >= vMin) {
      vertPointsLines += len * cnt;
      vertLineCount += cnt;
    }
  }
  const laminarity = vertPointsAll > 0 ? vertPointsLines / vertPointsAll : 0;
  const trappingTime = vertLineCount > 0 ? vertPointsLines / vertLineCount : 0;

  return {
    recurrenceRate,
    determinism,
    laminarity,
    longestDiagonal,
    divergence: longestDiagonal > 0 ? 1 / longestDiagonal : 0,
    meanDiagonal,
    entropy,
    trappingTime,
    epsilon,
    embeddedLength: count
  };
}

/** Mean ± standard error of one RQA measure across blocks. */
export interface RqaMeasureUncertainty {
  mean: number;
  stdError: number;
}

export interface RqaUncertainty {
  /** Number of contiguous blocks the series was split into. */
  blocks: number;
  /** Per-block full RQA results (same options; threshold re-fit per block). */
  blockResults: RqaResult[];
  determinism: RqaMeasureUncertainty;
  laminarity: RqaMeasureUncertainty;
  divergence: RqaMeasureUncertainty;
  entropy: RqaMeasureUncertainty;
  trappingTime: RqaMeasureUncertainty;
  recurrenceRate: RqaMeasureUncertainty;
}

/**
 * Block-resampled uncertainty for the RQA measures: split the series into
 * `blocks` contiguous segments, quantify each independently, and report the
 * mean ± standard error across blocks. Contiguous blocks respect the temporal
 * correlation structure (the same batched-means idea as the Lyapunov
 * `batchedStandardError`), unlike an i.i.d. bootstrap which would shuffle the
 * very recurrence structure being measured. RQA is O(N²), so k blocks of N/k
 * points cost ~1/k of the full quantification — the uncertainty is cheaper
 * than the estimate itself.
 */
export function rqaBlockUncertainty(series: readonly number[], options: RqaOptions = {}, blocks = 4): RqaUncertainty {
  const normalized = normalizeOptions(options);
  validateSeries(series);
  const k = safeIntegerOption('blocks', blocks, 2);
  if (k > NUMERICAL_WORK_BUDGETS.rqa.maxUncertaintyBlocks) {
    throw new RangeError(`blocks must not exceed ${NUMERICAL_WORK_BUDGETS.rqa.maxUncertaintyBlocks}`);
  }
  const blockLength = Math.floor(series.length / k);
  const minimumBlockLength = (normalized.dimension - 1) * normalized.delay + 2;
  if (blockLength < minimumBlockLength) {
    throw new RangeError(
      `series is too short for ${k} non-empty RQA blocks with dimension ${normalized.dimension} and delay ${normalized.delay}`
    );
  }
  const remainder = series.length % k;
  const blockResults: RqaResult[] = [];
  let start = 0;
  for (let b = 0; b < k; b += 1) {
    const length = blockLength + (b < remainder ? 1 : 0);
    const slice = series.slice(start, start + length);
    start += length;
    blockResults.push(recurrenceQuantification(slice, options));
  }
  const summarize = (pick: (r: RqaResult) => number): RqaMeasureUncertainty => {
    const values = blockResults.map(pick);
    let mean = 0;
    for (const v of values) mean += v;
    mean /= values.length;
    let varSum = 0;
    for (const v of values) varSum += (v - mean) * (v - mean);
    const stdError = values.length > 1 ? Math.sqrt(varSum / (values.length - 1) / values.length) : 0;
    return { mean, stdError };
  };
  return {
    blocks: k,
    blockResults,
    determinism: summarize((r) => r.determinism),
    laminarity: summarize((r) => r.laminarity),
    divergence: summarize((r) => r.divergence),
    entropy: summarize((r) => r.entropy),
    trappingTime: summarize((r) => r.trappingTime),
    recurrenceRate: summarize((r) => r.recurrenceRate)
  };
}
