/**
 * Noether-style automatic conserved-quantity detection for the chain systems.
 *
 * For each candidate one-parameter symmetry group the detector runs two
 * independent numerical checks and reports whether they agree:
 *
 * 1. **Symmetry of the Hamiltonian** — the group action g_ε is applied to
 *    probe states and the directional derivative |dH/dε| is measured by a
 *    central difference. Rotations about the vertical axis leave the energy
 *    invariant; rotations about horizontal axes change bob heights, so the
 *    residual is O(m·g·l) unless g ≈ 0.
 * 2. **Conservation along the flow** — the candidate momentum is sampled
 *    along an RK4 trajectory and its relative drift is measured.
 *
 * Noether's theorem says (for the γ = 0 Lagrangian systems here) that the two
 * verdicts must agree: a symmetry ⟺ its momentum is conserved. The report
 * flags any candidate where they disagree (`noetherConsistent: false`), which
 * would indicate a derivation or integration bug rather than physics.
 *
 * Geometry conventions (matching `sphericalChain.ts`): the vertical axis is
 * **y** (gravity acts along −y), u = (sinθcosφ, −cosθ, sinθsinφ). The
 * conventional name “L_z” used elsewhere in this project refers to the
 * angular momentum about this vertical axis.
 */

import type { SphericalChainParams } from './sphericalChain';
import type { ChainParameters } from './nPendulum';
import type { SystemSpec } from './systemSpec';
import {
  createSphericalChainWorkspace,
  rhsSphericalChain,
  sphericalChainEnergy,
  sphericalChainLength,
  sphericalChainPositions,
  sphericalChainVelocities
} from './sphericalChain';
import { chainLength, createChainWorkspace, energyChain, rhsChain } from './nPendulum';
import { rk4Step } from './integrators';

export type Vec3 = readonly [number, number, number];

export interface ConservedQuantityCandidate {
  /** Candidate invariant, e.g. 'energy', 'angular-momentum-vertical'. */
  name: string;
  /** The one-parameter group whose Noether charge this is. */
  generator: string;
  /**
   * Max relative |dH/dε| over the probe states (central difference). ~0 means
   * the Hamiltonian is invariant under the group action.
   */
  symmetryResidual: number;
  symmetric: boolean;
  /** Max relative drift of the candidate along the integrated trajectory. */
  drift: number;
  conserved: boolean;
  /** Noether agreement: symmetric ⟺ conserved (always expected to be true). */
  noetherConsistent: boolean;
  detail: string;
}

export interface ConservedQuantityReport {
  system: string;
  candidates: ConservedQuantityCandidate[];
  /** Names of the candidates judged conserved. */
  conserved: string[];
  horizon: number;
  dt: number;
  method: string;
  caveat: string;
}

export interface ConservedQuantityOptions {
  /** Trajectory horizon for the drift check (s). Default 8. */
  horizon?: number;
  /** RK4 step. Default 0.002 (the validated chain step). */
  dt?: number;
  /** Relative |dH/dε| below this counts as symmetric. Default 1e-6. */
  symmetryTol?: number;
  /** Relative drift below this counts as conserved. Default 1e-4. */
  driftTol?: number;
}

/** Rodrigues rotation of v about the unit axis n by angle α (allocation-light). */
function rotateVec3(v: Vec3, n: Vec3, alpha: number): [number, number, number] {
  const cos = Math.cos(alpha);
  const sin = Math.sin(alpha);
  const dot = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
  const crossX = n[1] * v[2] - n[2] * v[1];
  const crossY = n[2] * v[0] - n[0] * v[2];
  const crossZ = n[0] * v[1] - n[1] * v[0];
  return [
    v[0] * cos + crossX * sin + n[0] * dot * (1 - cos),
    v[1] * cos + crossY * sin + n[1] * dot * (1 - cos),
    v[2] * cos + crossZ * sin + n[2] * dot * (1 - cos)
  ];
}

/**
 * Apply the rotation group action g_α (about unit axis `axis`) to a spherical
 * chain chart state: each link direction u_k and velocity u̇_k is rotated in
 * Cartesian space and converted back to (θ, φ, θ̇, φ̇). Avoid pole states —
 * the chart conversion is ill-conditioned at |sinθ| → 0 (as documented for
 * the chart itself).
 */
export function rotateSphericalChainState(state: ArrayLike<number>, n: number, axis: Vec3, alpha: number): number[] {
  const out = new Array<number>(4 * n).fill(0);
  for (let k = 0; k < n; k += 1) {
    const theta = Number(state[2 * k] ?? 0);
    const phi = Number(state[2 * k + 1] ?? 0);
    const thetaDot = Number(state[2 * n + 2 * k] ?? 0);
    const phiDot = Number(state[2 * n + 2 * k + 1] ?? 0);
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    const u: Vec3 = [sin * cp, -cos, sin * sp];
    // u̇ = θ̇·a + φ̇·b with a = ∂u/∂θ, b = ∂u/∂φ = sinθ·e_φ.
    const a: Vec3 = [cos * cp, sin, cos * sp];
    const b: Vec3 = [sin * -sp, 0, sin * cp];
    const uDot: Vec3 = [
      thetaDot * a[0] + phiDot * b[0],
      thetaDot * a[1] + phiDot * b[1],
      thetaDot * a[2] + phiDot * b[2]
    ];
    const ru = rotateVec3(u, axis, alpha);
    const ruDot = rotateVec3(uDot, axis, alpha);
    const sinNew = Math.hypot(ru[0], ru[2]);
    const thetaNew = Math.atan2(sinNew, -ru[1]);
    const phiNew = Math.atan2(ru[2], ru[0]);
    const spN = Math.sin(phiNew);
    const cpN = Math.cos(phiNew);
    const cosNew = Math.cos(thetaNew);
    const aNew: Vec3 = [cosNew * cpN, Math.sin(thetaNew), cosNew * spN];
    const bNew: Vec3 = [Math.sin(thetaNew) * -spN, 0, Math.sin(thetaNew) * cpN];
    const thetaDotNew = aNew[0] * ruDot[0] + aNew[1] * ruDot[1] + aNew[2] * ruDot[2];
    const sin2 = Math.max(Math.sin(thetaNew) ** 2, 1e-12);
    const phiDotNew = (bNew[0] * ruDot[0] + bNew[1] * ruDot[1] + bNew[2] * ruDot[2]) / sin2;
    out[2 * k] = thetaNew;
    out[2 * k + 1] = phiNew;
    out[2 * n + 2 * k] = thetaDotNew;
    out[2 * n + 2 * k + 1] = phiDotNew;
  }
  return out;
}

/** Total angular momentum Σ mᵢ rᵢ × vᵢ projected onto the unit axis. */
export function sphericalChainAngularMomentum(state: ArrayLike<number>, params: SphericalChainParams, axis: Vec3): number {
  const positions = sphericalChainPositions(state, params);
  const velocities = sphericalChainVelocities(state, params);
  let lx = 0;
  let ly = 0;
  let lz = 0;
  for (let i = 0; i < positions.length; i += 1) {
    const m = params.masses[i] ?? 0;
    const r = positions[i]!;
    const v = velocities[i]!;
    lx += m * (r.y * v.z - r.z * v.y);
    ly += m * (r.z * v.x - r.x * v.z);
    lz += m * (r.x * v.y - r.y * v.x);
  }
  return lx * axis[0] + ly * axis[1] + lz * axis[2];
}

/** Planar chain kinematics: positions/velocities from absolute angles. */
function planarChainKinematics(state: ArrayLike<number>, params: ChainParameters): { x: number[]; y: number[]; vx: number[]; vy: number[] } {
  const n = chainLength(params);
  const x: number[] = [];
  const y: number[] = [];
  const vx: number[] = [];
  const vy: number[] = [];
  let px = 0;
  let py = 0;
  let pvx = 0;
  let pvy = 0;
  for (let k = 0; k < n; k += 1) {
    const theta = Number(state[k] ?? 0);
    const omega = Number(state[n + k] ?? 0);
    const l = params.lengths[k] ?? 0;
    px += l * Math.sin(theta);
    py -= l * Math.cos(theta);
    pvx += l * Math.cos(theta) * omega;
    pvy += l * Math.sin(theta) * omega;
    x.push(px);
    y.push(py);
    vx.push(pvx);
    vy.push(pvy);
  }
  return { x, y, vx, vy };
}

/** Planar total angular momentum about the pivot: Σ mᵢ (xᵢ·ẏᵢ − yᵢ·ẋᵢ). */
export function planarChainAngularMomentum(state: ArrayLike<number>, params: ChainParameters): number {
  const { x, y, vx, vy } = planarChainKinematics(state, params);
  let L = 0;
  for (let i = 0; i < x.length; i += 1) {
    L += (params.masses[i] ?? 0) * (x[i]! * vy[i]! - y[i]! * vx[i]!);
  }
  return L;
}

interface CandidateSpec {
  name: string;
  generator: string;
  /** dH/dε residual (already relative). NaN means not applicable (energy). */
  symmetryResidual: number;
  symmetric: boolean;
  evaluate: (state: ArrayLike<number>) => number;
  symmetryDetail: string;
}

function runCandidates(
  system: string,
  candidates: CandidateSpec[],
  state0: number[],
  rhs: (state: Float64Array, out: Float64Array) => void,
  options: Required<Pick<ConservedQuantityOptions, 'horizon' | 'dt' | 'symmetryTol' | 'driftTol'>>,
  caveat: string
): ConservedQuantityReport {
  const { horizon, dt, driftTol } = options;
  const steps = Math.max(1, Math.round(horizon / dt));
  const sampleEvery = Math.max(1, Math.round(steps / 400));
  const state = new Float64Array(state0);
  const next = new Float64Array(state.length);

  const initialValues = candidates.map((candidate) => candidate.evaluate(state));
  const maxAbs = initialValues.map((value) => Math.abs(value));
  const maxDelta = candidates.map(() => 0);

  for (let step = 1; step <= steps; step += 1) {
    rk4Step(state, dt, rhs, next);
    state.set(next);
    if (step % sampleEvery === 0 || step === steps) {
      for (let c = 0; c < candidates.length; c += 1) {
        const value = candidates[c]!.evaluate(state);
        maxAbs[c] = Math.max(maxAbs[c]!, Math.abs(value));
        maxDelta[c] = Math.max(maxDelta[c]!, Math.abs(value - initialValues[c]!));
      }
    }
  }

  const results: ConservedQuantityCandidate[] = candidates.map((candidate, c) => {
    // Scale by the candidate's dynamic range so a momentum that starts at 0
    // but swings to O(1) is judged against O(1), not against 0.
    const scale = Math.max(maxAbs[c]!, 1e-9);
    const drift = maxDelta[c]! / scale;
    const conserved = drift < driftTol;
    return {
      name: candidate.name,
      generator: candidate.generator,
      symmetryResidual: candidate.symmetryResidual,
      symmetric: candidate.symmetric,
      drift,
      conserved,
      noetherConsistent: candidate.symmetric === conserved,
      detail: `${candidate.symmetryDetail}; relative drift ${drift.toExponential(2)} over ${horizon}s (RK4 dt=${dt})`
    };
  });

  return {
    system,
    candidates: results,
    conserved: results.filter((result) => result.conserved).map((result) => result.name),
    horizon,
    dt,
    method: 'Noether detection: central-difference Hamiltonian invariance under each group action + momentum drift along an RK4 trajectory; the two verdicts are cross-checked',
    caveat
  };
}

const SPHERICAL_AXES: ReadonlyArray<{ key: string; axis: Vec3; label: string }> = [
  { key: 'angular-momentum-vertical', axis: [0, 1, 0], label: 'rotations about the vertical (gravity) axis' },
  { key: 'angular-momentum-x', axis: [1, 0, 0], label: 'rotations about the horizontal x axis' },
  { key: 'angular-momentum-z', axis: [0, 0, 1], label: 'rotations about the horizontal z axis' }
];

/**
 * Detect conserved quantities of the spherical N-chain. Candidates: total
 * energy (time translation) and the angular momentum about the vertical and
 * two horizontal axes (rotation groups). Keep probe states away from the
 * chart poles.
 */
export function detectSphericalChainConservedQuantities(
  params: SphericalChainParams,
  state0: ArrayLike<number>,
  options: ConservedQuantityOptions = {}
): ConservedQuantityReport {
  const n = sphericalChainLength(params);
  const resolved = {
    horizon: options.horizon ?? 8,
    dt: options.dt ?? 0.002,
    symmetryTol: options.symmetryTol ?? 1e-6,
    driftTol: options.driftTol ?? 1e-4
  };
  const base = Array.from({ length: 4 * n }, (_, i) => Number(state0[i] ?? 0));
  const energyScale = Math.max(Math.abs(sphericalChainEnergy(base, params).total), 1);

  // A couple of deterministic probe states around the initial condition keep
  // the symmetry test from accidentally probing only a special configuration.
  const probes: number[][] = [base];
  const perturbed = base.slice();
  for (let i = 0; i < perturbed.length; i += 1) perturbed[i]! += 0.1 * Math.sin(1 + 3 * i);
  probes.push(perturbed);

  const eps = 1e-5;
  const rotationCandidates: CandidateSpec[] = SPHERICAL_AXES.map(({ key, axis, label }) => {
    let residual = 0;
    for (const probe of probes) {
      const plus = sphericalChainEnergy(rotateSphericalChainState(probe, n, axis, eps), params).total;
      const minus = sphericalChainEnergy(rotateSphericalChainState(probe, n, axis, -eps), params).total;
      residual = Math.max(residual, Math.abs(plus - minus) / (2 * eps) / energyScale);
    }
    const symmetric = residual < resolved.symmetryTol && params.damping === 0;
    return {
      name: key,
      generator: label,
      symmetryResidual: residual,
      symmetric,
      evaluate: (state) => sphericalChainAngularMomentum(state, params, axis),
      symmetryDetail: `|dH/dε| = ${residual.toExponential(2)} (relative) under ${label}${params.damping > 0 ? '; damping breaks the Lagrangian structure' : ''}`
    };
  });

  const energyCandidate: CandidateSpec = {
    name: 'energy',
    generator: 'time translation (autonomous Lagrangian)',
    symmetryResidual: 0,
    symmetric: params.damping === 0,
    evaluate: (state) => sphericalChainEnergy(state, params).total,
    symmetryDetail: params.damping === 0
      ? 'autonomous Lagrangian system (no explicit t)'
      : `autonomous but dissipative (γ=${params.damping}): the Noether charge decays`
  };

  const workspace = createSphericalChainWorkspace(n);
  const rhs = (state: Float64Array, out: Float64Array): void => {
    rhsSphericalChain(state, params, out, workspace);
  };

  return runCandidates(
    `spherical-chain-n${n}`,
    [energyCandidate, ...rotationCandidates],
    base,
    rhs,
    resolved,
    'Numerical detection on finite probes/horizons, not a symbolic proof; chart conversions degrade near the poles (|sinθ| → 0), so keep probe states away from them.'
  );
}

/**
 * Detect conserved quantities of the planar N-chain. Candidates: total energy
 * and the planar angular momentum about the pivot, whose group action is the
 * rigid rotation θ_k → θ_k + ε of all absolute link angles (exact in this
 * chart). The rotation is a symmetry only when g ≈ 0.
 */
export function detectPlanarChainConservedQuantities(
  params: ChainParameters,
  gamma: number,
  state0: ArrayLike<number>,
  options: ConservedQuantityOptions = {}
): ConservedQuantityReport {
  const n = chainLength(params);
  const resolved = {
    horizon: options.horizon ?? 8,
    dt: options.dt ?? 0.002,
    symmetryTol: options.symmetryTol ?? 1e-6,
    driftTol: options.driftTol ?? 1e-4
  };
  const base = Array.from({ length: 2 * n }, (_, i) => Number(state0[i] ?? 0));
  const energyScale = Math.max(Math.abs(energyChain(base, params).total), 1);

  const eps = 1e-5;
  const rotate = (state: readonly number[], alpha: number): number[] => {
    const out = state.slice();
    for (let k = 0; k < n; k += 1) out[k]! += alpha;
    return out;
  };
  const probes: number[][] = [base];
  const perturbed = base.slice();
  for (let i = 0; i < perturbed.length; i += 1) perturbed[i]! += 0.1 * Math.cos(1 + 2 * i);
  probes.push(perturbed);

  let residual = 0;
  for (const probe of probes) {
    const plus = energyChain(rotate(probe, eps), params).total;
    const minus = energyChain(rotate(probe, -eps), params).total;
    residual = Math.max(residual, Math.abs(plus - minus) / (2 * eps) / energyScale);
  }

  const candidates: CandidateSpec[] = [
    {
      name: 'energy',
      generator: 'time translation (autonomous Lagrangian)',
      symmetryResidual: 0,
      symmetric: gamma === 0,
      evaluate: (state) => energyChain(state, params).total,
      symmetryDetail: gamma === 0
        ? 'autonomous Lagrangian system (no explicit t)'
        : `autonomous but dissipative (γ=${gamma}): the Noether charge decays`
    },
    {
      name: 'angular-momentum-planar',
      generator: 'rigid in-plane rotation θ_k → θ_k + ε of all links',
      symmetryResidual: residual,
      symmetric: residual < resolved.symmetryTol && gamma === 0,
      evaluate: (state) => planarChainAngularMomentum(state, params),
      symmetryDetail: `|dH/dε| = ${residual.toExponential(2)} (relative) under rigid rotation${gamma > 0 ? '; damping breaks the Lagrangian structure' : ''}`
    }
  ];

  const workspace = createChainWorkspace(n);
  const rhs = (state: Float64Array, out: Float64Array): void => {
    rhsChain(state, params, gamma, out, workspace);
  };

  return runCandidates(
    `chain-n${n}`,
    candidates,
    base,
    rhs,
    resolved,
    'Numerical detection on finite probes/horizons, not a symbolic proof. With g > 0 gravity picks out the vertical, so the in-plane rotation is not a symmetry and L is expected to drift.'
  );
}

/**
 * Spec-level dispatcher for the workbench/CLI. Supported kinds:
 * 'spherical-chain' and 'chain' (the planar double/triple are the N = 2 / 3
 * chain systems — express them as a chain spec to analyse them here).
 */
export function detectConservedQuantities(
  spec: SystemSpec,
  state0: ArrayLike<number>,
  options: ConservedQuantityOptions = {}
): ConservedQuantityReport {
  if (spec.kind === 'spherical-chain') {
    return detectSphericalChainConservedQuantities(
      { masses: spec.masses, lengths: spec.lengths, g: spec.g, damping: spec.damping },
      state0,
      options
    );
  }
  if (spec.kind === 'chain') {
    return detectPlanarChainConservedQuantities({ masses: spec.masses, lengths: spec.lengths, g: spec.g }, 0, state0, options);
  }
  throw new Error(`detectConservedQuantities: unsupported kind '${spec.kind}' (supported: spherical-chain, chain)`);
}
