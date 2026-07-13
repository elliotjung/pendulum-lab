import type { EnergyBreakdown } from '../types/domain';
import type { StateVector } from './types';

/**
 * Duffing oscillator — the canonical forced, damped nonlinear oscillator and the
 * archetype of a particle in a smooth double-well. It is the small-system limit
 * of a MEMS/NEMS resonator (hardening/softening Duffing response) and, with a
 * negative linear term, the textbook bistable potential whose noise-activated
 * hopping is modelled by the Kramers escape rate (see `kramersEscape.ts`).
 *
 *   x'' + δ x' + α x + β x³ = γ cos(ω t)
 *
 * The drive is made autonomous by carrying the phase as a third coordinate
 * (φ' = ω), so the system integrates with any explicit solver without a
 * time-dependent RHS — the same device used by the driven pendulum.
 *
 * State layout: [x, v, φ] where v = x' and φ is the drive phase.
 *
 *   x' = v
 *   v' = -δ v - α x - β x³ + γ cos(φ)
 *   φ' = ω
 *
 * Potential (per unit mass): V(x) = ½ α x² + ¼ β x⁴.
 * For α < 0, β > 0 this is a symmetric double well with minima at
 * x* = ±√(-α/β), a barrier of height ΔV = α²/(4β) at the origin, well angular
 * frequency ω₀ = √(-2α) and (imaginary) barrier frequency ω_b = √(-α).
 */
export interface DuffingParameters {
  /** Linear viscous damping δ (≥ 0). Set 0 for the conservative oscillator. */
  damping: number;
  /** Linear stiffness α. Negative gives a double well; positive a single well. */
  linearStiffness: number;
  /** Cubic (Duffing) stiffness β. β > 0 confines; β < 0 softens. */
  cubicStiffness: number;
  /** Drive amplitude γ (≥ 0). Set 0 for the autonomous oscillator. */
  driveAmplitude: number;
  /** Drive angular frequency ω. */
  driveFrequency: number;
}

/**
 * A widely-studied chaotic parameter set for the (single-well) forced Duffing
 * oscillator: δ = 0.3, α = -1, β = 1, γ = 0.37, ω = 1.2 (Ueda-type attractor).
 */
export const DUFFING_CHAOS_PRESET: DuffingParameters = Object.freeze({
  damping: 0.3,
  linearStiffness: -1,
  cubicStiffness: 1,
  driveAmplitude: 0.37,
  driveFrequency: 1.2
});

export function rhsDuffing(state: ArrayLike<number>, parameters: DuffingParameters, out: StateVector): StateVector {
  const x = Number(state[0] ?? 0);
  const v = Number(state[1] ?? 0);
  const phi = Number(state[2] ?? 0);
  const { damping, linearStiffness, cubicStiffness, driveAmplitude, driveFrequency } = parameters;
  out[0] = v;
  out[1] = -damping * v - linearStiffness * x - cubicStiffness * x * x * x + driveAmplitude * Math.cos(phi);
  out[2] = driveFrequency;
  return out;
}

/** Duffing potential V(x) = ½ α x² + ¼ β x⁴ (per unit mass). */
export function duffingPotential(
  x: number,
  parameters: Pick<DuffingParameters, 'linearStiffness' | 'cubicStiffness'>
): number {
  const { linearStiffness, cubicStiffness } = parameters;
  return 0.5 * linearStiffness * x * x + 0.25 * cubicStiffness * x * x * x * x;
}

/**
 * Instantaneous mechanical energy E = ½ v² + V(x). For a driven and/or damped
 * Duffing oscillator this is deliberately NOT conserved — it is a diagnostic of
 * injection/dissipation. KE = ½ v²; PE = V(x) (the quartic well, which may be
 * negative for the double-well case).
 */
export function energyDuffing(state: ArrayLike<number>, parameters: DuffingParameters): EnergyBreakdown {
  const x = Number(state[0] ?? 0);
  const v = Number(state[1] ?? 0);
  const KE = 0.5 * v * v;
  const PE = duffingPotential(x, parameters);
  return { total: KE + PE, KE, PE };
}

/** Geometry of a symmetric Duffing double well (requires α < 0 and β > 0). */
export interface DuffingDoubleWell {
  /** Stable well centres x* = ±√(-α/β). */
  minima: readonly [number, number];
  /** Barrier height ΔV = α²/(4β) measured from a well bottom to the origin. */
  barrierHeight: number;
  /** Well angular frequency ω₀ = √(V''(x*)) = √(-2α). */
  wellFrequency: number;
  /** Barrier angular frequency ω_b = √(|V''(0)|) = √(-α). */
  barrierFrequency: number;
}

/**
 * Closed-form geometry of the symmetric double well, the ingredients of the
 * Kramers escape rate. Throws unless α < 0 and β > 0 (otherwise the potential is
 * not bistable). The curvatures follow from V''(x) = α + 3β x²: V''(0) = α < 0
 * (the barrier) and V''(x*) = -2α > 0 (each well).
 */
export function duffingDoubleWell(
  parameters: Pick<DuffingParameters, 'linearStiffness' | 'cubicStiffness'>
): DuffingDoubleWell {
  const { linearStiffness: alpha, cubicStiffness: beta } = parameters;
  if (!(alpha < 0) || !(beta > 0)) {
    throw new Error(`duffingDoubleWell: requires α < 0 and β > 0 for a double well (got α=${alpha}, β=${beta})`);
  }
  const xMin = Math.sqrt(-alpha / beta);
  return {
    minima: [-xMin, xMin],
    barrierHeight: (alpha * alpha) / (4 * beta),
    wellFrequency: Math.sqrt(-2 * alpha),
    barrierFrequency: Math.sqrt(-alpha)
  };
}
