/**
 * @packageDocumentation
 *
 * `@elliotjung/pendulum-lab` — the headless, dependency-free research core of
 * Pendulum Lab, organised into four audience-oriented groups:
 *
 * - {@link core} — physics: systems (double/triple/N-chain, rope, double
 *   string, spherical, 3D spherical chain), integrators, energies, SystemSpec.
 * - {@link analysis} — chaos diagnostics: Lyapunov, RQA, basin/Wada, CLV,
 *   FTLE, Floquet/continuation, Melnikov, 0–1 test, recurrence networks.
 * - {@link research} — reproducibility tooling: sampling, experiment design,
 *   ZIP bundles, provenance, notebooks, figures, CLI batch spec, job protocol.
 * - {@link experimental} — unstable APIs (WebGPU ensemble runner).
 *
 * Every API is browser- and Node-compatible: no DOM, no Workers — the app's
 * UI layers build on exactly these exports.
 *
 * The flat re-exports below the namespace exports preserve the pre-10.31
 * import surface (`import { rhsChain } from '@elliotjung/pendulum-lab'`) so existing
 * scripts keep working; new code should prefer the grouped namespaces.
 *
 * Stability contract:
 * - `core`, `analysis`, and `research` are stable public namespaces governed
 *   by semantic versioning.
 * - `experimental` is tested but may change in minor releases; each change
 *   must be documented in `CHANGELOG.md`.
 * - Flat re-exports are compatibility aliases. They remain supported until a
 *   future major release announces a concrete removal version.
 */

export * as core from './lib/core';
export * as analysis from './lib/analysis';
export * as research from './lib/research';
export * as experimental from './lib/experimental';

// --- Flat compatibility surface (pre-10.31) --------------------------------

export type {
  EnergyBreakdown,
  PendulumParameters,
  SystemType,
  IntegratorId,
  RunMode,
  RuntimeSnapshot
} from './types/domain';

// Physics
export * from './physics/types';
export * from './physics/integrators';
export { rhsDouble } from './physics/double';
export { energyDouble } from './physics/energy';
export {
  rhsChain,
  energyChain,
  chainMassMatrix,
  chainMassMatrixDiagnostics,
  createChainWorkspace,
  validateChainParameters
} from './physics/nPendulum';
export type { ChainParameters, ChainWorkspace } from './physics/nPendulum';
export { assertLinearSolve, solveLinearInPlace } from './physics/linearSolve';
export type {
  LinearSolveFailureReason,
  LinearSolveFallbackPolicy,
  LinearSolveOptions,
  LinearSolveResult
} from './physics/linearSolve';
export { buildRhs, buildJacobian } from './physics/systemSpec';
export type { SystemSpec } from './physics/systemSpec';
export {
  gaussianSampler,
  eulerMaruyamaStep,
  milsteinStep,
  stochasticHeunStratonovichStep,
  commutativeMilsteinStep,
  runLangevinEnsemble,
  buildBrownianGrid,
  runAdaptiveLangevinPath,
  fixedGridLangevinPath
} from './physics/stochastic';
export { commutativityDefect } from './physics/noiseCommutativity';
// Quantum chaos & Hamiltonian maps: Chirikov standard map + quantum kicked rotor.
export { fftInPlace, ifftInPlace } from './physics/fft';
export {
  STANDARD_MAP_KC,
  standardMapStep,
  standardMapEnsembleEnergy,
  standardMapDiffusionRate
} from './physics/standardMap';
export {
  createQkrPlan,
  createQkrState,
  qkrStep,
  qkrNorm,
  qkrMeanSquareMomentum,
  runQuantumKickedRotor
} from './physics/quantumKickedRotor';
export type { QuantumKickedRotorParams, QkrPlan, QkrState, QkrRun } from './physics/quantumKickedRotor';
export type {
  GaussianSampler,
  StateDependentVector,
  DiffusionMatrix,
  DiffusionMatrixJacobian,
  MatrixSdeScratch,
  MultiplicativeNoise,
  LangevinScheme,
  LangevinEnsembleSpec,
  LangevinEnsembleResult,
  BrownianGrid,
  AdaptiveLangevinSpec,
  AdaptiveLangevinResult
} from './physics/stochastic';
export type { CrossingDirection, EventFunction } from './physics/events';
export { DAMPED_DRIVEN_CHAOS_PRESET, energyDriven, rhsDriven } from './physics/driven';
export type { DrivenParameters } from './physics/driven';
// Canonical nonlinear oscillators + escape/phonon/diagnostic helpers.
export {
  rhsDuffing,
  energyDuffing,
  duffingPotential,
  duffingDoubleWell,
  DUFFING_CHAOS_PRESET
} from './physics/duffing';
export type { DuffingParameters, DuffingDoubleWell } from './physics/duffing';
export { rhsVanDerPol, energyVanDerPol, vanDerPolPeriodEstimate } from './physics/vanDerPol';
export type { VanDerPolParameters } from './physics/vanDerPol';
export {
  rhsKuramoto,
  rhsHuygensPhasePair,
  kuramotoOrderParameter,
  kuramotoLocalOrderParameters,
  nonlocalRingAdjacency,
  kuramotoCriticalCoupling,
  kuramotoCriticalCouplingLorentzian,
  kuramotoCriticalCouplingGaussian,
  huygensLockedPhaseDifference
} from './physics/kuramoto';
export type { KuramotoNetworkParameters, PhaseOrderParameter, HuygensPhasePairParameters } from './physics/kuramoto';
export {
  smoothFrictionSign,
  coulombFrictionForce,
  stribeckFrictionMagnitude,
  stribeckFrictionForce,
  applyStribeckFriction
} from './physics/friction';
export type { RegularizedCoulombFriction, StribeckFrictionParameters } from './physics/friction';
export { pyragasFeedback, rhsPyragasPendulum, integratePyragasPendulumDde } from './physics/pyragasDde';
export type {
  PyragasPendulumParameters,
  PyragasHistory,
  PyragasDdeOptions,
  PyragasDdeResult
} from './physics/pyragasDde';
export {
  rhsKapitza,
  energyKapitza,
  kapitzaEffectivePotential,
  kapitzaInvertedStable,
  kapitzaInvertedFrequency,
  KAPITZA_INVERTED_PRESET
} from './physics/kapitza';
export type { KapitzaParameters } from './physics/kapitza';
export {
  rhsMagneticPendulum,
  magneticPendulumEnergy,
  nearestMagnetIndex,
  magneticPendulumSettle,
  magneticPendulumBasinGrid,
  THREE_MAGNET_PRESET
} from './physics/magneticPendulum';
export type {
  MagneticPendulumParameters,
  MagnetSpec,
  MagneticSettleResult,
  MagneticSettleOptions,
  MagneticBasinGridOptions,
  MagneticBasinGrid
} from './physics/magneticPendulum';
export {
  kramersRateOverdamped,
  kramersMeanFirstPassage,
  duffingKramersRate,
  arrheniusMTTF,
  simulateQuarticEscape
} from './physics/kramersEscape';
export type { OverdampedRateSpec, QuarticEscapeSpec, QuarticEscapeResult } from './physics/kramersEscape';
export {
  diatomicDispersion,
  diatomicBandGap,
  diatomicDispersionCurve,
  acousticSoundSpeed,
  diatomicGroupVelocity
} from './physics/latticeDispersion';
export type {
  DiatomicChainParams,
  DispersionBranches,
  DiatomicBandGap,
  DispersionSample
} from './physics/latticeDispersion';
export { implicitMidpointNewton } from './physics/implicitDiagnostics';
export type {
  ImplicitMidpointReport,
  NewtonStepRecord,
  ImplicitMidpointNewtonOptions
} from './physics/implicitDiagnostics';
export {
  SINE_GORDON_KINK_REST_ENERGY,
  sineGordonKink,
  sineGordonKinkRate,
  kinkEnergy,
  kinkMomentum,
  sineGordonBreather,
  breatherEnergy,
  sineGordonDispersion,
  sineGordonGroupVelocity,
  sineGordonPhaseVelocity,
  sineGordonResidual,
  topologicalCharge,
  createSineGordonField,
  stepSineGordon,
  sineGordonFieldEnergy,
  kinkCenter,
  sineGordonKinkPositions,
  createKinkAntikinkField,
  frenkelKontorovaEnergy,
  relaxFrenkelKontorovaKink,
  peierlsNabarroBarrier
} from './physics/sineGordon';
export type {
  KinkSign,
  SineGordonKinkParams,
  SineGordonBreatherParams,
  SineGordonBoundary,
  SineGordonGrid,
  SineGordonFieldSpec,
  KinkAntikinkSpec,
  RelaxedKinkResult,
  RelaxKinkOptions,
  PeierlsNabarroResult
} from './physics/sineGordon';
export {
  fputAcceleration,
  fputEnergy,
  fputModeFrequency,
  fputModeEnergies,
  createFputModeState,
  createFputVerletScratch,
  fputVelocityVerletStep,
  fputRecurrence
} from './physics/fput';
export type { FputParameters, FputVerletScratch, FputRecurrenceResult } from './physics/fput';
export { RopePendulum } from './physics/rope';
export type { RopeParams, RopePhase, RopeStateSnapshot, RopeEvent } from './physics/rope';
export {
  DoubleStringPendulum,
  doubleStringEnergy,
  doubleStringEnergyFromTautState,
  doubleStringTautFraction,
  doubleStringTensions
} from './physics/doubleString';
export type {
  DoubleStringEvent,
  DoubleStringParams,
  DoubleStringPhase,
  DoubleStringSnapshot,
  TautFractionResult
} from './physics/doubleString';
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
  EmbeddedSphericalPendulum,
  sphericalEmbeddedRhs,
  sphericalEmbeddedEnergy,
  sphericalEmbeddedLz,
  sphericalEmbeddedPosition,
  angleToEmbedded,
  embeddedToAngle
} from './physics/sphericalEmbedded';
export type { EmbeddedSphericalState, EmbeddedSphericalDiagnostics } from './physics/sphericalEmbedded';
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
} from './physics/sphericalChain';
export type {
  SphericalChainParams,
  SphericalChainDiagnostics,
  SphericalChainOptions,
  SphericalChainWorkspace
} from './physics/sphericalChain';
export {
  EmbeddedSphericalChain,
  createEmbeddedChainWorkspace,
  rhsEmbeddedChain,
  embeddedChainEnergy,
  embeddedChainLz,
  embeddedChainPositions,
  embeddedChainVelocities,
  angleChainToEmbedded,
  embeddedChainToAngle
} from './physics/sphericalEmbeddedChain';
export type {
  EmbeddedChainParams,
  EmbeddedChainState,
  EmbeddedChainDiagnostics,
  EmbeddedChainWorkspace
} from './physics/sphericalEmbeddedChain';

// Chaos diagnostics (re-exports the curated chaos index).
export * from './chaos';

// Worker job protocol (pure handlers usable headlessly).
export { runChaosJob } from './workers/chaosProtocol';
export type {
  BasinRequest,
  BasinResponse,
  BifurcationJobSettings,
  BifurcationRequest,
  BifurcationResponse,
  ChaosErrorResponse,
  ChaosRequest,
  ChaosResponse,
  ClvRequest,
  ClvResponse,
  CodimTwoRequest,
  CodimTwoResponse,
  FtleRequest,
  FtleResponse,
  LyapunovRequest,
  LyapunovResponse,
  LyapunovSpectrumRequest,
  LyapunovSpectrumResponse,
  RqaJobSettings,
  RqaRequest,
  RqaResponse,
  StudyPointJobSettings,
  StudyPointRequest,
  StudyPointResponse,
  WadaConvergenceRequest,
  WadaConvergenceResponse,
  ZeroOneJobSettings,
  ZeroOneRequest,
  ZeroOneResponse
} from './workers/chaosProtocol';
export { JobEngine, jobPhases, JOB_PROTOCOL_V2 } from './workers/jobProtocol';
export type {
  JobControlMessage,
  JobEventMessage,
  JobInboundMessage,
  JobStatus,
  JobCheckpointState,
  JobSubmitMessage,
  PhaseRunner
} from './workers/jobProtocol';

// Research tooling
export * from './research/researchSampling';
export * from './research/experimentDesign';
export * from './research/surrogate';
export * from './research/parameterEstimation';
export * from './research/experimentalDataImport';
export * from './research/videoTracking';
export * from './research/sindy';
export * from './research/complexEig';
export * from './research/eigenGeneral';
export * from './research/unitaryFloquet';
export * from './research/svd';
export * from './research/dmd';
export * from './research/havok';
export * from './research/qkrFloquet';
export * from './research/qkrViewModel';
export * from './research/reservoir';
export * from './research/hamiltonianLearning';
export * from './research/lanczos';
export * from './research/arnoldi';
export * from './research/zipBundle';
export * from './research/provenance';
export * from './research/notebookBuilder';
export * from './research/figurePipeline';
export * from './research/libraryUx';
export * from './research/cliBatchSpec';
export { hashText, csvCell, dataUrlByteEstimate } from './research/researchExportUtils';

// Ensembles
export {
  runDoublePendulumEnsemble,
  ensembleGrid,
  ensembleStatistics,
  webgpuEnsembleStatistics,
  compareEnsembleStatistics
} from './runtime/gpuEnsemble';
export type {
  EnsembleOptions,
  EnsembleResult,
  EnsembleStatistics,
  EnsembleStatisticsComparison,
  EnsembleStatisticsTolerances
} from './runtime/gpuEnsemble';
export {
  promotedDoublePendulumLyapunovSpectrum,
  webgpuDoublePendulumLyapunovSpectrumCandidate
} from './runtime/gpuLyapunov';
export type {
  WebgpuLyapunovSpectrumCandidate,
  WebgpuLyapunovSpectrumOptions,
  WebgpuLyapunovSpectrumPromotion
} from './runtime/gpuLyapunov';
export {
  promotedDoublePendulumClv,
  promotedDoublePendulumVariationalFtleField,
  webgpuDoublePendulumClvCandidate,
  webgpuDoublePendulumVariationalFtleFieldCandidate
} from './runtime/gpuChaosPromotion';
export {
  buildNChainJacobianTape,
  nChainVariationalCpuOracle,
  promotedNChainVariational,
  webgpuNChainVariationalCandidate
} from './runtime/gpuNChainVariational';
export type {
  NChainVariationalComparison,
  NChainVariationalOptions,
  NChainVariationalPromotion,
  NChainVariationalSummary,
  WebgpuNChainVariationalCandidate
} from './runtime/gpuNChainVariational';
export type {
  WebgpuClvCandidate,
  WebgpuClvOptions,
  WebgpuClvPromotion,
  WebgpuFtleFieldCandidate,
  WebgpuFtleFieldOptions,
  WebgpuFtleFieldPromotion
} from './runtime/gpuChaosPromotion';
