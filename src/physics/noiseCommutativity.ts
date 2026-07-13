import type { StateVector } from './types';
import type { DiffusionMatrix, DiffusionMatrixJacobian } from './stochastic';

/**
 * Commutativity diagnostic for matrix-diffusion SDEs — the guard that says
 * whether the commutative-noise Milstein scheme (`commutativeMilsteinStep`) is
 * actually valid for a given diffusion matrix B, rather than silently dropping
 * to strong order ½.
 */

/**
 * Commutativity defect of a diffusion matrix B at a state — the obstruction that
 * makes any commutative-noise Milstein scheme lose its strong order 1. The noise
 * is *commutative* iff the Lie derivatives satisfy L_j B_{i,k} = L_k B_{i,j} for
 * all i and all j, k, where L_j = Σ_l B_{l,j} ∂/∂x_l. This returns
 *
 *   max_{i, j<k} | L_j B_{i,k} − L_k B_{i,j} |,
 *
 * which is 0 for commutative noise (diagonal noise with each b_i = b_i(x_i), and
 * additive noise, are the common commutative cases) and strictly positive
 * otherwise. Callers feeding `commutativeMilsteinStep` a general B should check
 * this is ≈ 0 first — a non-zero defect means the result needs the Lévy-area
 * terms this engine intentionally does not approximate, and the commutative
 * Milstein step would be only strong order ½ (no better than Euler–Maruyama).
 *
 * The Lie-derivative layout matches `commutativeMilsteinStep`'s correction term:
 * `diffusionJacobian` writes ∂B_{i,k}/∂x_l at out[((i·noiseDim + k)·stateDim) + l].
 */
export function commutativityDefect(
  state: StateVector,
  noiseDimension: number,
  diffusion: DiffusionMatrix,
  diffusionJacobian: DiffusionMatrixJacobian
): number {
  if (!Number.isInteger(noiseDimension) || noiseDimension < 1) {
    throw new Error('commutativityDefect: noiseDimension must be a positive integer.');
  }
  const dim = state.length;
  const B = new Array<number>(dim * noiseDimension).fill(0);
  const dB = new Array<number>(dim * noiseDimension * dim).fill(0);
  diffusion(state, B, noiseDimension);
  diffusionJacobian(state, dB, noiseDimension);
  // L_j B_{i,k} = Σ_l B_{l,j} · ∂B_{i,k}/∂x_l.
  const lie = (i: number, k: number, j: number): number => {
    let s = 0;
    for (let l = 0; l < dim; l += 1) {
      s += (B[l * noiseDimension + j] ?? 0) * (dB[(i * noiseDimension + k) * dim + l] ?? 0);
    }
    return s;
  };
  let defect = 0;
  for (let i = 0; i < dim; i += 1) {
    for (let j = 0; j < noiseDimension; j += 1) {
      for (let k = j + 1; k < noiseDimension; k += 1) {
        defect = Math.max(defect, Math.abs(lie(i, k, j) - lie(i, j, k)));
      }
    }
  }
  return defect;
}
