/**
 * Rope / string pendulum: a bob on an inextensible *string* of length l.
 * Unlike a rigid rod, a string can only pull. The dynamics is a hybrid system:
 *
 *  - TAUT phase (constraint active): standard pendulum ODE in (θ, ω) with
 *    string tension per unit mass T/m = g·cosθ + l·ω². The phase is valid
 *    while T ≥ 0.
 *  - SLACK phase (constraint inactive): when T would go negative the string
 *    folds; the bob is a projectile in (x, y) with the same linear drag.
 *  - CAPTURE event: when the slack bob reaches |r| = l moving outward, the
 *    string snaps taut. The radial velocity component is destroyed (perfectly
 *    inextensible, inelastic capture — kinetic energy drops), the tangential
 *    component continues as l·ω.
 *
 * Angle convention: θ from the downward vertical; x = l·sinθ, y = −l·cosθ.
 *
 * Phase transitions are located *inside* the integration substep with the
 * shared event locator (`eventLocator.ts`), the same primitive that refines
 * Poincaré crossings: tension zero for taut→slack, |r| = l for capture. The
 * integrator steps exactly to the transition, switches phase there, and
 * finishes the remainder of the substep in the new phase, so event times and
 * states are accurate to the root tolerance instead of one substep.
 */
import { locateTransition } from './eventLocator';

export type RopePhase = 'taut' | 'slack';

export interface RopeParams {
  /** String length (m). */
  l: number;
  /** Gravity (m/s²). */
  g: number;
  /** Linear damping coefficient γ (1/s) applied in both phases. */
  damping: number;
}

export interface RopeStateSnapshot {
  phase: RopePhase;
  theta: number;
  omega: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  time: number;
  /** Tension per unit mass (N/kg); exactly 0 while slack. */
  tension: number;
  /** Total mechanical energy per unit mass. */
  energy: number;
  /** | |r| − l | — only meaningful approaching capture; 0 when taut. */
  constraintError: number;
}

export interface RopeEvent {
  type: 'slack' | 'capture';
  time: number;
  /** Energy lost at the event (J/kg); > 0 only for capture. */
  energyLoss: number;
  /**
   * Event-condition residual at the recorded time: |T| (N/kg) for slack
   * release, | |r| − l | (m) for capture. Near zero when the transition was
   * located by in-step refinement; up to one substep's drift otherwise.
   */
  residual?: number;
}

export class RopePendulum {
  private phase: RopePhase = 'taut';
  private theta: number;
  private omega: number;
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private time = 0;
  readonly events: RopeEvent[] = [];

  constructor(
    readonly params: RopeParams,
    theta0: number,
    omega0 = 0
  ) {
    this.theta = theta0;
    this.omega = omega0;
    // A string cannot support negative tension even at t = 0.
    if (this.tautTension() < 0) this.releaseToSlack();
  }

  /** Tension per unit mass in the taut phase: T/m = g·cosθ + l·ω². */
  private tautTension(): number {
    return this.params.g * Math.cos(this.theta) + this.params.l * this.omega * this.omega;
  }

  tension(): number {
    return this.phase === 'taut' ? Math.max(0, this.tautTension()) : 0;
  }

  currentPhase(): RopePhase {
    return this.phase;
  }

  position(): { x: number; y: number } {
    if (this.phase === 'slack') return { x: this.x, y: this.y };
    return { x: this.params.l * Math.sin(this.theta), y: -this.params.l * Math.cos(this.theta) };
  }

  velocity(): { vx: number; vy: number } {
    if (this.phase === 'slack') return { vx: this.vx, vy: this.vy };
    return {
      vx: this.params.l * this.omega * Math.cos(this.theta),
      vy: this.params.l * this.omega * Math.sin(this.theta)
    };
  }

  energy(): number {
    const { y } = this.position();
    const { vx, vy } = this.velocity();
    return 0.5 * (vx * vx + vy * vy) + this.params.g * y;
  }

  constraintError(): number {
    if (this.phase === 'taut') return 0;
    return Math.abs(Math.hypot(this.x, this.y) - this.params.l);
  }

  /** Human-readable warning when the string model is near its validity edge. */
  warning(): string | null {
    if (this.phase === 'slack') return 'String is SLACK — bob in free flight; constraint inactive.';
    const tension = this.tautTension();
    if (tension < 0.05 * this.params.g)
      return `Tension near zero (${tension.toFixed(3)} N/kg) — string about to go slack.`;
    return null;
  }

  private releaseToSlack(atTime = this.time, residual = 0): void {
    const { x, y } = this.position();
    const { vx, vy } = this.velocity();
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.phase = 'slack';
    this.events.push({ type: 'slack', time: atTime, energyLoss: 0, residual });
  }

  private captureToTaut(atTime = this.time): void {
    const r = Math.hypot(this.x, this.y) || this.params.l;
    const residual = Math.abs(r - this.params.l);
    // Clamp onto the circle and keep only the tangential velocity.
    const ux = this.x / r;
    const uy = this.y / r;
    const before = this.energy();
    this.x = ux * this.params.l;
    this.y = uy * this.params.l;
    this.theta = Math.atan2(this.x, -this.y);
    const tx = Math.cos(this.theta);
    const ty = Math.sin(this.theta);
    const vTangential = this.vx * tx + this.vy * ty;
    this.omega = vTangential / this.params.l;
    this.phase = 'taut';
    const after = this.energy();
    this.events.push({ type: 'capture', time: atTime, energyLoss: Math.max(0, before - after), residual });
  }

  /** Advance by dt (internally split into RK4 substeps no larger than 2 ms). */
  step(dt: number): void {
    let remaining = dt;
    const maxSub = 0.002;
    while (remaining > 1e-12) {
      const h = Math.min(maxSub, remaining);
      remaining -= h;
      if (this.phase === 'taut') this.stepTaut(h, 0);
      else this.stepSlack(h, 0);
      this.time += h;
    }
  }

  /** Pure taut-phase RK4 advance from (theta, omega) by h. */
  private advanceTaut(theta: number, omega: number, h: number): { theta: number; omega: number } {
    const { g, l, damping } = this.params;
    const accel = (t: number, w: number): number => -(g / l) * Math.sin(t) - damping * w;
    const k1t = omega;
    const k1w = accel(theta, omega);
    const k2t = omega + (h / 2) * k1w;
    const k2w = accel(theta + (h / 2) * k1t, omega + (h / 2) * k1w);
    const k3t = omega + (h / 2) * k2w;
    const k3w = accel(theta + (h / 2) * k2t, omega + (h / 2) * k2w);
    const k4t = omega + h * k3w;
    const k4w = accel(theta + h * k3t, omega + h * k3w);
    return {
      theta: theta + (h / 6) * (k1t + 2 * k2t + 2 * k3t + k4t),
      omega: omega + (h / 6) * (k1w + 2 * k2w + 2 * k3w + k4w)
    };
  }

  /** Pure slack-phase (linear-drag projectile) RK4 advance by h. */
  private advanceSlack(
    x: number,
    y: number,
    vx: number,
    vy: number,
    h: number
  ): { x: number; y: number; vx: number; vy: number } {
    const { g, damping } = this.params;
    const ax = (v: number): number => -damping * v;
    const ay = (v: number): number => -g - damping * v;
    const k1 = { x: vx, y: vy, vx: ax(vx), vy: ay(vy) };
    const k2 = {
      x: vx + (h / 2) * k1.vx,
      y: vy + (h / 2) * k1.vy,
      vx: ax(vx + (h / 2) * k1.vx),
      vy: ay(vy + (h / 2) * k1.vy)
    };
    const k3 = {
      x: vx + (h / 2) * k2.vx,
      y: vy + (h / 2) * k2.vy,
      vx: ax(vx + (h / 2) * k2.vx),
      vy: ay(vy + (h / 2) * k2.vy)
    };
    const k4 = { x: vx + h * k3.vx, y: vy + h * k3.vy, vx: ax(vx + h * k3.vx), vy: ay(vy + h * k3.vy) };
    return {
      x: x + (h / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
      y: y + (h / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
      vx: vx + (h / 6) * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx),
      vy: vy + (h / 6) * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy)
    };
  }

  /** Bounded recursion across in-substep phase switches (taut↔slack chains). */
  private static readonly MAX_SWITCH_DEPTH = 4;

  private stepTaut(h: number, depth: number): void {
    const theta0 = this.theta;
    const omega0 = this.omega;
    const tension0 = this.tautTension();
    const end = this.advanceTaut(theta0, omega0, h);
    this.theta = end.theta;
    this.omega = end.omega;
    const tension1 = this.tautTension();
    if (tension1 >= 0) return;

    if (depth >= RopePendulum.MAX_SWITCH_DEPTH || !(tension0 > 0)) {
      // Degenerate bracket or too many switches in one substep: legacy
      // behaviour (switch at the substep end).
      this.releaseToSlack(this.time + h, Math.abs(tension1));
      return;
    }
    // Refine the tension zero inside the step, switch exactly there, and
    // finish the remainder of the substep in the slack phase.
    const tensionAt = (tau: number): number => {
      const s = this.advanceTaut(theta0, omega0, tau);
      return this.params.g * Math.cos(s.theta) + this.params.l * s.omega * s.omega;
    };
    const crossing = locateTransition(tensionAt, h, tension0, tension1);
    const s = this.advanceTaut(theta0, omega0, crossing.tAfter);
    this.theta = s.theta;
    this.omega = s.omega;
    this.releaseToSlack(this.time + crossing.tAfter, Math.abs(crossing.gAfter));
    const rest = h - crossing.tAfter;
    if (rest > 1e-12) this.stepSlack(rest, depth + 1);
  }

  private stepSlack(h: number, depth: number): void {
    const start = { x: this.x, y: this.y, vx: this.vx, vy: this.vy };
    const r0 = Math.hypot(start.x, start.y);
    const end = this.advanceSlack(start.x, start.y, start.vx, start.vy, h);
    this.x = end.x;
    this.y = end.y;
    this.vx = end.vx;
    this.vy = end.vy;
    const r1 = Math.hypot(this.x, this.y);
    const radialOutward = (this.x * this.vx + this.y * this.vy) / (r1 || 1);
    if (!(r1 >= this.params.l && radialOutward > 0)) return;

    if (depth >= RopePendulum.MAX_SWITCH_DEPTH || !(r0 < this.params.l)) {
      // Legacy capture at the substep end (grazing start or depth limit).
      this.captureToTaut(this.time + h);
      return;
    }
    // Refine |r| = l inside the step and capture exactly there.
    const radiusErrorAt = (tau: number): number => {
      const s = this.advanceSlack(start.x, start.y, start.vx, start.vy, tau);
      return Math.hypot(s.x, s.y) - this.params.l;
    };
    const crossing = locateTransition(radiusErrorAt, h, r0 - this.params.l, r1 - this.params.l);
    const s = this.advanceSlack(start.x, start.y, start.vx, start.vy, crossing.tAfter);
    const radialAtCrossing = (s.x * s.vx + s.y * s.vy) / (Math.hypot(s.x, s.y) || 1);
    if (radialAtCrossing <= 0) {
      // Grazing contact moving inward at the refined time: keep the end-of-
      // step state and let the legacy condition handle the capture.
      this.captureToTaut(this.time + h);
      return;
    }
    this.x = s.x;
    this.y = s.y;
    this.vx = s.vx;
    this.vy = s.vy;
    this.captureToTaut(this.time + crossing.tAfter);
    const rest = h - crossing.tAfter;
    if (rest > 1e-12) this.stepTaut(rest, depth + 1);
  }

  snapshot(): RopeStateSnapshot {
    const { x, y } = this.position();
    const { vx, vy } = this.velocity();
    return {
      phase: this.phase,
      theta: this.theta,
      omega: this.omega,
      x,
      y,
      vx,
      vy,
      time: this.time,
      tension: this.tension(),
      energy: this.energy(),
      constraintError: this.constraintError()
    };
  }
}
