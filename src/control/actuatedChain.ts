import type { StateVector } from '../physics/types';
import {
  chainLength,
  chainMassMatrix,
  createChainWorkspace,
  type ChainParameters,
  type ChainWorkspace
} from '../physics/nPendulum';
import { assertLinearSolve, choleskyFactor, choleskySolveFactored, solveCholeskyInPlace, solveLinearInPlace } from '../physics/linearSolve';
import { createChainJacobianWorkspace, jacobianChain, type ChainJacobianWorkspace } from '../physics/jacobians';

/**
 * Actuated planar N-chain — the control-input extension of `rhsChain`,
 * generalising `rhsDoubleActuated` to N links. Joint torques τ_j act between
 * link j−1 and link j (τ_0 at the pivot); with absolute angles, virtual work
 * gives the generalised forces
 *
 *   Q_j = τ_j − τ_{j+1}   (τ_N = 0)
 *
 * i.e. Q = S·τ with S = I − superdiagonal. The τ = 0 case is pinned bitwise
 * against `rhsChain` in the tests, mirroring the double-pendulum contract.
 */

/** Upright (fully inverted) chain state: all angles π, all rates zero. */
export function uprightChainState(n: number): Float64Array {
  const state = new Float64Array(2 * n);
  for (let j = 0; j < n; j += 1) state[j] = Math.PI;
  return state;
}

/** Total energy of the fully inverted chain under the `energyChain` convention. */
export function uprightEnergyChain(parameters: ChainParameters): number {
  const n = chainLength(parameters);
  let y = 0;
  let pe = 0;
  for (let i = 0; i < n; i += 1) {
    y += parameters.lengths[i] ?? 0;
    pe += parameters.g * (parameters.masses[i] ?? 0) * y;
  }
  return pe;
}

export function rhsChainActuated(
  state: ArrayLike<number>,
  parameters: ChainParameters,
  gamma: number,
  tau: ArrayLike<number>,
  out: StateVector,
  workspace: ChainWorkspace = createChainWorkspace(chainLength(parameters))
): StateVector {
  const n = chainLength(parameters);
  const { masses, lengths, g } = parameters;
  if (workspace.n !== n) throw new Error(`rhsChainActuated: workspace length ${workspace.n} does not match chain length ${n}`);
  const { suffix: s, matrix, rhs } = workspace;
  let acc = 0;
  for (let j = n - 1; j >= 0; j -= 1) {
    acc += masses[j] ?? 0;
    s[j] = acc;
  }
  matrix.fill(0);
  rhs.fill(0);

  for (let j = 0; j < n; j += 1) {
    const tj = Number(state[j] ?? 0);
    const wj = Number(state[n + j] ?? 0);
    const lj = lengths[j] ?? 0;
    out[j] = wj;
    let coupling = 0;
    for (let k = 0; k < n; k += 1) {
      const tk = Number(state[k] ?? 0);
      const wk = Number(state[n + k] ?? 0);
      const lk = lengths[k] ?? 0;
      const sjk = s[Math.max(j, k)] ?? 0;
      const delta = tj - tk;
      matrix[j * n + k] = sjk * lj * lk * Math.cos(delta);
      coupling += sjk * lj * lk * Math.sin(delta) * wk * wk;
    }
    // rhsChain force assembly plus the generalised torque Q_j = τ_j − τ_{j+1}.
    rhs[j] = -coupling - g * lj * Math.sin(tj) * (s[j] ?? 0) - gamma * wj + Number(tau[j] ?? 0) - Number(tau[j + 1] ?? 0);
  }

  const cholesky = solveCholeskyInPlace(matrix, rhs, n, workspace.factor);
  if (!cholesky.ok) {
    const solve = solveLinearInPlace(matrix, rhs, n);
    assertLinearSolve(solve, 'rhsChainActuated mass matrix');
  }
  for (let j = 0; j < n; j += 1) out[n + j] = rhs[j] ?? 0;
  return out;
}

/**
 * Exact control Jacobian B(x) = ∂(rhsChainActuated)/∂τ, row-major into `b`
 * (length 2n×n). Torques enter linearly through M(q)⁻¹S with S column c equal
 * to e_c − e_{c−1}, so B is one Cholesky factorisation plus n triangular
 * solves. Verified against central differences in the tests.
 */
export function controlMatrixChain(state: ArrayLike<number>, parameters: ChainParameters, b: Float64Array): Float64Array {
  const n = chainLength(parameters);
  const matrix = chainMassMatrix(state, parameters);
  const factor = new Float64Array(n * n);
  const column = new Float64Array(n);
  const factored = choleskyFactor(matrix, n, factor);
  b.fill(0);
  for (let c = 0; c < n; c += 1) {
    column.fill(0);
    column[c] = 1;
    if (c > 0) column[c - 1] = -1;
    if (factored.ok) {
      choleskySolveFactored(factor, column, n);
    } else {
      const scratch = matrix.slice();
      const solve = solveLinearInPlace(scratch, column, n);
      assertLinearSolve(solve, 'controlMatrixChain mass matrix');
    }
    for (let r = 0; r < n; r += 1) b[(n + r) * n + c] = column[r] ?? 0;
  }
  return b;
}

/**
 * Exact state Jacobian ∂(rhsChainActuated)/∂x at fixed torque: `jacobianChain`
 * with the constant generalised force Q = S·τ threaded through the dual
 * assembly (the −(∂M/∂x)·α term carries its configuration dependence).
 */
export function jacobianChainActuated(
  state: ArrayLike<number>,
  parameters: ChainParameters,
  gamma: number,
  tau: ArrayLike<number>,
  jac: Float64Array,
  workspace: ChainJacobianWorkspace = createChainJacobianWorkspace(chainLength(parameters)),
  forceScratch = new Float64Array(chainLength(parameters))
): Float64Array {
  const n = workspace.n;
  for (let j = 0; j < n; j += 1) forceScratch[j] = Number(tau[j] ?? 0) - Number(tau[j + 1] ?? 0);
  return jacobianChain(state, parameters, gamma, jac, workspace, forceScratch);
}
