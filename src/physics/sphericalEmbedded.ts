/**
 * Spherical pendulum on the embedded chart: instead of the polar coordinates
 * (θ, φ) of `spherical.ts` — which are singular at the poles (sinθ → 0, where
 * the azimuth is undefined and φ̈ = −2cotθ·θ̇·φ̇ blows up, forcing the clamp
 * `|sinθ| ≥ ε`) — the bob direction is carried as a Cartesian unit vector
 * u ∈ S² with its velocity w = u̇ (tangent: u·w = 0). This is the "ambient"
 * chart of the S² atlas: a single globally-regular parametrisation that covers
 * the poles, so a bob swinging through or near the vertical loses no accuracy.
 *
 * Equation of motion (per unit mass; r = l·u, gravity −g·ŷ, ŷ up):
 *
 *   ü = −(g/l)·ŷ + [ (g/l)(u·ŷ) − |u̇|² ]·u − γ·u̇
 *
 * The bracket is the rod reaction enforcing |u| = 1: dotting with u and using
 * u·ü = −|u̇|² (from differentiating u·u = 1 twice) makes it exact. One checks
 *   d/dt[½l²|u̇|² + g·l·u_y] = −γ l²|u̇|²        (energy)
 *   d/dt[l²(u_x u̇_z − u_z u̇_x)] = −γ·Lz/m       (vertical angular momentum)
 * so both are conserved analytically when γ = 0 — including across the poles,
 * where the (θ, φ) chart's clamp injects drift. Validated against `spherical.ts`
 * away from the poles, and by E/Lz conservation through a near-pole passage.
 *
 * State layout: [u_x, u_y, u_z, w_x, w_y, w_z]. u_y = −cosθ (so u_y = −1 is the
 * downward pole, hanging straight down; u_y = +1 is straight up).
 */

import type { SphericalParams, SphericalState } from './spherical';

/** Embedded state [u_x, u_y, u_z, w_x, w_y, w_z] with |u| = 1 and u·w = 0. */
export type EmbeddedSphericalState = readonly [number, number, number, number, number, number];

/** Right-hand side of the embedded equation of motion: returns [u̇, ü] = [w, ü]. */
export function sphericalEmbeddedRhs(state: EmbeddedSphericalState, params: SphericalParams): EmbeddedSphericalState {
  const ux = state[0];
  const uy = state[1];
  const uz = state[2];
  const wx = state[3];
  const wy = state[4];
  const wz = state[5];
  const { g, l, damping } = params;
  const gl = g / l;
  const wSq = wx * wx + wy * wy + wz * wz;
  const uDotY = uy; // u · ŷ
  const c = gl * uDotY - wSq; // rod-reaction coefficient
  // ü = −(g/l) ŷ + c·u − γ·w
  const ax = c * ux - damping * wx;
  const ay = -gl + c * uy - damping * wy;
  const az = c * uz - damping * wz;
  return [wx, wy, wz, ax, ay, az];
}

/** Total energy per unit mass: ½l²|w|² + g·l·u_y. Matches `sphericalEnergy`. */
export function sphericalEmbeddedEnergy(state: EmbeddedSphericalState, params: SphericalParams): number {
  const { g, l } = params;
  const wSq = state[3] * state[3] + state[4] * state[4] + state[5] * state[5];
  return 0.5 * l * l * wSq + g * l * state[1];
}

/** Vertical angular momentum per unit mass: l²(u_x w_z − u_z w_x) = l²sin²θ·φ̇. Matches `sphericalLz`. */
export function sphericalEmbeddedLz(state: EmbeddedSphericalState, params: SphericalParams): number {
  return params.l * params.l * (state[0] * state[5] - state[2] * state[3]);
}

/** Cartesian bob position (y up, pivot at origin): r = l·u. */
export function sphericalEmbeddedPosition(state: EmbeddedSphericalState, params: SphericalParams): { x: number; y: number; z: number } {
  return { x: params.l * state[0], y: params.l * state[1], z: params.l * state[2] };
}

/** Convert a polar (θ, φ, θ̇, φ̇) state to the embedded chart. */
export function angleToEmbedded(state: SphericalState): EmbeddedSphericalState {
  const [theta, phi, thetaDot, phiDot] = state;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  // u = (sinθcosφ, −cosθ, sinθsinφ)
  const ux = sin * cp;
  const uy = -cos;
  const uz = sin * sp;
  // w = θ̇·∂u/∂θ + φ̇·∂u/∂φ ; ∂u/∂θ = (cosθcosφ, sinθ, cosθsinφ), ∂u/∂φ = (−sinθsinφ, 0, sinθcosφ)
  const wx = thetaDot * cos * cp - phiDot * sin * sp;
  const wy = thetaDot * sin;
  const wz = thetaDot * cos * sp + phiDot * sin * cp;
  return [ux, uy, uz, wx, wy, wz];
}

/** Convert an embedded state back to polar (θ, φ, θ̇, φ̇). Singular at the poles (sinθ → 0). */
export function embeddedToAngle(state: EmbeddedSphericalState): SphericalState {
  const ux = state[0];
  const uy = state[1];
  const uz = state[2];
  const theta = Math.acos(Math.max(-1, Math.min(1, -uy))); // u_y = −cosθ
  const phi = Math.atan2(uz, ux);
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  // θ̇ = w·∂u/∂θ (unit); φ̇ = (w·e_φ)/sinθ with e_φ = (−sinφ, 0, cosφ)
  const thetaDot = state[3] * cos * cp + state[4] * sin + state[5] * cos * sp;
  const phiDot = sin === 0 ? 0 : (state[3] * -sp + state[5] * cp) / sin;
  return [theta, phi, thetaDot, phiDot];
}

export interface EmbeddedSphericalDiagnostics {
  time: number;
  energy: number;
  energyDrift: number;
  lz: number;
  lzDrift: number;
  /** |u| − 1 after projection (unit-sphere constraint residual). */
  unitConstraintError: number;
  /** |u·w| (tangency constraint residual). */
  tangentConstraintError: number;
  method: 'rk4';
  dt: number;
  caveat: string;
}

/**
 * Fixed-step RK4 integrator on the embedded chart, with a projection after each
 * step that renormalises u to S² and removes any radial component of w. Mirrors
 * `SphericalPendulum` but is regular at the poles.
 */
export class EmbeddedSphericalPendulum {
  private state: EmbeddedSphericalState;
  private time = 0;
  private readonly initialEnergy: number;
  private readonly initialLz: number;

  constructor(readonly params: SphericalParams, initial: EmbeddedSphericalState, readonly dt = 0.002) {
    this.state = project(initial);
    this.initialEnergy = sphericalEmbeddedEnergy(this.state, params);
    this.initialLz = sphericalEmbeddedLz(this.state, params);
  }

  /** Construct from a polar (θ, φ, θ̇, φ̇) initial condition. */
  static fromAngles(params: SphericalParams, initial: SphericalState, dt = 0.002): EmbeddedSphericalPendulum {
    return new EmbeddedSphericalPendulum(params, angleToEmbedded(initial), dt);
  }

  current(): EmbeddedSphericalState {
    return [...this.state] as EmbeddedSphericalState;
  }

  position(): { x: number; y: number; z: number } {
    return sphericalEmbeddedPosition(this.state, this.params);
  }

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
    const s = this.state;
    const add = (a: EmbeddedSphericalState, k: EmbeddedSphericalState, scale: number): EmbeddedSphericalState =>
      [a[0] + scale * k[0], a[1] + scale * k[1], a[2] + scale * k[2], a[3] + scale * k[3], a[4] + scale * k[4], a[5] + scale * k[5]];
    const k1 = sphericalEmbeddedRhs(s, this.params);
    const k2 = sphericalEmbeddedRhs(add(s, k1, h / 2), this.params);
    const k3 = sphericalEmbeddedRhs(add(s, k2, h / 2), this.params);
    const k4 = sphericalEmbeddedRhs(add(s, k3, h), this.params);
    const next: EmbeddedSphericalState = [
      s[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      s[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
      s[2] + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
      s[3] + (h / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]),
      s[4] + (h / 6) * (k1[4] + 2 * k2[4] + 2 * k3[4] + k4[4]),
      s[5] + (h / 6) * (k1[5] + 2 * k2[5] + 2 * k3[5] + k4[5])
    ];
    this.state = project(next);
  }

  diagnostics(): EmbeddedSphericalDiagnostics {
    const energy = sphericalEmbeddedEnergy(this.state, this.params);
    const lz = sphericalEmbeddedLz(this.state, this.params);
    const uNorm = Math.hypot(this.state[0], this.state[1], this.state[2]);
    const tangent = this.state[0] * this.state[3] + this.state[1] * this.state[4] + this.state[2] * this.state[5];
    return {
      time: this.time,
      energy,
      energyDrift: Math.abs((energy - this.initialEnergy) / (Math.abs(this.initialEnergy) || 1)),
      lz,
      lzDrift: Math.abs(lz - this.initialLz) / (Math.abs(this.initialLz) || 1),
      unitConstraintError: Math.abs(uNorm - 1),
      tangentConstraintError: Math.abs(tangent),
      method: 'rk4',
      dt: this.dt,
      caveat: this.params.damping > 0
        ? 'Damping active: E and Lz decay physically; drift is not an integrator error metric.'
        : 'Conservative run: E and Lz drift measure integrator error. Embedded chart is regular at the poles (no clamp).'
    };
  }
}

/** Renormalise u to the unit sphere and remove the radial component of w (u·w = 0). */
function project(state: EmbeddedSphericalState): EmbeddedSphericalState {
  const norm = Math.hypot(state[0], state[1], state[2]) || 1;
  const ux = state[0] / norm;
  const uy = state[1] / norm;
  const uz = state[2] / norm;
  const radial = ux * state[3] + uy * state[4] + uz * state[5];
  return [ux, uy, uz, state[3] - radial * ux, state[4] - radial * uy, state[5] - radial * uz];
}
