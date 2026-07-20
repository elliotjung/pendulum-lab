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
const MAX_STEPS_PER_CALL = 1_000_000;
const SUPPORTED_METHODS = new Set<IntegratorId>([
  'euler',
  'rk2',
  'rk4',
  'verlet',
  'leapfrog',
  'symplectic',
  'yoshida4',
  'yoshida6',
  'yoshida8',
  'hmidpoint',
  'gauss2',
  'rkf45',
  'dopri5',
  'dop853',
  'gbs',
  'bdf2'
]);

function finite(name: string, value: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
}

function positive(name: string, value: number): number {
  finite(name, value);
  if (value <= 0) throw new RangeError(`${name} must be greater than zero`);
  return value;
}

function validatedConfig(config: LabConfig): LabConfig {
  if (config.system !== 'double' && config.system !== 'triple') {
    throw new RangeError('LabSimulation supports only double and triple pendulum systems');
  }
  if (!SUPPORTED_METHODS.has(config.method)) throw new RangeError('LabSimulation integrator is unsupported');
  const dt = positive('dt', config.dt);
  if (dt > 1) throw new RangeError('dt must be at most 1 second');
  const gamma = finite('gamma', config.gamma);
  if (gamma < 0) throw new RangeError('gamma must be non-negative');
  if (config.tolerance !== undefined) positive('tolerance', config.tolerance);

  const parameters: PendulumParameters = {
    m1: positive('m1', config.parameters.m1),
    m2: positive('m2', config.parameters.m2),
    l1: positive('l1', config.parameters.l1),
    l2: positive('l2', config.parameters.l2),
    g: finite('g', config.parameters.g)
  };
  if (parameters.g < 0) throw new RangeError('g must be non-negative');
  if (config.system === 'triple') {
    parameters.m3 = positive('m3', config.parameters.m3 ?? Number.NaN);
    parameters.l3 = positive('l3', config.parameters.l3 ?? Number.NaN);
  }

  const dim = config.system === 'triple' ? TRIPLE_DIM : DOUBLE_DIM;
  const initialState = Array.from({ length: dim }, (_, index) => {
    const value = config.initialState[index] ?? 0;
    return finite(`initialState[${index}]`, value);
  });
  return Object.freeze({
    ...config,
    system: config.system,
    method: config.method,
    dt,
    gamma,
    parameters: Object.freeze(parameters),
    initialState: Object.freeze(initialState)
  });
}

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
    this.config = validatedConfig(config);
    this.dim = this.config.system === 'triple' ? TRIPLE_DIM : DOUBLE_DIM;
    this.state = new Float64Array(this.dim);
    this.scratch = new Float64Array(this.dim);
    for (let i = 0; i < this.dim; i += 1) this.state[i] = this.config.initialState[i] ?? 0;
    this.rhs = (s, out) =>
      physicsAdapter.derivative(this.config.system, s, this.config.parameters, this.config.gamma, out);
    this.initialEnergy = this.energy();
    if (!Number.isFinite(this.initialEnergy)) throw new Error('initial energy is non-finite');
  }

  /** Advance `steps` fixed steps of size `config.dt`. */
  step(steps = 1): void {
    if (!Number.isSafeInteger(steps) || steps < 0 || steps > MAX_STEPS_PER_CALL) {
      throw new RangeError(`steps must be a safe integer in [0, ${MAX_STEPS_PER_CALL}]`);
    }
    const { method, dt, tolerance } = this.config;
    const options = { previousError: this.residualBox, ...(tolerance === undefined ? {} : { tolerance }) };
    for (let s = 0; s < steps; s += 1) {
      physicsAdapter.step(method, this.state, dt, this.rhs, this.scratch, options);
      for (let index = 0; index < this.dim; index += 1) {
        if (!Number.isFinite(this.scratch[index])) {
          throw new Error(`integrator produced a non-finite state at index ${index}`);
        }
      }
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
