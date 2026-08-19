import type { EnergyBreakdown } from '../types/domain';
import type { StateVector } from './types';
import { PhysicsEvaluationError, assertFiniteVector, assertNonNegativeFinite, assertOutputVector } from './errors';

/**
 * Van der Pol oscillator — the archetypal self-sustained (limit-cycle)
 * oscillator and the canonical example of a supercritical Hopf/relaxation
 * transition. Originally a model of a triode vacuum-tube circuit, it is the
 * nonlinear-dynamics companion to the invariant-circle continuation in
 * `chaos/neimarkSacker.ts`: its forced version mode-locks on the Arnold tongues
 * computed in `chaos/arnoldTongue.ts`.
 *
 *   x'' - μ(1 - x²) x' + x = 0
 *
 * State layout: [x, v] with v = x'.
 *
 *   x' = v
 *   v' = μ(1 - x²) v - x
 *
 * The single attracting limit cycle has amplitude → 2 and period → 2π as μ → 0
 * (quasi-harmonic), crossing over to slow–fast relaxation oscillations of
 * period ≈ (3 - 2ln2)·μ as μ → ∞. The "energy" E = ½(x² + v²) is reported as a
 * diagnostic only: dE/dt = μ(1 - x²) v² pumps energy in for |x| < 1 and removes
 * it for |x| > 1, which is exactly what sustains the cycle.
 */
export interface VanDerPolParameters {
  /** Nonlinearity / damping strength μ (≥ 0). μ = 0 is the harmonic oscillator. */
  mu: number;
}

function validateVanDerPolParameters(parameters: VanDerPolParameters, operation: string): void {
  assertNonNegativeFinite(parameters.mu, 'mu', operation);
}

function assertFiniteVanDerPolResult(values: readonly number[], operation: string): void {
  if (!values.every(Number.isFinite)) {
    throw new PhysicsEvaluationError('NON_FINITE_INPUT', `${operation}: result overflowed`, {
      operation,
      retryable: false,
      suggestedAction: 'Reduce the state magnitude or reduce mu.'
    });
  }
}

export function rhsVanDerPol(state: ArrayLike<number>, parameters: VanDerPolParameters, out: StateVector): StateVector {
  assertFiniteVector(state, 2, 'rhsVanDerPol');
  assertOutputVector(out, 2, 'rhsVanDerPol');
  validateVanDerPolParameters(parameters, 'rhsVanDerPol');
  const x = Number(state[0] ?? 0);
  const v = Number(state[1] ?? 0);
  const { mu } = parameters;
  const acceleration = mu * (1 - x * x) * v - x;
  assertFiniteVanDerPolResult([v, acceleration], 'rhsVanDerPol');
  out[0] = v;
  out[1] = acceleration;
  return out;
}

/**
 * Harmonic-core energy E = ½(x² + v²), a diagnostic for the limit-cycle balance
 * (NOT a conserved quantity unless μ = 0). KE = ½v², PE = ½x².
 */
export function energyVanDerPol(state: ArrayLike<number>, _parameters: VanDerPolParameters): EnergyBreakdown {
  assertFiniteVector(state, 2, 'energyVanDerPol');
  validateVanDerPolParameters(_parameters, 'energyVanDerPol');
  const x = Number(state[0] ?? 0);
  const v = Number(state[1] ?? 0);
  const KE = 0.5 * v * v;
  const PE = 0.5 * x * x;
  const total = KE + PE;
  assertFiniteVanDerPolResult([KE, PE, total], 'energyVanDerPol');
  return { total, KE, PE };
}

/**
 * Leading-order period of the Van der Pol limit cycle. For small μ the cycle is
 * quasi-harmonic with period 2π(1 + μ²/16 + O(μ⁴)); for large μ it relaxes with
 * period (3 - 2 ln 2)·μ + O(μ^(-1/3)). This returns the appropriate asymptotic
 * estimate and is meant for orientation, not as a high-accuracy value at μ ~ 1.
 */
export function vanDerPolPeriodEstimate(mu: number): number {
  assertNonNegativeFinite(mu, 'mu', 'vanDerPolPeriodEstimate');
  const period = mu <= 1 ? 2 * Math.PI * (1 + (mu * mu) / 16) : (3 - 2 * Math.LN2) * mu;
  assertFiniteVanDerPolResult([period], 'vanDerPolPeriodEstimate');
  return period;
}
