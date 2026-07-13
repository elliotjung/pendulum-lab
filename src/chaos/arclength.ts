/**
 * Pseudo-arclength continuation (Keller's method) of a solution branch
 * G(x, λ) = 0, with fold (turning-point) detection.
 *
 * Natural-parameter continuation (see `continueDrivenPeriodicOrbit`) fixes the
 * parameter λ and solves for the state x, so it stalls at a fold, where the
 * branch has a vertical tangent (dx/dλ → ∞) and λ ceases to be a graph
 * coordinate. Pseudo-arclength continuation instead treats (x, λ) jointly and
 * advances along the branch's arclength s: the corrector solves the augmented
 * system
 *
 *     G(x, λ) = 0                                   (n equations)
 *     τ · ((x, λ) − (x_prev, λ_prev)) − ds = 0      (arclength constraint)
 *
 * where τ is the unit tangent at the previous point. The augmented Jacobian
 * stays non-singular *through* a fold (its last row is τ), so the branch is
 * traced around turning points. A fold is flagged where the tangent's λ-component
 * changes sign.
 *
 * The Jacobians are obtained by central finite differences, so the algorithm is
 * fully generic: the residual G can be an algebraic map or, e.g., the
 * stroboscopic fixed-point condition P(x; λ) − x of the driven pendulum.
 */

export interface ArclengthSystem {
  /** Residual G(x, λ); returns a length-`dimension` array. */
  residual: (x: readonly number[], lambda: number) => number[];
  /** Number of state unknowns n. */
  dimension: number;
}

export interface ArclengthOptions {
  x0: number[];
  lambda0: number;
  /** Arclength step. */
  ds: number;
  /** Maximum number of continuation steps. */
  steps: number;
  /** Initial direction of travel in λ (+1 increasing, −1 decreasing). Default +1. */
  direction?: 1 | -1;
  fdStep?: number;
  newtonTol?: number;
  maxNewton?: number;
}

export interface ArclengthPoint {
  x: number[];
  lambda: number;
  /** The branch tangent's λ-component at this point (its sign change marks a fold). */
  tangentLambda: number;
}

export interface ArclengthFold {
  lambda: number;
  x: number[];
}

export interface ArclengthResult {
  branch: ArclengthPoint[];
  folds: ArclengthFold[];
}

/** Solve A·x = b (A is m×m row-major-as-rows) by Gaussian elimination with partial pivoting; null if singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const m = b.length;
  const M = A.map((row, i) => [...row, b[i] ?? 0]);
  for (let col = 0; col < m; col += 1) {
    let pivot = col;
    let best = Math.abs(M[col]![col] ?? 0);
    for (let r = col + 1; r < m; r += 1) {
      const v = Math.abs(M[r]![col] ?? 0);
      if (v > best) {
        best = v;
        pivot = r;
      }
    }
    if (best < 1e-300) return null;
    if (pivot !== col) {
      const t = M[col]!;
      M[col] = M[pivot]!;
      M[pivot] = t;
    }
    const diag = M[col]![col] ?? 0;
    for (let r = col + 1; r < m; r += 1) {
      const f = (M[r]![col] ?? 0) / diag;
      if (f === 0) continue;
      for (let c = col; c <= m; c += 1) M[r]![c] = (M[r]![c] ?? 0) - f * (M[col]![c] ?? 0);
    }
  }
  const x = new Array<number>(m).fill(0);
  for (let i = m - 1; i >= 0; i -= 1) {
    let acc = M[i]![m] ?? 0;
    for (let j = i + 1; j < m; j += 1) acc -= (M[i]![j] ?? 0) * (x[j] ?? 0);
    x[i] = acc / (M[i]![i] ?? 1);
  }
  return x;
}

/** Central-difference ∂G/∂x (n×n) and ∂G/∂λ (n). */
function jacobians(system: ArclengthSystem, x: number[], lambda: number, h: number): { gx: number[][]; gl: number[] } {
  const n = system.dimension;
  const gx: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let j = 0; j < n; j += 1) {
    const xp = [...x];
    xp[j] = (xp[j] ?? 0) + h;
    const xm = [...x];
    xm[j] = (xm[j] ?? 0) - h;
    const rp = system.residual(xp, lambda);
    const rm = system.residual(xm, lambda);
    for (let i = 0; i < n; i += 1) gx[i]![j] = ((rp[i] ?? 0) - (rm[i] ?? 0)) / (2 * h);
  }
  const rlp = system.residual(x, lambda + h);
  const rlm = system.residual(x, lambda - h);
  const gl = new Array<number>(n);
  for (let i = 0; i < n; i += 1) gl[i] = ((rlp[i] ?? 0) - (rlm[i] ?? 0)) / (2 * h);
  return { gx, gl };
}

/** Build the (n+1)×(n+1) augmented Jacobian [[Gx, Gλ],[τ]]. */
function augmented(gx: number[][], gl: number[], tau: number[]): number[][] {
  const n = gl.length;
  const A: number[][] = [];
  for (let i = 0; i < n; i += 1) A.push([...gx[i]!, gl[i] ?? 0]);
  A.push([...tau]);
  return A;
}

function norm(v: readonly number[]): number {
  let s = 0;
  for (const c of v) s += c * c;
  return Math.sqrt(s);
}

/** Continue G(x, λ) = 0 by pseudo-arclength, detecting folds. */
export function continueArclength(system: ArclengthSystem, options: ArclengthOptions): ArclengthResult {
  const n = system.dimension;
  const h = options.fdStep ?? 1e-7;
  const tol = options.newtonTol ?? 1e-10;
  const maxNewton = options.maxNewton ?? 20;
  const dir = options.direction ?? 1;

  let z = [...options.x0, options.lambda0]; // length n+1

  // Initial tangent: force τ_λ = +1, solve Gx·τ_x = −Gλ, normalize, apply direction.
  const { gx: gx0, gl: gl0 } = jacobians(system, options.x0, options.lambda0, h);
  const initRow = new Array<number>(n + 1).fill(0);
  initRow[n] = 1;
  const tau0 = solveLinear(augmented(gx0, gl0, initRow), [...new Array<number>(n).fill(0), 1]);
  if (!tau0) return { branch: [], folds: [] };
  const tn0 = norm(tau0);
  let tau: number[] = tau0.map((c) => (c / tn0) * dir);

  const branch: ArclengthPoint[] = [{ x: z.slice(0, n), lambda: z[n] ?? 0, tangentLambda: tau[n] ?? 0 }];
  const folds: ArclengthFold[] = [];

  for (let step = 0; step < options.steps; step += 1) {
    const zPrev = [...z];
    const tauPrev = [...tau];
    // Predictor.
    let zc = z.map((v, i) => v + options.ds * (tau[i] ?? 0));

    // Corrector (Newton on [G; arclength]).
    let converged = false;
    for (let it = 0; it < maxNewton; it += 1) {
      const xc = zc.slice(0, n);
      const lc = zc[n] ?? 0;
      const g = system.residual(xc, lc);
      let nConstraint = -options.ds;
      for (let i = 0; i <= n; i += 1) nConstraint += (tauPrev[i] ?? 0) * ((zc[i] ?? 0) - (zPrev[i] ?? 0));
      const res = [...g, nConstraint];
      if (norm(res) < tol) {
        converged = true;
        break;
      }
      const { gx, gl } = jacobians(system, xc, lc, h);
      const delta = solveLinear(
        augmented(gx, gl, tauPrev),
        res.map((v) => -v)
      );
      if (!delta) break;
      zc = zc.map((v, i) => v + (delta[i] ?? 0));
    }
    if (!converged) break;
    z = zc;

    // New tangent (Keller): solve Aug·τ = e_{n+1} with τ_prev in the last row.
    const xc = z.slice(0, n);
    const lc = z[n] ?? 0;
    const { gx, gl } = jacobians(system, xc, lc, h);
    const rhs = [...new Array<number>(n).fill(0), 1];
    const tauNew = solveLinear(augmented(gx, gl, tauPrev), rhs);
    if (!tauNew) break;
    const tnNew = norm(tauNew);
    let tauN = tauNew.map((c) => c / tnNew);
    // Keep the branch direction continuous.
    let dot = 0;
    for (let i = 0; i <= n; i += 1) dot += (tauN[i] ?? 0) * (tauPrev[i] ?? 0);
    if (dot < 0) tauN = tauN.map((c) => -c);

    // Fold: the tangent's λ-component changed sign between consecutive points.
    if ((tauPrev[n] ?? 0) * (tauN[n] ?? 0) < 0) {
      folds.push({ lambda: lc, x: xc });
    }
    tau = tauN;
    branch.push({ x: xc, lambda: lc, tangentLambda: tau[n] ?? 0 });
  }

  return { branch, folds };
}
