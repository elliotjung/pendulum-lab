/**
 * HAVOK — the Hankel Alternative View Of Koopman (Brunton, Brunton, Proctor,
 * Kaiser & Kutz, *Nature Communications* 2017). It closes the data-driven layer:
 * SINDy finds a sparse *nonlinear* model, DMD/EDMD a global *linear* one, and
 * HAVOK a linear model *with intermittent forcing* from a single scalar series.
 *
 * A scalar measurement y(t) is time-delay embedded into a Hankel matrix; its SVD
 * yields the **eigen-time-delay coordinates** v₁(t), …, v_r(t) (the columns of V).
 * The leading r−1 evolve almost linearly, driven by the last coordinate:
 *
 *     d/dt [v₁ … v_{r−1}]ᵀ = A [v₁ … v_{r−1}]ᵀ + B v_r .
 *
 * Because the regression is on the *derivative*, A is the continuous-time
 * generator and its eigenvalues are the intrinsic linear frequencies/growth
 * rates directly (no ln/dt). The decisive HAVOK result is that for chaotic data
 * the forcing v_r is **intermittent** — strongly non-Gaussian (high excess
 * kurtosis), switching on at the moments the trajectory reorganises — while the
 * core coordinates are smooth. Built on the engine's own thin SVD (`svd.ts`),
 * central differences (`sindy.ts`) and Cholesky solver; the spectrum of A comes
 * from `complexEig`.
 */
import { choleskyFactor, choleskySolveFactored } from '../physics/linearSolve';
import { matrixEigenvalues, type Complex } from './complexEig';
import { finiteDifferenceDerivatives } from './sindy';
import { thinSvd } from './svd';

/** A Hankel (time-delay) matrix of a scalar series: rows = delays, cols = time. */
export interface HankelMatrix {
  rows: number;
  cols: number;
  /** Row-major rows×cols, `data[i*cols + j] = series[i + j]`. */
  data: number[];
}

/** Build the Hankel matrix with `delays` rows from a scalar series. */
export function hankelMatrix(series: readonly number[], delays: number): HankelMatrix {
  if (!Number.isInteger(delays) || delays < 2) throw new Error('hankelMatrix: delays must be an integer ≥ 2.');
  const cols = series.length - delays + 1;
  if (cols < 2) throw new Error('hankelMatrix: series too short for the requested delays.');
  const data = new Array<number>(delays * cols).fill(0);
  for (let i = 0; i < delays; i += 1) {
    for (let j = 0; j < cols; j += 1) data[i * cols + j] = series[i + j] ?? 0;
  }
  return { rows: delays, cols, data };
}

export interface HavokResult {
  /** Number of Hankel rows (the embedding dimension / stackmax). */
  delays: number;
  /** Retained SVD rank r (modes). */
  rank: number;
  /** Hankel singular values (descending), one per retained mode. */
  singularValues: number[];
  /** Eigen-time-delay coordinates V: `delayCoordinates[t][i]` = mode i at time t. */
  delayCoordinates: number[][];
  /** Continuous-time linear operator A, row-major (r−1)×(r−1). */
  linearOperator: number[];
  /** Forcing coupling B, length r−1. */
  forcingCoupling: number[];
  /** The forcing coordinate v_r over time (the intermittent driver). */
  forcing: number[];
  /** Eigenvalues of A — the intrinsic continuous-time spectrum of the core. */
  eigenvalues: Complex[];
  /** Relative residual of the linear+forcing fit to the core derivatives. */
  reconstructionError: number;
  /** Excess kurtosis of the forcing v_r (≫ 0 ⇒ intermittent / bursty). */
  forcingExcessKurtosis: number;
  /** Excess kurtosis of the leading coordinate v₁ (≈ smooth, for comparison). */
  leadingExcessKurtosis: number;
}

function excessKurtosis(x: readonly number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  let mean = 0;
  for (const v of x) mean += v;
  mean /= n;
  let m2 = 0;
  let m4 = 0;
  for (const v of x) {
    const d = v - mean;
    m2 += d * d;
    m4 += d * d * d * d;
  }
  m2 /= n;
  m4 /= n;
  if (m2 <= 0) return 0;
  return m4 / (m2 * m2) - 3;
}

/**
 * HAVOK analysis of a scalar time series sampled at `dt`. `options.delays` is the
 * Hankel embedding dimension; `options.rank` the number of retained modes (the
 * last is the forcing). Returns the linear operator + forcing model, the spectrum
 * of A, the fit residual and the forcing/leading intermittency (excess kurtosis).
 */
export function havokAnalysis(
  series: readonly number[],
  dt: number,
  options: { delays: number; rank: number }
): HavokResult {
  if (!(dt > 0)) throw new Error('havokAnalysis: dt must be positive.');
  if (!Number.isInteger(options.rank) || options.rank < 2)
    throw new Error('havokAnalysis: rank must be an integer ≥ 2.');
  const hankel = hankelMatrix(series, options.delays);
  const svd = thinSvd(hankel.data, hankel.rows, hankel.cols, { maxRank: options.rank });
  const r = svd.rank;
  if (r < 2)
    throw new Error(
      'havokAnalysis: the Hankel matrix has numerical rank < 2; the series is too low-dimensional for this rank.'
    );
  const m = hankel.cols;

  // Eigen-time-delay coordinates V (m × r): svd.v is cols×rank row-major.
  const delayCoordinates: number[][] = [];
  for (let t = 0; t < m; t += 1) {
    const row = new Array<number>(r).fill(0);
    for (let i = 0; i < r; i += 1) row[i] = svd.v[t * r + i] ?? 0;
    delayCoordinates.push(row);
  }

  // Continuous-time derivatives of every coordinate; trim the endpoints so the
  // one-sided end differences do not bias the regression.
  const dV = finiteDifferenceDerivatives(delayCoordinates, dt);
  const start = 1;
  const end = m - 1; // exclusive
  const core = r - 1;

  // Regress d/dt v_i (i < r−1) on all r coordinates: solve the r×r normal
  // equations G·coefᵢ = rhsᵢ once-factored, where G = RᵀR over the trimmed rows.
  const gram = new Float64Array(r * r);
  for (let a = 0; a < r; a += 1) {
    for (let b = a; b < r; b += 1) {
      let s = 0;
      for (let t = start; t < end; t += 1) s += (delayCoordinates[t]![a] ?? 0) * (delayCoordinates[t]![b] ?? 0);
      gram[a * r + b] = s;
      gram[b * r + a] = s;
    }
  }
  const factor = new Float64Array(r * r);
  const fres = choleskyFactor(gram, r, factor);
  if (!fres.ok)
    throw new Error('havokAnalysis: the delay-coordinate Gram is singular; reduce rank or supply a longer series.');

  const linearOperator = new Array<number>(core * core).fill(0);
  const forcingCoupling = new Array<number>(core).fill(0);
  let residualSq = 0;
  let targetSq = 0;
  const rhs = new Float64Array(r);
  for (let i = 0; i < core; i += 1) {
    for (let a = 0; a < r; a += 1) {
      let s = 0;
      for (let t = start; t < end; t += 1) s += (delayCoordinates[t]![a] ?? 0) * (dV[t]![i] ?? 0);
      rhs[a] = s;
    }
    choleskySolveFactored(factor, rhs, r);
    for (let j = 0; j < core; j += 1) linearOperator[i * core + j] = rhs[j] ?? 0;
    forcingCoupling[i] = rhs[core] ?? 0;
    // Accumulate fit residual for this core coordinate.
    for (let t = start; t < end; t += 1) {
      let pred = 0;
      for (let a = 0; a < r; a += 1) pred += (rhs[a] ?? 0) * (delayCoordinates[t]![a] ?? 0);
      const e = pred - (dV[t]![i] ?? 0);
      residualSq += e * e;
      targetSq += (dV[t]![i] ?? 0) ** 2;
    }
  }

  const reconstructionError = targetSq > 0 ? Math.sqrt(residualSq / targetSq) : Math.sqrt(residualSq);
  const eigenvalues = matrixEigenvalues(linearOperator, core);
  const forcing = delayCoordinates.map((row) => row[r - 1] ?? 0);
  const leading = delayCoordinates.map((row) => row[0] ?? 0);

  return {
    delays: options.delays,
    rank: r,
    singularValues: svd.singularValues.slice(),
    delayCoordinates,
    linearOperator,
    forcingCoupling,
    forcing,
    eigenvalues,
    reconstructionError,
    forcingExcessKurtosis: excessKurtosis(forcing.slice(start, end)),
    leadingExcessKurtosis: excessKurtosis(leading.slice(start, end))
  };
}
