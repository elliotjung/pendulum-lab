import { describe, expect, test } from 'vitest';
import { jacobianDouble } from '../src/physics/double';
import type { PendulumParameters } from '../src/types/domain';

/**
 * Independent closed-form ground truth for the analytic Jacobian.
 *
 * Linearised about the downward equilibrium (θ = ω = 0), the double pendulum is
 * a pair of coupled harmonic oscillators whose small-oscillation normal-mode
 * frequencies are a classic textbook result. For *equal* masses and lengths,
 *
 *     ω²₊ = (2 + √2) g/l ,   ω²₋ = (2 − √2) g/l .
 *
 * The lower-left 2×2 block of the Jacobian (∂ω̇/∂θ at equilibrium) equals
 * −M⁻¹K, the linear restoring operator, so its eigenvalues are −ω². Checking
 * `jacobianDouble` against this analytic value validates the hand-derived
 * Jacobian against an *external* (pencil-and-paper) reference, not against
 * another finite difference of the same code.
 */

const SQRT2 = Math.SQRT2;

/** Eigenvalues of a real 2×2 matrix [[a,b],[c,d]] (real here: the block is symmetrisable). */
function eig2x2(a: number, b: number, c: number, d: number): [number, number] {
  const trace = a + d;
  const det = a * d - b * c;
  const disc = Math.sqrt(Math.max(0, trace * trace - 4 * det));
  return [(trace + disc) / 2, (trace - disc) / 2];
}

describe('linearised normal modes match the closed-form double-pendulum frequencies', () => {
  for (const [l, g] of [
    [1, 9.81],
    [0.5, 9.81],
    [1.25, 9.81]
  ] as const) {
    test(`equal m=1, l=${l}, g=${g}`, () => {
      const params: PendulumParameters = { m1: 1, m2: 1, l1: l, l2: l, g };
      const jac = new Float64Array(16);
      jacobianDouble([0, 0, 0, 0], params, 0, jac);

      // Lower-left ∂ω̇/∂θ block = -M^{-1}K. Closed form for equal m,l:
      //   A = (g/l) [[-2, 1], [2, -2]].
      const a = jac[8]!;
      const b = jac[9]!;
      const c = jac[12]!;
      const d = jac[13]!;
      const ratio = g / l;
      expect(a).toBeCloseTo(-2 * ratio, 9);
      expect(b).toBeCloseTo(1 * ratio, 9);
      expect(c).toBeCloseTo(2 * ratio, 9);
      expect(d).toBeCloseTo(-2 * ratio, 9);

      // Eigenvalues are -ω²; the squared normal-mode frequencies are (2 ± √2) g/l.
      const [e1, e2] = eig2x2(a, b, c, d);
      const omegaSquared = [-e1, -e2].sort((x, y) => y - x);
      expect(omegaSquared[0]!).toBeCloseTo((2 + SQRT2) * ratio, 9);
      expect(omegaSquared[1]!).toBeCloseTo((2 - SQRT2) * ratio, 9);
    });
  }

  test('the velocity block at equilibrium is the identity coupling (∂θ̇/∂ω = I)', () => {
    const params: PendulumParameters = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
    const jac = new Float64Array(16);
    jacobianDouble([0, 0, 0, 0], params, 0, jac);
    // Rows 0,1: θ̇ = ω, so ∂θ̇/∂ω = I and ∂θ̇/∂θ = 0.
    expect([jac[0], jac[1], jac[2], jac[3]]).toEqual([0, 0, 1, 0]);
    expect([jac[4], jac[5], jac[6], jac[7]]).toEqual([0, 0, 0, 1]);
  });
});
