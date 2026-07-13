import type { PendulumParameters, SystemType } from '../types/domain';
import { energyDouble, energyTriple } from './energy';
import { rhsDouble } from './double';
import { rhsTriple } from './triple';
import { step } from './integrators';
import type { Derivative, PhysicsAdapter, StateVector, StepOptions } from './types';

function rhsTripleFallback(state: StateVector, parameters: PendulumParameters, gamma: number, out: StateVector): StateVector {
  const required = {
    m1: parameters.m1,
    m2: parameters.m2,
    m3: parameters.m3 ?? 1,
    l1: parameters.l1,
    l2: parameters.l2,
    l3: parameters.l3 ?? 1,
    g: parameters.g
  };
  return rhsTriple(state, required, gamma, out);
}

export const physicsAdapter: PhysicsAdapter = Object.freeze({
  derivative(system: SystemType, state: StateVector, parameters: PendulumParameters, gamma: number, out: StateVector): StateVector {
    if (system === 'triple') return rhsTripleFallback(state, parameters, gamma, out);
    if (system === 'double') return rhsDouble(state, parameters, gamma, out);
    throw new Error(`physicsAdapter.derivative: ${system} is not supported by the 2D Lab adapter; use a SystemSpec or dedicated physics module.`);
  },
  energy(system: SystemType, state: StateVector, parameters: PendulumParameters) {
    if (system === 'triple') return energyTriple(state, parameters);
    if (system === 'double') return energyDouble(state, parameters);
    throw new Error(`physicsAdapter.energy: ${system} is not supported by the 2D Lab adapter; use a SystemSpec or dedicated physics module.`);
  },
  step(method: import('../types/domain').IntegratorId, state: StateVector, dt: number, rhs: Derivative, out: StateVector, options?: StepOptions) {
    return step(method, state, dt, rhs, out, options);
  }
});

export { energyDouble, energyTriple, relativeEnergyDrift } from './energy';
export { integratorRegistry } from './integrators';
export { rhsDouble } from './double';
export { rhsTriple } from './triple';
export { rhsChain, energyChain, chainLength, chainMassMatrixDiagnostics, createChainWorkspace, validateChainParameters } from './nPendulum';
export type { ChainParameters, ChainWorkspace } from './nPendulum';
export {
  SphericalChain,
  createSphericalChainWorkspace,
  rhsSphericalChain,
  sphericalChainEnergy,
  sphericalChainLz,
  sphericalChainMassMatrixDiagnostics,
  sphericalChainPositions,
  sphericalChainVelocities,
  sphericalChainLength,
  validateSphericalChainParams
} from './sphericalChain';
export type { SphericalChainParams, SphericalChainDiagnostics, SphericalChainOptions, SphericalChainWorkspace } from './sphericalChain';
export { assertLinearSolve, choleskyFactor, choleskySolveFactored, solveCholeskyInPlace, solveLinearInPlace } from './linearSolve';
export type { CholeskyFactorResult, LinearSolveFailureReason, LinearSolveFallbackPolicy, LinearSolveOptions, LinearSolveResult } from './linearSolve';
export {
  jacobianChain,
  jacobianDriven,
  jacobianSphericalChain,
  createChainJacobianWorkspace,
  createSphericalChainJacobianWorkspace
} from './jacobians';
export type { ChainJacobianWorkspace, SphericalChainJacobianWorkspace } from './jacobians';
export { DualArena, dAdd, dAddScaled, dClampAbsMin, dConst, dCos, dDot3, dMul, dNeg, dScale, dSin, dSub, dVar } from './autodiff';
export type { DualScalar } from './autodiff';
export {
  MASS_MATRIX_SINGULARITY_THRESHOLD,
  SPHERICAL_POLE_EPS,
  SPHERICAL_CHAIN_POLE_EPS,
  FD_JACOBIAN_EPS,
  IMPLICIT_SOLVE_TOLERANCE
} from './constants';
export type { DampingConvention } from './constants';
export {
  detectConservedQuantities,
  detectPlanarChainConservedQuantities,
  detectSphericalChainConservedQuantities,
  planarChainAngularMomentum,
  rotateSphericalChainState,
  sphericalChainAngularMomentum
} from './conservedQuantities';
export type { ConservedQuantityCandidate, ConservedQuantityOptions, ConservedQuantityReport } from './conservedQuantities';
export { rhsDriven, energyDriven, DAMPED_DRIVEN_CHAOS_PRESET } from './driven';
export type { DrivenParameters } from './driven';
export { rhsSpring, energySpring } from './spring';
export type { SpringPendulumParameters } from './spring';
export { rhsDuffing, energyDuffing, duffingPotential, duffingDoubleWell, DUFFING_CHAOS_PRESET } from './duffing';
export type { DuffingParameters, DuffingDoubleWell } from './duffing';
export { rhsVanDerPol, energyVanDerPol, vanDerPolPeriodEstimate } from './vanDerPol';
export type { VanDerPolParameters } from './vanDerPol';
export {
  rhsKapitza,
  energyKapitza,
  kapitzaEffectivePotential,
  kapitzaInvertedStable,
  kapitzaInvertedFrequency,
  KAPITZA_INVERTED_PRESET
} from './kapitza';
export type { KapitzaParameters } from './kapitza';
export {
  rhsMagneticPendulum,
  magneticPendulumEnergy,
  nearestMagnetIndex,
  magneticPendulumSettle,
  magneticPendulumBasinGrid,
  THREE_MAGNET_PRESET
} from './magneticPendulum';
export type { MagneticPendulumParameters, MagnetSpec, MagneticSettleResult, MagneticSettleOptions, MagneticBasinGridOptions, MagneticBasinGrid } from './magneticPendulum';
export {
  kramersRateOverdamped,
  kramersMeanFirstPassage,
  duffingKramersRate,
  arrheniusMTTF,
  simulateQuarticEscape
} from './kramersEscape';
export type { OverdampedRateSpec, QuarticEscapeSpec, QuarticEscapeResult } from './kramersEscape';
export {
  diatomicDispersion,
  diatomicBandGap,
  diatomicDispersionCurve,
  acousticSoundSpeed,
  diatomicGroupVelocity
} from './latticeDispersion';
export type { DiatomicChainParams, DispersionBranches, DiatomicBandGap, DispersionSample } from './latticeDispersion';
export { implicitMidpointNewton } from './implicitDiagnostics';
export type { ImplicitMidpointReport, NewtonStepRecord, ImplicitMidpointNewtonOptions } from './implicitDiagnostics';
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
} from './sineGordon';
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
} from './sineGordon';
export {
  fputAcceleration,
  fputEnergy,
  fputModeFrequency,
  fputModeEnergies,
  createFputModeState,
  createFputVerletScratch,
  fputVelocityVerletStep,
  fputRecurrence
} from './fput';
export type { FputParameters, FputVerletScratch, FputRecurrenceResult } from './fput';
export {
  rhsPendulumNetwork,
  pendulumNetworkEnergy,
  pendulumNetworkStiffnessMatrix,
  ringPhononDispersion,
  buildCouplingMatrix,
  ringCouplingMatrix,
  networkSize,
  validatePendulumNetworkParameters
} from './pendulumNetwork';
export type { PendulumNetworkParameters, NetworkEdge } from './pendulumNetwork';
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
} from './kuramoto';
export type { KuramotoNetworkParameters, PhaseOrderParameter, HuygensPhasePairParameters } from './kuramoto';
export { smoothFrictionSign, coulombFrictionForce, stribeckFrictionMagnitude, stribeckFrictionForce, applyStribeckFriction } from './friction';
export type { RegularizedCoulombFriction, StribeckFrictionParameters } from './friction';
export { pyragasFeedback, rhsPyragasPendulum, integratePyragasPendulumDde } from './pyragasDde';
export type { PyragasPendulumParameters, PyragasHistory, PyragasDdeOptions, PyragasDdeResult } from './pyragasDde';
export { stochasticResonanceResponse, stochasticResonanceCurve } from './stochasticResonance';
export type { BistableSrParameters, SrResponse } from './stochasticResonance';
export { RopePendulum } from './rope';
export type { RopeParams, RopePhase, RopeStateSnapshot, RopeEvent } from './rope';
export { DoubleStringPendulum, doubleStringEnergy, doubleStringTensions } from './doubleString';
export type { DoubleStringEvent, DoubleStringParams, DoubleStringPhase, DoubleStringSnapshot } from './doubleString';
export * from './canonical';
export {
  step,
  rk4Step,
  rk2Step,
  eulerStep,
  implicitMidpointStep,
  symplecticEulerStep,
  leapfrogStep,
  yoshida4Step,
  yoshida6Step,
  yoshida8Step,
  rkf45Step,
  dop853Step,
  gaussLegendre4Step,
  gaussLegendre6Step
} from './integrators';
export {
  dormandPrince54Step,
  dormandPrince54StepDense,
  bulirschStoerStep,
  adaptiveStep,
  integrateAdaptive,
  richardsonStep,
  createStepController
} from './adaptive';
export type { DenseStepResult, StepController, StepControllerCoefficients, StepControllerKind } from './adaptive';
export { refineCrossing, locateTransition } from './eventLocator';
export type { RefineOptions, RefinedCrossing } from './eventLocator';
export { trBdf2Step } from './stiff';
export { detectEvents } from './events';
export type {
  EventFunction,
  CrossingDirection,
  EventSpec,
  EventHit,
  EventSolveOptions,
  EventSolveResult
} from './events';
export type {
  EmbeddedStepResult,
  AdaptiveControllerOptions,
  AdaptiveStepOutcome,
  FixedStepper
} from './adaptive';
export type { Derivative, IntegratorMeta, PhysicsAdapter, StateVector, StepOptions } from './types';
export {
  DEFAULT_EXPANSION_METHODS,
  EXPANSION_MODEL_DEFINITIONS,
  EXPANSION_MODEL_IDS,
  EXPANSION_PRESETS,
  GOLDEN_EXPANSION_PRESET_IDS,
  GOLDEN_REGRESSION_BASELINES,
  buildExpansionReport,
  configFromPreset,
  createExpansionSystem,
  expansionLyapunovProfile,
  expansionPreset,
  expansionModelDefinition,
  parseExpansionShareHash,
  runGoldenExpansionCenter,
  runExpansionBatch,
  runGoldenExpansionChecks,
  runResearchMatrixStudy,
  runExpansionSuite,
  stableExperimentHash
} from './expandedModels';
export type {
  BatchExperimentResult,
  ExpansionBasinCell,
  ExpansionBifurcationColumn,
  ExpansionDimensionlessMetric,
  ExpansionEnergyCell,
  ExpansionGhostFrame,
  ExpansionHeatmap,
  ExpansionLyapunovProfile,
  ExpansionLyapunovProfiler,
  ExpansionLyapunovTimelinePoint,
  ExpansionMatrixCell,
  ExpansionMethodResult,
  ExpansionModelDefinition,
  ExpansionModelId,
  ExpansionParameterMap,
  ExpansionPoincarePoint,
  ExpansionPoint,
  ExpansionPreset,
  ExpansionResearchMatrixResult,
  ExpansionSweepAxis,
  ExpansionSuiteConfig,
  ExpansionSuiteResult,
  ExpansionTrajectorySample,
  GoldenCenterMethodResult,
  GoldenCenterPresetResult,
  GoldenCenterResult,
  GoldenExperimentResult
} from './expandedModels';
