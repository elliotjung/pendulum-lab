import type { EnergyBreakdown } from '../types/domain';
import type { StateVector } from './types';
import {
  PhysicsEvaluationError,
  assertFiniteScalar,
  assertFiniteVector,
  assertNonNegativeFinite,
  assertOutputVector,
  assertPositiveFinite
} from './errors';

/**
 * Kapitza pendulum — a rigid pendulum whose pivot is driven vertically at high
 * frequency, y_pivot(t) = a cos(Ω t). Its celebrated feature is *dynamic
 * stabilization*: for a fast enough drive the normally-unstable inverted
 * equilibrium (θ = π) becomes stable, sitting at the bottom of a fast-drive
 * *effective* potential. It is the mechanical archetype of stabilization by a
 * rapidly oscillating field (Paul-trap / ponderomotive confinement), which is
 * why it is on-theme for a device-physics portfolio.
 *
 * Angle θ is measured from the downward vertical. The exact (non-averaged)
 * equation of motion, with the drive made autonomous via the phase φ' = Ω, is
 *
 *   θ'' = -((g - a Ω² cos φ) / l) sin θ - γ θ'
 *
 * which follows from the Euler–Lagrange equation θ'' = -((g + ÿ_pivot)/l) sinθ
 * with ÿ_pivot = -a Ω² cos(Ω t).
 *
 * State layout: [θ, θ̇, φ].
 *
 * Averaging over the fast drive yields the effective acceleration potential
 *   Φ_eff(θ) = -(g/l) cos θ + (a² Ω²)/(4 l²) sin² θ,   θ''_slow = -dΦ_eff/dθ,
 * whose curvature at θ = π is (a²Ω²)/(2l²) - g/l > 0 exactly when
 *   a² Ω² > 2 g l   (the inverted-stabilization criterion).
 */
export interface KapitzaParameters {
  /** Gravity g (> 0). */
  g: number;
  /** Rod length l (> 0). */
  length: number;
  /** Pivot drive amplitude a (≥ 0). */
  driveAmplitude: number;
  /** Pivot drive angular frequency Ω. */
  driveFrequency: number;
  /** Linear (rate) damping γ (≥ 0). */
  damping: number;
}

/** A drive comfortably above the inverted-stabilization threshold for g=l=1. */
export const KAPITZA_INVERTED_PRESET: KapitzaParameters = Object.freeze({
  g: 9.81,
  length: 1,
  driveAmplitude: 0.2,
  driveFrequency: 30,
  damping: 0
});

function validateKapitzaParameters(parameters: KapitzaParameters, operation: string): void {
  assertPositiveFinite(parameters.g, 'g', operation);
  assertPositiveFinite(parameters.length, 'length', operation);
  assertNonNegativeFinite(parameters.driveAmplitude, 'driveAmplitude', operation);
  assertFiniteScalar(parameters.driveFrequency, 'driveFrequency', operation);
  assertNonNegativeFinite(parameters.damping, 'damping', operation);
}

function assertFiniteKapitzaResult(values: readonly number[], operation: string): void {
  if (!values.every(Number.isFinite)) {
    throw new PhysicsEvaluationError('NON_FINITE_INPUT', `${operation}: result overflowed`, {
      operation,
      retryable: false,
      suggestedAction: 'Reduce the state magnitude or rescale the drive parameters.'
    });
  }
}

export function rhsKapitza(state: ArrayLike<number>, parameters: KapitzaParameters, out: StateVector): StateVector {
  assertFiniteVector(state, 3, 'rhsKapitza');
  assertOutputVector(out, 3, 'rhsKapitza');
  validateKapitzaParameters(parameters, 'rhsKapitza');
  const theta = Number(state[0] ?? 0);
  const thetaDot = Number(state[1] ?? 0);
  const phi = Number(state[2] ?? 0);
  const { g, length, driveAmplitude, driveFrequency, damping } = parameters;
  const effectiveG = g - driveAmplitude * driveFrequency * driveFrequency * Math.cos(phi);
  const acceleration = -(effectiveG / length) * Math.sin(theta) - damping * thetaDot;
  assertFiniteKapitzaResult([thetaDot, effectiveG, acceleration, driveFrequency], 'rhsKapitza');
  out[0] = thetaDot;
  out[1] = acceleration;
  out[2] = driveFrequency;
  return out;
}

/**
 * Internal bob energy E = ½ l² θ̇² - g l cos θ (unit mass), relative to the
 * pivot. A driven system, so this is a diagnostic of energy exchange with the
 * shaker, not a conserved quantity.
 */
export function energyKapitza(state: ArrayLike<number>, parameters: KapitzaParameters): EnergyBreakdown {
  assertFiniteVector(state, 2, 'energyKapitza');
  validateKapitzaParameters(parameters, 'energyKapitza');
  const theta = Number(state[0] ?? 0);
  const thetaDot = Number(state[1] ?? 0);
  const { g, length } = parameters;
  const KE = 0.5 * length * length * thetaDot * thetaDot;
  const PE = -g * length * Math.cos(theta);
  const total = KE + PE;
  assertFiniteKapitzaResult([KE, PE, total], 'energyKapitza');
  return { total, KE, PE };
}

/**
 * Effective (fast-drive-averaged) acceleration potential
 * Φ_eff(θ) = -(g/l) cos θ + (a² Ω²)/(4 l²) sin² θ, with units of 1/time² such
 * that the slow dynamics is θ''_slow = -dΦ_eff/dθ.
 */
export function kapitzaEffectivePotential(theta: number, parameters: KapitzaParameters): number {
  assertFiniteScalar(theta, 'theta', 'kapitzaEffectivePotential');
  validateKapitzaParameters(parameters, 'kapitzaEffectivePotential');
  const { g, length, driveAmplitude, driveFrequency } = parameters;
  const aOmega = driveAmplitude * driveFrequency;
  const potential =
    -(g / length) * Math.cos(theta) + ((aOmega * aOmega) / (4 * length * length)) * Math.sin(theta) * Math.sin(theta);
  assertFiniteKapitzaResult([aOmega, potential], 'kapitzaEffectivePotential');
  return potential;
}

/** True iff the inverted equilibrium θ = π is dynamically stable: a² Ω² > 2 g l. */
export function kapitzaInvertedStable(parameters: KapitzaParameters): boolean {
  validateKapitzaParameters(parameters, 'kapitzaInvertedStable');
  const { g, length, driveAmplitude, driveFrequency } = parameters;
  const aOmega = driveAmplitude * driveFrequency;
  return aOmega * aOmega > 2 * g * length;
}

/**
 * Small-oscillation angular frequency of the slow motion about the *inverted*
 * equilibrium, ω = √((a²Ω²)/(2l²) - g/l). Throws unless the inverted state is
 * stable (otherwise the effective curvature is non-positive).
 */
export function kapitzaInvertedFrequency(parameters: KapitzaParameters): number {
  validateKapitzaParameters(parameters, 'kapitzaInvertedFrequency');
  if (!kapitzaInvertedStable(parameters)) {
    throw new Error('kapitzaInvertedFrequency: inverted equilibrium is not stable (need a²Ω² > 2gl)');
  }
  const { g, length, driveAmplitude, driveFrequency } = parameters;
  const aOmega = driveAmplitude * driveFrequency;
  const frequency = Math.sqrt((aOmega * aOmega) / (2 * length * length) - g / length);
  assertFiniteKapitzaResult([frequency], 'kapitzaInvertedFrequency');
  return frequency;
}
