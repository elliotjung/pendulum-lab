/**
 * @packageDocumentation
 *
 * `core` — the physics foundation of pendulum-lab-core: shared domain types,
 * integrators, and every dynamical system (planar double/triple chains, the
 * general N-chain, rope/elastic, double string, spherical pendulum, and the 3D
 * spherical N-chain) together with their energy/diagnostic helpers.
 *
 * Everything here is deterministic, allocation-conscious, and runs in both the
 * browser and Node (no DOM, no Workers).
 */

// Shared domain types
export type { PendulumParameters, SystemType, IntegratorId, RunMode, RuntimeSnapshot } from '../types/domain';

// Physics primitives
export * from '../physics/types';
export * from '../physics/integrators';
export { rhsDouble } from '../physics/double';
export { energyDouble } from '../physics/energy';
export { rhsChain, energyChain, createChainWorkspace, validateChainParameters } from '../physics/nPendulum';
export type { ChainParameters, ChainWorkspace } from '../physics/nPendulum';
export { assertLinearSolve, solveLinearInPlace } from '../physics/linearSolve';
export type { LinearSolveFailureReason, LinearSolveOptions, LinearSolveResult } from '../physics/linearSolve';
export { buildRhs, buildJacobian } from '../physics/systemSpec';
export type { SystemSpec } from '../physics/systemSpec';

// Non-rigid and 3D systems
export { RopePendulum } from '../physics/rope';
export type { RopeParams, RopePhase, RopeStateSnapshot, RopeEvent } from '../physics/rope';
export { DoubleStringPendulum, doubleStringEnergy, doubleStringEnergyFromTautState, doubleStringTautFraction, doubleStringTensions } from '../physics/doubleString';
export type { DoubleStringEvent, DoubleStringParams, DoubleStringPhase, DoubleStringSnapshot, TautFractionResult } from '../physics/doubleString';
export {
  SphericalPendulum,
  sphericalRhs,
  sphericalEnergy,
  sphericalLz,
  sphericalTension,
  sphericalPosition,
  conicalRate
} from '../physics/spherical';
export type { SphericalParams, SphericalState, SphericalDiagnostics } from '../physics/spherical';
export {
  SphericalChain,
  createSphericalChainWorkspace,
  rhsSphericalChain,
  sphericalChainEnergy,
  sphericalChainLz,
  sphericalChainPositions,
  sphericalChainVelocities,
  validateSphericalChainParams
} from '../physics/sphericalChain';
export type { SphericalChainParams, SphericalChainDiagnostics, SphericalChainOptions, SphericalChainWorkspace } from '../physics/sphericalChain';
