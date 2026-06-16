/**
 * Spherical N-chain on the embedded (Cartesian unit-vector) chart — the
 * pole-singularity-free generalisation of `sphericalChain.ts`, and the N-link
 * extension of the single-pendulum `sphericalEmbedded.ts`.
 *
 * The polar chain carries each link as (θ_k, φ_k); at a pole (sinθ_k → 0) the
 * azimuth is undefined, the φ_k row/column of the mass matrix degenerates, and
 * `sphericalChain.ts` must clamp |sinθ| ≥ 1e-6, perturbing trajectories that
 * swing through the vertical. Here each link direction is instead carried as a
 * Cartesian unit vector u_k ∈ S² with velocity w_k = u̇_k (tangency u_k·w_k = 0),
 * the globally-regular "ambient" member of the S² atlas. **No clamp anywhere.**
 *
 * ─── Derivation (constant-metric constrained dynamics) ───────────────────────
 * Bob positions r_i = Σ_{k≤i} l_k u_k, so velocities ṙ_i = Σ_{k≤i} l_k w_k and
 *
 *   T = ½ Σ_i m_i |ṙ_i|² = ½ Σ_{j,k} A_{jk} (w_j·w_k),   A_{jk} = l_j l_k S_{max(j,k)}
 *   V = Σ_i m_i g (r_i·ŷ) = g Σ_k l_k S_k (u_k·ŷ)          (ŷ up, S_k = Σ_{i≥k} m_i)
 *
 * The decisive simplification: in the embedded chart the kinetic metric A is the
 * *constant* suffix-mass matrix (it is A = Σ_i m_i v_i v_iᵀ with (v_i)_k = l_k·[k≤i],
 * hence symmetric positive-definite), so ∂T/∂u_k = 0 — there are **no
 * configuration-dependent Coriolis/centrifugal terms**. All the nonlinearity
 * lives in the rod constraints |u_k| = 1, enforced by Lagrange multipliers λ_k
 * (the rod tensions). The Euler–Lagrange equations are therefore
 *
 *   Σ_j A_{kj} ü_j = −g l_k S_k ŷ + λ_k u_k            (∗)
 *
 * Writing B = A⁻¹ (constant — factor it once) and a_i = ü_i, (∗) gives
 *
 *   a_i = a_i^free + Σ_j B_{ij} λ_j u_j,   a_i^free = −g (Σ_j B_{ij} l_j S_j) ŷ ≡ (0, −φ_i, 0).
 *
 * Differentiating |u_i|² = 1 twice gives the acceleration-level constraint
 * u_i·a_i = −|w_i|²; substituting a_i yields the linear multiplier system
 *
 *   G λ = c,   G_{ij} = B_{ij}(u_i·u_j),   c_i = −|w_i|² + (u_i·ŷ) φ_i.
 *
 * G is the Hadamard product of the SPD matrix B with the Gram matrix U_{ij}=u_i·u_j
 * (PSD, unit diagonal); by the Schur product theorem **G is positive-definite for
 * every configuration** — so unlike the polar chart this solve is *never* singular,
 * with no clamp and no pole exception. Damping follows the embedded single-pendulum
 * convention a_i ← a_i − γ w_i (which preserves tangency exactly since u_i·w_i = 0).
 *
 * N = 1 reduces to `sphericalEmbedded.ts` analytically: B = 1/(l²m), φ = g/l, and
 * a = −(g/l)ŷ + [(g/l)u_y − |w|²]·u. Validation anchors (tests/spherical-embedded-chain):
 *   • exact reduction to `EmbeddedSphericalPendulum` at N = 1 (RHS + trajectory),
 *   • agreement with the polar `SphericalChain` away from the poles (~1e-7),
 *   • E and L_z conserved through a near-pole passage where the clamped polar chain
 *     loses a large fraction of its energy — the embedded chart's whole purpose.
 *
 * State layout (length 6N): [u_0(3), …, u_{N−1}(3), w_0(3), …, w_{N−1}(3)],
 * with u_{k,y} = −cosθ_k (u_k = −ŷ is link k hanging straight down).
 */

import {
  assertLinearSolve,
  choleskyFactor,
  choleskySolveFactored,
  solveCholeskyInPlace,
  solveLinearInPlace,
  type LinearSolveResult
} from './linearSolve';
import { sphericalChainLength, validateSphericalChainParams, type SphericalChainParams } from './sphericalChain';
import type { EnergyBreakdown } from '../types/domain';

/** Reuse the polar chain's parameter shape (masses, lengths, g, damping). */
export type EmbeddedChainParams = SphericalChainParams;

/** Flat embedded chain state [u_0…u_{N−1}, w_0…w_{N−1}] of length 6N. */
export type EmbeddedChainState = Float64Array;

export interface EmbeddedChainWorkspace {
  n: number;
  /** Suffix masses S_k = Σ_{i≥k} m_i. */
  suffix: Float64Array;
  /** B = A⁻¹ (constant inverse of the suffix-mass metric), row-major n×n. */
  bInv: Float64Array;
  /** φ_i = g·Σ_j B_{ij} l_j S_j (constant gravity response), length n. */
  phi: Float64Array;
  /** Per-step multiplier matrix G_{ij} = B_{ij}(u_i·u_j), row-major n×n. */
  gMatrix: Float64Array;
  /** Cholesky factor scratch for the G-solve (keeps gMatrix intact for the GE fallback). */
  gFactor: Float64Array;
  /** RHS / solution buffer for G λ = c (length n). */
  lambda: Float64Array;
  /** |w_k|² scratch (length n). */
  wSq: Float64Array;
}

/**
 * Build the constant inverse metric B = A⁻¹ with A_{jk} = l_j l_k S_{max(j,k)}.
 * A is SPD by construction, so Cholesky succeeds; a pivoted-GE path is kept as a
 * defensive fallback and fails loudly rather than fabricating a wrong inverse.
 */
function buildInverseMetric(params: EmbeddedChainParams, n: number, suffix: Float64Array): Float64Array {
  const a = new Float64Array(n * n);
  for (let j = 0; j < n; j += 1) {
    const lj = params.lengths[j] ?? 0;
    for (let k = 0; k < n; k += 1) {
      const lk = params.lengths[k] ?? 0;
      a[j * n + k] = lj * lk * (suffix[Math.max(j, k)] ?? 0);
    }
  }
  const factor = new Float64Array(n * n);
  const b = new Float64Array(n * n);
  const col = new Float64Array(n);
  const factored = choleskyFactor(a, n, factor);
  if (factored.ok) {
    for (let c = 0; c < n; c += 1) {
      col.fill(0);
      col[c] = 1;
      choleskySolveFactored(factor, col, n);
      for (let r = 0; r < n; r += 1) b[r * n + c] = col[r] ?? 0;
    }
    return b;
  }
  // Defensive fallback: solve A·B_col = e_col by pivoted elimination on a fresh copy.
  for (let c = 0; c < n; c += 1) {
    const aCopy = new Float64Array(a);
    col.fill(0);
    col[c] = 1;
    const solve = solveLinearInPlace(aCopy, col, n);
    assertLinearSolve(solve, 'embedded chain inverse metric');
    for (let r = 0; r < n; r += 1) b[r * n + c] = col[r] ?? 0;
  }
  return b;
}

export function createEmbeddedChainWorkspace(params: EmbeddedChainParams): EmbeddedChainWorkspace {
  const n = sphericalChainLength(params);
  const suffix = new Float64Array(n);
  let acc = 0;
  for (let j = n - 1; j >= 0; j -= 1) {
    acc += params.masses[j] ?? 0;
    suffix[j] = acc;
  }
  const bInv = buildInverseMetric(params, n, suffix);
  const phi = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    let s = 0;
    for (let j = 0; j < n; j += 1) s += (bInv[i * n + j] ?? 0) * (params.lengths[j] ?? 0) * (suffix[j] ?? 0);
    phi[i] = params.g * s;
  }
  return {
    n,
    suffix,
    bInv,
    phi,
    gMatrix: new Float64Array(n * n),
    gFactor: new Float64Array(n * n),
    lambda: new Float64Array(n),
    wSq: new Float64Array(n)
  };
}

/**
 * Embedded chain equations of motion. `state` and `out` have length 6N. The rod
 * constraints are enforced by an SPD (Schur-positive) multiplier solve that is
 * regular at every configuration — there is no pole clamp.
 */
export function rhsEmbeddedChain(
  state: ArrayLike<number>,
  params: EmbeddedChainParams,
  out: Float64Array,
  workspace: EmbeddedChainWorkspace = createEmbeddedChainWorkspace(params)
): Float64Array {
  const n = workspace.n;
  if (n !== sphericalChainLength(params)) throw new Error(`rhsEmbeddedChain: workspace length ${n} does not match chain length ${sphericalChainLength(params)}`);
  const { bInv, phi, gMatrix, gFactor, lambda, wSq } = workspace;
  const uOff = 0;
  const wOff = 3 * n;

  // d/dt u_k = w_k, and per-link |w_k|².
  for (let k = 0; k < n; k += 1) {
    const wx = Number(state[wOff + 3 * k] ?? 0);
    const wy = Number(state[wOff + 3 * k + 1] ?? 0);
    const wz = Number(state[wOff + 3 * k + 2] ?? 0);
    out[uOff + 3 * k] = wx;
    out[uOff + 3 * k + 1] = wy;
    out[uOff + 3 * k + 2] = wz;
    wSq[k] = wx * wx + wy * wy + wz * wz;
  }

  // G_{ij} = B_{ij}(u_i·u_j);  c_i = −|w_i|² + (u_i·ŷ) φ_i.   (ŷ is +y ⇒ u_i·ŷ = u_{i,y})
  for (let i = 0; i < n; i += 1) {
    const uix = Number(state[uOff + 3 * i] ?? 0);
    const uiy = Number(state[uOff + 3 * i + 1] ?? 0);
    const uiz = Number(state[uOff + 3 * i + 2] ?? 0);
    for (let j = 0; j < n; j += 1) {
      const dot = uix * Number(state[uOff + 3 * j] ?? 0) + uiy * Number(state[uOff + 3 * j + 1] ?? 0) + uiz * Number(state[uOff + 3 * j + 2] ?? 0);
      gMatrix[i * n + j] = (bInv[i * n + j] ?? 0) * dot;
    }
    lambda[i] = -(wSq[i] ?? 0) + uiy * (phi[i] ?? 0);
  }

  // Solve G λ = c. G is SPD for every configuration (Schur product theorem);
  // the GE fallback only guards against catastrophic round-off and fails loudly.
  const chol = solveCholeskyInPlace(gMatrix, lambda, n, gFactor);
  if (!chol.ok) {
    const solve = solveLinearInPlace(gMatrix, lambda, n);
    assertLinearSolve(solve, 'rhsEmbeddedChain multiplier matrix');
  }

  // a_i = (0, −φ_i, 0) + Σ_j B_{ij} λ_j u_j,  then damp: a_i ← a_i − γ w_i.
  for (let i = 0; i < n; i += 1) {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let j = 0; j < n; j += 1) {
      const bl = (bInv[i * n + j] ?? 0) * (lambda[j] ?? 0);
      sx += bl * Number(state[uOff + 3 * j] ?? 0);
      sy += bl * Number(state[uOff + 3 * j + 1] ?? 0);
      sz += bl * Number(state[uOff + 3 * j + 2] ?? 0);
    }
    const damping = params.damping;
    out[wOff + 3 * i] = sx - damping * Number(state[wOff + 3 * i] ?? 0);
    out[wOff + 3 * i + 1] = -(phi[i] ?? 0) + sy - damping * Number(state[wOff + 3 * i + 1] ?? 0);
    out[wOff + 3 * i + 2] = sz - damping * Number(state[wOff + 3 * i + 2] ?? 0);
  }
  return out;
}

/** Cartesian bob positions r_i = Σ_{k≤i} l_k u_k (y up, pivot at the origin). */
export function embeddedChainPositions(state: ArrayLike<number>, params: EmbeddedChainParams): Array<{ x: number; y: number; z: number }> {
  const n = sphericalChainLength(params);
  const out: Array<{ x: number; y: number; z: number }> = [];
  let x = 0;
  let y = 0;
  let z = 0;
  for (let k = 0; k < n; k += 1) {
    const l = params.lengths[k] ?? 0;
    x += l * Number(state[3 * k] ?? 0);
    y += l * Number(state[3 * k + 1] ?? 0);
    z += l * Number(state[3 * k + 2] ?? 0);
    out.push({ x, y, z });
  }
  return out;
}

/** Cartesian bob velocities ṙ_i = Σ_{k≤i} l_k w_k. */
export function embeddedChainVelocities(state: ArrayLike<number>, params: EmbeddedChainParams): Array<{ x: number; y: number; z: number }> {
  const n = sphericalChainLength(params);
  const wOff = 3 * n;
  const out: Array<{ x: number; y: number; z: number }> = [];
  let vx = 0;
  let vy = 0;
  let vz = 0;
  for (let k = 0; k < n; k += 1) {
    const l = params.lengths[k] ?? 0;
    vx += l * Number(state[wOff + 3 * k] ?? 0);
    vy += l * Number(state[wOff + 3 * k + 1] ?? 0);
    vz += l * Number(state[wOff + 3 * k + 2] ?? 0);
    out.push({ x: vx, y: vy, z: vz });
  }
  return out;
}

/** Total energy: ½ Σ_i m_i |ṙ_i|² + Σ_i m_i g y_i — identical physical quantity to `sphericalChainEnergy`. */
export function embeddedChainEnergy(state: ArrayLike<number>, params: EmbeddedChainParams): EnergyBreakdown {
  const n = sphericalChainLength(params);
  const wOff = 3 * n;
  let KE = 0;
  let PE = 0;
  let vx = 0;
  let vy = 0;
  let vz = 0;
  let y = 0;
  for (let k = 0; k < n; k += 1) {
    const l = params.lengths[k] ?? 0;
    const m = params.masses[k] ?? 0;
    vx += l * Number(state[wOff + 3 * k] ?? 0);
    vy += l * Number(state[wOff + 3 * k + 1] ?? 0);
    vz += l * Number(state[wOff + 3 * k + 2] ?? 0);
    y += l * Number(state[3 * k + 1] ?? 0);
    KE += 0.5 * m * (vx * vx + vy * vy + vz * vz);
    PE += m * params.g * y;
  }
  return { total: KE + PE, KE, PE };
}

/** Vertical angular momentum Σ_i m_i (z_i ẋ_i − x_i ż_i); conserved when γ = 0. */
export function embeddedChainLz(state: ArrayLike<number>, params: EmbeddedChainParams): number {
  const n = sphericalChainLength(params);
  const wOff = 3 * n;
  let lz = 0;
  let x = 0;
  let z = 0;
  let vx = 0;
  let vz = 0;
  for (let k = 0; k < n; k += 1) {
    const l = params.lengths[k] ?? 0;
    const m = params.masses[k] ?? 0;
    x += l * Number(state[3 * k] ?? 0);
    z += l * Number(state[3 * k + 2] ?? 0);
    vx += l * Number(state[wOff + 3 * k] ?? 0);
    vz += l * Number(state[wOff + 3 * k + 2] ?? 0);
    lz += m * (z * vx - x * vz);
  }
  return lz;
}

/** Convert a polar chain state [θ_0,φ_0,…,θ̇_0,φ̇_0,…] (length 4N) to the embedded chart (length 6N). */
export function angleChainToEmbedded(state: ArrayLike<number>, n: number): EmbeddedChainState {
  const out = new Float64Array(6 * n);
  const wOff = 3 * n;
  for (let k = 0; k < n; k += 1) {
    const theta = Number(state[2 * k] ?? 0);
    const phi = Number(state[2 * k + 1] ?? 0);
    const thetaDot = Number(state[2 * n + 2 * k] ?? 0);
    const phiDot = Number(state[2 * n + 2 * k + 1] ?? 0);
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    out[3 * k] = sin * cp;
    out[3 * k + 1] = -cos;
    out[3 * k + 2] = sin * sp;
    // w = θ̇·∂u/∂θ + φ̇·∂u/∂φ, with ∂u/∂θ = (cosθcosφ, sinθ, cosθsinφ), ∂u/∂φ = (−sinθsinφ, 0, sinθcosφ).
    out[wOff + 3 * k] = thetaDot * cos * cp - phiDot * sin * sp;
    out[wOff + 3 * k + 1] = thetaDot * sin;
    out[wOff + 3 * k + 2] = thetaDot * cos * sp + phiDot * sin * cp;
  }
  return out;
}

/** Convert an embedded chain state back to the polar chart (length 4N). Singular at the poles. */
export function embeddedChainToAngle(state: ArrayLike<number>, n: number): Float64Array {
  const out = new Float64Array(4 * n);
  const wOff = 3 * n;
  for (let k = 0; k < n; k += 1) {
    const ux = Number(state[3 * k] ?? 0);
    const uy = Number(state[3 * k + 1] ?? 0);
    const uz = Number(state[3 * k + 2] ?? 0);
    const theta = Math.acos(Math.max(-1, Math.min(1, -uy)));
    const phi = Math.atan2(uz, ux);
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    const wx = Number(state[wOff + 3 * k] ?? 0);
    const wy = Number(state[wOff + 3 * k + 1] ?? 0);
    const wz = Number(state[wOff + 3 * k + 2] ?? 0);
    out[2 * k] = theta;
    out[2 * k + 1] = phi;
    out[2 * n + 2 * k] = wx * cos * cp + wy * sin + wz * cos * sp;
    out[2 * n + 2 * k + 1] = sin === 0 ? 0 : (wx * -sp + wz * cp) / sin;
  }
  return out;
}

export interface EmbeddedChainDiagnostics {
  time: number;
  energy: number;
  energyDrift: number;
  lz: number;
  lzDrift: number;
  /** max_k ||u_k| − 1| after projection. */
  unitConstraintError: number;
  /** max_k |u_k·w_k|. */
  tangentConstraintError: number;
  method: 'rk4';
  dt: number;
  caveat: string;
}

/** Renormalise every u_k to S² and remove the radial part of each w_k (u_k·w_k = 0). */
function projectChain(state: EmbeddedChainState, n: number): void {
  const wOff = 3 * n;
  for (let k = 0; k < n; k += 1) {
    const ux = state[3 * k] ?? 0;
    const uy = state[3 * k + 1] ?? 0;
    const uz = state[3 * k + 2] ?? 0;
    const norm = Math.hypot(ux, uy, uz) || 1;
    const nx = ux / norm;
    const ny = uy / norm;
    const nz = uz / norm;
    state[3 * k] = nx;
    state[3 * k + 1] = ny;
    state[3 * k + 2] = nz;
    const wx = state[wOff + 3 * k] ?? 0;
    const wy = state[wOff + 3 * k + 1] ?? 0;
    const wz = state[wOff + 3 * k + 2] ?? 0;
    const radial = nx * wx + ny * wy + nz * wz;
    state[wOff + 3 * k] = wx - radial * nx;
    state[wOff + 3 * k + 1] = wy - radial * ny;
    state[wOff + 3 * k + 2] = wz - radial * nz;
  }
}

/**
 * Fixed-step RK4 integrator on the embedded chart with a per-step projection
 * back onto the constraint manifold (each u_k renormalised, each w_k made
 * tangent). Mirrors `SphericalChain` but is regular at the poles — no clamp.
 */
export class EmbeddedSphericalChain {
  private state: EmbeddedChainState;
  private time = 0;
  private readonly n: number;
  private readonly initialEnergy: number;
  private readonly initialLz: number;
  private readonly workspace: EmbeddedChainWorkspace;
  private readonly scratch: Float64Array[];
  private readonly dt: number;

  constructor(readonly params: EmbeddedChainParams, initial: ArrayLike<number>, dt = 0.002) {
    validateSphericalChainParams(params);
    this.n = sphericalChainLength(params);
    const dof = 6 * this.n;
    this.state = Float64Array.from({ length: dof }, (_, i) => Number(initial[i] ?? 0));
    projectChain(this.state, this.n);
    this.dt = dt;
    this.workspace = createEmbeddedChainWorkspace(params);
    this.initialEnergy = embeddedChainEnergy(this.state, params).total;
    this.initialLz = embeddedChainLz(this.state, params);
    this.scratch = [0, 1, 2, 3, 4].map(() => new Float64Array(dof));
  }

  /** Construct from a polar chain initial condition [θ_0,φ_0,…,θ̇_0,φ̇_0,…] (length 4N). */
  static fromAngles(params: EmbeddedChainParams, initial: ArrayLike<number>, dt = 0.002): EmbeddedSphericalChain {
    const n = sphericalChainLength(params);
    return new EmbeddedSphericalChain(params, angleChainToEmbedded(initial, n), dt);
  }

  current(): EmbeddedChainState {
    return this.state.slice();
  }

  positions(): Array<{ x: number; y: number; z: number }> {
    return embeddedChainPositions(this.state, this.params);
  }

  step(elapsed: number): void {
    let remaining = elapsed;
    while (remaining > 1e-12) {
      const h = Math.min(this.dt, remaining);
      remaining -= h;
      this.rk4(h);
      projectChain(this.state, this.n);
      this.time += h;
    }
  }

  private rk4(h: number): void {
    const dof = this.state.length;
    const [k1, k2, k3, k4, tmp] = this.scratch as [Float64Array, Float64Array, Float64Array, Float64Array, Float64Array];
    rhsEmbeddedChain(this.state, this.params, k1, this.workspace);
    for (let i = 0; i < dof; i += 1) tmp[i] = (this.state[i] ?? 0) + (h / 2) * (k1[i] ?? 0);
    rhsEmbeddedChain(tmp, this.params, k2, this.workspace);
    for (let i = 0; i < dof; i += 1) tmp[i] = (this.state[i] ?? 0) + (h / 2) * (k2[i] ?? 0);
    rhsEmbeddedChain(tmp, this.params, k3, this.workspace);
    for (let i = 0; i < dof; i += 1) tmp[i] = (this.state[i] ?? 0) + h * (k3[i] ?? 0);
    rhsEmbeddedChain(tmp, this.params, k4, this.workspace);
    for (let i = 0; i < dof; i += 1) {
      this.state[i] = (this.state[i] ?? 0) + (h / 6) * ((k1[i] ?? 0) + 2 * (k2[i] ?? 0) + 2 * (k3[i] ?? 0) + (k4[i] ?? 0));
    }
  }

  diagnostics(): EmbeddedChainDiagnostics {
    const energy = embeddedChainEnergy(this.state, this.params).total;
    const lz = embeddedChainLz(this.state, this.params);
    let unitErr = 0;
    let tangentErr = 0;
    const wOff = 3 * this.n;
    for (let k = 0; k < this.n; k += 1) {
      const ux = this.state[3 * k] ?? 0;
      const uy = this.state[3 * k + 1] ?? 0;
      const uz = this.state[3 * k + 2] ?? 0;
      const wx = this.state[wOff + 3 * k] ?? 0;
      const wy = this.state[wOff + 3 * k + 1] ?? 0;
      const wz = this.state[wOff + 3 * k + 2] ?? 0;
      unitErr = Math.max(unitErr, Math.abs(Math.hypot(ux, uy, uz) - 1));
      tangentErr = Math.max(tangentErr, Math.abs(ux * wx + uy * wy + uz * wz));
    }
    return {
      time: this.time,
      energy,
      energyDrift: Math.abs((energy - this.initialEnergy) / (Math.abs(this.initialEnergy) || 1)),
      lz,
      lzDrift: Math.abs(lz - this.initialLz) / Math.max(Math.abs(this.initialLz), 1e-12),
      unitConstraintError: unitErr,
      tangentConstraintError: tangentErr,
      method: 'rk4',
      dt: this.dt,
      caveat: this.params.damping > 0
        ? 'Damping active: E and Lz decay physically; drift is not an integrator error metric.'
        : 'Conservative run: E and Lz drift measure integrator error. Embedded chart is globally regular — no pole clamp.'
    };
  }

  /** Multiplier-matrix conditioning at the current state (always positive-definite). */
  multiplierDiagnostics(): LinearSolveResult {
    const n = this.n;
    const g = new Float64Array(n * n);
    const { bInv } = this.workspace;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const dot = (this.state[3 * i] ?? 0) * (this.state[3 * j] ?? 0) + (this.state[3 * i + 1] ?? 0) * (this.state[3 * j + 1] ?? 0) + (this.state[3 * i + 2] ?? 0) * (this.state[3 * j + 2] ?? 0);
        g[i * n + j] = (bInv[i * n + j] ?? 0) * dot;
      }
    }
    const probe = new Float64Array(n).fill(1);
    return solveLinearInPlace(g, probe, n, { diagnostics: true });
  }
}
