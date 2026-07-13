import type { Derivative, Jacobian } from '../physics/types';
import { rk4Step } from '../physics/integrators';
import { rhsDriven, type DrivenParameters } from '../physics/driven';
import { determinant, flowMapGradient, type FtleOptions } from './ftle';

/**
 * Floquet analysis of periodic orbits.
 *
 * For a T-periodic orbit x*(t) the monodromy matrix M = ∂x(T)/∂x(0) (the
 * state-transition matrix over one period — the same object `flowMapGradient`
 * computes) governs the linear stability: its eigenvalues are the Floquet
 * multipliers ρ_i. |ρ_i| < 1 ⇒ the corresponding direction contracts, |ρ_i| > 1
 * ⇒ it expands, and the orbit is asymptotically stable iff every multiplier lies
 * inside the unit circle. The Floquet exponents are μ_i = ln(ρ_i)/T.
 *
 * The implementation is restricted to planar (2-D state) systems, where the
 * monodromy is 2×2 and its eigenvalues are in closed form — exactly the regime
 * of the driven/parametric single pendulum, the textbook route to chaos. For the
 * driven pendulum (made autonomous by carrying the drive phase as a third
 * coordinate) a period-1 orbit is a fixed point of the stroboscopic map, found
 * here by a 2-D Newton iteration whose Jacobian is the monodromy itself.
 */

export interface FloquetMultiplier {
  re: number;
  im: number;
  /** |ρ|. */
  modulus: number;
}

export interface FloquetResult {
  /** 2×2 monodromy (state) block, row-major. */
  monodromy: Float64Array;
  multipliers: FloquetMultiplier[];
  /** Largest |ρ| — the orbit is stable iff this is ≤ 1. */
  maxModulus: number;
  stable: boolean;
  /** det(M) = Π ρ_i = exp(∫ div f dt) over one period (a Liouville check). */
  determinant: number;
}

export interface FloquetSpectrumResult {
  /** stateDim x stateDim monodromy block, row-major. */
  monodromy: Float64Array;
  dimension: number;
  multipliers: FloquetMultiplier[];
  maxModulus: number;
  stable: boolean;
  determinant: number;
  /** QR sweeps used to reduce the monodromy to real Schur-like form. */
  qrIterations: number;
  /** Infinity norm of the strict lower triangle after QR sweeps. */
  qrResidual: number;
  caveat: string;
}

/** Eigenvalues of a 2×2 real matrix [[a,b],[c,d]] (row-major) — a real or complex-conjugate pair. */
export function eigenvalues2x2(M: ArrayLike<number>): FloquetMultiplier[] {
  const a = Number(M[0] ?? 0);
  const b = Number(M[1] ?? 0);
  const c = Number(M[2] ?? 0);
  const d = Number(M[3] ?? 0);
  const trace = a + d;
  const det = a * d - b * c;
  const disc = trace * trace - 4 * det;
  if (disc >= 0) {
    const s = Math.sqrt(disc);
    const l1 = (trace + s) / 2;
    const l2 = (trace - s) / 2;
    return [
      { re: l1, im: 0, modulus: Math.abs(l1) },
      { re: l2, im: 0, modulus: Math.abs(l2) }
    ];
  }
  const im = Math.sqrt(-disc) / 2;
  const re = trace / 2;
  const modulus = Math.hypot(re, im);
  return [
    { re, im, modulus },
    { re, im: -im, modulus }
  ];
}

function qrDecompose(A: Float64Array, n: number): { q: Float64Array; r: Float64Array } {
  const q = new Float64Array(n * n);
  const r = new Float64Array(n * n);
  const v = new Float64Array(n);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) v[i] = A[i * n + j] ?? 0;
    for (let k = 0; k < j; k += 1) {
      let dot = 0;
      for (let i = 0; i < n; i += 1) dot += (q[i * n + k] ?? 0) * (v[i] ?? 0);
      r[k * n + j] = dot;
      for (let i = 0; i < n; i += 1) v[i] = (v[i] ?? 0) - dot * (q[i * n + k] ?? 0);
    }
    let norm = 0;
    for (let i = 0; i < n; i += 1) norm += (v[i] ?? 0) ** 2;
    norm = Math.sqrt(norm);
    if (norm <= 1e-14) {
      r[j * n + j] = 0;
      for (let i = 0; i < n; i += 1) q[i * n + j] = i === j ? 1 : 0;
    } else {
      r[j * n + j] = norm;
      for (let i = 0; i < n; i += 1) q[i * n + j] = (v[i] ?? 0) / norm;
    }
  }
  return { q, r };
}

function multiply(A: Float64Array, B: Float64Array, n: number): Float64Array {
  const out = new Float64Array(n * n);
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      let sum = 0;
      for (let k = 0; k < n; k += 1) sum += (A[r * n + k] ?? 0) * (B[k * n + c] ?? 0);
      out[r * n + c] = sum;
    }
  }
  return out;
}

function strictLowerNorm(A: Float64Array, n: number): number {
  let norm = 0;
  for (let r = 1; r < n; r += 1) {
    for (let c = 0; c < r - 1; c += 1) norm = Math.max(norm, Math.abs(A[r * n + c] ?? 0));
  }
  return norm;
}

function qrEigenvalues(A: Float64Array, n: number, maxIterations = 160, tolerance = 1e-10): { multipliers: FloquetMultiplier[]; iterations: number; residual: number } {
  let work: Float64Array = Float64Array.from(A);
  let iterations = 0;
  for (; iterations < maxIterations; iterations += 1) {
    const { q, r } = qrDecompose(work, n);
    work = multiply(r, q, n);
    if (strictLowerNorm(work, n) < tolerance) break;
  }
  const multipliers: FloquetMultiplier[] = [];
  for (let i = 0; i < n; i += 1) {
    const subdiag = i < n - 1 ? Math.abs(work[(i + 1) * n + i] ?? 0) : 0;
    const scale = Math.max(1, Math.abs(work[i * n + i] ?? 0), i < n - 1 ? Math.abs(work[(i + 1) * n + i + 1] ?? 0) : 0);
    if (i < n - 1 && subdiag > 1e-8 * scale) {
      multipliers.push(...eigenvalues2x2([
        work[i * n + i] ?? 0,
        work[i * n + i + 1] ?? 0,
        work[(i + 1) * n + i] ?? 0,
        work[(i + 1) * n + i + 1] ?? 0
      ]));
      i += 1;
    } else {
      const value = work[i * n + i] ?? 0;
      multipliers.push({ re: value, im: 0, modulus: Math.abs(value) });
    }
  }
  return { multipliers, iterations, residual: strictLowerNorm(work, n) };
}

/**
 * Monodromy matrix (the `stateDim`×`stateDim` top-left block of the period-T
 * flow-map gradient) for an orbit through `x0`. For a planar system the full
 * gradient already is the monodromy; the block extraction supports the driven
 * pendulum, whose 3-D augmented state carries a neutral drive-phase direction.
 */
export function monodromyMatrix(
  x0: ArrayLike<number>,
  rhs: Derivative,
  period: number,
  options: FtleOptions = {},
  jacobian?: Jacobian,
  stateDim = 2
): Float64Array {
  const { stm, n } = flowMapGradient(x0, rhs, period, options, jacobian);
  const block = new Float64Array(stateDim * stateDim);
  for (let i = 0; i < stateDim; i += 1) {
    for (let j = 0; j < stateDim; j += 1) block[i * stateDim + j] = stm[i * n + j] ?? 0;
  }
  return block;
}

/** Floquet multipliers + stability verdict for a planar orbit through `x0` with period `period`. */
export function floquetAnalysis(
  x0: ArrayLike<number>,
  rhs: Derivative,
  period: number,
  options: FtleOptions = {},
  jacobian?: Jacobian
): FloquetResult {
  const M = monodromyMatrix(x0, rhs, period, options, jacobian, 2);
  const multipliers = eigenvalues2x2(M);
  const maxModulus = Math.max(multipliers[0]!.modulus, multipliers[1]!.modulus);
  const determinant = (M[0] ?? 0) * (M[3] ?? 0) - (M[1] ?? 0) * (M[2] ?? 0);
  return { monodromy: M, multipliers, maxModulus, stable: maxModulus <= 1 + 1e-6, determinant };
}

/**
 * General-dimensional Floquet spectrum. The monodromy block is reduced with QR
 * iteration and interpreted as real Schur blocks, so real multipliers and
 * complex-conjugate 2x2 pairs are both reported.
 */
export function floquetSpectrum(
  x0: ArrayLike<number>,
  rhs: Derivative,
  period: number,
  options: FtleOptions = {},
  jacobian?: Jacobian,
  stateDim: number = x0.length
): FloquetSpectrumResult {
  const M = monodromyMatrix(x0, rhs, period, options, jacobian, stateDim);
  const { multipliers, iterations, residual } = qrEigenvalues(M, stateDim);
  const maxModulus = multipliers.reduce((max, item) => Math.max(max, item.modulus), 0);
  return {
    monodromy: M,
    dimension: stateDim,
    multipliers,
    maxModulus,
    stable: maxModulus <= 1 + 1e-6,
    determinant: determinant(M, stateDim),
    qrIterations: iterations,
    qrResidual: residual,
    caveat: 'Finite-step monodromy spectrum from QR iteration; refine dt/period and inspect qrResidual for near-defective or stiff orbits.'
  };
}

export interface DrivenOrbitOptions {
  dt?: number;
  maxIterations?: number;
  tolerance?: number;
}

export interface DrivenOrbitResult extends FloquetResult {
  /** Converged period-1 orbit point (θ, ω) at drive phase φ = 0. */
  orbit: [number, number];
  period: number;
  converged: boolean;
  /** ‖P(x*) − x*‖ at the returned point. */
  residual: number;
  iterations: number;
}

/**
 * Strobe map: integrate [θ, ω, φ=0] over one drive period and return (θ, ω).
 * The step is snapped so steps·dt equals the period *exactly* — otherwise the
 * map is a strobe at a slightly wrong period and the fixed point lands ~1e-3
 * off the true orbit for typical dt.
 */
function strobe(rhs: Derivative, theta: number, omega: number, period: number, dt: number): [number, number] {
  const steps = Math.max(1, Math.round(period / dt));
  const dtEff = period / steps;
  const cur = new Float64Array([theta, omega, 0]);
  const nxt = new Float64Array(3);
  for (let s = 0; s < steps; s += 1) {
    rk4Step(cur, dtEff, rhs, nxt);
    cur.set(nxt);
  }
  return [cur[0] ?? 0, cur[1] ?? 0];
}

/**
 * Period-1 orbit of the driven pendulum (a fixed point of the stroboscopic map)
 * via 2-D Newton — the update solves (DP − I) Δ = −(P(x) − x) with DP the 2×2
 * monodromy block — followed by its Floquet analysis. Returns `converged: false`
 * (rather than throwing) when Newton fails to reach the tolerance.
 */
export function drivenPeriodicOrbit(
  params: DrivenParameters,
  guess: [number, number],
  options: DrivenOrbitOptions = {}
): DrivenOrbitResult {
  const period = (2 * Math.PI) / params.driveFrequency;
  const dtRaw = options.dt ?? 0.005;
  // Snap dt so the monodromy is computed over *exactly* one period, matching the strobe.
  const dt = period / Math.max(1, Math.round(period / dtRaw));
  const tol = options.tolerance ?? 1e-9;
  const maxIterations = options.maxIterations ?? 60;
  const rhs: Derivative = (s, o) => {
    rhsDriven(s, params, o);
  };

  let theta = guess[0];
  let omega = guess[1];
  let residual = Infinity;
  let iterations = 0;
  let converged = false;

  for (let it = 0; it < maxIterations; it += 1) {
    iterations = it + 1;
    const [pt, po] = strobe(rhs, theta, omega, period, dt);
    const f0 = pt - theta;
    const f1 = po - omega;
    residual = Math.hypot(f0, f1);
    if (residual < tol) {
      converged = true;
      break;
    }
    // DP = 2×2 (θ,ω) block of the 3×3 monodromy about the current point.
    const M = monodromyMatrix([theta, omega, 0], rhs, period, { dt }, undefined, 2);
    // Solve (M − I) Δ = −f.
    const a = (M[0] ?? 0) - 1;
    const b = M[1] ?? 0;
    const c = M[2] ?? 0;
    const d = (M[3] ?? 0) - 1;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-14) break; // singular Newton step — give up gracefully
    const dTheta = (-f0 * d + b * f1) / det;
    const dOmega = (-a * f1 + c * f0) / det;
    theta += dTheta;
    omega += dOmega;
  }

  const analysis = floquetAnalysis([theta, omega, 0], rhs, period, { dt }, undefined);
  return { ...analysis, orbit: [theta, omega], period, converged, residual, iterations };
}
