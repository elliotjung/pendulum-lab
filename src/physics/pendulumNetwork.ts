import type { EnergyBreakdown } from '../types/domain';
import type { StateVector } from './types';

/**
 * Network of planar pendula coupled by linear torsional springs — a discrete
 * lattice of identical (or detuned) oscillators. With uniform nearest-neighbour
 * coupling on a ring it is the harmonic limit of the Frenkel–Kontorova / discrete
 * sine-Gordon chain, whose small-amplitude normal modes are exactly the **phonon
 * dispersion** ω²(q) = ω₀² + (2κ/I)(1 − cos q) of a 1-D monatomic lattice — the
 * same band structure that governs lattice vibrations (and, through them,
 * thermal/electrical transport) in a crystal. That makes this the most direct
 * solid-state-physics extension of the pendulum family.
 *
 * Each node i is a point mass m_i on a rigid rod of length l_i (moment of inertia
 * I_i = m_i l_i²), angle θ_i from the downward vertical. A torsional spring κ_ij
 * couples nodes i and j with the potential ½ κ_ij (θ_i − θ_j)².
 *
 * Lagrangian (γ = 0):
 *   L = Σ_i [½ I_i θ_i'² − m_i g l_i (1 − cos θ_i)] − ½ Σ_{i<j} κ_ij (θ_i − θ_j)²
 * Euler–Lagrange equations of motion (with optional per-node rate damping γ_i):
 *   θ_i'' = −(g/l_i) sin θ_i − (1/I_i) Σ_j κ_ij (θ_i − θ_j) − γ_i θ_i'
 * Energy balance: dE/dt = −Σ_i γ_i I_i ω_i² (≤ 0), so the flow is conservative
 * exactly when every γ_i = 0.
 *
 * State layout: [θ_0 .. θ_{N-1}, ω_0 .. ω_{N-1}] (positions block then velocities
 * block, splittable for symplectic integrators). The coupling is supplied as a
 * dense symmetric N×N matrix κ_ij = κ_ji ≥ 0 (row-major); only the off-diagonal
 * entries matter (the diagonal multiplies θ_i − θ_i = 0). `buildCouplingMatrix`
 * assembles it from an edge list and `ringCouplingMatrix` from a uniform ring.
 */
export interface PendulumNetworkParameters {
  /** Bob masses, length N (> 0). */
  masses: readonly number[];
  /** Rod lengths, length N (> 0). */
  lengths: readonly number[];
  /** Gravity (> 0). */
  g: number;
  /**
   * Symmetric N×N torsional-coupling matrix, row-major, κ_ij ≥ 0. Diagonal
   * ignored. Accepts a plain array or the `Float64Array` returned by
   * {@link buildCouplingMatrix} / {@link ringCouplingMatrix}.
   */
  coupling: ArrayLike<number>;
  /**
   * Optional per-node linear (rate) damping γ_i, length N (≥ 0). Enters as
   * −γ_i ω_i, a non-conservative torque, so a non-zero γ makes the energy
   * decrease — it is not a conservation diagnostic.
   */
  damping?: readonly number[];
}

/** An undirected coupling edge: a torsional spring κ between nodes i and j. */
export interface NetworkEdge {
  i: number;
  j: number;
  /** Torsional spring constant κ_ij (≥ 0). */
  kappa: number;
}

/** Number of nodes N in the network. */
export function networkSize(parameters: PendulumNetworkParameters): number {
  return parameters.masses.length;
}

/** Throw on malformed network parameters (sizes, positivity, coupling symmetry). */
export function validatePendulumNetworkParameters(parameters: PendulumNetworkParameters): void {
  const n = parameters.masses.length;
  if (n === 0) throw new Error('PendulumNetworkParameters: at least one node is required');
  if (parameters.lengths.length !== n) {
    throw new Error(`PendulumNetworkParameters: masses (${n}) and lengths (${parameters.lengths.length}) must have the same length`);
  }
  if (!Number.isFinite(parameters.g) || parameters.g <= 0) {
    throw new Error('PendulumNetworkParameters: g must be positive and finite');
  }
  for (let i = 0; i < n; i += 1) {
    const m = parameters.masses[i] ?? NaN;
    const l = parameters.lengths[i] ?? NaN;
    if (!Number.isFinite(m) || m <= 0) throw new Error(`PendulumNetworkParameters: mass[${i}] must be positive and finite`);
    if (!Number.isFinite(l) || l <= 0) throw new Error(`PendulumNetworkParameters: length[${i}] must be positive and finite`);
  }
  if (parameters.coupling.length !== n * n) {
    throw new Error(`PendulumNetworkParameters: coupling must be an N×N (${n * n}) matrix, got ${parameters.coupling.length}`);
  }
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const kij = parameters.coupling[i * n + j] ?? NaN;
      const kji = parameters.coupling[j * n + i] ?? NaN;
      if (!Number.isFinite(kij) || kij < 0) {
        throw new Error(`PendulumNetworkParameters: coupling[${i},${j}] must be finite and non-negative`);
      }
      if (Math.abs(kij - kji) > 1e-12 * (1 + Math.abs(kij))) {
        throw new Error(`PendulumNetworkParameters: coupling must be symmetric (coupling[${i},${j}] != coupling[${j},${i}])`);
      }
    }
  }
  if (parameters.damping) {
    if (parameters.damping.length !== n) throw new Error(`PendulumNetworkParameters: damping must have length N (${n})`);
    for (let i = 0; i < n; i += 1) {
      const gi = parameters.damping[i] ?? NaN;
      if (!Number.isFinite(gi) || gi < 0) throw new Error(`PendulumNetworkParameters: damping[${i}] must be finite and non-negative`);
    }
  }
}

/**
 * Assemble the symmetric N×N coupling matrix from an undirected edge list.
 * Parallel edges between the same pair accumulate; self-edges are rejected.
 */
export function buildCouplingMatrix(n: number, edges: readonly NetworkEdge[]): Float64Array {
  if (!Number.isInteger(n) || n < 1) throw new Error('buildCouplingMatrix: n must be a positive integer');
  const K = new Float64Array(n * n);
  for (const { i, j, kappa } of edges) {
    if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= n || j >= n) {
      throw new Error(`buildCouplingMatrix: edge (${i}, ${j}) is out of range for n=${n}`);
    }
    if (i === j) throw new Error(`buildCouplingMatrix: self-edge (${i}, ${i}) is not allowed`);
    if (!Number.isFinite(kappa) || kappa < 0) {
      throw new Error(`buildCouplingMatrix: kappa for edge (${i}, ${j}) must be finite and non-negative`);
    }
    K[i * n + j] = (K[i * n + j] ?? 0) + kappa;
    K[j * n + i] = (K[j * n + i] ?? 0) + kappa;
  }
  return K;
}

/**
 * Uniform nearest-neighbour ring of N nodes (each coupled to i±1 mod N with the
 * same κ) — the canonical 1-D monatomic lattice. For N = 2 the two nodes share a
 * single spring (a 2-ring would otherwise double-count the one bond).
 */
export function ringCouplingMatrix(n: number, kappa: number): Float64Array {
  if (!Number.isInteger(n) || n < 2) throw new Error('ringCouplingMatrix: n must be an integer >= 2');
  const edges: NetworkEdge[] = [];
  if (n === 2) {
    edges.push({ i: 0, j: 1, kappa });
  } else {
    for (let i = 0; i < n; i += 1) edges.push({ i, j: (i + 1) % n, kappa });
  }
  return buildCouplingMatrix(n, edges);
}

/**
 * Right-hand side of the coupled-pendulum network. Allocation-free (O(N²) in the
 * dense coupling sum). Writes [θ', ω'] into `out`; angles measured from the
 * downward vertical.
 */
export function rhsPendulumNetwork(state: ArrayLike<number>, parameters: PendulumNetworkParameters, out: StateVector): StateVector {
  const n = parameters.masses.length;
  const { g, coupling } = parameters;
  const damping = parameters.damping;
  for (let i = 0; i < n; i += 1) {
    const theta = Number(state[i] ?? 0);
    const omega = Number(state[n + i] ?? 0);
    out[i] = omega;
    const l = parameters.lengths[i] ?? 1;
    const inertia = (parameters.masses[i] ?? 1) * l * l;
    let couplingTorque = 0; // Σ_j κ_ij (θ_i − θ_j); the j = i term is identically 0.
    for (let j = 0; j < n; j += 1) {
      const kij = coupling[i * n + j] ?? 0;
      if (kij === 0) continue;
      couplingTorque += kij * (theta - Number(state[j] ?? 0));
    }
    const gammaI = damping ? (damping[i] ?? 0) : 0;
    out[n + i] = -(g / l) * Math.sin(theta) - couplingTorque / inertia - gammaI * omega;
  }
  return out;
}

/**
 * Total mechanical energy of the network: kinetic + gravitational + the
 * torsional-spring coupling potential ½ Σ_{i<j} κ_ij (θ_i − θ_j)².
 */
export function pendulumNetworkEnergy(state: ArrayLike<number>, parameters: PendulumNetworkParameters): EnergyBreakdown {
  const n = parameters.masses.length;
  const { g, coupling } = parameters;
  let KE = 0;
  let PE = 0;
  for (let i = 0; i < n; i += 1) {
    const theta = Number(state[i] ?? 0);
    const omega = Number(state[n + i] ?? 0);
    const m = parameters.masses[i] ?? 1;
    const l = parameters.lengths[i] ?? 1;
    KE += 0.5 * m * l * l * omega * omega;
    PE += m * g * l * (1 - Math.cos(theta));
  }
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const kij = coupling[i * n + j] ?? 0;
      if (kij === 0) continue;
      const d = Number(state[i] ?? 0) - Number(state[j] ?? 0);
      PE += 0.5 * kij * d * d;
    }
  }
  return { total: KE + PE, KE, PE };
}

/**
 * Small-angle stiffness matrix K (N×N, row-major) for which the linearised
 * dynamics is θ'' = −K θ. Its eigenvalues are the squared normal-mode (phonon)
 * frequencies ω². For a uniform ring K is symmetric-circulant and its
 * eigenvalues are {@link ringPhononDispersion}.
 *
 *   K_ii = g/l_i + (1/I_i) Σ_{j≠i} κ_ij,   K_ij = −κ_ij / I_i  (i ≠ j)
 */
export function pendulumNetworkStiffnessMatrix(parameters: PendulumNetworkParameters): Float64Array {
  const n = parameters.masses.length;
  const { g, coupling } = parameters;
  const K = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    const l = parameters.lengths[i] ?? 1;
    const inertia = (parameters.masses[i] ?? 1) * l * l;
    let diag = g / l;
    for (let j = 0; j < n; j += 1) {
      if (j === i) continue;
      const kij = coupling[i * n + j] ?? 0;
      if (kij === 0) continue;
      diag += kij / inertia;
      K[i * n + j] = -kij / inertia;
    }
    K[i * n + i] = diag;
  }
  return K;
}

/**
 * Closed-form phonon dispersion of a uniform ring of N identical pendula with
 * nearest-neighbour torsional coupling: ω²(q_k) = ω₀² + 2·c·(1 − cos q_k),
 * q_k = 2πk/N, where ω₀² = g/l is the on-site (pinning/gravity) frequency and
 * c = κ/I is the coupling rate. Returns ω²(q_k) for k = 0 .. N-1, i.e. the
 * acoustic band: a flat (gapped) branch at q = 0 lifting to ω₀² + 4c at the
 * zone boundary q = π.
 */
export function ringPhononDispersion(onsiteOmegaSq: number, couplingRate: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new Error('ringPhononDispersion: n must be a positive integer');
  const out: number[] = [];
  for (let k = 0; k < n; k += 1) {
    const q = (2 * Math.PI * k) / n;
    out.push(onsiteOmegaSq + 2 * couplingRate * (1 - Math.cos(q)));
  }
  return out;
}
