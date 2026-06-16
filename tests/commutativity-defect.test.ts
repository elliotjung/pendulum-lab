import { describe, expect, test } from 'vitest';
import { commutativityDefect } from '../src/physics/noiseCommutativity';
import {
  commutativeMilsteinStep,
  gaussianSampler,
  type DiffusionMatrix,
  type DiffusionMatrixJacobian
} from '../src/physics/stochastic';

/**
 * Commutativity defect (5-1): the guard that tells whether the commutative-noise
 * Milstein scheme is actually valid. Commutative noise -> defect 0; genuinely
 * non-commutative matrix diffusion -> defect > 0 (the scheme would silently drop
 * to strong order 1/2 there, needing Lévy-area terms the engine does not
 * approximate).
 */

// Decoupled diagonal noise B = diag(0.5 x0, 0.5 x1): each b_i depends only on x_i
// -> commutative, defect identically 0.
const commutativeDiffusion: DiffusionMatrix = (s, out) => {
  out[0] = 0.5 * (s[0] ?? 0);
  out[1] = 0;
  out[2] = 0;
  out[3] = 0.5 * (s[1] ?? 0);
};
const commutativeJacobian: DiffusionMatrixJacobian = (_s, out) => {
  // layout out[((i*nd + k)*dim) + l] = dB_{i,k}/dx_l, dim = nd = 2
  out[(0 * 2 + 0) * 2 + 0] = 0.5; // dB_{0,0}/dx0
  out[(1 * 2 + 1) * 2 + 1] = 0.5; // dB_{1,1}/dx1
};

// Cross-coupled noise B = [[x1, 0], [0, x0]]: b for noise 0 acts on state 0 with a
// coefficient that depends on x1 -> non-commutative.
const nonCommutativeDiffusion: DiffusionMatrix = (s, out) => {
  out[0] = s[1] ?? 0; // B_{0,0} = x1
  out[1] = 0;
  out[2] = 0;
  out[3] = s[0] ?? 0; // B_{1,1} = x0
};
const nonCommutativeJacobian: DiffusionMatrixJacobian = (_s, out) => {
  out[(0 * 2 + 0) * 2 + 1] = 1; // dB_{0,0}/dx1
  out[(1 * 2 + 1) * 2 + 0] = 1; // dB_{1,1}/dx0
};

describe('commutativityDefect', () => {
  test('decoupled diagonal noise is commutative (defect = 0)', () => {
    const state = Float64Array.of(1.3, -0.7);
    expect(commutativityDefect(state, 2, commutativeDiffusion, commutativeJacobian)).toBe(0);
  });

  test('cross-coupled matrix noise is non-commutative (defect > 0)', () => {
    const state = Float64Array.of(1, 1);
    const defect = commutativityDefect(state, 2, nonCommutativeDiffusion, nonCommutativeJacobian);
    expect(defect).toBeGreaterThan(0.5); // closed-form value is |x0| = |x1| = 1 here
    expect(defect).toBeCloseTo(1, 12);
  });

  test('the defect uses the same Lie-derivative layout the Milstein step consumes', () => {
    // Sanity: the commutative step runs without error on the commutative B, and the
    // defect helper agrees the configuration is valid for it.
    const state = Float64Array.of(0.4, 0.2);
    expect(commutativityDefect(state, 2, commutativeDiffusion, commutativeJacobian)).toBe(0);
    const out = new Float64Array(2);
    const drift = (s: Float64Array, o: Float64Array): void => {
      o[0] = 0;
      o[1] = 0;
    };
    expect(() =>
      commutativeMilsteinStep(state, 1e-3, drift, 2, commutativeDiffusion, commutativeJacobian, gaussianSampler(1), out)
    ).not.toThrow();
    expect(Number.isFinite(out[0]!)).toBe(true);
  });
});
