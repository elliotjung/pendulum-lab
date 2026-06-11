/**
 * Spherical N-chain: N point masses linked by rigid massless rods, each joint
 * a full ball joint — the genuine three-dimensional generalisation of the
 * planar N-pendulum. N = 2 is the *spherical double pendulum* (4 DOF, chaotic,
 * conserves E and the vertical angular momentum L_z when undamped); N = 3 is
 * the spherical triple pendulum (6 DOF).
 *
 * Coordinates per link k: (θ_k, φ_k) — θ the polar angle from the downward
 * vertical, φ the azimuth — matching `spherical.ts` (which is the N = 1 case).
 * State layout: [θ_0, φ_0, …, θ_{N−1}, φ_{N−1}, θ̇_0, φ̇_0, …, θ̇_{N−1}, φ̇_{N−1}].
 *
 * Derivation (standard manipulator form, no hand-expanded Christoffel symbols):
 * with unit link directions u_k = (sinθcosφ, −cosθ, sinθsinφ) (y up) the bob
 * positions are r_i = Σ_{k≤i} l_k u_k, so the position Jacobians have the
 * closed-form columns ∂r_i/∂θ_k = l_k a_k and ∂r_i/∂φ_k = l_k b_k with
 *
 *   a = ∂u/∂θ = (cosθcosφ, sinθ, cosθsinφ)
 *   b = ∂u/∂φ = sinθ·e_φ,   e_φ = (−sinφ, 0, cosφ)
 *
 * and the column time-derivatives are also closed-form:
 *
 *   ȧ = −θ̇·u + φ̇·cosθ·e_φ
 *   ḃ = θ̇·cosθ·e_φ − φ̇·sinθ·ρ,   ρ = (cosφ, 0, sinφ)
 *
 * The Euler–Lagrange equations then read M(q)·q̈ = Q_grav − C(q, q̇) with
 *
 *   M = Σ_i m_i J_iᵀJ_i        (entries S_{max(j,k)} · l_j l_k · d_j·d_k)
 *   C = Σ_i m_i J_iᵀ(J̇_i q̇)   (entries Σ_k S_{max(j,k)} · l_j d_j · v_k)
 *   v_k = l_k (θ̇_k ȧ_k + φ̇_k ḃ_k),   S_j = Σ_{i≥j} m_i  (suffix masses)
 *
 * and gravity contributes only to the θ rows: Q_θj = −g l_j sinθ_j S_j.
 * Every ingredient is an exact closed form — no finite differences — and the
 * implementation is pinned against `sphericalRhs` (N = 1), the planar
 * `rhsChain` (motion restricted to a vertical plane), conservation of E and
 * L_z in full 3D chaos, and an independent SymPy symbolic derivation
 * (`npm run validate:sympy`).
 *
 * Damping follows the `spherical.ts` convention: q̈ ← q̈ − γ·q̇ applied after
 * the mass-matrix solve (per-coordinate rate damping), so N = 1 reduces to
 * `sphericalRhs` exactly even with damping. (The planar `rhsChain` applies
 * damping at force level instead, so planar comparisons use γ = 0.)
 *
 * Chart singularity: at the poles (sinθ_k → 0) the azimuth of link k is
 * undefined and the φ_k row/column of M degenerates. As in `spherical.ts` the
 * chart is regularised — the sinθ entering b_k is clamped to |sinθ| ≥ 1e-6 —
 * which leaves the dynamics exact outside a 1e-6 neighbourhood of the poles.
 */
import type { EnergyBreakdown } from '../types/domain';
import type { IntegratorId } from '../types/domain';
import { assertLinearSolve, solveLinearInPlace } from './linearSolve';
import { step as integrateStep } from './integrators';

export interface SphericalChainParams {
  /** Bob masses, length N. */
  masses: readonly number[];
  /** Link lengths, length N. */
  lengths: readonly number[];
  g: number;
  /** Per-coordinate rate damping γ (1/s); 0 = conservative. */
  damping: number;
}

const POLE_EPS = 1e-6;

export interface SphericalChainWorkspace {
  n: number;
  dof: number;
  suffix: Float64Array;
  matrix: Float64Array;
  force: Float64Array;
}

export function sphericalChainLength(params: SphericalChainParams): number {
  validateSphericalChainParams(params);
  return params.masses.length;
}

export function validateSphericalChainParams(params: SphericalChainParams): void {
  if (params.masses.length !== params.lengths.length) {
    throw new Error(`SphericalChainParams: masses (${params.masses.length}) and lengths (${params.lengths.length}) must have the same length`);
  }
  if (params.masses.length === 0) throw new Error('SphericalChainParams: at least one link is required');
  for (let i = 0; i < params.masses.length; i += 1) {
    const mass = params.masses[i] ?? NaN;
    const length = params.lengths[i] ?? NaN;
    if (!Number.isFinite(mass) || mass <= 0) throw new Error(`SphericalChainParams: mass[${i}] must be positive and finite`);
    if (!Number.isFinite(length) || length <= 0) throw new Error(`SphericalChainParams: length[${i}] must be positive and finite`);
  }
  if (!Number.isFinite(params.g) || params.g <= 0) throw new Error('SphericalChainParams: g must be positive and finite');
  if (!Number.isFinite(params.damping) || params.damping < 0) throw new Error('SphericalChainParams: damping must be non-negative and finite');
}

export function createSphericalChainWorkspace(n: number): SphericalChainWorkspace {
  const dof = 2 * n;
  return {
    n,
    dof,
    suffix: new Float64Array(n),
    matrix: new Float64Array(dof * dof),
    force: new Float64Array(dof)
  };
}

function fillSuffixMass(masses: readonly number[], n: number, s: Float64Array): void {
  let acc = 0;
  for (let j = n - 1; j >= 0; j -= 1) {
    acc += masses[j] ?? 0;
    s[j] = acc;
  }
}

/** Per-link geometric quantities (3-vectors stored flat as [x, y, z]). */
interface LinkFrame {
  u: [number, number, number];
  /** ∂u/∂θ. */
  a: [number, number, number];
  /** ∂u/∂φ = sinθ_clamped · e_φ. */
  b: [number, number, number];
  /** l_k (θ̇ ȧ + φ̇ ḃ) — the J̇ q̇ contribution of this link. */
  v: [number, number, number];
  sin: number;
  cos: number;
}

function dot(p: readonly [number, number, number], q: readonly [number, number, number]): number {
  return p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
}

function linkFrames(state: ArrayLike<number>, params: SphericalChainParams, n: number): LinkFrame[] {
  const frames: LinkFrame[] = [];
  for (let k = 0; k < n; k += 1) {
    const theta = Number(state[2 * k] ?? 0);
    const phi = Number(state[2 * k + 1] ?? 0);
    const thetaDot = Number(state[2 * n + 2 * k] ?? 0);
    const phiDot = Number(state[2 * n + 2 * k + 1] ?? 0);
    const l = params.lengths[k] ?? 0;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    // Regularise the chart singularity at the poles (see header comment).
    const safeSin = Math.abs(sin) < POLE_EPS ? (sin >= 0 ? POLE_EPS : -POLE_EPS) : sin;
    const u: [number, number, number] = [sin * cp, -cos, sin * sp];
    const a: [number, number, number] = [cos * cp, sin, cos * sp];
    const ephi: [number, number, number] = [-sp, 0, cp];
    const rho: [number, number, number] = [cp, 0, sp];
    const b: [number, number, number] = [safeSin * ephi[0], 0, safeSin * ephi[2]];
    // ȧ = −θ̇u + φ̇cosθ e_φ ; ḃ = θ̇cosθ e_φ − φ̇sinθ ρ
    const aDot: [number, number, number] = [
      -thetaDot * u[0] + phiDot * cos * ephi[0],
      -thetaDot * u[1],
      -thetaDot * u[2] + phiDot * cos * ephi[2]
    ];
    const bDot: [number, number, number] = [
      thetaDot * cos * ephi[0] - phiDot * sin * rho[0],
      0,
      thetaDot * cos * ephi[2] - phiDot * sin * rho[2]
    ];
    const v: [number, number, number] = [
      l * (thetaDot * aDot[0] + phiDot * bDot[0]),
      l * (thetaDot * aDot[1] + phiDot * bDot[1]),
      l * (thetaDot * aDot[2] + phiDot * bDot[2])
    ];
    frames.push({ u, a, b, v, sin, cos });
  }
  return frames;
}

/**
 * Equations of motion for the spherical N-chain. `state` and `out` have
 * length 4N (see header for the layout). Near-pole configurations are chart-
 * regularised; a numerically singular mass matrix yields zero accelerations.
 */
export function rhsSphericalChain(
  state: ArrayLike<number>,
  params: SphericalChainParams,
  out: Float64Array,
  workspace = createSphericalChainWorkspace(sphericalChainLength(params))
): Float64Array {
  const n = sphericalChainLength(params);
  const dof = 2 * n;
  if (workspace.n !== n || workspace.dof !== dof) throw new Error(`rhsSphericalChain: workspace length ${workspace.n} does not match chain length ${n}`);
  const { suffix: s, matrix, force } = workspace;
  fillSuffixMass(params.masses, n, s);
  matrix.fill(0);
  force.fill(0);
  const frames = linkFrames(state, params, n);

  for (let j = 0; j < n; j += 1) {
    const fj = frames[j]!;
    const lj = params.lengths[j] ?? 0;
    // d/dt of the coordinates.
    out[2 * j] = Number(state[dof + 2 * j] ?? 0);
    out[2 * j + 1] = Number(state[dof + 2 * j + 1] ?? 0);

    // Row vectors of J for link j's two coordinates, scaled by l_j.
    const rows: Array<readonly [number, number, number]> = [fj.a, fj.b];
    for (let alpha = 0; alpha < 2; alpha += 1) {
      const row = rows[alpha]!;
      const r = 2 * j + alpha;
      let coriolis = 0;
      for (let k = 0; k < n; k += 1) {
        const fk = frames[k]!;
        const lk = params.lengths[k] ?? 0;
        const sjk = s[Math.max(j, k)] ?? 0;
        const cols: Array<readonly [number, number, number]> = [fk.a, fk.b];
        for (let beta = 0; beta < 2; beta += 1) {
          matrix[r * dof + (2 * k + beta)] = sjk * lj * lk * dot(row, cols[beta]!);
        }
        coriolis += sjk * lj * dot(row, fk.v);
      }
      // Gravity acts only on the θ coordinate of each link.
      const gravity = alpha === 0 ? -params.g * lj * fj.sin * (s[j] ?? 0) : 0;
      force[r] = gravity - coriolis;
    }
  }

  const solve = solveLinearInPlace(matrix, force, dof);
  assertLinearSolve(solve, 'rhsSphericalChain mass matrix');
  for (let i = 0; i < dof; i += 1) {
    const qDot = Number(state[dof + i] ?? 0);
    out[dof + i] = (force[i] ?? 0) - params.damping * qDot;
  }
  return out;
}

/** Cartesian bob positions (y up, pivot at the origin). */
export function sphericalChainPositions(state: ArrayLike<number>, params: SphericalChainParams): Array<{ x: number; y: number; z: number }> {
  const n = sphericalChainLength(params);
  const positions: Array<{ x: number; y: number; z: number }> = [];
  let x = 0;
  let y = 0;
  let z = 0;
  for (let k = 0; k < n; k += 1) {
    const theta = Number(state[2 * k] ?? 0);
    const phi = Number(state[2 * k + 1] ?? 0);
    const l = params.lengths[k] ?? 0;
    const sin = Math.sin(theta);
    x += l * sin * Math.cos(phi);
    z += l * sin * Math.sin(phi);
    y -= l * Math.cos(theta);
    positions.push({ x, y, z });
  }
  return positions;
}

/**
 * Cartesian bob velocities, ṙ_i = Σ_{k≤i} l_k (θ̇_k a_k + φ̇_k sinθ_k e_φk).
 * Uses the un-clamped sinθ (the clamp only protects the mass-matrix solve).
 */
export function sphericalChainVelocities(state: ArrayLike<number>, params: SphericalChainParams): Array<{ x: number; y: number; z: number }> {
  const n = sphericalChainLength(params);
  const velocities: Array<{ x: number; y: number; z: number }> = [];
  let vx = 0;
  let vy = 0;
  let vz = 0;
  for (let k = 0; k < n; k += 1) {
    const theta = Number(state[2 * k] ?? 0);
    const phi = Number(state[2 * k + 1] ?? 0);
    const thetaDot = Number(state[2 * n + 2 * k] ?? 0);
    const phiDot = Number(state[2 * n + 2 * k + 1] ?? 0);
    const l = params.lengths[k] ?? 0;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    vx += l * (thetaDot * cos * cp - phiDot * sin * sp);
    vy += l * thetaDot * sin;
    vz += l * (thetaDot * cos * sp + phiDot * sin * cp);
    velocities.push({ x: vx, y: vy, z: vz });
  }
  return velocities;
}

export function sphericalChainEnergy(state: ArrayLike<number>, params: SphericalChainParams): EnergyBreakdown {
  const n = sphericalChainLength(params);
  let KE = 0;
  let PE = 0;
  let vx = 0;
  let vy = 0;
  let vz = 0;
  let y = 0;
  for (let k = 0; k < n; k += 1) {
    const theta = Number(state[2 * k] ?? 0);
    const phi = Number(state[2 * k + 1] ?? 0);
    const thetaDot = Number(state[2 * n + 2 * k] ?? 0);
    const phiDot = Number(state[2 * n + 2 * k + 1] ?? 0);
    const l = params.lengths[k] ?? 0;
    const m = params.masses[k] ?? 0;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    // ṙ accumulates l_k (θ̇·a_k + φ̇·sinθ·e_φk) along the chain.
    vx += l * (thetaDot * cos * cp - phiDot * sin * sp);
    vy += l * thetaDot * sin;
    vz += l * (thetaDot * cos * sp + phiDot * sin * cp);
    y -= l * cos;
    KE += 0.5 * m * (vx * vx + vy * vy + vz * vz);
    PE += m * params.g * y;
  }
  return { total: KE + PE, KE, PE };
}

/** Total angular momentum about the vertical axis: Σ m_i (z_i ẋ_i − x_i ż_i)… conserved when γ = 0. */
export function sphericalChainLz(state: ArrayLike<number>, params: SphericalChainParams): number {
  const n = sphericalChainLength(params);
  let lz = 0;
  let x = 0;
  let z = 0;
  let vx = 0;
  let vz = 0;
  for (let k = 0; k < n; k += 1) {
    const theta = Number(state[2 * k] ?? 0);
    const phi = Number(state[2 * k + 1] ?? 0);
    const thetaDot = Number(state[2 * n + 2 * k] ?? 0);
    const phiDot = Number(state[2 * n + 2 * k + 1] ?? 0);
    const l = params.lengths[k] ?? 0;
    const m = params.masses[k] ?? 0;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    x += l * sin * cp;
    z += l * sin * sp;
    vx += l * (thetaDot * cos * cp - phiDot * sin * sp);
    vz += l * (thetaDot * cos * sp + phiDot * sin * cp);
    // (r × v)·ŷ = z·ẋ − x·ż  in right-handed (x, y, z) with y up.
    lz += m * (z * vx - x * vz);
  }
  return lz;
}

export interface SphericalChainDiagnostics {
  time: number;
  energy: number;
  energyDrift: number;
  lz: number;
  lzDrift: number;
  method: IntegratorId;
  dt: number;
  caveat: string;
}

export interface SphericalChainOptions {
  dt?: number;
  method?: IntegratorId;
  tolerance?: number;
}

/** Fixed-step integrator over the spherical chain, mirroring `SphericalPendulum`. */
export class SphericalChain {
  private state: Float64Array;
  private time = 0;
  private readonly initialEnergy: number;
  private readonly initialLz: number;
  private readonly scratch: Float64Array[];
  private readonly rhsWorkspace: SphericalChainWorkspace;
  private readonly method: IntegratorId;
  private readonly dt: number;
  private readonly tolerance: number;

  constructor(readonly params: SphericalChainParams, initial: ArrayLike<number>, options: number | SphericalChainOptions = 0.001) {
    const dof = 4 * sphericalChainLength(params);
    this.state = Float64Array.from({ length: dof }, (_, i) => Number(initial[i] ?? 0));
    const parsed = typeof options === 'number' ? { dt: options } : options;
    this.dt = parsed.dt ?? 0.001;
    this.method = parsed.method ?? 'rk4';
    this.tolerance = parsed.tolerance ?? 1e-10;
    this.initialEnergy = sphericalChainEnergy(this.state, params).total;
    this.initialLz = sphericalChainLz(this.state, params);
    this.scratch = [0, 1, 2, 3, 4].map(() => new Float64Array(dof));
    this.rhsWorkspace = createSphericalChainWorkspace(sphericalChainLength(params));
  }

  current(): Float64Array {
    return this.state.slice();
  }

  positions(): Array<{ x: number; y: number; z: number }> {
    return sphericalChainPositions(this.state, this.params);
  }

  step(elapsed: number): void {
    let remaining = elapsed;
    while (remaining > 1e-12) {
      const h = Math.min(this.dt, remaining);
      remaining -= h;
      if (this.method === 'rk4') this.rk4(h);
      else this.genericStep(h);
      this.time += h;
    }
  }

  private rk4(h: number): void {
    const dof = this.state.length;
    const [k1, k2, k3, k4, tmp] = this.scratch as [Float64Array, Float64Array, Float64Array, Float64Array, Float64Array];
    rhsSphericalChain(this.state, this.params, k1, this.rhsWorkspace);
    for (let i = 0; i < dof; i += 1) tmp[i] = (this.state[i] ?? 0) + (h / 2) * (k1[i] ?? 0);
    rhsSphericalChain(tmp, this.params, k2, this.rhsWorkspace);
    for (let i = 0; i < dof; i += 1) tmp[i] = (this.state[i] ?? 0) + (h / 2) * (k2[i] ?? 0);
    rhsSphericalChain(tmp, this.params, k3, this.rhsWorkspace);
    for (let i = 0; i < dof; i += 1) tmp[i] = (this.state[i] ?? 0) + h * (k3[i] ?? 0);
    rhsSphericalChain(tmp, this.params, k4, this.rhsWorkspace);
    for (let i = 0; i < dof; i += 1) {
      this.state[i] = (this.state[i] ?? 0) + (h / 6) * ((k1[i] ?? 0) + 2 * (k2[i] ?? 0) + 2 * (k3[i] ?? 0) + (k4[i] ?? 0));
    }
  }

  private genericStep(h: number): void {
    const [, , , , out] = this.scratch as [Float64Array, Float64Array, Float64Array, Float64Array, Float64Array];
    const rhs = (state: Float64Array, deriv: Float64Array): void => {
      rhsSphericalChain(state, this.params, deriv, this.rhsWorkspace);
    };
    integrateStep(this.method, this.state, h, rhs, out, { tolerance: this.tolerance });
    this.state.set(out);
  }

  diagnostics(): SphericalChainDiagnostics {
    const energy = sphericalChainEnergy(this.state, this.params).total;
    const lz = sphericalChainLz(this.state, this.params);
    return {
      time: this.time,
      energy,
      energyDrift: Math.abs((energy - this.initialEnergy) / (Math.abs(this.initialEnergy) || 1)),
      lz,
      lzDrift: Math.abs(lz - this.initialLz) / Math.max(Math.abs(this.initialLz), 1e-12),
      method: this.method,
      dt: this.dt,
      caveat: this.params.damping > 0
        ? 'Damping active: E and Lz decay physically; drift is not an integrator error metric.'
        : 'Conservative run: E and Lz drift measure integrator error. Chart regularised near the poles (|sinθ| < 1e-6).'
    };
  }
}
