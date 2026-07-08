import type { IntegratorId, PendulumParameters, SystemType } from '../types/domain';
import { physicsAdapter } from '../physics';
import type { Derivative, StateVector } from '../physics/types';

/**
 * Headless simulation core for the Lab tab. It owns the integration state and
 * drives the typed physics engine (`physicsAdapter`) — the same tested
 * integrators used everywhere else — so the modern Lab is byte-for-byte
 * consistent with the engine rather than carrying its own copy of the physics.
 *
 * State layout matches the engine: double = [θ1, θ2, ω1, ω2], triple = [θ1, θ2,
 * θ3, ω1, ω2, ω3]. Positions are reported in physical metres with the pivot at
 * the origin and +y pointing down (gravity), which the renderer maps to pixels.
 */

export interface LabConfig {
  system: SystemType;
  parameters: PendulumParameters;
  /** Linear damping γ. γ>0 makes the system dissipative (energy is not conserved). */
  gamma: number;
  method: IntegratorId;
  dt: number;
  /** Initial [θ1, θ2, (θ3), ω1, ω2, (ω3)]. Missing entries default to 0. */
  initialState: readonly number[];
  /** Optional solver tolerance forwarded to implicit/adaptive integrators. */
  tolerance?: number;
}

export interface BobPosition {
  x: number;
  y: number;
}

export interface LabSnapshot {
  time: number;
  state: readonly number[];
  energy: number;
  /** Relative energy drift |E − E₀| / |E₀| (a diagnostic, not valid under γ>0). */
  drift: number;
  /** Final implicit/adaptive solver residual, when the method reports one. */
  residual: number;
  bobs: BobPosition[];
}

const DOUBLE_DIM = 4;
const TRIPLE_DIM = 6;

export class LabSimulation {
  readonly config: LabConfig;
  readonly initialEnergy: number;
  time = 0;

  private readonly dim: number;
  private readonly rhs: Derivative;
  private readonly residualBox = { value: 0 };
  private state: StateVector;
  private scratch: StateVector;

  constructor(config: LabConfig) {
    this.config = config;
    this.dim = config.system === 'triple' ? TRIPLE_DIM : DOUBLE_DIM;
    this.state = new Float64Array(this.dim);
    this.scratch = new Float64Array(this.dim);
    for (let i = 0; i < this.dim; i += 1) this.state[i] = config.initialState[i] ?? 0;
    this.rhs = (s, out) => physicsAdapter.derivative(config.system, s, config.parameters, config.gamma, out);
    this.initialEnergy = this.energy();
  }

  /** Advance `steps` fixed steps of size `config.dt`. */
  step(steps = 1): void {
    const { method, dt, tolerance } = this.config;
    const options = { previousError: this.residualBox, ...(tolerance === undefined ? {} : { tolerance }) };
    for (let s = 0; s < steps; s += 1) {
      physicsAdapter.step(method, this.state, dt, this.rhs, this.scratch, options);
      // Swap in the freshly written buffer; reuse the old one as next scratch.
      const previous = this.state;
      this.state = this.scratch;
      this.scratch = previous;
      this.time += dt;
    }
  }

  energy(): number {
    return physicsAdapter.energy(this.config.system, this.state, this.config.parameters).total;
  }

  /** Relative energy drift since t=0. Only physically meaningful when γ=0. */
  drift(): number {
    return this.driftForEnergy(this.energy());
  }

  driftForEnergy(energy: number): number {
    const e0 = this.initialEnergy;
    return Math.abs((energy - e0) / (Math.abs(e0) || 1));
  }

  residual(): number {
    return this.residualBox.value;
  }

  getState(): number[] {
    return Array.from(this.state);
  }

  stateView(): Readonly<StateVector> {
    return this.state;
  }

  copyState(): number[] {
    return Array.from(this.state);
  }

  /** Cartesian bob positions in metres (pivot at origin, +y down). */
  bobPositionsMeters(): BobPosition[] {
    return this.bobPositionsInto([]);
  }

  bobPositionsInto(out: BobPosition[]): BobPosition[] {
    const { l1, l2, l3 } = this.config.parameters;
    const s = this.state;
    const x1 = l1 * Math.sin(s[0]!);
    const y1 = l1 * Math.cos(s[0]!);
    const x2 = x1 + l2 * Math.sin(s[1]!);
    const y2 = y1 + l2 * Math.cos(s[1]!);
    const b1 = out[0] ?? { x: 0, y: 0 };
    const b2 = out[1] ?? { x: 0, y: 0 };
    b1.x = x1;
    b1.y = y1;
    b2.x = x2;
    b2.y = y2;
    out[0] = b1;
    out[1] = b2;
    if (this.config.system === 'triple') {
      const ell3 = l3 ?? 1;
      const x3 = x2 + ell3 * Math.sin(s[2]!);
      const y3 = y2 + ell3 * Math.cos(s[2]!);
      const b3 = out[2] ?? { x: 0, y: 0 };
      b3.x = x3;
      b3.y = y3;
      out[2] = b3;
      out.length = 3;
      return out;
    }
    out.length = 2;
    return out;
  }

  snapshot(): LabSnapshot {
    return {
      time: this.time,
      state: this.getState(),
      energy: this.energy(),
      drift: this.drift(),
      residual: this.residual(),
      bobs: this.bobPositionsMeters()
    };
  }
}
