import { num } from './systemControls';
import { TabController } from './TabController';
import type { IntegratorId, PendulumParameters } from '../types/domain';
import { LabSimulation, type LabConfig } from './LabSimulation';
import { renderMultiLine, type LineSeries } from './labPlots';

/**
 * Modern port of the integrator-Comparison tab. Several integrators are run from
 * one initial condition simultaneously and overlaid on #cmpCanvas; the energy
 * drift (vs each method's own start) and the divergence from the RK4 reference
 * are plotted live. A benchmark measures steps/ms for every registered method.
 * Built entirely on the tested `LabSimulation`.
 */

interface MethodSpec {
  id: IntegratorId;
  color: string;
  field?: string;
}

// Overlaid methods (colors match the legacy canvas caption).
const OVERLAY: MethodSpec[] = [
  { id: 'rk4', color: '#18d4f8' },
  { id: 'leapfrog', color: '#ff7a2c' },
  { id: 'rkf45', color: '#34e88a' },
  { id: 'yoshida4', color: '#9d78ff' }
];

// Benchmark targets → their result fields.
const BENCH: MethodSpec[] = [
  { id: 'rk4', color: '', field: 'bRK4' },
  { id: 'rkf45', color: '', field: 'bRKF45' },
  { id: 'leapfrog', color: '', field: 'bLeap' },
  { id: 'yoshida4', color: '', field: 'bYosh' },
  { id: 'symplectic', color: '', field: 'bSympl' },
  { id: 'gauss2', color: '', field: 'bGauss' },
  { id: 'rk2', color: '', field: 'bRK2' },
  { id: 'euler', color: '', field: 'bEuler' }
];

export class CompareTab extends TabController {
  private sims: LabSimulation[] = [];
  private driftHist: number[][] = [];
  private divHist: number[][] = [];
  private rafId: number | null = null;
  private params: PendulumParameters = { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 };

  private config(method: IntegratorId, dt: number): LabConfig {
    return {
      system: 'double',
      parameters: this.params,
      gamma: 0,
      method,
      dt,
      initialState: [num('th1', 2), num('th2', 2.5), num('iw1', 0), num('iw2', 0)]
    };
  }

  private start(): void {
    this.stop();
    this.params = { m1: num('m1', 1), m2: num('m2', 1), l1: num('l1', 1.2), l2: num('l2', 1), g: num('g', 9.81) };
    const dt = num('cmpDt', 0.005);
    this.sims = OVERLAY.map((m) => new LabSimulation(this.config(m.id, dt)));
    this.driftHist = OVERLAY.map(() => []);
    this.divHist = OVERLAY.map(() => []);
    this.rafId = requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    const canvas = this.dom.el<HTMLCanvasElement>('cmpCanvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    for (const sim of this.sims) sim.step(4);

    // Overlay pendulums.
    ctx.save();
    ctx.fillStyle = 'rgba(5,8,13,0.18)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const pivot = { x: canvas.width / 2, y: canvas.height * 0.42 };
    const scale = 80;
    const reference = this.sims[0]!.getState();
    this.sims.forEach((sim, k) => {
      this.drawPendulum(ctx, sim, pivot, scale, OVERLAY[k]!.color);
      const drift = sim.drift();
      this.push(this.driftHist[k]!, drift);
      const s = sim.getState();
      let d = 0;
      for (let i = 0; i < 4; i += 1) d = Math.max(d, Math.abs((s[i] ?? 0) - (reference[i] ?? 0)));
      this.push(this.divHist[k]!, d);
    });
    ctx.restore();

    this.plot('cmpEnergy', this.driftHist);
    this.plot('cmpDiverge', this.divHist.slice(1)); // divergence is vs rk4 (series 0 is 0)

    this.rafId = requestAnimationFrame(() => this.frame());
  }

  private drawPendulum(
    ctx: CanvasRenderingContext2D,
    sim: LabSimulation,
    pivot: { x: number; y: number },
    scale: number,
    color: string
  ): void {
    const pixels = sim.bobPositionsMeters().map((b) => ({ x: pivot.x + b.x * scale, y: pivot.y + b.y * scale }));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pivot.x, pivot.y);
    for (const p of pixels) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.fillStyle = color;
    for (const p of pixels) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private plot(canvasId: string, hist: number[][]): void {
    const canvas = this.dom.el(canvasId) as HTMLCanvasElement | null;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const series: LineSeries[] = hist.map((values, k) => ({
      color: OVERLAY[canvasId === 'cmpDiverge' ? k + 1 : k]!.color,
      values
    }));
    renderMultiLine(ctx, { x: 0, y: 0, width: canvas.width, height: canvas.height }, series, { log: true });
  }

  private push(arr: number[], v: number): void {
    arr.push(v);
    if (arr.length > 600) arr.splice(0, arr.length - 600);
  }

  private stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  /** Benchmark steps/ms for each registered method and fill the result fields. */
  benchmark(): void {
    const params = { m1: num('m1', 1), m2: num('m2', 1), l1: num('l1', 1.2), l2: num('l2', 1), g: num('g', 9.81) };
    const dt = num('cmpDt', 0.005);
    const steps = 20_000;
    const results: { id: IntegratorId; stepsPerMs: number }[] = [];
    for (const m of BENCH) {
      const sim = new LabSimulation({
        system: 'double',
        parameters: params,
        gamma: 0,
        method: m.id,
        dt,
        initialState: [2, 2.5, 0, 0]
      });
      const t0 = performance.now();
      sim.step(steps);
      const elapsed = performance.now() - t0;
      const stepsPerMs = elapsed > 0 ? steps / elapsed : 0;
      results.push({ id: m.id, stepsPerMs });
      if (m.field) this.dom.setText(m.field, `${stepsPerMs.toFixed(0)} steps/ms`);
    }
    this.drawBenchmark(results);
  }

  private drawBenchmark(results: { id: IntegratorId; stepsPerMs: number }[]): void {
    const canvas = this.dom.el<HTMLCanvasElement>('cmpBench');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#05080d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const max = Math.max(1, ...results.map((r) => r.stepsPerMs));
    const slot = canvas.width / results.length;
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    results.forEach((r, i) => {
      const h = (r.stepsPerMs / max) * (canvas.height - 24);
      ctx.fillStyle = '#18d4f8';
      ctx.fillRect(i * slot + slot * 0.2, canvas.height - h - 14, slot * 0.6, h);
      ctx.fillStyle = '#9fb3c8';
      ctx.fillText(r.id, i * slot + slot / 2, canvas.height - 3);
    });
  }

  protected bind(): void {
    this.dom.takeOver('cmpStart')?.addEventListener('click', () => this.start());
    this.dom.takeOver('cmpStop')?.addEventListener('click', () => this.stop());
    this.dom.takeOver('cmpBenchBtn')?.addEventListener('click', () => this.benchmark());
  }
}
