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
export type { EnergyBreakdown, PendulumParameters, SystemType, IntegratorId, RunMode, RuntimeSnapshot } from '../types/domain';

// Physics primitives
export * from '../physics/types';
export * from '../physics/integrators';
export { rhsDouble } from '../physics/double';
export { energyDouble } from '../physics/energy';
export { rhsChain, energyChain, chainMassMatrix, chainMassMatrixDiagnostics, createChainWorkspace, validateChainParameters } from '../physics/nPendulum';
export type { ChainParameters, ChainWorkspace } from '../physics/nPendulum';
export { assertLinearSolve, choleskyFactor, choleskySolveFactored, solveCholeskyInPlace, solveLinearInPlace } from '../physics/linearSolve';
export type { CholeskyFactorResult, LinearSolveFailureReason, LinearSolveFallbackPolicy, LinearSolveOptions, LinearSolveResult } from '../physics/linearSolve';
export { buildRhs, buildJacobian, dampingConventionFor } from '../physics/systemSpec';
export type { SystemSpec } from '../physics/systemSpec';
export type { DampingConvention } from '../physics/constants';
export {
  MASS_MATRIX_SINGULARITY_THRESHOLD,
  SPHERICAL_POLE_EPS,
  SPHERICAL_CHAIN_POLE_EPS,
  FD_JACOBIAN_EPS,
  IMPLICIT_SOLVE_TOLERANCE
} from '../physics/constants';
export {
  jacobianChain,
  jacobianDriven,
  jacobianSphericalChain,
  createChainJacobianWorkspace,
  createSphericalChainJacobianWorkspace
} from '../physics/jacobians';
export type { ChainJacobianWorkspace, SphericalChainJacobianWorkspace } from '../physics/jacobians';
export type { CrossingDirection, EventFunction } from '../physics/events';
export { DAMPED_DRIVEN_CHAOS_PRESET, energyDriven, rhsDriven } from '../physics/driven';
export type { DrivenParameters } from '../physics/driven';

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
  sphericalChainMassMatrix,
  sphericalChainPositions,
  sphericalChainVelocities,
  validateSphericalChainParams
} from '../physics/sphericalChain';
export type { SphericalChainParams, SphericalChainDiagnostics, SphericalChainOptions, SphericalChainWorkspace } from '../physics/sphericalChain';
export {
  detectConservedQuantities,
  detectPlanarChainConservedQuantities,
  detectSphericalChainConservedQuantities,
  planarChainAngularMomentum,
  rotateSphericalChainState,
  sphericalChainAngularMomentum
} from '../physics/conservedQuantities';
export type { ConservedQuantityCandidate, ConservedQuantityOptions, ConservedQuantityReport } from '../physics/conservedQuantities';
