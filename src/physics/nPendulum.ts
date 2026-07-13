import type { EnergyBreakdown } from '../types/domain';
import type { StateVector } from './types';
import { assertLinearSolve, solveCholeskyInPlace, solveLinearInPlace, type LinearSolveResult } from './linearSolve';

/**
 * Generalized planar chain ("N-pendulum"). The double and triple pendulums are
 * the N = 2 and N = 3 special cases of these equations; `tests/n-pendulum.test.ts`
 * checks that this RHS reproduces `rhsDouble` and `rhsTriple` to machine epsilon.
 *
 * State layout: [theta_0 .. theta_{N-1}, omega_0 .. omega_{N-1}].
 * Angles are measured from the downward vertical.
 */
export interface ChainParameters {
  /** Bob masses, length N. */
  masses: readonly number[];
  /** Link lengths, length N. */
  lengths: readonly number[];
  g: number;
}

export interface ChainWorkspace {
  n: number;
  suffix: Float64Array;
  matrix: Float64Array;
  rhs: Float64Array;
  /** Cholesky factor scratch (n×n); keeps `matrix` intact for the GE fallback. */
  factor: Float64Array;
}

export function chainLength(parameters: ChainParameters): number {
  validateChainParameters(parameters);
  return parameters.masses.length;
}

export function validateChainParameters(parameters: ChainParameters): void {
  if (parameters.masses.length !== parameters.lengths.length) {
    throw new Error(
      `ChainParameters: masses (${parameters.masses.length}) and lengths (${parameters.lengths.length}) must have the same length`
    );
  }
  if (parameters.masses.length === 0) throw new Error('ChainParameters: at least one link is required');
  for (let i = 0; i < parameters.masses.length; i += 1) {
    const mass = parameters.masses[i] ?? NaN;
    const length = parameters.lengths[i] ?? NaN;
    if (!Number.isFinite(mass) || mass <= 0) throw new Error(`ChainParameters: mass[${i}] must be positive and finite`);
    if (!Number.isFinite(length) || length <= 0)
      throw new Error(`ChainParameters: length[${i}] must be positive and finite`);
  }
  if (!Number.isFinite(parameters.g) || parameters.g <= 0)
    throw new Error('ChainParameters: g must be positive and finite');
}

export function createChainWorkspace(n: number): ChainWorkspace {
  return {
    n,
    suffix: new Float64Array(n),
    matrix: new Float64Array(n * n),
    rhs: new Float64Array(n),
    factor: new Float64Array(n * n)
  };
}

// Suffix mass sums S_j = sum_{i >= j} m_i, precomputed for the coupling terms.
function fillSuffixMass(masses: readonly number[], n: number, s: Float64Array): void {
  let acc = 0;
  for (let j = n - 1; j >= 0; j -= 1) {
    acc += masses[j] ?? 0;
    s[j] = acc;
  }
}

/**
 * Equations of motion for the N-link chain pendulum.
 *
 *   M_jk = S_{max(j,k)} * l_j * l_k * cos(theta_j - theta_k)
 *   f_j  = -sum_k C_jk * omega_k^2 - g * l_j * sin(theta_j) * S_j - gamma * omega_j
 *   C_jk = S_{max(j,k)} * l_j * l_k * sin(theta_j - theta_k)
 *
 * Solving M * alpha = f yields the angular accelerations.
 */
export function rhsChain(
  state: ArrayLike<number>,
  parameters: ChainParameters,
  gamma: number,
  out: StateVector,
  workspace: ChainWorkspace = createChainWorkspace(chainLength(parameters))
): StateVector {
  const n = chainLength(parameters);
  const { masses, lengths, g } = parameters;
  if (workspace.n !== n) throw new Error(`rhsChain: workspace length ${workspace.n} does not match chain length ${n}`);
  const { suffix: s, matrix, rhs } = workspace;
  fillSuffixMass(masses, n, s);
  matrix.fill(0);
  rhs.fill(0);

  for (let j = 0; j < n; j += 1) {
    const tj = Number(state[j] ?? 0);
    const wj = Number(state[n + j] ?? 0);
    const lj = lengths[j] ?? 0;
    out[j] = wj; // d(theta_j)/dt = omega_j
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
    rhs[j] = -coupling - g * lj * Math.sin(tj) * (s[j] ?? 0) - gamma * wj;
  }

  // The mass matrix is SPD by construction, so Cholesky (≈3× cheaper and
  // pivot-free) is the primary solver; a numerically non-SPD configuration
  // falls back to pivoted Gaussian elimination on the untouched matrix.
  const cholesky = solveCholeskyInPlace(matrix, rhs, n, workspace.factor);
  if (!cholesky.ok) {
    const solve = solveLinearInPlace(matrix, rhs, n);
    assertLinearSolve(solve, 'rhsChain mass matrix');
  }
  for (let j = 0; j < n; j += 1) out[n + j] = rhs[j] ?? 0;
  return out;
}

/**
 * The chain's mass (inertia) matrix M(θ) with entries
 * M_jk = S_{max(j,k)} · l_j · l_k · cos(θ_j − θ_k). Exposed for validation:
 * a correct M is symmetric and positive definite for every configuration.
 */
export function chainMassMatrix(
  state: ArrayLike<number>,
  parameters: ChainParameters,
  out: Float64Array = new Float64Array(chainLength(parameters) ** 2)
): Float64Array {
  const n = chainLength(parameters);
  const { lengths } = parameters;
  const s = new Float64Array(n);
  fillSuffixMass(parameters.masses, n, s);
  for (let j = 0; j < n; j += 1) {
    const tj = Number(state[j] ?? 0);
    const lj = lengths[j] ?? 0;
    for (let k = 0; k < n; k += 1) {
      const tk = Number(state[k] ?? 0);
      const lk = lengths[k] ?? 0;
      out[j * n + k] = (s[Math.max(j, k)] ?? 0) * lj * lk * Math.cos(tj - tk);
    }
  }
  return out;
}

export function chainMassMatrixDiagnostics(state: ArrayLike<number>, parameters: ChainParameters): LinearSolveResult {
  const n = chainLength(parameters);
  const matrix = chainMassMatrix(state, parameters);
  const probeRhs = new Float64Array(n);
  probeRhs.fill(1);
  return solveLinearInPlace(matrix, probeRhs, n, { diagnostics: true });
}

export function energyChain(state: ArrayLike<number>, parameters: ChainParameters): EnergyBreakdown {
  const n = chainLength(parameters);
  const { masses, lengths, g } = parameters;
  let vx = 0;
  let vy = 0;
  let y = 0;
  let KE = 0;
  let PE = 0;
  for (let i = 0; i < n; i += 1) {
    const ti = Number(state[i] ?? 0);
    const wi = Number(state[n + i] ?? 0);
    const li = lengths[i] ?? 0;
    const mi = masses[i] ?? 0;
    // Cumulative joint position and velocity along the chain.
    vx += li * Math.cos(ti) * wi;
    vy += li * Math.sin(ti) * wi;
    y -= li * Math.cos(ti);
    KE += 0.5 * mi * (vx * vx + vy * vy);
    PE += g * mi * y;
  }
  return { total: KE + PE, KE, PE };
}
