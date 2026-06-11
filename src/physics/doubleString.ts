import { rhsDouble } from './double';

export type DoubleStringPhase = 'taut' | 'outer-slack' | 'full-slack';

export interface DoubleStringParams {
  m1: number;
  m2: number;
  l1: number;
  l2: number;
  g: number;
  damping: number;
}

export interface DoubleStringEvent {
  type: 'slack' | 'capture';
  link: 'inner' | 'outer' | 'both';
  time: number;
  energyLoss: number;
}

export interface DoubleStringSnapshot {
  phase: DoubleStringPhase;
  time: number;
  theta1: number;
  theta2: number;
  omega1: number;
  omega2: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  vx1: number;
  vy1: number;
  vx2: number;
  vy2: number;
  tension1: number;
  tension2: number;
  energy: number;
  constraintError1: number;
  constraintError2: number;
  caveat: string;
}

interface CartesianState {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  vx1: number;
  vy1: number;
  vx2: number;
  vy2: number;
}

function validateParams(params: DoubleStringParams): void {
  for (const [key, value] of Object.entries(params)) {
    if (!Number.isFinite(value)) throw new Error(`DoubleStringParams: ${key} must be finite`);
  }
  if (params.m1 <= 0 || params.m2 <= 0) throw new Error('DoubleStringParams: masses must be positive');
  if (params.l1 <= 0 || params.l2 <= 0) throw new Error('DoubleStringParams: lengths must be positive');
  if (params.g <= 0) throw new Error('DoubleStringParams: g must be positive');
  if (params.damping < 0) throw new Error('DoubleStringParams: damping must be non-negative');
}

function dot(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

function tautToCartesian(state: ArrayLike<number>, params: DoubleStringParams): CartesianState {
  const t1 = Number(state[0] ?? 0);
  const t2 = Number(state[1] ?? 0);
  const w1 = Number(state[2] ?? 0);
  const w2 = Number(state[3] ?? 0);
  const x1 = params.l1 * Math.sin(t1);
  const y1 = -params.l1 * Math.cos(t1);
  const vx1 = params.l1 * w1 * Math.cos(t1);
  const vy1 = params.l1 * w1 * Math.sin(t1);
  const x2 = x1 + params.l2 * Math.sin(t2);
  const y2 = y1 - params.l2 * Math.cos(t2);
  const vx2 = vx1 + params.l2 * w2 * Math.cos(t2);
  const vy2 = vy1 + params.l2 * w2 * Math.sin(t2);
  return { x1, y1, x2, y2, vx1, vy1, vx2, vy2 };
}

export function doubleStringEnergy(snapshot: Pick<DoubleStringSnapshot, 'x1' | 'y1' | 'x2' | 'y2' | 'vx1' | 'vy1' | 'vx2' | 'vy2'>, params: DoubleStringParams): number {
  return 0.5 * params.m1 * (snapshot.vx1 * snapshot.vx1 + snapshot.vy1 * snapshot.vy1) +
    0.5 * params.m2 * (snapshot.vx2 * snapshot.vx2 + snapshot.vy2 * snapshot.vy2) +
    params.g * (params.m1 * snapshot.y1 + params.m2 * snapshot.y2);
}

/** Total energy of a taut-phase [θ₁, θ₂, ω₁, ω₂] state (pivot at the origin, y up). */
export function doubleStringEnergyFromTautState(state: ArrayLike<number>, params: DoubleStringParams): number {
  return doubleStringEnergy(tautToCartesian(state, params), params);
}

export interface TautFractionResult {
  /** Fraction of simulated time both strings were taut (rigid-equivalent dynamics). */
  tautFraction: number;
  /** Number of slack events (a string went slack). */
  slackEvents: number;
  /** Number of recapture events (inelastic, each loses energy). */
  captureEvents: number;
  /** Total energy lost to inelastic recaptures. */
  energyLost: number;
  horizon: number;
  caveat: string;
}

/**
 * Validity probe for taut-phase analyses: simulate the full hybrid system for
 * `horizon` seconds and report how much of the time both strings stayed taut.
 * Smooth diagnostics (Lyapunov, RQA via the rigid-equivalent vector field) are
 * trustworthy when this is ≈ 1 and meaningless when slack phases dominate.
 */
export function doubleStringTautFraction(
  params: DoubleStringParams,
  theta1: number,
  theta2: number,
  omega1 = 0,
  omega2 = 0,
  horizon = 30,
  dt = 0.002
): TautFractionResult {
  const sim = new DoubleStringPendulum(params, theta1, theta2, omega1, omega2, dt);
  let tautTime = 0;
  const steps = Math.max(1, Math.round(horizon / dt));
  for (let i = 0; i < steps; i += 1) {
    sim.step(dt);
    if (sim.currentPhase() === 'taut') tautTime += dt;
  }
  const slackEvents = sim.events.filter((e) => e.type === 'slack').length;
  const captureEvents = sim.events.filter((e) => e.type === 'capture').length;
  const energyLost = sim.events.reduce((sum, e) => sum + e.energyLoss, 0);
  const tautFraction = tautTime / (steps * dt);
  return {
    tautFraction,
    slackEvents,
    captureEvents,
    energyLost,
    horizon,
    caveat: tautFraction > 0.999
      ? 'Strings stayed taut: rigid-equivalent (smooth) analyses are valid over this horizon.'
      : `Strings went slack for ${((1 - tautFraction) * 100).toFixed(1)}% of the run; smooth-flow diagnostics only describe the taut phase.`
  };
}

export function doubleStringTensions(state: ArrayLike<number>, params: DoubleStringParams): { tension1: number; tension2: number } {
  const t1 = Number(state[0] ?? 0);
  const t2 = Number(state[1] ?? 0);
  const w1 = Number(state[2] ?? 0);
  const w2 = Number(state[3] ?? 0);
  const deriv = rhsDouble(state, { m1: params.m1, m2: params.m2, l1: params.l1, l2: params.l2, g: params.g }, params.damping, new Float64Array(4));
  const a1 = Number(deriv[2] ?? 0);
  const a2 = Number(deriv[3] ?? 0);
  const ax1 = params.l1 * (a1 * Math.cos(t1) - w1 * w1 * Math.sin(t1));
  const ay1 = params.l1 * (a1 * Math.sin(t1) + w1 * w1 * Math.cos(t1));
  const ax2 = ax1 + params.l2 * (a2 * Math.cos(t2) - w2 * w2 * Math.sin(t2));
  const ay2 = ay1 + params.l2 * (a2 * Math.sin(t2) + w2 * w2 * Math.cos(t2));
  const e1x = Math.sin(t1);
  const e1y = -Math.cos(t1);
  const e2x = Math.sin(t2);
  const e2y = -Math.cos(t2);
  const tension2 = params.m2 * (params.g * Math.cos(t2) - dot(ax2, ay2, e2x, e2y));
  const tension1 = params.m1 * (params.g * Math.cos(t1) - dot(ax1, ay1, e1x, e1y)) + tension2 * Math.cos(t1 - t2);
  return { tension1, tension2 };
}

export class DoubleStringPendulum {
  private phase: DoubleStringPhase = 'taut';
  private state: Float64Array;
  private cart: CartesianState;
  private readonly scratch: Float64Array[];
  private time = 0;
  readonly events: DoubleStringEvent[] = [];

  constructor(readonly params: DoubleStringParams, theta1: number, theta2: number, omega1 = 0, omega2 = 0, readonly maxSubstep = 0.002) {
    validateParams(params);
    this.state = new Float64Array([theta1, theta2, omega1, omega2]);
    this.scratch = [0, 1, 2, 3, 4].map(() => new Float64Array(4));
    this.cart = tautToCartesian(this.state, params);
    this.checkSlack();
  }

  currentPhase(): DoubleStringPhase {
    return this.phase;
  }

  step(dt: number): void {
    let remaining = dt;
    while (remaining > 1e-12) {
      const h = Math.min(this.maxSubstep, remaining);
      remaining -= h;
      if (this.phase === 'taut') this.stepTaut(h);
      else if (this.phase === 'outer-slack') this.stepOuterSlack(h);
      else this.stepFullSlack(h);
      this.time += h;
    }
  }

  private stepTaut(h: number): void {
    const [k1, k2, k3, k4, tmp] = this.scratch as [Float64Array, Float64Array, Float64Array, Float64Array, Float64Array];
    const rhs = (state: Float64Array, out: Float64Array): void => {
      rhsDouble(state, { m1: this.params.m1, m2: this.params.m2, l1: this.params.l1, l2: this.params.l2, g: this.params.g }, this.params.damping, out);
    };
    rhs(this.state, k1);
    for (let i = 0; i < 4; i += 1) tmp[i] = (this.state[i] ?? 0) + 0.5 * h * (k1[i] ?? 0);
    rhs(tmp, k2);
    for (let i = 0; i < 4; i += 1) tmp[i] = (this.state[i] ?? 0) + 0.5 * h * (k2[i] ?? 0);
    rhs(tmp, k3);
    for (let i = 0; i < 4; i += 1) tmp[i] = (this.state[i] ?? 0) + h * (k3[i] ?? 0);
    rhs(tmp, k4);
    for (let i = 0; i < 4; i += 1) {
      this.state[i] = (this.state[i] ?? 0) + (h / 6) * ((k1[i] ?? 0) + 2 * (k2[i] ?? 0) + 2 * (k3[i] ?? 0) + (k4[i] ?? 0));
    }
    this.cart = tautToCartesian(this.state, this.params);
    this.checkSlack();
  }

  private stepOuterSlack(h: number): void {
    this.stepInnerSingleString(h);
    this.stepProjectile2(h);
    this.tryCaptureOuter();
  }

  private stepFullSlack(h: number): void {
    this.stepProjectile1(h);
    this.stepProjectile2(h);
    this.tryCaptureInner();
  }

  private stepInnerSingleString(h: number): void {
    const theta = this.state[0] ?? 0;
    const omega = this.state[2] ?? 0;
    const accel = (t: number, w: number): number => -(this.params.g / this.params.l1) * Math.sin(t) - this.params.damping * w;
    const k1t = omega;
    const k1w = accel(theta, omega);
    const k2t = omega + 0.5 * h * k1w;
    const k2w = accel(theta + 0.5 * h * k1t, omega + 0.5 * h * k1w);
    const k3t = omega + 0.5 * h * k2w;
    const k3w = accel(theta + 0.5 * h * k2t, omega + 0.5 * h * k2w);
    const k4t = omega + h * k3w;
    const k4w = accel(theta + h * k3t, omega + h * k3w);
    this.state[0] = theta + (h / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
    this.state[2] = omega + (h / 6) * (k1w + 2 * k2w + 2 * k3w + k4w);
    const p = tautToCartesian([this.state[0] ?? 0, 0, this.state[2] ?? 0, 0], { ...this.params, l2: 0.000001 });
    this.cart.x1 = p.x1;
    this.cart.y1 = p.y1;
    this.cart.vx1 = p.vx1;
    this.cart.vy1 = p.vy1;
    if (this.params.g * Math.cos(this.state[0] ?? 0) + this.params.l1 * (this.state[2] ?? 0) ** 2 < 0) this.releaseFull();
  }

  private stepProjectile1(h: number): void {
    const ax = -this.params.damping * this.cart.vx1;
    const ay = -this.params.g - this.params.damping * this.cart.vy1;
    this.cart.x1 += h * this.cart.vx1 + 0.5 * h * h * ax;
    this.cart.y1 += h * this.cart.vy1 + 0.5 * h * h * ay;
    this.cart.vx1 += h * ax;
    this.cart.vy1 += h * ay;
  }

  private stepProjectile2(h: number): void {
    const ax = -this.params.damping * this.cart.vx2;
    const ay = -this.params.g - this.params.damping * this.cart.vy2;
    this.cart.x2 += h * this.cart.vx2 + 0.5 * h * h * ax;
    this.cart.y2 += h * this.cart.vy2 + 0.5 * h * h * ay;
    this.cart.vx2 += h * ax;
    this.cart.vy2 += h * ay;
  }

  private checkSlack(): void {
    if (this.phase !== 'taut') return;
    const { tension1, tension2 } = doubleStringTensions(this.state, this.params);
    if (tension1 < 0) this.releaseFull();
    else if (tension2 < 0) this.releaseOuter();
  }

  private releaseOuter(): void {
    if (this.phase !== 'taut') return;
    this.cart = tautToCartesian(this.state, this.params);
    this.phase = 'outer-slack';
    this.events.push({ type: 'slack', link: 'outer', time: this.time, energyLoss: 0 });
  }

  private releaseFull(): void {
    if (this.phase === 'full-slack') return;
    if (this.phase === 'taut') this.cart = tautToCartesian(this.state, this.params);
    this.phase = 'full-slack';
    this.events.push({ type: 'slack', link: 'inner', time: this.time, energyLoss: 0 });
  }

  private tryCaptureOuter(): void {
    const dx = this.cart.x2 - this.cart.x1;
    const dy = this.cart.y2 - this.cart.y1;
    const r = Math.hypot(dx, dy) || this.params.l2;
    const ux = dx / r;
    const uy = dy / r;
    const rvx = this.cart.vx2 - this.cart.vx1;
    const rvy = this.cart.vy2 - this.cart.vy1;
    const radial = dot(rvx, rvy, ux, uy);
    if (r < this.params.l2 || radial <= 0) return;

    const before = this.energy();
    this.cart.x2 = this.cart.x1 + this.params.l2 * ux;
    this.cart.y2 = this.cart.y1 + this.params.l2 * uy;
    this.cart.vx2 -= radial * ux;
    this.cart.vy2 -= radial * uy;
    this.state[0] = Math.atan2(this.cart.x1, -this.cart.y1);
    this.state[1] = Math.atan2(this.cart.x2 - this.cart.x1, -(this.cart.y2 - this.cart.y1));
    this.state[2] = dot(this.cart.vx1, this.cart.vy1, Math.cos(this.state[0] ?? 0), Math.sin(this.state[0] ?? 0)) / this.params.l1;
    this.state[3] = dot(this.cart.vx2 - this.cart.vx1, this.cart.vy2 - this.cart.vy1, Math.cos(this.state[1] ?? 0), Math.sin(this.state[1] ?? 0)) / this.params.l2;
    this.phase = 'taut';
    this.events.push({ type: 'capture', link: 'outer', time: this.time, energyLoss: Math.max(0, before - this.energy()) });
    this.checkSlack();
  }

  private tryCaptureInner(): void {
    const r = Math.hypot(this.cart.x1, this.cart.y1) || this.params.l1;
    const ux = this.cart.x1 / r;
    const uy = this.cart.y1 / r;
    const radial = dot(this.cart.vx1, this.cart.vy1, ux, uy);
    if (r < this.params.l1 || radial <= 0) return;
    const before = this.energy();
    this.cart.x1 = this.params.l1 * ux;
    this.cart.y1 = this.params.l1 * uy;
    this.cart.vx1 -= radial * ux;
    this.cart.vy1 -= radial * uy;
    this.state[0] = Math.atan2(this.cart.x1, -this.cart.y1);
    this.state[2] = dot(this.cart.vx1, this.cart.vy1, Math.cos(this.state[0] ?? 0), Math.sin(this.state[0] ?? 0)) / this.params.l1;
    this.phase = 'outer-slack';
    this.events.push({ type: 'capture', link: 'inner', time: this.time, energyLoss: Math.max(0, before - this.energy()) });
    this.tryCaptureOuter();
  }

  energy(): number {
    return doubleStringEnergy(this.cart, this.params);
  }

  snapshot(): DoubleStringSnapshot {
    const theta1 = Math.atan2(this.cart.x1, -this.cart.y1);
    const theta2 = Math.atan2(this.cart.x2 - this.cart.x1, -(this.cart.y2 - this.cart.y1));
    const omega1 = dot(this.cart.vx1, this.cart.vy1, Math.cos(theta1), Math.sin(theta1)) / this.params.l1;
    const omega2 = dot(this.cart.vx2 - this.cart.vx1, this.cart.vy2 - this.cart.vy1, Math.cos(theta2), Math.sin(theta2)) / this.params.l2;
    const tensions = this.phase === 'taut'
      ? doubleStringTensions(this.state, this.params)
      : {
          tension1: this.phase === 'outer-slack' ? this.params.m1 * Math.max(0, this.params.g * Math.cos(theta1) + this.params.l1 * omega1 * omega1) : 0,
          tension2: 0
        };
    return {
      phase: this.phase,
      time: this.time,
      theta1,
      theta2,
      omega1,
      omega2,
      ...this.cart,
      tension1: Math.max(0, tensions.tension1),
      tension2: Math.max(0, tensions.tension2),
      energy: this.energy(),
      constraintError1: Math.abs(Math.hypot(this.cart.x1, this.cart.y1) - this.params.l1),
      constraintError2: Math.abs(Math.hypot(this.cart.x2 - this.cart.x1, this.cart.y2 - this.cart.y1) - this.params.l2),
      caveat: this.phase === 'taut'
        ? 'Both strings taut: dynamics match the rigid double pendulum with non-negative tension gates.'
        : 'Hybrid string mode: slack flight and inelastic recapture are finite-time numerical events; use small dt near capture.'
    };
  }
}
