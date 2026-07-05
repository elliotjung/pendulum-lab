import { TabController } from './TabController';
import { num, str } from './systemControls';
import { downloadText } from './labExport';
import { rk4Step } from '../physics/integrators';
import { energyDouble } from '../physics/double';
import type { StateVector } from '../physics/types';
import type { PendulumParameters } from '../types/domain';
import {
  createHybridSwingUpController,
  designUprightLqr,
  ilqrSolveAsync,
  lqrLyapunovLevel,
  lqrTorque,
  makeDoubleSwingUpProblem,
  rhsDoubleActuated,
  uprightEnergyDouble,
  wrapAngle,
  type ActuationMode,
  type HybridSwingUpController,
  type IlqrResult,
  type LqrDesign
} from '../control';

/**
 * Control tab — the live showcase of the optimal-control module: swing the
 * double pendulum up from hanging and balance it inverted, on screen, with the
 * torques, energy, and controller phase visible while it happens.
 *
 * Three strategies share one animation loop:
 * - `hybrid`  — energy pump + Lyapunov-gated LQR capture (full actuation);
 * - `ilqr`    — iLQR plans the swing-up off the main thread's frame budget
 *               (cooperative chunks), then the plan is replayed and handed to
 *               the LQR balance law at the end;
 * - `lqr`     — pure balance from a perturbed inverted start, including the
 *               underactuated acrobot/pendubot modes.
 *
 * The tab runs a fixed unit double pendulum (m = l = 1, g = 9.81) so every run
 * reproduces the calibrated behaviour pinned in `tests/control-*.test.ts`;
 * the CSV export carries the same [t, θ, ω, τ, E] rows the headless
 * `npm run research -- swingup` command reports.
 */

const PARAMS: PendulumParameters = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
const SIM_DT = 0.005;
const ILQR_DT = 0.025;
const ILQR_HORIZON = 140;
const SUBSTEPS_PER_FRAME = 4; // ≈ real time at 50 fps and speed 1×
const TRAIL_LIMIT = 700;
const CSV_LIMIT = 40_000;

type Strategy = 'hybrid' | 'ilqr' | 'lqr';
type RunPhase = 'idle' | 'planning' | 'running' | 'paused';

interface PlanPlayback {
  result: IlqrResult;
  mode: ActuationMode;
  /** Fractional knot index advanced by the animation clock. */
  index: number;
  /** True once playback finished and the LQR hold took over. */
  holding: boolean;
}

export class ControlTab extends TabController {
  private phase: RunPhase = 'idle';
  private strategy: Strategy = 'hybrid';
  private mode: ActuationMode = 'full';
  private torqueLimit = 30;

  private readonly state = new Float64Array(4);
  private readonly tau = new Float64Array(2);
  private readonly stepOut = new Float64Array(4);
  private simTime = 0;
  private maxTau = 0;

  private hybrid: HybridSwingUpController | null = null;
  private balance: LqrDesign | null = null;
  private plan: PlanPlayback | null = null;

  private readonly trail: number[] = [];
  private readonly rows: number[][] = [];
  private rafId: number | null = null;
  private planGeneration = 0;

  // ---------------------------------------------------------------------
  // Run control
  // ---------------------------------------------------------------------

  private start(): void {
    if (this.phase === 'paused') {
      this.phase = 'running';
      this.dom.setText('ctlStatus', 'resumed');
      return;
    }
    if (this.phase !== 'idle') return;
    this.strategy = str('ctlStrategy', 'hybrid') as Strategy;
    this.mode = this.strategy === 'hybrid' ? 'full' : (str('ctlMode', 'full') as ActuationMode);
    this.torqueLimit = num('ctlTorque', 30);
    this.trail.length = 0;
    this.rows.length = 0;
    this.simTime = 0;
    this.maxTau = 0;
    this.hybrid = null;
    this.plan = null;
    this.balance = null;

    if (this.strategy === 'hybrid') {
      const spec = { parameters: PARAMS, gamma: 0, dt: SIM_DT, mode: 'full' as const };
      this.hybrid = createHybridSwingUpController(spec, { torqueLimit: this.torqueLimit });
      this.state.set([0.1, 0, 0, 0]);
      this.phase = 'running';
      this.dom.setText('ctlStatus', 'energy pump engaged — swinging up from hanging');
    } else if (this.strategy === 'lqr') {
      this.balance = designUprightLqr({ parameters: PARAMS, gamma: 0, dt: SIM_DT, mode: this.mode });
      const perturbation = this.mode === 'full' ? [0.3, -0.35, 0.5, -0.4] : [0.05, -0.07, 0, 0];
      this.state.set([Math.PI + perturbation[0]!, Math.PI + perturbation[1]!, perturbation[2]!, perturbation[3]!]);
      this.phase = 'running';
      this.dom.setText('ctlStatus', `LQR balancing (${this.mode}) from a perturbed inverted start`);
    } else {
      this.startIlqrPlan();
    }
  }

  private startIlqrPlan(): void {
    this.phase = 'planning';
    this.state.set([0, 0, 0, 0]);
    const generation = (this.planGeneration += 1);
    const mode = this.mode;
    const problem = makeDoubleSwingUpProblem({
      parameters: PARAMS,
      gamma: 0,
      dt: ILQR_DT,
      horizon: ILQR_HORIZON,
      mode,
      torqueLimit: this.torqueLimit,
      Qf: [
        [1000, 0, 0, 0],
        [0, 1000, 0, 0],
        [0, 0, 200, 0],
        [0, 0, 0, 200]
      ]
    });
    this.dom.setText('ctlStatus', 'iLQR optimising…');
    void ilqrSolveAsync(problem, {
      maxIterations: 260,
      chunkIterations: 12,
      shouldStop: () => generation !== this.planGeneration,
      onProgress: (partial) => {
        if (generation !== this.planGeneration) return;
        this.dom.setText('ctlStatus', `iLQR optimising… iteration ${partial.iterations} · cost ${partial.cost.toFixed(3)}`);
      }
    }).then((result) => {
      if (generation !== this.planGeneration || this.phase !== 'planning') return;
      this.plan = { result, mode, index: 0, holding: false };
      this.balance = designUprightLqr({ parameters: PARAMS, gamma: 0, dt: SIM_DT, mode });
      this.phase = 'running';
      this.dom.setText(
        'ctlStatus',
        `plan ready (${result.iterations} iterations, cost ${result.cost.toFixed(3)}${result.converged ? ', converged' : ''}) — tracking`
      );
      this.badge('ctlStatus', 'visual-only', 'Animated playback of an iLQR plan; the solver itself is pinned by unit tests.', {
        title: 'Swing-Up Control Trust',
        source: 'Control tab -> ilqrSolveAsync (analytic RK4 derivatives, box-DDP backward pass)',
        parameters: { mode, dt: ILQR_DT, horizon: ILQR_HORIZON, torqueLimit: this.torqueLimit },
        uncertainty: 'Deterministic optimisation; no sampling.',
        externalValidation: 'Cost monotonicity, torque-limit compliance, and end-state accuracy pinned by tests/control-ilqr.test.ts and tests/control-analytic-derivatives.test.ts.',
        reproduce: `npm run research -- ilqr --mode ${mode} --torque ${this.torqueLimit}`,
        caveat: 'Playback shows the planned open-loop trajectory; the final balance stage is live closed-loop LQR.',
        artifact: 'CSV export: pendulum_control_run.csv'
      });
    });
  }

  private reset(): void {
    this.planGeneration += 1; // cancels any in-flight plan
    this.phase = 'idle';
    this.hybrid = null;
    this.plan = null;
    this.balance = null;
    this.trail.length = 0;
    this.rows.length = 0;
    this.simTime = 0;
    this.maxTau = 0;
    this.state.set([0.1, 0, 0, 0]);
    this.tau.fill(0);
    this.dom.setText('ctlStatus', 'idle — pick a strategy and press Run');
    this.updateReadouts();
  }

  // ---------------------------------------------------------------------
  // Simulation stepping
  // ---------------------------------------------------------------------

  private currentTorque(): void {
    if (this.strategy === 'hybrid' && this.hybrid) {
      this.hybrid.torque(this.state, this.tau);
    } else if (this.strategy === 'lqr' && this.balance) {
      lqrTorque(this.balance, this.state, this.tau, { torqueLimit: this.torqueLimit });
    } else if (this.strategy === 'ilqr' && this.plan?.holding && this.balance) {
      lqrTorque(this.balance, this.state, this.tau, { torqueLimit: this.torqueLimit });
    }
  }

  private stepLive(speed: number): void {
    const rhs = (s: StateVector, o: StateVector): void => {
      rhsDoubleActuated(s, PARAMS, 0, this.tau, o);
    };
    const substeps = Math.max(1, Math.round(SUBSTEPS_PER_FRAME * speed));
    for (let i = 0; i < substeps; i += 1) {
      this.currentTorque();
      this.recordRow();
      rk4Step(this.state, SIM_DT, rhs, this.stepOut);
      this.state.set(this.stepOut);
      this.simTime += SIM_DT;
    }
  }

  /** Advance the iLQR plan playback clock; hand over to LQR at the last knot. */
  private stepPlayback(speed: number): void {
    const plan = this.plan;
    if (!plan) return;
    plan.index += speed * ((SUBSTEPS_PER_FRAME * SIM_DT) / ILQR_DT);
    const knots = plan.result.xs.length - 1;
    if (plan.index >= knots) {
      plan.index = knots;
      const last = plan.result.xs[knots]!;
      this.state.set(last);
      if (!plan.holding) {
        plan.holding = true;
        this.dom.setText('ctlStatus', 'plan complete — LQR holding the inverted state');
      }
      this.stepLive(speed);
      return;
    }
    const k = Math.floor(plan.index);
    const frac = plan.index - k;
    const a = plan.result.xs[k]!;
    const b = plan.result.xs[Math.min(k + 1, knots)]!;
    for (let i = 0; i < 4; i += 1) this.state[i] = (a[i] ?? 0) * (1 - frac) + (b[i] ?? 0) * frac;
    this.tau.fill(0);
    const u = plan.result.us[Math.min(k, plan.result.us.length - 1)]!;
    if (plan.mode === 'acrobot') this.tau[1] = u[0] ?? 0;
    else if (plan.mode === 'pendubot') this.tau[0] = u[0] ?? 0;
    else {
      this.tau[0] = u[0] ?? 0;
      this.tau[1] = u[1] ?? 0;
    }
    this.simTime = plan.index * ILQR_DT;
    this.recordRow();
  }

  private recordRow(): void {
    this.maxTau = Math.max(this.maxTau, Math.abs(this.tau[0] ?? 0), Math.abs(this.tau[1] ?? 0));
    if (this.rows.length < CSV_LIMIT) {
      this.rows.push([
        this.simTime,
        this.state[0]!,
        this.state[1]!,
        this.state[2]!,
        this.state[3]!,
        this.tau[0]!,
        this.tau[1]!,
        energyDouble(this.state, PARAMS).total
      ]);
    }
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------

  private phaseLabel(): string {
    if (this.phase === 'idle') return 'idle';
    if (this.phase === 'planning') return 'planning';
    if (this.phase === 'paused') return 'paused';
    if (this.strategy === 'hybrid' && this.hybrid) return this.hybrid.phase() === 'capture' ? 'capture' : 'pump';
    if (this.strategy === 'ilqr') return this.plan?.holding ? 'balance' : 'track';
    return 'balance';
  }

  private updateReadouts(): void {
    const label = this.phaseLabel();
    this.dom.setText('ctlPhase', label);
    this.dom.setText('ctlPhaseLabel', label);
    const energyGap = energyDouble(this.state, PARAMS).total - uprightEnergyDouble(PARAMS);
    this.dom.setText('ctlEnergyGap', this.phase === 'idle' ? '—' : energyGap.toFixed(3));
    if (this.hybrid) {
      const level = lqrLyapunovLevel(this.hybrid.design, this.state);
      this.dom.setText('ctlLyapLevel', `${level.toFixed(0)} / ${this.hybrid.captureLevel.toFixed(0)}`);
    } else if (this.balance) {
      this.dom.setText('ctlLyapLevel', lqrLyapunovLevel(this.balance, this.state).toFixed(1));
    } else {
      this.dom.setText('ctlLyapLevel', '—');
    }
    this.dom.setText('ctlTauMax', this.phase === 'idle' ? '—' : this.maxTau.toFixed(2));
  }

  private draw(): void {
    const canvas = this.dom.el<HTMLCanvasElement>('ctlCanvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h * 0.44;
    const scale = Math.min(w, h) * 0.19;

    ctx.fillStyle = '#07090d';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const t1 = this.state[0]!;
    const t2 = this.state[1]!;
    const x1 = cx + PARAMS.l1 * scale * Math.sin(t1);
    const y1 = cy + PARAMS.l1 * scale * Math.cos(t1);
    const x2 = x1 + PARAMS.l2 * scale * Math.sin(t2);
    const y2 = y1 + PARAMS.l2 * scale * Math.cos(t2);

    // Upright target ghost (until the controller is actually balancing there).
    const label = this.phaseLabel();
    if (label !== 'balance' && label !== 'capture') {
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(126,224,160,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - (PARAMS.l1 + PARAMS.l2) * scale);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(126,224,160,0.35)';
      ctx.beginPath();
      ctx.arc(cx, cy - (PARAMS.l1 + PARAMS.l2) * scale, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Trail of the tip bob, fading toward the past.
    if (this.phase !== 'idle') {
      this.trail.push(x2, y2);
      if (this.trail.length > TRAIL_LIMIT * 2) this.trail.splice(0, this.trail.length - TRAIL_LIMIT * 2);
    }
    for (let i = 2; i < this.trail.length; i += 2) {
      const alpha = (i / this.trail.length) * 0.5;
      ctx.strokeStyle = `rgba(0,212,255,${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.trail[i - 2]!, this.trail[i - 1]!);
      ctx.lineTo(this.trail[i]!, this.trail[i + 1]!);
      ctx.stroke();
    }

    // Torque arcs at the two joints (sweep and glow scale with |τ|/limit).
    this.drawTorqueArc(ctx, cx, cy, this.tau[0] ?? 0, '#ffb454');
    this.drawTorqueArc(ctx, x1, y1, this.tau[1] ?? 0, '#ff7ab6');

    // Rods and bobs.
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#5a7a9a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = '#6f95b8';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(144,160,184,0.7)';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#60a0d0';
    ctx.beginPath();
    ctx.arc(x1, y1, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#00d4ff';
    ctx.beginPath();
    ctx.arc(x2, y2, 9, 0, Math.PI * 2);
    ctx.fill();

    this.drawEnergyBar(ctx, w, h);
    this.drawPhaseBadge(ctx);

    if (this.phase === 'idle') {
      ctx.fillStyle = 'rgba(200,215,235,0.75)';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Press Run to swing the pendulum up and balance it inverted', cx, h - 24);
      ctx.textAlign = 'left';
    }
  }

  private drawTorqueArc(ctx: CanvasRenderingContext2D, x: number, y: number, torque: number, color: string): void {
    const magnitude = Math.min(1, Math.abs(torque) / Math.max(1e-9, this.torqueLimit));
    if (magnitude < 0.02) return;
    const radius = 20;
    const sweep = magnitude * Math.PI * 1.4;
    const start = -Math.PI / 2;
    const end = start + Math.sign(torque) * sweep;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.3 + 0.7 * magnitude;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius, Math.min(start, end), Math.max(start, end));
    ctx.stroke();
    // Arrow head at the moving end of the arc.
    const tip = end;
    const tx = x + radius * Math.cos(tip);
    const ty = y + radius * Math.sin(tip);
    const tangent = tip + (Math.sign(torque) > 0 ? Math.PI / 2 : -Math.PI / 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tx + 6 * Math.cos(tangent), ty + 6 * Math.sin(tangent));
    ctx.lineTo(tx + 5 * Math.cos(tip), ty + 5 * Math.sin(tip));
    ctx.lineTo(tx - 5 * Math.cos(tip), ty - 5 * Math.sin(tip));
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawEnergyBar(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const barX = w - 34;
    const top = 46;
    const bottom = h - 40;
    const eUp = uprightEnergyDouble(PARAMS);
    const e = energyDouble(this.state, PARAMS).total;
    const norm = Math.max(0, Math.min(1.12, (e + eUp) / (2 * eUp)));
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(barX, top, 12, bottom - top);
    const fillTop = bottom - norm * ((bottom - top) / 1.12);
    const gradient = ctx.createLinearGradient(0, bottom, 0, top);
    gradient.addColorStop(0, '#155e75');
    gradient.addColorStop(1, '#00d4ff');
    ctx.fillStyle = gradient;
    ctx.fillRect(barX, fillTop, 12, bottom - fillTop);
    // Upright-energy target line at norm = 1.
    const targetY = bottom - (bottom - top) / 1.12;
    ctx.strokeStyle = '#7ee0a0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(barX - 4, targetY);
    ctx.lineTo(barX + 16, targetY);
    ctx.stroke();
    ctx.fillStyle = 'rgba(200,215,235,0.8)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('E↑', barX - 4, targetY - 5);
  }

  private drawPhaseBadge(ctx: CanvasRenderingContext2D): void {
    const label = this.phaseLabel();
    const palette: Record<string, string> = {
      idle: '#5a7a9a',
      planning: '#b58cff',
      pump: '#ffb454',
      track: '#7cb7ff',
      capture: '#7ee0a0',
      balance: '#7ee0a0',
      paused: '#90a0b8'
    };
    const color = palette[label] ?? '#5a7a9a';
    const pulsing = label === 'pump' || label === 'planning' || label === 'track';
    const alpha = pulsing ? 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 350)) : 1;
    ctx.fillStyle = 'rgba(10,16,24,0.85)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(14, 14, 132, 30, 8);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(30, 29, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(label.toUpperCase(), 42, 33);
  }

  // ---------------------------------------------------------------------
  // Frame loop and bindings
  // ---------------------------------------------------------------------

  private frame = (): void => {
    // Do no work while another tab is active: the loop stays alive (cheap
    // no-op ticks) and the demo resumes exactly where it left off.
    if (!this.dom.tabActive('tab-control')) {
      this.rafId = requestAnimationFrame(this.frame);
      return;
    }
    if (this.phase === 'running') {
      const speed = num('ctlSpeed', 1);
      if (this.strategy === 'ilqr' && this.plan && !this.plan.holding) this.stepPlayback(speed);
      else this.stepLive(speed);
      if (this.strategy === 'hybrid' && this.hybrid?.phase() === 'capture') {
        const settled =
          Math.abs(wrapAngle(this.state[0]! - Math.PI)) < 5e-3 &&
          Math.abs(wrapAngle(this.state[1]! - Math.PI)) < 5e-3 &&
          Math.abs(this.state[2]!) < 5e-3 &&
          Math.abs(this.state[3]!) < 5e-3;
        if (settled) this.dom.setText('ctlStatus', `inverted and balanced at t = ${this.simTime.toFixed(1)} s (capture held)`);
      }
    }
    this.updateReadouts();
    this.draw();
    this.rafId = requestAnimationFrame(this.frame);
  };

  private exportCsv(): void {
    const header = 't,theta1,theta2,omega1,omega2,tau1,tau2,energy';
    const csv = [header, ...this.rows.map((row) => row.map((v) => v.toPrecision(8)).join(','))].join('\n');
    downloadText('pendulum_control_run.csv', csv, 'text/csv');
  }

  private syncModeSelect(): void {
    const select = this.dom.el<HTMLSelectElement>('ctlMode');
    if (!select) return;
    const hybrid = str('ctlStrategy', 'hybrid') === 'hybrid';
    select.disabled = hybrid;
    if (hybrid) select.value = 'full';
  }

  protected bind(): void {
    this.dom.takeOver('ctlRun')?.addEventListener('click', () => this.start());
    this.dom.takeOver('ctlPause')?.addEventListener('click', () => {
      if (this.phase === 'running') {
        this.phase = 'paused';
        this.dom.setText('ctlStatus', 'paused');
      }
    });
    this.dom.takeOver('ctlReset')?.addEventListener('click', () => this.reset());
    this.dom.takeOver('ctlExport')?.addEventListener('click', () => this.exportCsv());
    this.dom.el<HTMLSelectElement>('ctlStrategy')?.addEventListener('change', () => {
      this.syncModeSelect();
      this.reset();
    });
    this.dom.el<HTMLSelectElement>('ctlMode')?.addEventListener('change', () => this.reset());
    this.dom.el<HTMLInputElement>('ctlTorque')?.addEventListener('input', () => {
      this.dom.setText('ctlTorqueV', num('ctlTorque', 30).toFixed(0));
    });
    this.dom.el<HTMLInputElement>('ctlSpeed')?.addEventListener('input', () => {
      this.dom.setText('ctlSpeedV', `${num('ctlSpeed', 1).toFixed(2)}×`);
    });
    this.syncModeSelect();
    this.reset();
    if (this.rafId === null && typeof requestAnimationFrame === 'function') {
      this.rafId = requestAnimationFrame(this.frame);
    }
  }
}
