/**
 * Spherical pendulum: a bob constrained to a sphere of radius l — a genuine 3D
 * dynamical system, not a 3D camera over planar dynamics.
 *
 * Generalised coordinates (θ, φ): θ is the polar angle from the downward
 * vertical, φ the azimuth. Lagrangian dynamics give
 *
 *   θ̈ = sinθ·cosθ·φ̇² − (g/l)·sinθ − γ·θ̇
 *   φ̈ = −2·cotθ·θ̇·φ̇ − γ·φ̇            (θ ≠ 0)
 *
 * Without damping the system conserves energy
 *   E/m = ½l²(θ̇² + sin²θ·φ̇²) − g·l·cosθ
 * and the vertical angular momentum
 *   Lz/m = l²·sin²θ·φ̇
 * — both are exported as diagnostics, and their drift is the integrator
 * fidelity metric for the 3D mode.
 */

import { SPHERICAL_POLE_EPS } from './constants';
import {
  PhysicsEvaluationError,
  assertFiniteScalar,
  assertFiniteVector,
  assertNonNegativeFinite,
  assertPositiveFinite
} from './errors';

export interface SphericalParams {
  /** Pendulum length (m). */
  l: number;
  /** Gravity (m/s²). */
  g: number;
  /** Linear damping γ (1/s). */
  damping: number;
}

/** State vector [θ, φ, θ̇, φ̇]. */
export type SphericalState = [number, number, number, number];

function validateSphericalParams(params: SphericalParams, operation: string): void {
  assertPositiveFinite(params.l, 'l', operation);
  assertNonNegativeFinite(params.g, 'g', operation);
  assertNonNegativeFinite(params.damping, 'damping', operation);
}

function assertSphericalState(state: ArrayLike<number>, operation: string): void {
  assertFiniteVector(state, 4, operation);
}

function assertFiniteSphericalValues(values: readonly number[], operation: string): void {
  if (!values.every(Number.isFinite)) {
    throw new PhysicsEvaluationError('NON_FINITE_INPUT', `${operation}: result overflowed`, {
      operation,
      retryable: false,
      suggestedAction: 'Reduce the state magnitude or rescale the spherical parameters.'
    });
  }
}

export function sphericalRhs(state: SphericalState, params: SphericalParams): SphericalState {
  assertSphericalState(state, 'sphericalRhs');
  validateSphericalParams(params, 'sphericalRhs');
  const [theta, , thetaDot, phiDot] = state;
  const { g, l, damping } = params;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  // Regularise the coordinate singularity at the poles (sinθ → 0): the true
  // dynamics is smooth there, only the chart is singular.
  const safeSin = Math.abs(sin) < SPHERICAL_POLE_EPS ? (sin >= 0 ? SPHERICAL_POLE_EPS : -SPHERICAL_POLE_EPS) : sin;
  const thetaAcc = sin * cos * phiDot * phiDot - (g / l) * sin - damping * thetaDot;
  const phiAcc = ((-2 * cos) / safeSin) * thetaDot * phiDot - damping * phiDot;
  assertFiniteSphericalValues([thetaDot, phiDot, thetaAcc, phiAcc], 'sphericalRhs');
  return [thetaDot, phiDot, thetaAcc, phiAcc];
}

export function sphericalEnergy(state: SphericalState, params: SphericalParams): number {
  assertSphericalState(state, 'sphericalEnergy');
  validateSphericalParams(params, 'sphericalEnergy');
  const [theta, , thetaDot, phiDot] = state;
  const { g, l } = params;
  const sin = Math.sin(theta);
  const energy = 0.5 * l * l * (thetaDot * thetaDot + sin * sin * phiDot * phiDot) - g * l * Math.cos(theta);
  assertFiniteSphericalValues([energy], 'sphericalEnergy');
  return energy;
}

/** Vertical angular momentum per unit mass: conserved when γ = 0. */
export function sphericalLz(state: SphericalState, params: SphericalParams): number {
  assertSphericalState(state, 'sphericalLz');
  validateSphericalParams(params, 'sphericalLz');
  const [theta, , , phiDot] = state;
  const sin = Math.sin(theta);
  const lz = params.l * params.l * sin * sin * phiDot;
  assertFiniteSphericalValues([lz], 'sphericalLz');
  return lz;
}

/**
 * Rod/string force along the pendulum (per unit mass, positive = pulling the
 * bob inward): T/m = g·cosθ + l·(θ̇² + sin²θ·φ̇²). A *string* spherical
 * pendulum requires T ≥ 0; a rod supports both signs.
 */
export function sphericalTension(state: SphericalState, params: SphericalParams): number {
  assertSphericalState(state, 'sphericalTension');
  validateSphericalParams(params, 'sphericalTension');
  const [theta, , thetaDot, phiDot] = state;
  const sin = Math.sin(theta);
  const tension = params.g * Math.cos(theta) + params.l * (thetaDot * thetaDot + sin * sin * phiDot * phiDot);
  assertFiniteSphericalValues([tension], 'sphericalTension');
  return tension;
}

/** Cartesian bob position (y up, pivot at origin). */
export function sphericalPosition(state: SphericalState, params: SphericalParams): { x: number; y: number; z: number } {
  assertSphericalState(state, 'sphericalPosition');
  validateSphericalParams(params, 'sphericalPosition');
  const [theta, phi] = state;
  const sin = Math.sin(theta);
  const position = {
    x: params.l * sin * Math.cos(phi),
    z: params.l * sin * Math.sin(phi),
    y: -params.l * Math.cos(theta)
  };
  assertFiniteSphericalValues([position.x, position.y, position.z], 'sphericalPosition');
  return position;
}

/** Steady conical-pendulum azimuthal rate for polar angle θ₀: φ̇² = g/(l·cosθ₀). */
export function conicalRate(theta0: number, params: SphericalParams): number {
  assertFiniteScalar(theta0, 'theta0', 'conicalRate');
  validateSphericalParams(params, 'conicalRate');
  const denominator = params.l * Math.cos(theta0);
  if (!(denominator > 0) || !Number.isFinite(denominator)) {
    throw new PhysicsEvaluationError('INVALID_PARAMETER', 'conicalRate: theta0 must satisfy cos(theta0) > 0', {
      operation: 'conicalRate',
      retryable: false,
      parameter: 'theta0',
      value: theta0
    });
  }
  const rate = Math.sqrt(params.g / denominator);
  assertFiniteSphericalValues([rate], 'conicalRate');
  return rate;
}

export interface SphericalDiagnostics {
  time: number;
  energy: number;
  energyDrift: number;
  lz: number;
  lzDrift: number;
  tension: number;
  /** | |r| − l | from the redundant Cartesian reconstruction (chart sanity). */
  constraintEnergyError: number;
  method: 'rk4';
  dt: number;
  caveat: string;
}

export class SphericalPendulum {
  private state: SphericalState;
  private time = 0;
  private readonly initialEnergy: number;
  private readonly initialLz: number;

  constructor(
    readonly params: SphericalParams,
    initial: SphericalState,
    readonly dt = 0.002
  ) {
    validateSphericalParams(params, 'SphericalPendulum');
    assertSphericalState(initial, 'SphericalPendulum');
    assertPositiveFinite(dt, 'dt', 'SphericalPendulum');
    this.state = [...initial] as SphericalState;
    this.initialEnergy = sphericalEnergy(this.state, params);
    this.initialLz = sphericalLz(this.state, params);
  }

  current(): SphericalState {
    return [...this.state] as SphericalState;
  }

  position(): { x: number; y: number; z: number } {
    return sphericalPosition(this.state, this.params);
  }

  /** Advance by `elapsed` seconds using fixed-step RK4 substeps of size dt. */
  step(elapsed: number): void {
    if (!(elapsed >= 0) || !Number.isFinite(elapsed)) {
      throw new PhysicsEvaluationError(
        'NON_FINITE_INPUT',
        'SphericalPendulum.step: elapsed must be finite and non-negative',
        {
          operation: 'SphericalPendulum.step',
          retryable: false,
          parameter: 'elapsed',
          value: elapsed
        }
      );
    }
    if (Math.ceil(elapsed / this.dt) > 1_000_000) {
      throw new PhysicsEvaluationError(
        'INVALID_PARAMETER',
        'SphericalPendulum.step: elapsed exceeds the per-call step budget',
        {
          operation: 'SphericalPendulum.step',
          retryable: true,
          suggestedAction: 'Split the run into smaller chunks or use a worker batch.'
        }
      );
    }
    let remaining = elapsed;
    while (remaining > 1e-12) {
      const h = Math.min(this.dt, remaining);
      remaining -= h;
      this.rk4(h);
      this.time += h;
    }
  }

  private rk4(h: number): void {
    const add = (a: SphericalState, b: SphericalState, scale: number): SphericalState => [
      a[0] + scale * b[0],
      a[1] + scale * b[1],
      a[2] + scale * b[2],
      a[3] + scale * b[3]
    ];
    const k1 = sphericalRhs(this.state, this.params);
    const k2 = sphericalRhs(add(this.state, k1, h / 2), this.params);
    const k3 = sphericalRhs(add(this.state, k2, h / 2), this.params);
    const k4 = sphericalRhs(add(this.state, k3, h), this.params);
    this.state = [
      this.state[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      this.state[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
      this.state[2] + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
      this.state[3] + (h / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3])
    ];
  }

  diagnostics(): SphericalDiagnostics {
    const energy = sphericalEnergy(this.state, this.params);
    const lz = sphericalLz(this.state, this.params);
    const position = this.position();
    const radius = Math.hypot(position.x, position.y, position.z);
    return {
      time: this.time,
      energy,
      energyDrift: Math.abs((energy - this.initialEnergy) / (Math.abs(this.initialEnergy) || 1)),
      lz,
      lzDrift: Math.abs(lz - this.initialLz) / (Math.abs(this.initialLz) || 1),
      tension: sphericalTension(this.state, this.params),
      constraintEnergyError: Math.abs(radius - this.params.l),
      method: 'rk4',
      dt: this.dt,
      caveat:
        this.params.damping > 0
          ? 'Damping active: E and Lz decay physically; drift is not an integrator error metric.'
          : 'Conservative run: E and Lz drift measure integrator error. Chart singular at poles (regularised).'
    };
  }
}
