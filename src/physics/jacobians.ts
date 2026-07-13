/**
 * Exact analytic Jacobians for the mass-matrix systems (planar N-chain and
 * spherical N-chain), assembled by forward-mode automatic differentiation.
 *
 * Both systems have the form  M(q)·q̈ = f(q, q̇)  followed by an explicit
 * first-order RHS [q̇, q̈]. Differentiating the solve analytically,
 *
 *   ∂q̈/∂x = M⁻¹ ( ∂f/∂x − (∂M/∂x)·q̈ ),
 *
 * so the Jacobian needs (a) exact entry-wise derivatives of M and f — produced
 * here by re-expressing the assembly in dual arithmetic (`autodiff.ts`), which
 * applies every product/chain rule mechanically — and (b) one Cholesky
 * factorisation of M reused across all right-hand-side columns. The result is
 * the machine-precision tangent of the *implemented* RHS (including the
 * pole-chart clamp of the spherical chain), which removes the ~1e-7…1e-11
 * finite-difference floor from the Lyapunov/variational pipeline and gives
 * Newton-type implicit integrators quadratic convergence.
 *
 * Tests pin these Jacobians against `jacobianDouble` (closed form, N = 2) and
 * central differences over random states for both systems.
 */
import type { ChainParameters } from './nPendulum';
import type { SphericalChainParams } from './sphericalChain';
import type { DrivenParameters } from './driven';
import type { StateVector } from './types';
import { chainLength } from './nPendulum';
import { sphericalChainLength } from './sphericalChain';
import { assertLinearSolve, choleskyFactor, choleskySolveFactored, solveLinearInPlace } from './linearSolve';
import { SPHERICAL_CHAIN_POLE_EPS } from './constants';
import {
  DualArena,
  dAdd,
  dAddScaled,
  dClampAbsMin,
  dConst,
  dCos,
  dDot3,
  dMul,
  dNeg,
  dScale,
  dSin,
  dSub,
  dVar,
  type DualScalar
} from './autodiff';

/**
 * Factor M once (Cholesky, with a pivoted-GE fallback for numerically
 * non-SPD configurations) and return a solver for repeated right-hand sides.
 */
function makeRepeatedSolver(
  matrix: Float64Array,
  n: number,
  factor: Float64Array,
  geScratch: Float64Array,
  context: string
): (b: Float64Array) => void {
  const factored = choleskyFactor(matrix, n, factor);
  if (factored.ok) {
    return (b) => choleskySolveFactored(factor, b, n);
  }
  return (b) => {
    geScratch.set(matrix.subarray(0, n * n));
    const result = solveLinearInPlace(geScratch, b, n);
    assertLinearSolve(result, context);
  };
}

// ---------------------------------------------------------------------------
// Planar N-chain
// ---------------------------------------------------------------------------

export interface ChainJacobianWorkspace {
  n: number;
  arena: DualArena;
  theta: DualScalar[];
  omega: DualScalar[];
  mDual: DualScalar[];
  fDual: DualScalar[];
  t1: DualScalar;
  t2: DualScalar;
  t3: DualScalar;
  suffix: Float64Array;
  matrix: Float64Array;
  factor: Float64Array;
  geScratch: Float64Array;
  accel: Float64Array;
  column: Float64Array;
}

export function createChainJacobianWorkspace(n: number): ChainJacobianWorkspace {
  const nv = 2 * n;
  const arena = new DualArena(nv, 2 * n + n * n + n + 3);
  return {
    n,
    arena,
    theta: Array.from({ length: n }, () => arena.alloc()),
    omega: Array.from({ length: n }, () => arena.alloc()),
    mDual: Array.from({ length: n * n }, () => arena.alloc()),
    fDual: Array.from({ length: n }, () => arena.alloc()),
    t1: arena.alloc(),
    t2: arena.alloc(),
    t3: arena.alloc(),
    suffix: new Float64Array(n),
    matrix: new Float64Array(n * n),
    factor: new Float64Array(n * n),
    geScratch: new Float64Array(n * n),
    accel: new Float64Array(n),
    column: new Float64Array(n)
  };
}

/**
 * Exact Jacobian J[i][j] = ∂(rhsChain_i)/∂(state_j) of the planar N-chain,
 * written row-major into `jac` (length (2n)²). Mirrors the `rhsChain`
 * assembly in dual arithmetic; damping enters at force level, matching the
 * chain convention.
 */
export function jacobianChain(
  state: ArrayLike<number>,
  parameters: ChainParameters,
  gamma: number,
  jac: Float64Array,
  workspace: ChainJacobianWorkspace = createChainJacobianWorkspace(chainLength(parameters))
): Float64Array {
  const n = chainLength(parameters);
  if (workspace.n !== n) throw new Error(`jacobianChain: workspace length ${workspace.n} does not match chain length ${n}`);
  const { masses, lengths, g } = parameters;
  const nv = 2 * n;
  const { theta, omega, mDual, fDual, t1, t2, t3, suffix } = workspace;

  let acc = 0;
  for (let j = n - 1; j >= 0; j -= 1) {
    acc += masses[j] ?? 0;
    suffix[j] = acc;
  }

  for (let j = 0; j < n; j += 1) {
    dVar(theta[j]!, Number(state[j] ?? 0), j);
    dVar(omega[j]!, Number(state[n + j] ?? 0), n + j);
  }

  // Assembly, mirroring rhsChain:
  //   M_jk = S_max(j,k) l_j l_k cos(θ_j − θ_k)
  //   f_j  = −Σ_k S l_j l_k sin(θ_j − θ_k) ω_k² − g l_j sinθ_j S_j − γ ω_j
  for (let j = 0; j < n; j += 1) {
    const lj = lengths[j] ?? 0;
    const fj = fDual[j]!;
    dConst(fj, 0);
    for (let k = 0; k < n; k += 1) {
      const lk = lengths[k] ?? 0;
      const sjk = suffix[Math.max(j, k)] ?? 0;
      dSub(t1, theta[j]!, theta[k]!); // δ = θ_j − θ_k
      dCos(t2, t1);
      dScale(mDual[j * n + k]!, t2, sjk * lj * lk);
      dSin(t2, t1);
      dMul(t3, omega[k]!, omega[k]!); // ω_k²
      dMul(t3, t2, t3); // sinδ·ω_k²
      dAddScaled(fj, t3, -sjk * lj * lk);
    }
    dSin(t1, theta[j]!);
    dAddScaled(fj, t1, -g * lj * (suffix[j] ?? 0));
    dAddScaled(fj, omega[j]!, -gamma);
  }

  // Primal solve M α = f, factoring once for all columns.
  const { matrix, factor, geScratch, accel, column } = workspace;
  for (let i = 0; i < n * n; i += 1) matrix[i] = mDual[i]![0] ?? 0;
  const solve = makeRepeatedSolver(matrix, n, factor, geScratch, 'jacobianChain mass matrix');
  for (let i = 0; i < n; i += 1) accel[i] = fDual[i]![0] ?? 0;
  solve(accel);

  jac.fill(0);
  // Rows 0..n−1: d(θ_j)/dt = ω_j.
  for (let j = 0; j < n; j += 1) jac[j * nv + (n + j)] = 1;
  // Rows n..2n−1, column q: ∂α/∂x_q = M⁻¹(∂f/∂x_q − (∂M/∂x_q)·α).
  for (let q = 0; q < nv; q += 1) {
    for (let i = 0; i < n; i += 1) {
      let value = fDual[i]![q + 1] ?? 0;
      for (let c = 0; c < n; c += 1) value -= (mDual[i * n + c]![q + 1] ?? 0) * (accel[c] ?? 0);
      column[i] = value;
    }
    solve(column);
    for (let i = 0; i < n; i += 1) jac[(n + i) * nv + q] = column[i] ?? 0;
  }
  return jac;
}

// ---------------------------------------------------------------------------
// Spherical N-chain
// ---------------------------------------------------------------------------

interface SphericalLinkDuals {
  sin: DualScalar;
  cos: DualScalar;
  sp: DualScalar;
  cp: DualScalar;
  safeSin: DualScalar;
  u: DualScalar[];
  a: DualScalar[];
  b: DualScalar[];
  v: DualScalar[];
}

export interface SphericalChainJacobianWorkspace {
  n: number;
  arena: DualArena;
  thetaDot: DualScalar[];
  phiDot: DualScalar[];
  links: SphericalLinkDuals[];
  mDual: DualScalar[];
  fDual: DualScalar[];
  t1: DualScalar;
  t2: DualScalar;
  t3: DualScalar;
  suffix: Float64Array;
  matrix: Float64Array;
  factor: Float64Array;
  geScratch: Float64Array;
  accel: Float64Array;
  column: Float64Array;
}

export function createSphericalChainJacobianWorkspace(n: number): SphericalChainJacobianWorkspace {
  const dof = 2 * n;
  const nv = 4 * n;
  // Per link: 5 trig/clamp + 4 vectors of 3 (u, a, b, v) = 17 slots.
  const arena = new DualArena(nv, 2 * n + 17 * n + dof * dof + dof + 3);
  const vec3 = (): DualScalar[] => [arena.alloc(), arena.alloc(), arena.alloc()];
  return {
    n,
    arena,
    thetaDot: Array.from({ length: n }, () => arena.alloc()),
    phiDot: Array.from({ length: n }, () => arena.alloc()),
    links: Array.from({ length: n }, () => ({
      sin: arena.alloc(),
      cos: arena.alloc(),
      sp: arena.alloc(),
      cp: arena.alloc(),
      safeSin: arena.alloc(),
      u: vec3(),
      a: vec3(),
      b: vec3(),
      v: vec3()
    })),
    mDual: Array.from({ length: dof * dof }, () => arena.alloc()),
    fDual: Array.from({ length: dof }, () => arena.alloc()),
    t1: arena.alloc(),
    t2: arena.alloc(),
    t3: arena.alloc(),
    suffix: new Float64Array(n),
    matrix: new Float64Array(dof * dof),
    factor: new Float64Array(dof * dof),
    geScratch: new Float64Array(dof * dof),
    accel: new Float64Array(dof),
    column: new Float64Array(dof)
  };
}

/**
 * Exact Jacobian J[i][j] = ∂(rhsSphericalChain_i)/∂(state_j), row-major into
 * `jac` (length (4n)²). Dual-arithmetic mirror of `fillLinkFrames` and the
 * `rhsSphericalChain` assembly — including the pole-chart clamp, so this is
 * the derivative of the regularised dynamics actually integrated. Damping is
 * rate-level (applied after the solve), matching the spherical convention.
 */
export function jacobianSphericalChain(
  state: ArrayLike<number>,
  params: SphericalChainParams,
  jac: Float64Array,
  workspace: SphericalChainJacobianWorkspace = createSphericalChainJacobianWorkspace(sphericalChainLength(params))
): Float64Array {
  const n = sphericalChainLength(params);
  if (workspace.n !== n) throw new Error(`jacobianSphericalChain: workspace length ${workspace.n} does not match chain length ${n}`);
  const dof = 2 * n;
  const nv = 4 * n;
  const { thetaDot, phiDot, links, mDual, fDual, t1, t2, t3, suffix } = workspace;

  let acc = 0;
  for (let j = n - 1; j >= 0; j -= 1) {
    acc += params.masses[j] ?? 0;
    suffix[j] = acc;
  }

  // Per-link dual frames, mirroring fillLinkFrames operation by operation.
  for (let k = 0; k < n; k += 1) {
    const L = links[k]!;
    const l = params.lengths[k] ?? 0;
    dVar(t1, Number(state[2 * k] ?? 0), 2 * k); // θ_k
    dSin(L.sin, t1);
    dCos(L.cos, t1);
    dVar(t1, Number(state[2 * k + 1] ?? 0), 2 * k + 1); // φ_k
    dSin(L.sp, t1);
    dCos(L.cp, t1);
    dVar(thetaDot[k]!, Number(state[dof + 2 * k] ?? 0), dof + 2 * k);
    dVar(phiDot[k]!, Number(state[dof + 2 * k + 1] ?? 0), dof + 2 * k + 1);
    dClampAbsMin(L.safeSin, L.sin, SPHERICAL_CHAIN_POLE_EPS);

    // u = (sinθcosφ, −cosθ, sinθsinφ)
    dMul(L.u[0]!, L.sin, L.cp);
    dNeg(L.u[1]!, L.cos);
    dMul(L.u[2]!, L.sin, L.sp);
    // a = ∂u/∂θ = (cosθcosφ, sinθ, cosθsinφ)
    dMul(L.a[0]!, L.cos, L.cp);
    L.a[1]!.set(L.sin);
    dMul(L.a[2]!, L.cos, L.sp);
    // b = safeSinθ·e_φ with e_φ = (−sinφ, 0, cosφ)
    dMul(L.b[0]!, L.safeSin, L.sp);
    dNeg(L.b[0]!, L.b[0]!);
    dConst(L.b[1]!, 0);
    dMul(L.b[2]!, L.safeSin, L.cp);

    // ȧ = −θ̇u + φ̇cosθe_φ ; ḃ = θ̇cosθe_φ − φ̇sinθρ ; v = l(θ̇ȧ + φ̇ḃ)
    // (assembled directly into v, mirroring fillLinkFrames):
    //   vx = l(θ̇·aDotX + φ̇·bDotX), aDotX = −θ̇ux − φ̇cosθ·sinφ, bDotX = −θ̇cosθ·sinφ − φ̇sinθ·cosφ
    const td = thetaDot[k]!;
    const pd = phiDot[k]!;
    // aDotX = −θ̇·ux + φ̇·cos·(−sp)
    dMul(t1, td, L.u[0]!);
    dNeg(t1, t1);
    dMul(t2, pd, L.cos);
    dMul(t2, t2, L.sp);
    dSub(t1, t1, t2); // aDotX
    dMul(t1, td, t1); // θ̇·aDotX
    // bDotX = θ̇·cos·(−sp) − φ̇·sin·cp
    dMul(t2, td, L.cos);
    dMul(t2, t2, L.sp);
    dNeg(t2, t2);
    dMul(t3, pd, L.sin);
    dMul(t3, t3, L.cp);
    dSub(t2, t2, t3); // bDotX
    dMul(t2, pd, t2); // φ̇·bDotX
    dAdd(L.v[0]!, t1, t2);
    dScale(L.v[0]!, L.v[0]!, l);
    // aDotY = −θ̇·uy ; vy = l·θ̇·aDotY
    dMul(t1, td, L.u[1]!);
    dNeg(t1, t1);
    dMul(t1, td, t1);
    dScale(L.v[1]!, t1, l);
    // aDotZ = −θ̇·uz + φ̇·cos·cp ; bDotZ = θ̇·cos·cp − φ̇·sin·sp
    dMul(t1, td, L.u[2]!);
    dNeg(t1, t1);
    dMul(t2, pd, L.cos);
    dMul(t2, t2, L.cp);
    dAdd(t1, t1, t2); // aDotZ
    dMul(t1, td, t1);
    dMul(t2, td, L.cos);
    dMul(t2, t2, L.cp);
    dMul(t3, pd, L.sin);
    dMul(t3, t3, L.sp);
    dSub(t2, t2, t3); // bDotZ
    dMul(t2, pd, t2);
    dAdd(L.v[2]!, t1, t2);
    dScale(L.v[2]!, L.v[2]!, l);
  }

  // Mass matrix and force assembly, mirroring rhsSphericalChain.
  for (let j = 0; j < n; j += 1) {
    const lj = params.lengths[j] ?? 0;
    for (let alpha = 0; alpha < 2; alpha += 1) {
      const row = alpha === 0 ? links[j]!.a : links[j]!.b;
      const r = 2 * j + alpha;
      const fr = fDual[r]!;
      dConst(fr, 0);
      for (let k = 0; k < n; k += 1) {
        const lk = params.lengths[k] ?? 0;
        const sjk = suffix[Math.max(j, k)] ?? 0;
        for (let beta = 0; beta < 2; beta += 1) {
          const col = beta === 0 ? links[k]!.a : links[k]!.b;
          dDot3(t1, row, col, t2);
          dScale(mDual[r * dof + (2 * k + beta)]!, t1, sjk * lj * lk);
        }
        dDot3(t1, row, links[k]!.v, t2);
        dAddScaled(fr, t1, -sjk * lj);
      }
      if (alpha === 0) dAddScaled(fr, links[j]!.sin, -params.g * lj * (suffix[j] ?? 0));
    }
  }

  // Primal solve M α = f, factoring once for all columns.
  const { matrix, factor, geScratch, accel, column } = workspace;
  for (let i = 0; i < dof * dof; i += 1) matrix[i] = mDual[i]![0] ?? 0;
  const solve = makeRepeatedSolver(matrix, dof, factor, geScratch, 'jacobianSphericalChain mass matrix');
  for (let i = 0; i < dof; i += 1) accel[i] = fDual[i]![0] ?? 0;
  solve(accel);

  jac.fill(0);
  // Rows 0..dof−1: d(q_r)/dt = q̇_r.
  for (let r = 0; r < dof; r += 1) jac[r * nv + (dof + r)] = 1;
  // Rows dof..2dof−1: ∂(α_i − γ q̇_i)/∂x_q.
  for (let q = 0; q < nv; q += 1) {
    for (let i = 0; i < dof; i += 1) {
      let value = fDual[i]![q + 1] ?? 0;
      for (let c = 0; c < dof; c += 1) value -= (mDual[i * dof + c]![q + 1] ?? 0) * (accel[c] ?? 0);
      column[i] = value;
    }
    solve(column);
    for (let i = 0; i < dof; i += 1) jac[(dof + i) * nv + q] = column[i] ?? 0;
  }
  for (let i = 0; i < dof; i += 1) {
    jac[(dof + i) * nv + (dof + i)] = (jac[(dof + i) * nv + (dof + i)] ?? 0) - params.damping;
  }
  return jac;
}

// ---------------------------------------------------------------------------
// Driven pendulum (closed form)
// ---------------------------------------------------------------------------

/**
 * Exact Jacobian of `rhsDriven` (state [θ, ω, φ]), row-major into `jac`
 * (length 9): the drive phase makes the system autonomous, so the only
 * non-trivial row is ω̇ = −(g/l)sinθ − γω + A·cosφ.
 */
export function jacobianDriven(state: ArrayLike<number>, parameters: DrivenParameters, jac: Float64Array): Float64Array {
  const theta = Number(state[0] ?? 0);
  const phi = Number(state[2] ?? 0);
  const { g, length, damping, driveAmplitude } = parameters;
  jac.fill(0);
  jac[1] = 1; // ∂θ̇/∂ω
  jac[3] = -(g / length) * Math.cos(theta);
  jac[4] = -damping;
  jac[5] = -driveAmplitude * Math.sin(phi);
  return jac;
}

/** Adapter signature shared with the chaos pipeline. */
export type JacobianFn = (state: StateVector, jac: Float64Array) => void;
