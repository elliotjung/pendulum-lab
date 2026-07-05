import type { Derivative, StateVector } from './types';
import type { BrownianGrid, DiffusionMatrix, DiffusionMatrixJacobian, GaussianSampler } from './stochastic';

/**
 * Levy areas and the strong order-1.0 Milstein step for NON-commutative
 * multiplicative noise - the rough-path correction `commutativeMilsteinStep`
 * intentionally omits (see `commutativityDefect`).
 *
 * For an m-driver Ito SDE dX = a dt + B(X) dW the Milstein step needs the
 * iterated integrals I_jk = int int dW_j dW_k over each step. The diagonal has
 * the closed form I_jj = (dW_j^2 - h)/2, and the off-diagonal pair splits into
 * the symmetric product plus the antisymmetric Levy area A_jk:
 *
 *   I_jk = (dW_j dW_k + A_jk)/2,   I_kj = (dW_j dW_k - A_jk)/2   (j < k),
 *
 * with A_jk = int (W_j dW_k - W_k dW_j), E[A_jk] = 0, Var[A_jk] = h^2.
 * Commutative noise makes the Lie bracket symmetric so A_jk cancels; for
 * non-commutative noise dropping A_jk demotes the scheme to strong order 1/2.
 *
 * Two sources of areas are provided:
 * - `levyAreasFromGrid` - exact block areas of a frozen dyadic Brownian grid
 *   (the reproducible strong-convergence / common-path construction).
 * - `sampleBrownianStepWithAreas` - subdivision sampler for free-running
 *   integration: exact in law as substeps -> infinity, with the pinned
 *   finite-substep law Var[A] = h^2 (1 - 1/substeps).
 */

/** Packed index of the area A_jk (j < k) among m drivers. */
export function levyAreaPackedIndex(j: number, k: number, dimension: number): number {
  if (!(Number.isInteger(j) && Number.isInteger(k) && j >= 0 && k > j && k < dimension)) {
    throw new Error(`levyAreaPackedIndex: need 0 <= j < k < ${dimension}, got (${j}, ${k}).`);
  }
  return j * dimension - (j * (j + 1)) / 2 + (k - j - 1);
}

/** Number of packed areas for m drivers: m(m-1)/2. */
export function levyAreaCount(dimension: number): number {
  return (dimension * (dimension - 1)) / 2;
}

/**
 * Exact Levy areas of a dyadic Brownian grid over the node block
 * [aIndex, bIndex]: A_jk = sum_i [(W_j(i) - W_j(a)) d_k(i) - (W_k(i) - W_k(a)) d_j(i)].
 * Exact for the piecewise-linear path the grid represents, and consistent
 * under block composition (chained via the cross-increment term).
 */
export function levyAreasFromGrid(grid: BrownianGrid, aIndex: number, bIndex: number): Float64Array {
  const m = grid.dimension;
  const areas = new Float64Array(levyAreaCount(m));
  for (let j = 0; j < m; j += 1) {
    for (let k = j + 1; k < m; k += 1) {
      let area = 0;
      for (let i = aIndex; i < bIndex; i += 1) {
        const wj = grid.increment(aIndex, i, j);
        const wk = grid.increment(aIndex, i, k);
        area += wj * grid.increment(i, i + 1, k) - wk * grid.increment(i, i + 1, j);
      }
      areas[levyAreaPackedIndex(j, k, m)] = area;
    }
  }
  return areas;
}

export interface BrownianStepWithAreas {
  /** dW_j over the step. */
  increments: Float64Array;
  /** Packed A_jk for j < k. */
  levyAreas: Float64Array;
}

/**
 * Jointly sample the step increments and their Levy areas by internal
 * subdivision. The pair (dW, A) has the exact joint law in the limit; at
 * finite `substeps` the area variance is h^2 (1 - 1/substeps) (pinned by
 * tests), so 64 substeps keep the law within 1.6% of exact.
 */
export function sampleBrownianStepWithAreas(
  h: number,
  dimension: number,
  gaussian: GaussianSampler,
  substeps = 64
): BrownianStepWithAreas {
  if (!(h > 0)) throw new Error('sampleBrownianStepWithAreas: h must be positive.');
  if (!Number.isInteger(dimension) || dimension < 1) throw new Error('sampleBrownianStepWithAreas: dimension must be a positive integer.');
  if (!Number.isInteger(substeps) || substeps < 1) throw new Error('sampleBrownianStepWithAreas: substeps must be a positive integer.');
  const sqrtSub = Math.sqrt(h / substeps);
  const walk = new Float64Array(dimension);
  const delta = new Float64Array(dimension);
  const increments = new Float64Array(dimension);
  const levyAreas = new Float64Array(levyAreaCount(dimension));
  for (let i = 0; i < substeps; i += 1) {
    for (let j = 0; j < dimension; j += 1) delta[j] = sqrtSub * gaussian();
    for (let j = 0; j < dimension; j += 1) {
      for (let k = j + 1; k < dimension; k += 1) {
        const index = levyAreaPackedIndex(j, k, dimension);
        levyAreas[index] = (levyAreas[index] ?? 0) + walk[j]! * delta[k]! - walk[k]! * delta[j]!;
      }
    }
    for (let j = 0; j < dimension; j += 1) {
      walk[j] = walk[j]! + delta[j]!;
    }
  }
  increments.set(walk);
  return { increments, levyAreas };
}

/**
 * Assemble the full m x m Ito iterated-integral matrix I_jk (row-major,
 * I[j*m+k]) from the step increments and packed Levy areas.
 */
export function iteratedItoIntegrals(h: number, increments: ArrayLike<number>, levyAreas: ArrayLike<number>): Float64Array {
  const m = increments.length;
  if (levyAreas.length !== levyAreaCount(m)) {
    throw new Error(`iteratedItoIntegrals: expected ${levyAreaCount(m)} packed areas for ${m} drivers, got ${levyAreas.length}.`);
  }
  const integrals = new Float64Array(m * m);
  for (let j = 0; j < m; j += 1) {
    const dWj = Number(increments[j] ?? 0);
    integrals[j * m + j] = (dWj * dWj - h) / 2;
    for (let k = j + 1; k < m; k += 1) {
      const product = dWj * Number(increments[k] ?? 0);
      const area = Number(levyAreas[levyAreaPackedIndex(j, k, m)] ?? 0);
      integrals[j * m + k] = (product + area) / 2;
      integrals[k * m + j] = (product - area) / 2;
    }
  }
  return integrals;
}

/**
 * Strong order-1.0 Milstein step for general (non-commutative) matrix
 * diffusion, driven by caller-supplied increments and iterated integrals:
 *
 *   x_i^+ = x_i + a_i h + sum_k B_ik dW_k + sum_{j,k} (L^j B_ik) I_jk,
 *
 * with L^j B_ik = sum_l B_lj dB_ik/dx_l (same Jacobian layout as
 * `commutativeMilsteinStep` / `commutativityDefect`). Supplying exact grid
 * areas gives the pathwise-convergent construction; supplying sampled areas
 * gives free-running strong order 1.0 in law.
 */
export function milsteinLevyStep(
  state: StateVector,
  dt: number,
  drift: Derivative,
  noiseDimension: number,
  diffusion: DiffusionMatrix,
  diffusionJacobian: DiffusionMatrixJacobian,
  increments: ArrayLike<number>,
  integrals: ArrayLike<number>,
  out: StateVector
): StateVector {
  if (!Number.isInteger(noiseDimension) || noiseDimension < 1) {
    throw new Error('milsteinLevyStep: noiseDimension must be a positive integer.');
  }
  if (increments.length !== noiseDimension) {
    throw new Error(`milsteinLevyStep: expected ${noiseDimension} increments, got ${increments.length}.`);
  }
  if (integrals.length !== noiseDimension * noiseDimension) {
    throw new Error(`milsteinLevyStep: expected ${noiseDimension * noiseDimension} iterated integrals, got ${integrals.length}.`);
  }
  const dim = state.length;
  const drift0 = new Float64Array(dim);
  const diffusion0 = new Array<number>(dim * noiseDimension).fill(0);
  const jacobian = new Array<number>(dim * noiseDimension * dim).fill(0);
  drift(state, drift0);
  diffusion(state, diffusion0, noiseDimension);
  diffusionJacobian(state, jacobian, noiseDimension);
  for (let i = 0; i < dim; i += 1) {
    let noise = 0;
    const row = i * noiseDimension;
    for (let k = 0; k < noiseDimension; k += 1) noise += (diffusion0[row + k] ?? 0) * Number(increments[k] ?? 0);
    let correction = 0;
    for (let j = 0; j < noiseDimension; j += 1) {
      for (let k = 0; k < noiseDimension; k += 1) {
        let lieDerivative = 0;
        for (let l = 0; l < dim; l += 1) {
          lieDerivative += (diffusion0[l * noiseDimension + j] ?? 0) * (jacobian[((i * noiseDimension + k) * dim) + l] ?? 0);
        }
        correction += lieDerivative * Number(integrals[j * noiseDimension + k] ?? 0);
      }
    }
    out[i] = state[i]! + (drift0[i] ?? 0) * dt + noise + correction;
  }
  return out;
}
