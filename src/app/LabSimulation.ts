import type { IntegratorId, PendulumParameters, SystemType } from '../types/domain';
import { createDoublePendulumDerivative, PhysicsEvaluationError, physicsAdapter } from '../physics';
import type { Derivative, StateVector, StepDiagnostics, StepOptions } from '../physics/types';

/**
 * Headless simulation core for the Lab tab. It owns the integration state and
 * drives the typed physics engine (`physicsAdapter`) — the same tested
 * integrators used everywhere else — so the modern Lab is byte-for-byte
 * consistent with the engine rather than carrying its own copy of the physics.
 *
 * State layout matches the engine: point-mass and compound doubles =
 * [θ1, θ2, ω1, ω2], triple = [θ1, θ2, θ3, ω1, ω2, ω3]. Positions are reported
 * in physical metres with the pivot at the origin and +y pointing down
 * (gravity), which the renderer maps to pixels.
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
  /** Transactional outcome of the most recent requested integration interval. */
  lastStep: LabStepReport;
}

/** Auditable outcome of one configured-dt interval in the live Lab loop. */
export interface LabStepReport {
  readonly accepted: boolean;
  readonly requestedDt: number;
  readonly advancedDt: number;
  /** Solver calls, including the rejected primary attempt and retry substeps. */
  readonly attempts: number;
  readonly retryAttempted: boolean;
  readonly retrySubsteps: number;
  readonly diagnostics: Readonly<Partial<StepDiagnostics>>;
  readonly primaryFailure?: Readonly<Partial<StepDiagnostics>>;
}

const DOUBLE_DIM = 4;
const TRIPLE_DIM = 6;
const MAX_STEPS_PER_CALL = 1_000_000;
const MAX_RETRY_ATTEMPTS = 1;
const MAX_RETRY_SUBSTEPS = 2;
const EMBEDDED_FIXED_METHODS = new Set<IntegratorId>(['rkf45', 'dopri5', 'dop853', 'gbs']);
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
  if (config.system !== 'double' && config.system !== 'compound-double' && config.system !== 'triple') {
    throw new RangeError('LabSimulation supports only double, compound-double, and triple pendulum systems');
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
  private readonly retryScratch: StateVector;
  private timeCompensation = 0;
  private lastReport: LabStepReport = Object.freeze({
    accepted: true,
    requestedDt: 0,
    advancedDt: 0,
    attempts: 0,
    retryAttempted: false,
    retrySubsteps: 0,
    diagnostics: Object.freeze({})
  });

  constructor(config: LabConfig) {
    this.config = validatedConfig(config);
    this.dim = this.config.system === 'triple' ? TRIPLE_DIM : DOUBLE_DIM;
    this.state = new Float64Array(this.dim);
    this.scratch = new Float64Array(this.dim);
    this.retryScratch = new Float64Array(this.dim);
    for (let i = 0; i < this.dim; i += 1) this.state[i] = this.config.initialState[i] ?? 0;
    this.rhs =
      this.config.system === 'double'
        ? createDoublePendulumDerivative(this.config.parameters, this.config.gamma)
        : (s, out) => physicsAdapter.derivative(this.config.system, s, this.config.parameters, this.config.gamma, out);
    this.initialEnergy = this.energy();
    if (!Number.isFinite(this.initialEnergy)) throw new Error('initial energy is non-finite');
  }

  private attemptStep(from: StateVector, dt: number, out: StateVector): Readonly<Partial<StepDiagnostics>> {
    const diagnostics: Partial<StepDiagnostics> = {};
    this.residualBox.value = 0;
    const options: StepOptions = {
      previousError: this.residualBox,
      diagnostics,
      ...(this.config.tolerance === undefined ? {} : { tolerance: this.config.tolerance })
    };
    physicsAdapter.step(this.config.method, from, dt, this.rhs, out, options);
    for (let index = 0; index < this.dim; index += 1) {
      if (!Number.isFinite(out[index])) {
        throw new PhysicsEvaluationError(
          'NON_FINITE_INPUT',
          `integrator produced a non-finite state at index ${index}`,
          {
            operation: 'LabSimulation.step',
            retryable: false,
            component: index,
            method: this.config.method,
            dt
          }
        );
      }
    }
    return Object.freeze({
      solver: diagnostics.solver ?? (EMBEDDED_FIXED_METHODS.has(this.config.method) ? 'adaptive' : 'explicit'),
      iterations: diagnostics.iterations ?? 1,
      residualNorm: diagnostics.residualNorm ?? this.residualBox.value,
      converged: diagnostics.converged ?? diagnostics.accepted !== false,
      accepted: diagnostics.accepted ?? true,
      retryable: diagnostics.retryable ?? false,
      ...(diagnostics.conditionEstimate === undefined ? {} : { conditionEstimate: diagnostics.conditionEstimate }),
      ...(diagnostics.failureReason === undefined ? {} : { failureReason: diagnostics.failureReason }),
      ...(diagnostics.errorCode === undefined ? {} : { errorCode: diagnostics.errorCode }),
      ...(diagnostics.suggestedDt === undefined ? {} : { suggestedDt: diagnostics.suggestedDt })
    });
  }

  private retryStepSize(diagnostics: Readonly<Partial<StepDiagnostics>>, dt: number): number | null {
    if (MAX_RETRY_ATTEMPTS < 1 || MAX_RETRY_SUBSTEPS !== 2 || diagnostics.retryable !== true) return null;
    const suggested = diagnostics.suggestedDt;
    const magnitude = Math.abs(dt);
    if (!(suggested !== undefined && Number.isFinite(suggested) && suggested > 0 && suggested < magnitude)) return null;
    const half = magnitude / MAX_RETRY_SUBSTEPS;
    // suggestedDt is an upper bound. Two equal substeps are the only bounded
    // retry that both respects it and covers the entire rejected interval.
    if (half > suggested * (1 + 64 * Number.EPSILON)) return null;
    return Math.sign(dt) * half;
  }

  private combinedRetryDiagnostics(
    first: Readonly<Partial<StepDiagnostics>>,
    second: Readonly<Partial<StepDiagnostics>>
  ): Readonly<Partial<StepDiagnostics>> {
    const conditionEstimate = Math.max(first.conditionEstimate ?? 0, second.conditionEstimate ?? 0);
    return Object.freeze({
      solver: second.solver ?? first.solver ?? 'explicit',
      iterations: (first.iterations ?? 0) + (second.iterations ?? 0),
      residualNorm: Math.max(first.residualNorm ?? 0, second.residualNorm ?? 0),
      converged: true,
      accepted: true,
      retryable: false,
      ...(conditionEstimate > 0 ? { conditionEstimate } : {})
    });
  }

  private recordReport(
    report: Omit<LabStepReport, 'diagnostics' | 'primaryFailure'> & {
      diagnostics: Readonly<Partial<StepDiagnostics>>;
      primaryFailure?: Readonly<Partial<StepDiagnostics>>;
    }
  ): void {
    this.lastReport = Object.freeze({
      ...report,
      diagnostics: Object.freeze({ ...report.diagnostics }),
      ...(report.primaryFailure ? { primaryFailure: Object.freeze({ ...report.primaryFailure }) } : {})
    });
  }

  private advanceTime(dt: number): void {
    // Kahan accumulation keeps the displayed clock tied to accepted intervals
    // without allowing rejected solver attempts to leak into simulation time.
    const corrected = dt - this.timeCompensation;
    const next = this.time + corrected;
    this.timeCompensation = next - this.time - corrected;
    this.time = next;
  }

  private rejectStep(
    diagnostics: Readonly<Partial<StepDiagnostics>>,
    primaryFailure: Readonly<Partial<StepDiagnostics>>,
    attempts: number,
    retrySubsteps: number
  ): never {
    this.residualBox.value = diagnostics.residualNorm ?? this.residualBox.value;
    this.recordReport({
      accepted: false,
      requestedDt: this.config.dt,
      advancedDt: 0,
      attempts,
      retryAttempted: retrySubsteps > 0,
      retrySubsteps,
      diagnostics,
      primaryFailure
    });
    throw new PhysicsEvaluationError(
      diagnostics.errorCode === 'NON_FINITE_INPUT' ? 'NON_FINITE_INPUT' : 'IMPLICIT_SOLVER_DID_NOT_CONVERGE',
      `LabSimulation.step: ${this.config.method} rejected the interval without advancing state or time`,
      {
        operation: 'LabSimulation.step',
        retryable: false,
        method: this.config.method,
        requestedDt: this.config.dt,
        attempts,
        retrySubsteps,
        solverErrorCode: diagnostics.errorCode,
        failureReason: diagnostics.failureReason,
        suggestedAction: 'Reduce dt or relax the solver tolerance, then retry from the unchanged state.'
      }
    );
  }

  /** Advance `steps` fixed steps of size `config.dt`. */
  step(steps = 1): void {
    if (!Number.isSafeInteger(steps) || steps < 0 || steps > MAX_STEPS_PER_CALL) {
      throw new RangeError(`steps must be a safe integer in [0, ${MAX_STEPS_PER_CALL}]`);
    }
    const { dt } = this.config;
    for (let s = 0; s < steps; s += 1) {
      const primary = this.attemptStep(this.state, dt, this.scratch);
      let acceptedDiagnostics = primary;
      let attempts = 1;
      let retrySubsteps = 0;
      if (primary.accepted === false) {
        const retryDt = this.retryStepSize(primary, dt);
        if (retryDt === null) this.rejectStep(primary, primary, attempts, retrySubsteps);

        const first = this.attemptStep(this.state, retryDt, this.retryScratch);
        attempts += 1;
        retrySubsteps += 1;
        if (first.accepted === false) this.rejectStep(first, primary, attempts, retrySubsteps);

        const second = this.attemptStep(this.retryScratch, retryDt, this.scratch);
        attempts += 1;
        retrySubsteps += 1;
        if (second.accepted === false) this.rejectStep(second, primary, attempts, retrySubsteps);
        acceptedDiagnostics = this.combinedRetryDiagnostics(first, second);
        this.residualBox.value = acceptedDiagnostics.residualNorm ?? this.residualBox.value;
      }
      // Swap in the freshly written buffer; reuse the old one as next scratch.
      const previous = this.state;
      this.state = this.scratch;
      this.scratch = previous;
      this.advanceTime(dt);
      this.recordReport({
        accepted: true,
        requestedDt: dt,
        advancedDt: dt,
        attempts,
        retryAttempted: retrySubsteps > 0,
        retrySubsteps,
        diagnostics: acceptedDiagnostics,
        ...(primary.accepted === false ? { primaryFailure: primary } : {})
      });
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

  /** Immutable diagnostics for the most recent configured-dt interval. */
  lastStepReport(): LabStepReport {
    return this.lastReport;
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
      bobs: this.bobPositionsMeters(),
      lastStep: this.lastStepReport()
    };
  }
}
