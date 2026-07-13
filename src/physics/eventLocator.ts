/**
 * Shared zero-crossing locator for hybrid-system events. One primitive serves
 * every event consumer — Poincaré sections (`events.ts`), the rope pendulum's
 * taut↔slack transitions, and the double-string slack/capture events — so
 * they all share identical bracketing semantics, tolerance handling, and the
 * same secant/bisection hybrid instead of three hand-rolled root finders.
 *
 * The caller supplies g(τ) evaluated by re-advancing the dynamics from the
 * step start by τ ∈ [lo, hi] (or by evaluating a dense-output interpolant),
 * with a sign change g(lo)·g(hi) ≤ 0 already established.
 */

export interface RefineOptions {
  /** Convergence tolerance on the bracket width (time units). Default 1e-9. */
  tol?: number;
  /** Iteration cap; the bracket halves at worst, so 80 covers any sane tol. */
  maxIterations?: number;
}

export interface RefinedCrossing {
  /** Bracket end just before the crossing. */
  tBefore: number;
  /** Bracket end just after the crossing (the conventional event time). */
  tAfter: number;
  /** g at `tBefore` / `tAfter` — |gAfter| is the event residual. */
  gBefore: number;
  gAfter: number;
  iterations: number;
}

/**
 * Shrink a sign-change bracket [lo, hi] of g to width ≤ tol using a guarded
 * secant/bisection hybrid: a secant candidate is accepted only when it falls
 * safely inside the current bracket (Dekker-style guard), otherwise the step
 * bisects, so convergence is superlinear on smooth g yet never slower than
 * bisection on pathological ones.
 */
export function refineCrossing(
  g: (tau: number) => number,
  lo: number,
  hi: number,
  gLo: number,
  gHi: number,
  options: RefineOptions = {}
): RefinedCrossing {
  const tol = options.tol ?? 1e-9;
  const maxIterations = options.maxIterations ?? 80;
  let iterations = 0;
  if (gLo === 0) return { tBefore: lo, tAfter: lo, gBefore: 0, gAfter: 0, iterations };

  while (hi - lo > tol && iterations < maxIterations) {
    iterations += 1;
    // Secant candidate, guarded to the inner 80% of the bracket.
    const denom = gHi - gLo;
    let mid = denom !== 0 ? hi - (gHi * (hi - lo)) / denom : 0.5 * (lo + hi);
    const guard = 0.1 * (hi - lo);
    if (!(mid > lo + guard && mid < hi - guard)) mid = 0.5 * (lo + hi);
    const gMid = g(mid);
    // An exact zero is the root — return it instead of folding it into one
    // bracket side, where a zero gLo would corrupt the subsequent sign tests.
    // (The secant step lands exactly on the root often enough to matter.)
    if (gMid === 0) return { tBefore: mid, tAfter: mid, gBefore: 0, gAfter: 0, iterations };
    if (gLo < 0 ? gMid < 0 : gMid > 0) {
      lo = mid;
      gLo = gMid;
    } else {
      hi = mid;
      gHi = gMid;
    }
  }
  return { tBefore: lo, tAfter: hi, gBefore: gLo, gAfter: gHi, iterations };
}

/**
 * Convenience wrapper for the hybrid-pendulum systems: given a step of size
 * `h` whose event function went from `g0` (valid side) to `g1` (event side),
 * return the refined transition offset τ* ∈ (0, h], or `h` unchanged when the
 * bracket is degenerate (event already active at the step start).
 */
export function locateTransition(
  g: (tau: number) => number,
  h: number,
  g0: number,
  g1: number,
  options: RefineOptions = {}
): RefinedCrossing {
  if (!(g0 > 0 && g1 <= 0) && !(g0 < 0 && g1 >= 0)) {
    return { tBefore: h, tAfter: h, gBefore: g0, gAfter: g1, iterations: 0 };
  }
  return refineCrossing(g, 0, h, g0, g1, options);
}
