import type { PendulumParameters } from '../types/domain';
import type { Complex } from '../research/complexEig';
import { eigenvaluesGeneral } from '../research/eigenGeneral';
import { jacobianDouble } from '../physics/double';
import { chainLength, type ChainParameters } from '../physics/nPendulum';
import { jacobianChain } from '../physics/jacobians';
import {
  DOUBLE_UPRIGHT_STATE,
  applyActuationMode,
  controlMatrixDouble,
  wrapAngle,
  type ActuationMode
} from './actuated';
import { controlMatrixChain, uprightChainState } from './actuatedChain';

/**
 * Infinite-horizon LQR for the inverted double pendulum — the balancing half
 * of the DFKI `double_pendulum` benchmark controllers, re-designed for this
 * codebase instead of transcribed: where the reference implementation calls
 * `scipy.linalg.solve_continuous_are`, this module (a) discretises the exact
 * analytic linearisation (`jacobianDouble` + closed-form B) with the Van Loan
 * block-matrix exponential, and (b) solves the discrete algebraic Riccati
 * equation by value iteration, which converges to the stabilising solution
 * from P₀ = Q for a stabilisable/detectable pair without needing an initial
 * stabilising gain. Discrete-time gains are also what the simulation loop
 * actually applies (one torque per integrator step), so the design and the
 * deployment use the same clock.
 *
 * All matrices are plain row-major `number[][]` — these are 4×4/4×2 design-time
 * objects, not hot-loop state, and this keeps the algebra readable and
 * directly comparable with the textbook recursions (Bertsekas, DP & OC).
 */

export interface DareResult {
  /** Stabilising cost-to-go matrix (n×n, symmetric). */
  P: number[][];
  /** Optimal feedback gain (m×n): u = −K x. */
  K: number[][];
  iterations: number;
  converged: boolean;
  /** max |ΔP| of the final iteration, for convergence reporting. */
  residual: number;
}

export interface LqrDesign {
  /** Continuous-time linearisation at the upright equilibrium. */
  A: number[][];
  B: number[][];
  /** Discrete-time pair actually used for the Riccati solve. */
  Ad: number[][];
  Bd: number[][];
  dt: number;
  mode: ActuationMode;
  riccati: DareResult;
  /** Closed-loop eigenvalues of Ad − Bd·K (all must lie inside the unit circle). */
  closedLoopEigenvalues: Complex[];
  spectralRadius: number;
  /** True when the Riccati solve converged and the closed loop is Schur-stable. */
  stabilising: boolean;
}

export interface LqrSpec {
  parameters: PendulumParameters;
  /** Velocity-level damping coefficient, matching the `rhsDouble` convention. */
  gamma: number;
  /** Controller/integrator step the discrete design targets. */
  dt: number;
  mode?: ActuationMode;
  /** State cost diag or full matrix (4×4); defaults to diag(10, 10, 1, 1). */
  Q?: number[][];
  /** Control cost (m×m in actuated-channel space); defaults to identity. */
  R?: number[][];
}

// ---------------------------------------------------------------------------
// Small dense-matrix helpers (row-major number[][]).
// ---------------------------------------------------------------------------

export function matZeros(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
}

export function matIdentity(n: number): number[][] {
  const m = matZeros(n, n);
  for (let i = 0; i < n; i += 1) m[i]![i] = 1;
  return m;
}

export function matMul(a: readonly (readonly number[])[], b: readonly (readonly number[])[]): number[][] {
  const rows = a.length;
  const inner = b.length;
  const cols = b[0]?.length ?? 0;
  const out = matZeros(rows, cols);
  for (let i = 0; i < rows; i += 1) {
    for (let k = 0; k < inner; k += 1) {
      const aik = a[i]![k] ?? 0;
      if (aik === 0) continue;
      for (let j = 0; j < cols; j += 1) out[i]![j] = (out[i]![j] ?? 0) + aik * (b[k]![j] ?? 0);
    }
  }
  return out;
}

export function matTranspose(a: readonly (readonly number[])[]): number[][] {
  const rows = a.length;
  const cols = a[0]?.length ?? 0;
  const out = matZeros(cols, rows);
  for (let i = 0; i < rows; i += 1) for (let j = 0; j < cols; j += 1) out[j]![i] = a[i]![j] ?? 0;
  return out;
}

function matAddScaled(a: readonly (readonly number[])[], b: readonly (readonly number[])[], scale: number): number[][] {
  return a.map((row, i) => row.map((v, j) => v + scale * (b[i]![j] ?? 0)));
}

function matMaxAbs(a: readonly (readonly number[])[]): number {
  let max = 0;
  for (const row of a) for (const v of row) max = Math.max(max, Math.abs(v));
  return max;
}

/**
 * Solve A·X = B for small dense systems by Gaussian elimination with partial
 * pivoting (A is copied, not mutated). Throws on a numerically singular pivot —
 * in the Riccati recursion that only happens for R + BᵀPB losing rank, which is
 * a spec error (R must be positive definite).
 */
export function solveSmall(aIn: readonly (readonly number[])[], bIn: readonly (readonly number[])[]): number[][] {
  const n = aIn.length;
  const cols = bIn[0]?.length ?? 0;
  const a = aIn.map((row) => row.slice());
  const x = bIn.map((row) => row.slice());
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(a[r]![col] ?? 0) > Math.abs(a[pivot]![col] ?? 0)) pivot = r;
    }
    if (Math.abs(a[pivot]![col] ?? 0) < 1e-14) throw new Error('solveSmall: singular matrix');
    if (pivot !== col) {
      [a[col], a[pivot]] = [a[pivot]!, a[col]!];
      [x[col], x[pivot]] = [x[pivot]!, x[col]!];
    }
    const inv = 1 / (a[col]![col] ?? 1);
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = (a[r]![col] ?? 0) * inv;
      if (factor === 0) continue;
      for (let c = col; c < n; c += 1) a[r]![c] = (a[r]![c] ?? 0) - factor * (a[col]![c] ?? 0);
      for (let c = 0; c < cols; c += 1) x[r]![c] = (x[r]![c] ?? 0) - factor * (x[col]![c] ?? 0);
    }
  }
  for (let r = 0; r < n; r += 1) {
    const inv = 1 / (a[r]![r] ?? 1);
    for (let c = 0; c < cols; c += 1) x[r]![c] = (x[r]![c] ?? 0) * inv;
  }
  return x;
}

/**
 * Matrix exponential by scaling-and-squaring with a Taylor series on the
 * scaled matrix. For the ≤6×6 design matrices used here (‖A·dt/2ˢ‖ ≤ 0.5) the
 * truncated series reaches machine precision in well under 20 terms; tests pin
 * it against the closed-form rotation exponential.
 */
export function matExp(a: readonly (readonly number[])[]): number[][] {
  const n = a.length;
  const norm = matMaxAbs(a) * n;
  const squarings = Math.max(0, Math.ceil(Math.log2(Math.max(norm, 1e-300) / 0.5)));
  const scale = 1 / 2 ** squarings;
  const scaled = a.map((row) => row.map((v) => v * scale));
  let result = matIdentity(n);
  let term = matIdentity(n);
  for (let i = 1; i <= 24; i += 1) {
    term = matMul(term, scaled).map((row) => row.map((v) => v / i));
    result = matAddScaled(result, term, 1);
    if (matMaxAbs(term) < 1e-18 * Math.max(1, matMaxAbs(result))) break;
  }
  for (let s = 0; s < squarings; s += 1) result = matMul(result, result);
  return result;
}

/**
 * Exact zero-order-hold discretisation of ẋ = Ax + Bu via the Van Loan block
 * exponential: expm([[A, B], [0, 0]]·dt) = [[Ad, Bd], [0, I]].
 */
export function discretizeLinear(
  a: readonly (readonly number[])[],
  b: readonly (readonly number[])[],
  dt: number
): { Ad: number[][]; Bd: number[][] } {
  const n = a.length;
  const m = b[0]?.length ?? 0;
  const block = matZeros(n + m, n + m);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) block[i]![j] = (a[i]![j] ?? 0) * dt;
    for (let j = 0; j < m; j += 1) block[i]![n + j] = (b[i]![j] ?? 0) * dt;
  }
  const e = matExp(block);
  const Ad = matZeros(n, n);
  const Bd = matZeros(n, m);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) Ad[i]![j] = e[i]![j] ?? 0;
    for (let j = 0; j < m; j += 1) Bd[i]![j] = e[i]![n + j] ?? 0;
  }
  return { Ad, Bd };
}

export interface DareOptions {
  maxIterations?: number;
  tolerance?: number;
}

/**
 * Discrete algebraic Riccati equation by value iteration from P₀ = Q:
 *
 *   P ← Q + AᵀPA − AᵀPB (R + BᵀPB)⁻¹ BᵀPA
 *
 * (Bertsekas, Dynamic Programming and Optimal Control, vol. I — the same
 * recursion the DFKI benchmark uses for its finite-horizon TVLQR, iterated to
 * the fixed point.) P is symmetrised each sweep to stop round-off drift.
 */
export function solveDare(
  Ad: readonly (readonly number[])[],
  Bd: readonly (readonly number[])[],
  Q: readonly (readonly number[])[],
  R: readonly (readonly number[])[],
  options: DareOptions = {}
): DareResult {
  const maxIterations = options.maxIterations ?? 100_000;
  const tolerance = options.tolerance ?? 1e-12;
  const At = matTranspose(Ad);
  const Bt = matTranspose(Bd);
  let P = Q.map((row) => row.slice());
  let K: number[][] = matZeros(Bd[0]?.length ?? 0, Ad.length);
  let iterations = 0;
  let residual = Infinity;
  let converged = false;
  while (iterations < maxIterations) {
    iterations += 1;
    const PA = matMul(P, Ad);
    const PB = matMul(P, Bd);
    const G = matAddScaled(R, matMul(Bt, PB), 1); // R + BᵀPB
    K = solveSmall(G, matMul(Bt, PA)); // (R + BᵀPB)⁻¹ BᵀPA
    // P⁺ = Q + Aᵀ P (A − B K)
    const closed = matAddScaled(Ad, matMul(Bd, K), -1);
    const next = matAddScaled(Q, matMul(At, matMul(P, closed)), 1);
    // Symmetrise before the convergence check.
    for (let i = 0; i < next.length; i += 1) {
      for (let j = i + 1; j < next.length; j += 1) {
        const avg = 0.5 * ((next[i]![j] ?? 0) + (next[j]![i] ?? 0));
        next[i]![j] = avg;
        next[j]![i] = avg;
      }
    }
    residual = matMaxAbs(matAddScaled(next, P, -1));
    P = next;
    if (residual < tolerance * Math.max(1, matMaxAbs(P))) {
      converged = true;
      break;
    }
  }
  return { P, K, iterations, converged, residual };
}

const DEFAULT_Q = [
  [10, 0, 0, 0],
  [0, 10, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1]
];

/** Actuated torque channels for a mode (column indices into the 2-torque input). */
export function actuatedChannels(mode: ActuationMode): number[] {
  if (mode === 'acrobot') return [1];
  if (mode === 'pendubot') return [0];
  return [0, 1];
}

/**
 * Design an upright-balancing LQR for the (possibly underactuated) double
 * pendulum: exact linearisation at [π, π, 0, 0], ZOH discretisation at the
 * controller step, Riccati value iteration, and a closed-loop eigenvalue
 * report so "stabilising" is a checked claim rather than an assumption.
 */
export function designUprightLqr(spec: LqrSpec): LqrDesign {
  const mode = spec.mode ?? 'full';
  const channels = actuatedChannels(mode);
  const upright = Float64Array.from(DOUBLE_UPRIGHT_STATE);

  const jac = new Float64Array(16);
  jacobianDouble(upright, spec.parameters, spec.gamma, jac);
  const A = matZeros(4, 4);
  for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) A[i]![j] = jac[i * 4 + j] ?? 0;

  const bFlat = new Float64Array(8);
  controlMatrixDouble(upright, spec.parameters, bFlat);
  const B = matZeros(4, channels.length);
  for (let i = 0; i < 4; i += 1) {
    for (let c = 0; c < channels.length; c += 1) B[i]![c] = bFlat[i * 2 + channels[c]!] ?? 0;
  }

  const Q = spec.Q ?? DEFAULT_Q;
  const R = spec.R ?? matIdentity(channels.length);
  const { Ad, Bd } = discretizeLinear(A, B, spec.dt);
  const riccati = solveDare(Ad, Bd, Q, R);

  const closed = matAddScaled(Ad, matMul(Bd, riccati.K), -1);
  const closedLoopEigenvalues = eigenvaluesGeneral(closed);
  const spectralRadius = closedLoopEigenvalues.reduce((max, z) => Math.max(max, Math.hypot(z.re, z.im)), 0);

  return {
    A,
    B,
    Ad,
    Bd,
    dt: spec.dt,
    mode,
    riccati,
    closedLoopEigenvalues,
    spectralRadius,
    stabilising: riccati.converged && spectralRadius < 1
  };
}

export interface LqrControllerOptions {
  /** Symmetric saturation |τ_i| ≤ torqueLimit (Infinity disables). */
  torqueLimit?: number;
}

/**
 * Wrap an `LqrDesign` into a state-feedback law u = −K·δx around the upright
 * equilibrium, with angle wrapping so the controller sees the nearest upright
 * representative, saturation, and the unactuated channel forced to zero.
 * Writes the full [τ1, τ2] joint-torque vector into `out`.
 */
export function lqrTorque(design: LqrDesign, state: ArrayLike<number>, out: Float64Array, options: LqrControllerOptions = {}): Float64Array {
  const limit = options.torqueLimit ?? Infinity;
  const channels = actuatedChannels(design.mode);
  const dx = [
    wrapAngle(Number(state[0] ?? 0) - Math.PI),
    wrapAngle(Number(state[1] ?? 0) - Math.PI),
    Number(state[2] ?? 0),
    Number(state[3] ?? 0)
  ];
  out.fill(0);
  for (let c = 0; c < channels.length; c += 1) {
    let u = 0;
    for (let j = 0; j < 4; j += 1) u -= (design.riccati.K[c]![j] ?? 0) * (dx[j] ?? 0);
    out[channels[c]!] = Math.min(limit, Math.max(-limit, u));
  }
  applyActuationMode(design.mode, out);
  return out;
}

/** Quadratic Lyapunov level V(x) = δxᵀ P δx of the LQR cost-to-go — the capture gate for hybrid swing-up. */
export function lqrLyapunovLevel(design: LqrDesign, state: ArrayLike<number>): number {
  const dx = [
    wrapAngle(Number(state[0] ?? 0) - Math.PI),
    wrapAngle(Number(state[1] ?? 0) - Math.PI),
    Number(state[2] ?? 0),
    Number(state[3] ?? 0)
  ];
  let v = 0;
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) v += (dx[i] ?? 0) * (design.riccati.P[i]![j] ?? 0) * (dx[j] ?? 0);
  }
  return v;
}

// ---------------------------------------------------------------------------
// N-chain upright balancing — none of the surveyed source projects attempt
// this; it exists here because the exact chain linearisation (`jacobianChain`)
// and the closed-form M⁻¹S control matrix were already available.
// ---------------------------------------------------------------------------

export interface ChainLqrSpec {
  parameters: ChainParameters;
  /** Force-level damping coefficient, matching the `rhsChain` convention. */
  gamma: number;
  dt: number;
  /** State cost (2n×2n); defaults to diag(10 for angles, 1 for rates). */
  Q?: number[][];
  /** Control cost (n×n, all joints actuated); defaults to identity. */
  R?: number[][];
}

export interface ChainLqrDesign {
  n: number;
  A: number[][];
  B: number[][];
  Ad: number[][];
  Bd: number[][];
  dt: number;
  riccati: DareResult;
  closedLoopEigenvalues: Complex[];
  spectralRadius: number;
  stabilising: boolean;
}

/**
 * Upright LQR for the fully-actuated planar N-chain: exact linearisation at
 * the all-inverted equilibrium (every θ_j = π) via `jacobianChain`, closed-form
 * B = M⁻¹S, then the same Van Loan discretisation + Riccati value iteration
 * as the double-pendulum design. The N = 2 case cross-checks against
 * `designUprightLqr` in the tests; N = 3 and 4 are pinned by nonlinear
 * balancing simulations.
 */
export function designChainUprightLqr(spec: ChainLqrSpec): ChainLqrDesign {
  const n = chainLength(spec.parameters);
  const upright = uprightChainState(n);

  const jac = new Float64Array(4 * n * n);
  jacobianChain(upright, spec.parameters, spec.gamma, jac);
  const A = matZeros(2 * n, 2 * n);
  for (let i = 0; i < 2 * n; i += 1) {
    for (let j = 0; j < 2 * n; j += 1) A[i]![j] = jac[i * 2 * n + j] ?? 0;
  }

  const bFlat = new Float64Array(2 * n * n);
  controlMatrixChain(upright, spec.parameters, bFlat);
  const B = matZeros(2 * n, n);
  for (let i = 0; i < 2 * n; i += 1) {
    for (let c = 0; c < n; c += 1) B[i]![c] = bFlat[i * n + c] ?? 0;
  }

  const Q = spec.Q ?? (() => {
    const q = matIdentity(2 * n);
    for (let i = 0; i < n; i += 1) q[i]![i] = 10;
    return q;
  })();
  const R = spec.R ?? matIdentity(n);
  const { Ad, Bd } = discretizeLinear(A, B, spec.dt);
  const riccati = solveDare(Ad, Bd, Q, R);

  const closed = matAddScaled(Ad, matMul(Bd, riccati.K), -1);
  const closedLoopEigenvalues = eigenvaluesGeneral(closed);
  const spectralRadius = closedLoopEigenvalues.reduce((max, z) => Math.max(max, Math.hypot(z.re, z.im)), 0);

  return {
    n,
    A,
    B,
    Ad,
    Bd,
    dt: spec.dt,
    riccati,
    closedLoopEigenvalues,
    spectralRadius,
    stabilising: riccati.converged && spectralRadius < 1
  };
}

/**
 * Chain LQR feedback u = −K·δx around the all-upright equilibrium, with
 * per-link angle wrapping and symmetric saturation. Writes the n joint
 * torques into `out`.
 */
export function lqrChainTorque(design: ChainLqrDesign, state: ArrayLike<number>, out: Float64Array, options: LqrControllerOptions = {}): Float64Array {
  const n = design.n;
  const limit = options.torqueLimit ?? Infinity;
  for (let c = 0; c < n; c += 1) {
    let u = 0;
    for (let j = 0; j < n; j += 1) {
      u -= (design.riccati.K[c]![j] ?? 0) * wrapAngle(Number(state[j] ?? 0) - Math.PI);
      u -= (design.riccati.K[c]![n + j] ?? 0) * Number(state[n + j] ?? 0);
    }
    out[c] = Math.min(limit, Math.max(-limit, u));
  }
  return out;
}
