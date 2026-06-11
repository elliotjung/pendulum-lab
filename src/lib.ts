/**
 * @packageDocumentation
 *
 * `pendulum-lab-core` — the headless, dependency-free research core of
 * Pendulum Lab: physics (double/triple/driven/rope/spherical pendulums,
 * integrators), chaos diagnostics (Lyapunov, RQA, basin/Wada, CLV, FTLE,
 * Floquet/continuation, Melnikov, 0–1 test, recurrence networks,
 * Neimark–Sacker, codim-2 scans), and the research tooling (experiment design,
 * ZIP bundles, provenance, notebook builder, figure pipeline, CLI batch spec).
 *
 * Every API here is browser- and Node-compatible: no DOM, no Workers — the
 * app's UI layers build on exactly these exports.
 */

// Shared domain types
export type { PendulumParameters, SystemType, IntegratorId, RunMode, RuntimeSnapshot } from './types/domain';

// Physics
export * from './physics/types';
export * from './physics/integrators';
export { rhsDouble } from './physics/double';
export { energyDouble } from './physics/energy';
export { rhsChain, energyChain, createChainWorkspace, validateChainParameters } from './physics/nPendulum';
export type { ChainParameters, ChainWorkspace } from './physics/nPendulum';
export { assertLinearSolve, solveLinearInPlace } from './physics/linearSolve';
export type { LinearSolveFailureReason, LinearSolveOptions, LinearSolveResult } from './physics/linearSolve';
export { buildRhs, buildJacobian } from './physics/systemSpec';
export type { SystemSpec } from './physics/systemSpec';
export { RopePendulum } from './physics/rope';
export type { RopeParams, RopePhase, RopeStateSnapshot, RopeEvent } from './physics/rope';
export { DoubleStringPendulum, doubleStringEnergy, doubleStringTensions } from './physics/doubleString';
export type { DoubleStringEvent, DoubleStringParams, DoubleStringPhase, DoubleStringSnapshot } from './physics/doubleString';
export {
  SphericalPendulum,
  sphericalRhs,
  sphericalEnergy,
  sphericalLz,
  sphericalTension,
  sphericalPosition,
  conicalRate
} from './physics/spherical';
export type { SphericalParams, SphericalState, SphericalDiagnostics } from './physics/spherical';
export {
  SphericalChain,
  createSphericalChainWorkspace,
  rhsSphericalChain,
  sphericalChainEnergy,
  sphericalChainLz,
  sphericalChainPositions,
  sphericalChainVelocities,
  validateSphericalChainParams
} from './physics/sphericalChain';
export type { SphericalChainParams, SphericalChainDiagnostics, SphericalChainOptions, SphericalChainWorkspace } from './physics/sphericalChain';

// Chaos diagnostics (re-exports the curated chaos index).
export * from './chaos';

// Worker job protocol (pure handlers usable headlessly).
export { runChaosJob } from './workers/chaosProtocol';
export type { ChaosRequest, ChaosResponse } from './workers/chaosProtocol';
export { JobEngine, jobPhases, JOB_PROTOCOL_V2 } from './workers/jobProtocol';
export type { JobEventMessage, JobInboundMessage, JobStatus, JobCheckpointState, PhaseRunner } from './workers/jobProtocol';

// Research tooling
export * from './research/researchSampling';
export * from './research/experimentDesign';
export * from './research/zipBundle';
export * from './research/provenance';
export * from './research/notebookBuilder';
export * from './research/figurePipeline';
export * from './research/libraryUx';
export * from './research/cliBatchSpec';
export { hashText, csvCell, dataUrlByteEstimate } from './research/researchExportUtils';

// Ensembles
export { runDoublePendulumEnsemble, ensembleGrid } from './runtime/gpuEnsemble';
export type { EnsembleOptions, EnsembleResult } from './runtime/gpuEnsemble';
