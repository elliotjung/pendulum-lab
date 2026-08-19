import type { EnergyBreakdown, PendulumParameters } from '../types/domain';
import { energyDouble } from './double';
import { assertFiniteScalar, assertFiniteVector, assertPositiveFinite } from './errors';

export function energyTriple(state: ArrayLike<number>, parameters: PendulumParameters): EnergyBreakdown {
  assertFiniteVector(state, 6, 'energyTriple');
  for (const [label, value] of [
    ['m1', parameters.m1],
    ['m2', parameters.m2],
    ['m3', parameters.m3 ?? 1],
    ['l1', parameters.l1],
    ['l2', parameters.l2],
    ['l3', parameters.l3 ?? 1]
  ] as const) {
    assertPositiveFinite(value, label, 'energyTriple');
  }
  assertFiniteScalar(parameters.g, 'g', 'energyTriple');
  if (parameters.g < 0) throw new RangeError('energyTriple: g must be non-negative.');
  const p = {
    m1: parameters.m1,
    m2: parameters.m2,
    m3: parameters.m3 ?? 1,
    l1: parameters.l1,
    l2: parameters.l2,
    l3: parameters.l3 ?? 1,
    g: parameters.g
  };
  const t1 = Number(state[0] ?? 0);
  const t2 = Number(state[1] ?? 0);
  const t3 = Number(state[2] ?? 0);
  const w1 = Number(state[3] ?? 0);
  const w2 = Number(state[4] ?? 0);
  const w3 = Number(state[5] ?? 0);
  const py1 = -p.l1 * Math.cos(t1);
  const py2 = py1 - p.l2 * Math.cos(t2);
  const py3 = py2 - p.l3 * Math.cos(t3);
  const vx1 = p.l1 * Math.cos(t1) * w1;
  const vy1 = p.l1 * Math.sin(t1) * w1;
  const vx2 = vx1 + p.l2 * Math.cos(t2) * w2;
  const vy2 = vy1 + p.l2 * Math.sin(t2) * w2;
  const vx3 = vx2 + p.l3 * Math.cos(t3) * w3;
  const vy3 = vy2 + p.l3 * Math.sin(t3) * w3;
  const KE = 0.5 * (p.m1 * (vx1 * vx1 + vy1 * vy1) + p.m2 * (vx2 * vx2 + vy2 * vy2) + p.m3 * (vx3 * vx3 + vy3 * vy3));
  const PE = p.g * (p.m1 * py1 + p.m2 * py2 + p.m3 * py3);
  return { total: KE + PE, KE, PE };
}

export function relativeEnergyDrift(initial: EnergyBreakdown, current: EnergyBreakdown): number {
  if (![initial.total, current.total].every(Number.isFinite)) {
    throw new RangeError('relativeEnergyDrift: energies must be finite.');
  }
  return Math.abs((current.total - initial.total) / (Math.abs(initial.total) || 1));
}

export interface DissipatedWorkBalance {
  initialEnergy: number;
  currentEnergy: number;
  mechanicalEnergyChange: number;
  dissipatedWork: number;
  /** ΔE + W_diss; zero for an exactly integrated damped system. */
  balanceResidual: number;
  relativeBalanceError: number;
  elapsedTime: number;
  samples: number;
}

/** Generalised damping power γ Σ qdot_i² for the planar force-level convention. */
export function forceLevelDampingPower(state: ArrayLike<number>, gamma: number, coordinateCount: number): number {
  if (!Number.isSafeInteger(coordinateCount) || coordinateCount < 1 || state.length < 2 * coordinateCount) {
    throw new RangeError('forceLevelDampingPower: state must contain [q, qdot] for every coordinate.');
  }
  if (!Number.isFinite(gamma) || gamma < 0) {
    throw new RangeError('forceLevelDampingPower: gamma must be finite and non-negative.');
  }
  let speedSquared = 0;
  for (let i = 0; i < coordinateCount; i += 1) {
    const velocity = Number(state[coordinateCount + i]);
    if (!Number.isFinite(velocity)) throw new RangeError('forceLevelDampingPower: velocities must be finite.');
    speedSquared += velocity * velocity;
  }
  return gamma * speedSquared;
}

/**
 * Trapezoidal work accumulator for dissipative trajectories. This separates
 * physical mechanical-energy loss from numerical balance error, which a raw
 * conservative-run "energy drift" cannot do when damping is active.
 */
export class DissipatedWorkTracker {
  private dissipatedWorkValue = 0;
  private elapsedTimeValue = 0;
  private sampleCount = 0;

  constructor(
    private readonly initialEnergyValue: number,
    private readonly dissipatedPower: (state: ArrayLike<number>) => number
  ) {
    if (!Number.isFinite(initialEnergyValue))
      throw new RangeError('DissipatedWorkTracker: initial energy must be finite.');
  }

  acceptStep(previous: ArrayLike<number>, current: ArrayLike<number>, dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt))
      throw new RangeError('DissipatedWorkTracker: dt must be positive and finite.');
    const p0 = this.dissipatedPower(previous);
    const p1 = this.dissipatedPower(current);
    if (![p0, p1].every((value) => Number.isFinite(value) && value >= 0)) {
      throw new RangeError('DissipatedWorkTracker: dissipated power must be finite and non-negative.');
    }
    this.dissipatedWorkValue += 0.5 * dt * (p0 + p1);
    this.elapsedTimeValue += dt;
    this.sampleCount += 1;
  }

  report(currentEnergy: number): DissipatedWorkBalance {
    if (!Number.isFinite(currentEnergy)) throw new RangeError('DissipatedWorkTracker: current energy must be finite.');
    const mechanicalEnergyChange = currentEnergy - this.initialEnergyValue;
    const balanceResidual = mechanicalEnergyChange + this.dissipatedWorkValue;
    const scale = Math.max(Math.abs(this.initialEnergyValue), Math.abs(currentEnergy), this.dissipatedWorkValue, 1);
    return {
      initialEnergy: this.initialEnergyValue,
      currentEnergy,
      mechanicalEnergyChange,
      dissipatedWork: this.dissipatedWorkValue,
      balanceResidual,
      relativeBalanceError: Math.abs(balanceResidual) / scale,
      elapsedTime: this.elapsedTimeValue,
      samples: this.sampleCount
    };
  }
}

export { energyDouble };
