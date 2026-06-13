/**
 * Variance-based global sensitivity analysis: Sobol first-order and total
 * indices by the Saltelli sampling scheme.
 *
 * Two quasi-random base matrices A and B (Sobol low-discrepancy points mapped
 * into the variable ranges) are combined into the radial matrices AB_i (A with
 * column i replaced from B). With f evaluated on all of them,
 *
 *   S_i  = ( (1/N) Σ_j f(B)_j · (f(AB_i)_j − f(A)_j) ) / V        (Saltelli 2010)
 *   S_Ti = ( (1/2N) Σ_j (f(A)_j − f(AB_i)_j)² ) / V                (Jansen 1999)
 *
 * where V is the sample variance of f over A ∪ B. Cost: N·(d + 2) evaluations.
 * The estimators are the ones recommended in Saltelli et al., "Variance based
 * sensitivity analysis of model output" (Computer Physics Communications 2010).
 *
 * The evaluator may be async (e.g. a Lyapunov estimate per point) — evaluation
 * is sequential, so callers can yield to the event loop inside `evaluate`.
 */

import { sobolSequence } from './experimentDesign';

export interface SobolVariable {
  name: string;
  min: number;
  max: number;
}

export interface SobolIndicesOptions {
  /** Base sample size N (evaluations = N·(d+2)). Default 64. */
  samples?: number;
  /** Called after each model evaluation with progress in [0, 1]. */
  onProgress?: (done: number, total: number) => void;
}

export interface SobolIndicesResult {
  variables: string[];
  /** First-order indices S_i (fraction of output variance from variable i alone). */
  firstOrder: number[];
  /** Total indices S_Ti (variance fraction involving variable i in any interaction). */
  total: number[];
  /** Sample mean and variance of the model output over the A and B matrices. */
  mean: number;
  variance: number;
  /** Base sample size N and total model evaluations N·(d+2). */
  samples: number;
  evaluations: number;
  /** Count of evaluations that returned a non-finite output (excluded pairwise). */
  nonFiniteOutputs: number;
  method: string;
  caveat: string;
}

/**
 * Estimate Sobol first-order and total sensitivity indices of `evaluate` over
 * the box defined by `variables`. Indices are clamped to [0, 1] only in the
 * caveat-free sense of reporting raw estimator output: small negative values
 * (Monte-Carlo noise around zero) are preserved so callers can see them.
 */
export async function sobolIndices(
  evaluate: (point: number[]) => number | Promise<number>,
  variables: SobolVariable[],
  options: SobolIndicesOptions = {}
): Promise<SobolIndicesResult> {
  const d = variables.length;
  if (d === 0) throw new Error('sobolIndices: at least one variable required');
  // The joint A|B stream needs 2d distinct Sobol direction sets; the local
  // direction-number table holds 12, beyond which columns would repeat.
  if (2 * d > 12) throw new Error(`sobolIndices: at most 6 variables supported (got ${d})`);
  for (const variable of variables) {
    if (!(variable.max > variable.min)) throw new Error(`sobolIndices: empty range for ${variable.name}`);
  }
  const N = Math.max(8, Math.floor(options.samples ?? 64));
  // One 2d-dimensional Sobol stream split into A (first d columns) and B
  // (last d columns) keeps the two matrices jointly low-discrepancy.
  const joint = sobolSequence(2 * d, N);
  const A = joint.map((row) => variables.map((variable, i) => variable.min + (variable.max - variable.min) * (row[i] ?? 0.5)));
  const B = joint.map((row) => variables.map((variable, i) => variable.min + (variable.max - variable.min) * (row[d + i] ?? 0.5)));

  const total = N * (d + 2);
  let done = 0;
  const evalPoint = async (point: number[]): Promise<number> => {
    const value = await evaluate(point);
    done += 1;
    options.onProgress?.(done, total);
    return Number(value);
  };

  const fA: number[] = [];
  const fB: number[] = [];
  for (let j = 0; j < N; j += 1) fA.push(await evalPoint(A[j]!));
  for (let j = 0; j < N; j += 1) fB.push(await evalPoint(B[j]!));
  const fAB: number[][] = [];
  for (let i = 0; i < d; i += 1) {
    const column: number[] = [];
    for (let j = 0; j < N; j += 1) {
      const point = A[j]!.slice();
      point[i] = B[j]![i]!;
      column.push(await evalPoint(point));
    }
    fAB.push(column);
  }

  // Mean / variance over A ∪ B, ignoring non-finite outputs.
  let nonFinite = 0;
  let sum = 0;
  let count = 0;
  for (const value of [...fA, ...fB]) {
    if (Number.isFinite(value)) {
      sum += value;
      count += 1;
    } else nonFinite += 1;
  }
  const mean = count > 0 ? sum / count : Number.NaN;
  let varSum = 0;
  for (const value of [...fA, ...fB]) {
    if (Number.isFinite(value)) varSum += (value - mean) ** 2;
  }
  const variance = count > 1 ? varSum / (count - 1) : Number.NaN;

  const firstOrder: number[] = [];
  const totalIndex: number[] = [];
  for (let i = 0; i < d; i += 1) {
    let saltelli = 0;
    let jansen = 0;
    let pairs = 0;
    for (let j = 0; j < N; j += 1) {
      const a = fA[j]!;
      const b = fB[j]!;
      const ab = fAB[i]![j]!;
      if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(ab)) {
        nonFinite += Number.isFinite(ab) ? 0 : 1;
        continue;
      }
      saltelli += b * (ab - a);
      jansen += (a - ab) ** 2;
      pairs += 1;
    }
    const denom = variance > 0 && pairs > 0 ? variance : Number.NaN;
    firstOrder.push(Number.isFinite(denom) ? saltelli / pairs / denom : Number.NaN);
    totalIndex.push(Number.isFinite(denom) ? jansen / (2 * pairs) / denom : Number.NaN);
  }

  return {
    variables: variables.map((variable) => variable.name),
    firstOrder,
    total: totalIndex,
    mean,
    variance,
    samples: N,
    evaluations: total,
    nonFiniteOutputs: nonFinite,
    method: `Sobol indices via Saltelli radial sampling (N=${N}, ${total} evaluations); S_i Saltelli-2010, S_Ti Jansen-1999 estimators on a joint ${2 * d}-D Sobol stream`,
    caveat: `Monte-Carlo estimates: expect O(1/√N) noise (N=${N}); small negative values are estimator noise around zero, and S_Ti < S_i within noise is not a contradiction.`
  };
}
