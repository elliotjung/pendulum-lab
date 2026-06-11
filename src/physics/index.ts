import type { PendulumParameters, SystemType } from '../types/domain';
import { energyDouble, energyTriple } from './energy';
import { rhsDouble } from './double';
import { rhsTriple } from './triple';
import { integratorRegistry, step } from './integrators';
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
export { rhsChain, energyChain, chainLength, createChainWorkspace, validateChainParameters } from './nPendulum';
export type { ChainParameters, ChainWorkspace } from './nPendulum';
export {
  SphericalChain,
  createSphericalChainWorkspace,
  rhsSphericalChain,
  sphericalChainEnergy,
  sphericalChainLz,
  sphericalChainPositions,
  sphericalChainVelocities,
  sphericalChainLength,
  validateSphericalChainParams
} from './sphericalChain';
export type { SphericalChainParams, SphericalChainDiagnostics, SphericalChainOptions, SphericalChainWorkspace } from './sphericalChain';
export { assertLinearSolve, solveLinearInPlace } from './linearSolve';
export type { LinearSolveFailureReason, LinearSolveOptions, LinearSolveResult } from './linearSolve';
export { rhsDriven, energyDriven, DAMPED_DRIVEN_CHAOS_PRESET } from './driven';
export type { DrivenParameters } from './driven';
export { rhsSpring, energySpring } from './spring';
export type { SpringPendulumParameters } from './spring';
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
  rkf45Step,
  gaussLegendre4Step,
  gaussLegendre6Step
} from './integrators';
export {
  dormandPrince54Step,
  bulirschStoerStep,
  adaptiveStep,
  integrateAdaptive,
  richardsonStep
} from './adaptive';
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
