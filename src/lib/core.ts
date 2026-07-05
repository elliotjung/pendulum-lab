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
// Stochastic (Langevin) dynamics — seeded, so deterministic for a given seed.
export { gaussianSampler, eulerMaruyamaStep, milsteinStep, stochasticHeunStratonovichStep, commutativeMilsteinStep, runLangevinEnsemble, buildBrownianGrid, runAdaptiveLangevinPath, fixedGridLangevinPath } from '../physics/stochastic';
export { commutativityDefect } from '../physics/noiseCommutativity';
// Levy areas: the rough-path correction that restores strong order 1.0 for
// NON-commutative multiplicative noise (commutativityDefect > 0).
export {
  iteratedItoIntegrals,
  levyAreaCount,
  levyAreaPackedIndex,
  levyAreasFromGrid,
  milsteinLevyStep,
  sampleBrownianStepWithAreas
} from '../physics/levyArea';
export type { BrownianStepWithAreas } from '../physics/levyArea';
// Quantum chaos & Hamiltonian maps (frontier physics): the Chirikov standard map
// and its quantisation, the quantum kicked rotor (dynamical localization).
export { fftInPlace, ifftInPlace } from '../physics/fft';
export { STANDARD_MAP_KC, standardMapStep, standardMapEnsembleEnergy, standardMapDiffusionRate } from '../physics/standardMap';
export { createQkrPlan, createQkrState, qkrStep, qkrNorm, qkrMeanSquareMomentum, runQuantumKickedRotor } from '../physics/quantumKickedRotor';
export type { QuantumKickedRotorParams, QkrPlan, QkrState, QkrRun } from '../physics/quantumKickedRotor';
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
} from '../physics/stochastic';
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
// Coupled-pendulum network (lattice / phonon-dispersion extension).
export {
  rhsPendulumNetwork,
  pendulumNetworkEnergy,
  pendulumNetworkStiffnessMatrix,
  ringPhononDispersion,
  buildCouplingMatrix,
  ringCouplingMatrix,
  networkSize,
  validatePendulumNetworkParameters
} from '../physics/pendulumNetwork';
export type { PendulumNetworkParameters, NetworkEdge } from '../physics/pendulumNetwork';
// Stochastic resonance (noise-enhanced weak-signal detection).
export { stochasticResonanceResponse, stochasticResonanceCurve } from '../physics/stochasticResonance';
export type { BistableSrParameters, SrResponse } from '../physics/stochasticResonance';
// Canonical nonlinear oscillators: forced double-well, self-sustained, parametric, fractal-basin.
export { rhsDuffing, energyDuffing, duffingPotential, duffingDoubleWell, DUFFING_CHAOS_PRESET } from '../physics/duffing';
export type { DuffingParameters, DuffingDoubleWell } from '../physics/duffing';
export { rhsVanDerPol, energyVanDerPol, vanDerPolPeriodEstimate } from '../physics/vanDerPol';
export type { VanDerPolParameters } from '../physics/vanDerPol';
export {
  rhsKapitza,
  energyKapitza,
  kapitzaEffectivePotential,
  kapitzaInvertedStable,
  kapitzaInvertedFrequency,
  KAPITZA_INVERTED_PRESET
} from '../physics/kapitza';
export type { KapitzaParameters } from '../physics/kapitza';
export {
  rhsMagneticPendulum,
  magneticPendulumEnergy,
  nearestMagnetIndex,
  magneticPendulumSettle,
  THREE_MAGNET_PRESET
} from '../physics/magneticPendulum';
export type { MagneticPendulumParameters, MagnetSpec, MagneticSettleResult, MagneticSettleOptions } from '../physics/magneticPendulum';
// Noise-activated (Kramers) escape + reliability MTTF analog.
export {
  kramersRateOverdamped,
  kramersMeanFirstPassage,
  duffingKramersRate,
  arrheniusMTTF,
  simulateQuarticEscape
} from '../physics/kramersEscape';
export type { OverdampedRateSpec, QuarticEscapeSpec, QuarticEscapeResult } from '../physics/kramersEscape';
// Diatomic-lattice phonon dispersion (acoustic + optical bands).
export {
  diatomicDispersion,
  diatomicBandGap,
  diatomicDispersionCurve,
  acousticSoundSpeed,
  diatomicGroupVelocity
} from '../physics/latticeDispersion';
export type { DiatomicChainParams, DispersionBranches, DiatomicBandGap, DispersionSample } from '../physics/latticeDispersion';
// Newton-instrumented implicit midpoint (convergence history + conditioning).
export { implicitMidpointNewton } from '../physics/implicitDiagnostics';
export type { ImplicitMidpointReport, NewtonStepRecord, ImplicitMidpointNewtonOptions } from '../physics/implicitDiagnostics';
// Continuum sine-Gordon field: topological solitons (kink/breather), the
// nonlinear continuum limit of the coupled-pendulum lattice + the discrete
// Frenkel–Kontorova Peierls–Nabarro depinning barrier.
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
} from '../physics/sineGordon';
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
} from '../physics/sineGordon';
// Fermi–Pasta–Ulam–Tsingou anharmonic lattice (mode coupling, FPUT recurrence).
export {
  fputAcceleration,
  fputEnergy,
  fputModeFrequency,
  fputModeEnergies,
  createFputModeState,
  createFputVerletScratch,
  fputVelocityVerletStep,
  fputRecurrence
} from '../physics/fput';
export type { FputParameters, FputVerletScratch, FputRecurrenceResult } from '../physics/fput';

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
  EmbeddedSphericalPendulum,
  sphericalEmbeddedRhs,
  sphericalEmbeddedEnergy,
  sphericalEmbeddedLz,
  sphericalEmbeddedPosition,
  angleToEmbedded,
  embeddedToAngle
} from '../physics/sphericalEmbedded';
export type { EmbeddedSphericalState, EmbeddedSphericalDiagnostics } from '../physics/sphericalEmbedded';
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
  EmbeddedSphericalChain,
  createEmbeddedChainWorkspace,
  rhsEmbeddedChain,
  embeddedChainEnergy,
  embeddedChainLz,
  embeddedChainPositions,
  embeddedChainVelocities,
  angleChainToEmbedded,
  embeddedChainToAngle
} from '../physics/sphericalEmbeddedChain';
export type { EmbeddedChainParams, EmbeddedChainState, EmbeddedChainDiagnostics, EmbeddedChainWorkspace } from '../physics/sphericalEmbeddedChain';
// Chart verification: integrate the same chain through the polar AND embedded
// formulations and measure their positional agreement.
export { compareSphericalCharts } from '../physics/sphericalChartComparison';
export type { ChartComparisonOptions, ChartComparisonResult, ChartComparisonSample } from '../physics/sphericalChartComparison';
export {
  detectConservedQuantities,
  detectPlanarChainConservedQuantities,
  detectSphericalChainConservedQuantities,
  planarChainAngularMomentum,
  rotateSphericalChainState,
  sphericalChainAngularMomentum
} from '../physics/conservedQuantities';
export type { ConservedQuantityCandidate, ConservedQuantityOptions, ConservedQuantityReport } from '../physics/conservedQuantities';
