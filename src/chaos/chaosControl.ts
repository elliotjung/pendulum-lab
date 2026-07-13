import { solveLinearInPlace } from '../physics/linearSolve';

/**
 * Unstable periodic orbits (UPOs) and OGY chaos control for discrete maps —
 * the map-level companions to the continuous-time periodic-orbit shooting in
 * `floquet.ts` / `continuation.ts`. A chaotic attractor is shot through with a
 * dense skeleton of UPOs; OGY (Ott–Grebogi–Yorke) control stabilises one of
 * them with vanishingly small parameter nudges, the foundational idea of
 * controlling chaos. Both are exercised on the Hénon map in the tests.
 */
export type MapFn = (x: readonly number[], out: number[]) => void;
export type ParametrizedMapFn = (x: readonly number[], parameter: number, out: number[]) => void;

/** Forward-difference Jacobian DF(x) of a map (row-major n×n as number[][]). */
export function mapJacobianFD(map: MapFn, x: readonly number[], h = 1e-7): number[][] {
  const n = x.length;
  const base = new Array<number>(n).fill(0);
  map(x, base);
  const jac: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const xp = x.slice();
  const fp = new Array<number>(n).fill(0);
  for (let j = 0; j < n; j += 1) {
    const eps = h * Math.max(1, Math.abs(x[j] ?? 0));
    xp[j] = (x[j] ?? 0) + eps;
    map(xp, fp);
    for (let i = 0; i < n; i += 1) jac[i]![j] = ((fp[i] ?? 0) - (base[i] ?? 0)) / eps;
    xp[j] = x[j] ?? 0;
  }
  return jac;
}

export interface PeriodicOrbitResult {
  /** A point x* on the orbit with Fᵖ(x*) = x*. */
  point: number[];
  /** Whether ‖Fᵖ(x*) - x*‖_∞ fell below tolerance. */
  converged: boolean;
  iterations: number;
  residual: number;
  period: number;
}

/**
 * Locate a period-`period` orbit of `map` by a Newton solve of Fᵖ(x) - x = 0.
 * The Jacobian of Fᵖ is the chain-rule product of the per-step Jacobians along
 * the orbit, formed here by forward differences. period=1 finds a fixed point.
 */
export function findPeriodicOrbit(
  map: MapFn,
  x0: readonly number[],
  period: number,
  options: { tolerance?: number; maxIterations?: number; jacobianStep?: number } = {}
): PeriodicOrbitResult {
  if (!Number.isInteger(period) || period < 1) throw new Error('findPeriodicOrbit: period must be a positive integer');
  const n = x0.length;
  const tol = options.tolerance ?? 1e-12;
  const maxIter = options.maxIterations ?? 100;
  const h = options.jacobianStep ?? 1e-7;

  const iterate = (x: readonly number[]): { fp: number[]; jac: number[][] } => {
    let cur = x.slice();
    let jac = identity(n);
    const next = new Array<number>(n).fill(0);
    for (let p = 0; p < period; p += 1) {
      const step = mapJacobianFD(map, cur, h);
      jac = matMul(step, jac, n);
      map(cur, next);
      cur = next.slice();
    }
    return { fp: cur, jac };
  };

  let x = x0.slice();
  let residual = Infinity;
  let converged = false;
  let iterations = 0;
  for (let iter = 1; iter <= maxIter; iter += 1) {
    iterations = iter;
    const { fp, jac } = iterate(x);
    // G(x) = Fᵖ(x) - x, J_G = J_{Fᵖ} - I.
    const g = new Float64Array(n);
    residual = 0;
    for (let i = 0; i < n; i += 1) {
      g[i] = (fp[i] ?? 0) - (x[i] ?? 0);
      residual = Math.max(residual, Math.abs(g[i] ?? 0));
    }
    if (residual < tol) {
      converged = true;
      break;
    }
    const jg = new Float64Array(n * n);
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) jg[i * n + j] = (jac[i]![j] ?? 0) - (i === j ? 1 : 0);
    }
    const rhs = new Float64Array(n);
    for (let i = 0; i < n; i += 1) rhs[i] = -(g[i] ?? 0);
    const solve = solveLinearInPlace(jg, rhs, n);
    if (!solve.ok) break;
    for (let i = 0; i < n; i += 1) x[i] = (x[i] ?? 0) + (rhs[i] ?? 0);
  }
  return { point: x, converged, iterations, residual, period };
}

function identity(n: number): number[][] {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}
function matMul(a: number[][], b: number[][], n: number): number[][] {
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      let s = 0;
      for (let k = 0; k < n; k += 1) s += (a[i]![k] ?? 0) * (b[k]![j] ?? 0);
      out[i]![j] = s;
    }
  }
  return out;
}

export interface OgySpec {
  /** Fixed point x* of the uncontrolled map F(·; p₀) (length 2). */
  fixedPoint: readonly number[];
  /** Jacobian DF(x*; p₀) as a 2×2 [[a,b],[c,d]]. */
  jacobian: readonly [readonly [number, number], readonly [number, number]];
  /** Parameter sensitivity ∂F/∂p at (x*, p₀) (length 2). */
  parameterSensitivity: readonly [number, number];
}

export interface OgyAnalysis {
  /** Unstable eigenvalue λ_u (|λ_u| > 1). */
  unstableEigenvalue: number;
  /** Stable eigenvalue λ_s (|λ_s| < 1). */
  stableEigenvalue: number;
  /** Left unstable eigenvector f_u (f_u·DF = λ_u f_u). */
  leftUnstableVector: [number, number];
}

/**
 * Eigen-analysis of a 2×2 saddle Jacobian for OGY control. Throws unless the
 * fixed point is a real saddle (one |λ|>1 and one |λ|<1), which is the
 * controllable case.
 */
export function ogyAnalyze(spec: OgySpec): OgyAnalysis {
  const a = spec.jacobian[0][0];
  const b = spec.jacobian[0][1];
  const c = spec.jacobian[1][0];
  const d = spec.jacobian[1][1];
  const trace = a + d;
  const det = a * d - b * c;
  const disc = trace * trace - 4 * det;
  if (disc <= 0) throw new Error('ogyAnalyze: complex eigenvalues — fixed point is not a real saddle');
  const sq = Math.sqrt(disc);
  const l1 = (trace + sq) / 2;
  const l2 = (trace - sq) / 2;
  const unstable = Math.abs(l1) >= Math.abs(l2) ? l1 : l2;
  const stable = Math.abs(l1) >= Math.abs(l2) ? l2 : l1;
  if (!(Math.abs(unstable) > 1 && Math.abs(stable) < 1)) {
    throw new Error('ogyAnalyze: fixed point is not a saddle (need |λ_u|>1 and |λ_s|<1)');
  }
  // Left eigenvector of [[a,b],[c,d]] for λ: f = (c, λ - a).
  const f: [number, number] = [c, unstable - a];
  const norm = Math.hypot(f[0], f[1]) || 1;
  return { unstableEigenvalue: unstable, stableEigenvalue: stable, leftUnstableVector: [f[0] / norm, f[1] / norm] };
}

/**
 * OGY parameter perturbation δp that drives the next iterate onto the stable
 * manifold: δp = -λ_u (f_u·(x - x*)) / (f_u·∂F/∂p). Returns 0 outside the
 * linear control region (‖x - x*‖ > `region`) so control only acts near the UPO.
 */
export function ogyControlSignal(
  spec: OgySpec,
  analysis: OgyAnalysis,
  x: readonly number[],
  region: number = Infinity
): number {
  const dx0 = (x[0] ?? 0) - (spec.fixedPoint[0] ?? 0);
  const dx1 = (x[1] ?? 0) - (spec.fixedPoint[1] ?? 0);
  if (Math.hypot(dx0, dx1) > region) return 0;
  const f = analysis.leftUnstableVector;
  const fDotDx = f[0] * dx0 + f[1] * dx1;
  const fDotG = f[0] * spec.parameterSensitivity[0] + f[1] * spec.parameterSensitivity[1];
  if (Math.abs(fDotG) < 1e-14) return 0;
  return (-analysis.unstableEigenvalue * fDotDx) / fDotG;
}

export interface OgySimSpec {
  /** Nominal parameter p₀. */
  nominalParameter: number;
  /** Maximum allowed |δp| (control authority). */
  maxDelta: number;
  /** Linear control region radius ‖x-x*‖. */
  region: number;
  /** Steps to simulate. */
  steps: number;
}

export interface OgySimResult {
  /** Max ‖xₙ - x*‖ over the second half of the run (after capture). */
  settledDeviation: number;
  /** Max |δp| ever applied. */
  maxControl: number;
  /** Whether the orbit stayed within 10× the control region throughout. */
  captured: boolean;
}

/**
 * Simulate OGY control of a parametrized 2-D map starting near the target UPO.
 * Applies the clamped control signal each step and reports whether the orbit is
 * captured and how tightly it settles. With control disabled (maxDelta=0) the
 * same start escapes — the contrast that demonstrates the effect.
 */
export function simulateOgyControl(
  map: ParametrizedMapFn,
  spec: OgySpec,
  sim: OgySimSpec,
  x0: readonly number[]
): OgySimResult {
  const analysis = ogyAnalyze(spec);
  let x = x0.slice();
  const next = new Array<number>(x.length).fill(0);
  let maxControl = 0;
  let settledDeviation = 0;
  let captured = true;
  const escapeBound = 10 * sim.region;
  for (let k = 0; k < sim.steps; k += 1) {
    let dp = sim.maxDelta > 0 ? ogyControlSignal(spec, analysis, x, sim.region) : 0;
    if (dp > sim.maxDelta) dp = sim.maxDelta;
    if (dp < -sim.maxDelta) dp = -sim.maxDelta;
    maxControl = Math.max(maxControl, Math.abs(dp));
    map(x, sim.nominalParameter + dp, next);
    x = next.slice();
    const dev = Math.hypot((x[0] ?? 0) - (spec.fixedPoint[0] ?? 0), (x[1] ?? 0) - (spec.fixedPoint[1] ?? 0));
    if (!Number.isFinite(dev) || dev > escapeBound) {
      captured = false;
      break;
    }
    if (k > sim.steps / 2) settledDeviation = Math.max(settledDeviation, dev);
  }
  return { settledDeviation, maxControl, captured };
}
