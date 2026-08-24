import type { PendulumParameters } from '../types/domain';
import { canonicalRhs, momentumToOmega, omegaToMomentum } from '../physics/canonical';
import { createDoublePendulumDerivative, energyDouble } from '../physics/double';
import { rk4Step } from '../physics/integrators';
import type { Derivative, StateVector } from '../physics/types';

export interface FormulationComparisonInput {
  parameters: PendulumParameters;
  initialState: ArrayLike<number>;
  /** Fixed step shared by both formulations. */
  dt: number;
  /** Short comparison horizon. Long chaotic agreement is intentionally not claimed. */
  horizon: number;
  gamma?: number;
  /** Named review envelope; both paths still share the same fixed RK4 step. */
  comparisonPolicy?: FormulationComparisonPolicy;
}

export type FormulationComparisonPolicy = 'interactive' | 'reference';

export interface FormulationComparisonResult {
  policy: 'shared-fixed-rk4';
  comparisonPolicy: FormulationComparisonPolicy;
  policyToleranceCeiling: number;
  steps: number;
  simulatedTime: number;
  maxAngleDifference: readonly [number, number];
  maxPositionDifference: number;
  maxEnergyDifference: number;
  maxRelativeEnergyChange: readonly [number, number];
  /** Largest angle, length-normalized position, or energy-normalized mismatch. */
  maxNormalizedMismatch: number;
  comparisonTolerance: number;
  finalThetaOmega: Float64Array;
  /** Final canonical state in the native [q1, q2, p1, p2] representation. */
  finalCanonical: Float64Array;
  finalCanonicalAsThetaOmega: Float64Array;
  verdict: 'agreement' | 'review';
  caveat: string;
}

const MAX_STEPS = 250_000;
const POLICY_TOLERANCE_CEILINGS: Readonly<Record<FormulationComparisonPolicy, number>> = Object.freeze({
  interactive: 5e-5,
  reference: 1e-7
});

function finitePositive(value: number, label: string): number {
  if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`${label} must be positive and finite.`);
  return value;
}

function normalizedAngleDifference(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function maxBobPositionDifference(a: ArrayLike<number>, b: ArrayLike<number>, p: PendulumParameters): number {
  const a1x = p.l1 * Math.sin(Number(a[0] ?? 0));
  const a1y = -p.l1 * Math.cos(Number(a[0] ?? 0));
  const b1x = p.l1 * Math.sin(Number(b[0] ?? 0));
  const b1y = -p.l1 * Math.cos(Number(b[0] ?? 0));
  const a2x = a1x + p.l2 * Math.sin(Number(a[1] ?? 0));
  const a2y = a1y - p.l2 * Math.cos(Number(a[1] ?? 0));
  const b2x = b1x + p.l2 * Math.sin(Number(b[1] ?? 0));
  const b2y = b1y - p.l2 * Math.cos(Number(b[1] ?? 0));
  return Math.max(Math.hypot(a1x - b1x, a1y - b1y), Math.hypot(a2x - b2x, a2y - b2y));
}

/**
 * Compare the theta/omega Euler-Lagrange RHS with the canonical Hamiltonian RHS.
 * Both paths use the same fixed RK4 step and the same parameters/initial state,
 * so the result isolates formulation/coordinate effects rather than an
 * integrator-policy mismatch.
 */
export function compareDoublePendulumFormulations(input: FormulationComparisonInput): FormulationComparisonResult {
  const dt = finitePositive(input.dt, 'dt');
  const horizon = finitePositive(input.horizon, 'horizon');
  const gamma = input.gamma ?? 0;
  if (!Number.isFinite(gamma) || gamma < 0) throw new RangeError('gamma must be finite and non-negative.');
  if (input.initialState.length < 4) throw new RangeError('initialState must contain theta1, theta2, omega1, omega2.');
  const comparisonPolicy = input.comparisonPolicy ?? 'interactive';
  if (comparisonPolicy !== 'interactive' && comparisonPolicy !== 'reference') {
    throw new RangeError('comparisonPolicy must be interactive or reference.');
  }

  const steps = Math.max(1, Math.ceil(horizon / dt));
  if (steps > MAX_STEPS)
    throw new RangeError(`comparison exceeds the ${MAX_STEPS.toLocaleString()}-step safety budget.`);
  const stepDt = horizon / steps;
  let thetaOmega: StateVector = Float64Array.from(input.initialState).slice(0, 4);
  let canonical: StateVector = omegaToMomentum(thetaOmega, input.parameters);
  let nextThetaOmega: StateVector = new Float64Array(4);
  let nextCanonical: StateVector = new Float64Array(4);
  const canonicalAsThetaOmega = new Float64Array(4);
  const thetaRhs = createDoublePendulumDerivative(input.parameters, gamma);
  const canonicalDerivative: Derivative = (state, out): void => {
    out.set(canonicalRhs(state, input.parameters, gamma));
  };
  const initialEnergy = energyDouble(thetaOmega, input.parameters).total;
  const lengthScale = Math.max(Number.EPSILON, Math.abs(input.parameters.l1) + Math.abs(input.parameters.l2));
  const gravitationalEnergyScale =
    (Math.abs(input.parameters.m1) + Math.abs(input.parameters.m2)) *
      Math.abs(input.parameters.g * input.parameters.l1) +
    Math.abs(input.parameters.m2 * input.parameters.g * input.parameters.l2);
  const energyScale = Math.max(Number.EPSILON, Math.abs(initialEnergy), gravitationalEnergyScale);
  const maxAngleDifference: [number, number] = [0, 0];
  const maxRelativeEnergyChange: [number, number] = [0, 0];
  let maxPositionDifference = 0;
  let maxEnergyDifference = 0;

  for (let index = 0; index < steps; index += 1) {
    rk4Step(thetaOmega, stepDt, thetaRhs, nextThetaOmega);
    rk4Step(canonical, stepDt, canonicalDerivative, nextCanonical);
    [thetaOmega, nextThetaOmega] = [nextThetaOmega, thetaOmega];
    [canonical, nextCanonical] = [nextCanonical, canonical];
    momentumToOmega(canonical, input.parameters, canonicalAsThetaOmega);

    maxAngleDifference[0] = Math.max(
      maxAngleDifference[0],
      normalizedAngleDifference(thetaOmega[0]!, canonicalAsThetaOmega[0]!)
    );
    maxAngleDifference[1] = Math.max(
      maxAngleDifference[1],
      normalizedAngleDifference(thetaOmega[1]!, canonicalAsThetaOmega[1]!)
    );
    maxPositionDifference = Math.max(
      maxPositionDifference,
      maxBobPositionDifference(thetaOmega, canonicalAsThetaOmega, input.parameters)
    );
    const thetaEnergy = energyDouble(thetaOmega, input.parameters).total;
    const canonicalEnergy = energyDouble(canonicalAsThetaOmega, input.parameters).total;
    maxEnergyDifference = Math.max(maxEnergyDifference, Math.abs(thetaEnergy - canonicalEnergy));
    maxRelativeEnergyChange[0] = Math.max(
      maxRelativeEnergyChange[0],
      Math.abs(thetaEnergy - initialEnergy) / energyScale
    );
    maxRelativeEnergyChange[1] = Math.max(
      maxRelativeEnergyChange[1],
      Math.abs(canonicalEnergy - initialEnergy) / energyScale
    );
  }

  const policyToleranceCeiling = POLICY_TOLERANCE_CEILINGS[comparisonPolicy];
  const scaledTolerance = Math.max(5e-8, 40 * stepDt ** 4 * Math.max(1, horizon));
  const comparisonTolerance = Math.min(policyToleranceCeiling, scaledTolerance);
  const maxNormalizedMismatch = Math.max(
    maxAngleDifference[0],
    maxAngleDifference[1],
    maxPositionDifference / lengthScale,
    maxEnergyDifference / energyScale
  );
  const verdict = maxNormalizedMismatch <= comparisonTolerance ? 'agreement' : 'review';

  return {
    policy: 'shared-fixed-rk4',
    comparisonPolicy,
    policyToleranceCeiling,
    steps,
    simulatedTime: horizon,
    maxAngleDifference,
    maxPositionDifference,
    maxEnergyDifference,
    maxRelativeEnergyChange,
    maxNormalizedMismatch,
    comparisonTolerance,
    finalThetaOmega: Float64Array.from(thetaOmega),
    finalCanonical: Float64Array.from(canonical),
    finalCanonicalAsThetaOmega: Float64Array.from(canonicalAsThetaOmega),
    verdict,
    caveat:
      'Short-horizon agreement checks two equivalent state representations under one RK4 policy. It is not a claim that long chaotic trajectories remain pointwise identical.'
  };
}
