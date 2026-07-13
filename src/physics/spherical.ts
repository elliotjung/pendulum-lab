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

export function sphericalRhs(state: SphericalState, params: SphericalParams): SphericalState {
  const [theta, , thetaDot, phiDot] = state;
  const { g, l, damping } = params;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  // Regularise the coordinate singularity at the poles (sinθ → 0): the true
  // dynamics is smooth there, only the chart is singular.
  const safeSin = Math.abs(sin) < SPHERICAL_POLE_EPS ? (sin >= 0 ? SPHERICAL_POLE_EPS : -SPHERICAL_POLE_EPS) : sin;
  const thetaAcc = sin * cos * phiDot * phiDot - (g / l) * sin - damping * thetaDot;
  const phiAcc = ((-2 * cos) / safeSin) * thetaDot * phiDot - damping * phiDot;
  return [thetaDot, phiDot, thetaAcc, phiAcc];
}

export function sphericalEnergy(state: SphericalState, params: SphericalParams): number {
  const [theta, , thetaDot, phiDot] = state;
  const { g, l } = params;
  const sin = Math.sin(theta);
  return 0.5 * l * l * (thetaDot * thetaDot + sin * sin * phiDot * phiDot) - g * l * Math.cos(theta);
}

/** Vertical angular momentum per unit mass: conserved when γ = 0. */
export function sphericalLz(state: SphericalState, params: SphericalParams): number {
  const [theta, , , phiDot] = state;
  const sin = Math.sin(theta);
  return params.l * params.l * sin * sin * phiDot;
}

/**
 * Rod/string force along the pendulum (per unit mass, positive = pulling the
 * bob inward): T/m = g·cosθ + l·(θ̇² + sin²θ·φ̇²). A *string* spherical
 * pendulum requires T ≥ 0; a rod supports both signs.
 */
export function sphericalTension(state: SphericalState, params: SphericalParams): number {
  const [theta, , thetaDot, phiDot] = state;
  const sin = Math.sin(theta);
  return params.g * Math.cos(theta) + params.l * (thetaDot * thetaDot + sin * sin * phiDot * phiDot);
}

/** Cartesian bob position (y up, pivot at origin). */
export function sphericalPosition(state: SphericalState, params: SphericalParams): { x: number; y: number; z: number } {
  const [theta, phi] = state;
  const sin = Math.sin(theta);
  return {
    x: params.l * sin * Math.cos(phi),
    z: params.l * sin * Math.sin(phi),
    y: -params.l * Math.cos(theta)
  };
}

/** Steady conical-pendulum azimuthal rate for polar angle θ₀: φ̇² = g/(l·cosθ₀). */
export function conicalRate(theta0: number, params: SphericalParams): number {
  return Math.sqrt(params.g / (params.l * Math.cos(theta0)));
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
