import type { Derivative, Jacobian } from './types';
import type { DampingConvention } from './constants';
import { rhsDouble, energyDouble, jacobianDouble } from './double';
import {
  createChainJacobianWorkspace,
  createSphericalChainJacobianWorkspace,
  jacobianChain,
  jacobianDriven,
  jacobianSphericalChain
} from './jacobians';
import { rhsTriple } from './triple';
import { energyTriple } from './energy';
import { rhsChain, energyChain, createChainWorkspace } from './nPendulum';
import { rhsDriven, energyDriven } from './driven';
import { rhsSpring, energySpring } from './spring';
import { createSphericalChainWorkspace, rhsSphericalChain, sphericalChainEnergy } from './sphericalChain';
import type { EnergyBreakdown } from '../types/domain';

/**
 * Data-only descriptor of a physical system. Because it is plain JSON it can
 * cross a Web Worker boundary, where `buildRhs` reconstructs the actual
 * `Derivative` closure. This is what lets the chaos computations move off the
 * main thread without trying (and failing) to serialize a function.
 */
export type SystemSpec =
  | { kind: 'double'; m1: number; m2: number; l1: number; l2: number; g: number }
  | { kind: 'triple'; m1: number; m2: number; m3: number; l1: number; l2: number; l3: number; g: number }
  | { kind: 'chain'; masses: number[]; lengths: number[]; g: number }
  | { kind: 'driven'; g: number; length: number; damping: number; driveAmplitude: number; driveFrequency: number }
  | { kind: 'spring'; mass: number; stiffness: number; restLength: number; g: number }
  /**
   * Spherical N-chain (3D ball joints). State layout (length 4N):
   * [θ_0, φ_0, …, θ_{N−1}, φ_{N−1}, θ̇_0, φ̇_0, …]. Chart-regularised near the
   * poles (|sinθ| < 1e-6); diagnostics there carry a caveat.
   */
  | { kind: 'spherical-chain'; masses: number[]; lengths: number[]; g: number; damping: number }
  /**
   * Planar double pendulum on inextensible strings (unilateral constraints):
   * rods can only pull. State layout matches the rigid double pendulum
   * [θ₁, θ₂, ω₁, ω₂]; taut-phase dynamics equal the rigid system, slack
   * links fall ballistically (handled inside the RHS via phase detection).
   */
  | { kind: 'double-string'; m1: number; m2: number; l1: number; l2: number; g: number; damping: number };

/**
 * How linear damping enters each system's equations of motion (see
 * {@link DampingConvention}). Cross-system damping comparisons are only
 * meaningful between systems that share a convention; the UI and exports
 * surface this so a γ slider is never silently reinterpreted.
 */
export function dampingConventionFor(kind: SystemSpec['kind']): DampingConvention {
  switch (kind) {
    case 'double':
    case 'triple':
    case 'chain':
    case 'double-string':
      // −γ·ω_j enters the generalised force before the mass-matrix solve.
      return 'force-level';
    case 'driven':
    case 'spherical-chain':
      // q̈_j ← q̈_j − γ·q̇_j after the solve (per-coordinate rate damping).
      // (For the 1-DOF driven pendulum the two conventions coincide.)
      return 'rate-level';
    case 'spring':
      // The spring spec carries no damping parameter.
      return 'none';
    default: {
      const exhaustive: never = kind;
      throw new Error(`unknown system kind: ${String(exhaustive)}`);
    }
  }
}

/** Reconstruct the (undamped unless the spec encodes damping) RHS for a spec. */
export function buildRhs(spec: SystemSpec): Derivative {
  switch (spec.kind) {
    case 'double': {
      const p = spec;
      return (s, o) => {
        rhsDouble(s, p, 0, o);
      };
    }
    case 'triple': {
      const p = spec;
      return (s, o) => {
        rhsTriple(s, p, 0, o);
      };
    }
    case 'chain': {
      const p = { masses: spec.masses, lengths: spec.lengths, g: spec.g };
      // One workspace per closure: without it every RHS evaluation re-allocates
      // the mass-matrix/suffix/rhs buffers (millions of times per chaos job).
      const workspace = createChainWorkspace(spec.masses.length);
      return (s, o) => {
        rhsChain(s, p, 0, o, workspace);
      };
    }
    case 'driven': {
      const p = spec;
      return (s, o) => {
        rhsDriven(s, p, o);
      };
    }
    case 'spring': {
      const p = spec;
      return (s, o) => {
        rhsSpring(s, p, o);
      };
    }
    case 'spherical-chain': {
      const p = { masses: spec.masses, lengths: spec.lengths, g: spec.g, damping: spec.damping };
      // One workspace per closure: chaos jobs call the RHS millions of times,
      // so the mass matrix / force buffers must not be reallocated per call.
      const workspace = createSphericalChainWorkspace(spec.masses.length);
      return (s, o) => {
        rhsSphericalChain(s, p, o, workspace);
      };
    }
    case 'double-string': {
      // The smooth taut-branch vector field: exact while both tensions are
      // ≥ 0, where the string system coincides with the rigid double pendulum.
      // Slack/recapture phases are non-smooth events outside any single-chart
      // ODE; use `DoubleStringPendulum` for the full hybrid flow and
      // `doubleStringTautFraction` to check this chart's validity.
      const p = { m1: spec.m1, m2: spec.m2, l1: spec.l1, l2: spec.l2, g: spec.g };
      const damping = spec.damping;
      return (s, o) => {
        rhsDouble(s, p, damping, o);
      };
    }
    default: {
      const exhaustive: never = spec;
      throw new Error(`unknown system spec: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Exact Jacobian of the spec's RHS — the tangent of the same vector field
 * `buildRhs` returns, including each spec's damping convention. The double
 * pendulum uses the hand-derived closed form; the chain systems use the
 * dual-number (forward-mode AD) mass-matrix assembly of `jacobians.ts`; the
 * driven pendulum is trivial. Only the spring pendulum falls back to the
 * central-difference Jacobian (`undefined`). Supplying this to the Lyapunov /
 * variational pipeline removes the finite-difference error floor, and to
 * Newton-based implicit steppers restores quadratic convergence.
 */
export function buildJacobian(spec: SystemSpec): Jacobian | undefined {
  switch (spec.kind) {
    case 'double': {
      const p = spec;
      return (state, jac) => {
        jacobianDouble(state, p, 0, jac);
      };
    }
    case 'double-string': {
      // Taut chart: the vector field is the rigid double pendulum with the
      // spec's damping (matching buildRhs above).
      const p = { m1: spec.m1, m2: spec.m2, l1: spec.l1, l2: spec.l2, g: spec.g };
      const damping = spec.damping;
      return (state, jac) => {
        jacobianDouble(state, p, damping, jac);
      };
    }
    case 'triple': {
      // rhsTriple is the N = 3 chain in closed form (pinned by tests), so the
      // chain Jacobian is its exact tangent as well.
      const p = { masses: [spec.m1, spec.m2, spec.m3], lengths: [spec.l1, spec.l2, spec.l3], g: spec.g };
      const workspace = createChainJacobianWorkspace(3);
      return (state, jac) => {
        jacobianChain(state, p, 0, jac, workspace);
      };
    }
    case 'chain': {
      const p = { masses: spec.masses, lengths: spec.lengths, g: spec.g };
      const workspace = createChainJacobianWorkspace(spec.masses.length);
      return (state, jac) => {
        jacobianChain(state, p, 0, jac, workspace);
      };
    }
    case 'spherical-chain': {
      const p = { masses: spec.masses, lengths: spec.lengths, g: spec.g, damping: spec.damping };
      const workspace = createSphericalChainJacobianWorkspace(spec.masses.length);
      return (state, jac) => {
        jacobianSphericalChain(state, p, jac, workspace);
      };
    }
    case 'driven': {
      const p = spec;
      return (state, jac) => {
        jacobianDriven(state, p, jac);
      };
    }
    case 'spring':
      return undefined;
    default: {
      const exhaustive: never = spec;
      throw new Error(`unknown system spec: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Total/kinetic/potential energy for a spec's state, mirroring `buildRhs`. */
export function energyForSpec(spec: SystemSpec, state: ArrayLike<number>): EnergyBreakdown {
  switch (spec.kind) {
    case 'double':
      return energyDouble(state, spec);
    case 'triple':
      return energyTriple(state, spec);
    case 'chain':
      return energyChain(state, { masses: spec.masses, lengths: spec.lengths, g: spec.g });
    case 'driven':
      return energyDriven(state, spec);
    case 'spring':
      return energySpring(state, spec);
    case 'spherical-chain':
      return sphericalChainEnergy(state, {
        masses: spec.masses,
        lengths: spec.lengths,
        g: spec.g,
        damping: spec.damping
      });
    case 'double-string':
      // Taut chart: energies coincide with the rigid double pendulum's.
      return energyDouble(state, { m1: spec.m1, m2: spec.m2, l1: spec.l1, l2: spec.l2, g: spec.g });
    default: {
      const exhaustive: never = spec;
      throw new Error(`unknown system spec: ${JSON.stringify(exhaustive)}`);
    }
  }
}
