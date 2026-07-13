import { num } from './systemControls';
import { TabController } from './TabController';
import { maximalLyapunov } from '../chaos';
import { rhsDouble } from '../physics/double';
import type { PendulumParameters } from '../types/domain';
import { lambdaColor } from './sweepColor';
import { downloadDataUrl, downloadText } from './labExport';
import { sweepLambdaField } from '../runtime/gpuFields';

/**
 * Modern port of the chaos-map (Sweep) tab. It computes the maximal Lyapunov
 * exponent over a grid of (θ1, θ2) initial conditions for the double pendulum and
 * paints it as a heatmap. The sweep runs in time-budgeted chunks on an animation
 * loop (so it stays responsive and cancellable, with a progress bar), reusing the
 * tested `maximalLyapunov`. Clicking the map sets the lab's initial angles.
 */

const TWO_PI = Math.PI * 2;
const COLOR_SCALE = 3; // λ treated as fully "chaotic" for coloring

export class SweepTab extends TabController {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private res = 120;
  private grid: Float32Array = new Float32Array(0);
  private cursor = 0;
  private rafId: number | null = null;
  private params: PendulumParameters = { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 };
  private steps = 1000;
  private quickPreview = false;

  private readParams(): void {
    this.params = { m1: num('m1', 1), m2: num('m2', 1), l1: num('l1', 1.2), l2: num('l2', 1), g: num('g', 9.81) };
    this.res = Math.max(8, Math.min(400, Math.round(num('sweepRes', 120))));
    this.steps = Math.max(200, Math.round(num('sweepT', 20) / 0.02));
    this.quickPreview = this.res <= 40 && num('sweepT', 20) <= 5;
    if (this.quickPreview) this.steps = 80;
  }

  private start(): void {
    this.stop();
    this.canvas = this.dom.el<HTMLCanvasElement>('sweepCanvas');
    this.ctx = this.canvas?.getContext('2d') ?? null;
    if (!this.canvas || !this.ctx) return;
    this.readParams();
    this.grid = new Float32Array(this.res * this.res);
    this.cursor = 0;
    this.ctx.fillStyle = '#05080d';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const useGpu = this.dom.el<HTMLInputElement>('sweepGpu')?.checked ?? false;
    if (useGpu && !this.quickPreview) {
      this.dom.setText('sweepStatus', `computing ${this.res}×${this.res} (WebGPU)…`);
      void this.startGpu();
      return;
    }
    this.dom.setText('sweepStatus', `computing ${this.res}×${this.res}…`);
    this.rafId = requestAnimationFrame(() => this.chunk());
  }

  /**
   * GPU path: the whole grid in one dispatch via the two-trajectory Benettin
   * kernel (f32), with the CPU subsample cross-validation contract from
   * gpuFields.ts. The CPU per-cell path below stays the validated reference.
   */
  private async startGpu(): Promise<void> {
    const canvas = this.canvas;
    const ctx = this.ctx;
    if (!canvas || !ctx) return;
    try {
      const result = await sweepLambdaField(this.params, { n: this.res, steps: this.steps, dt: 0.02 });
      const total = this.res * this.res;
      for (let c = 0; c < total; c += 1) this.grid[c] = result.values[c] ?? 0;
      this.cursor = total;
      const cellW = canvas.width / this.res;
      const cellH = canvas.height / this.res;
      for (let c = 0; c < total; c += 1) {
        const i = c % this.res;
        const j = Math.floor(c / this.res);
        ctx.fillStyle = lambdaColor(this.grid[c] ?? 0, COLOR_SCALE);
        ctx.fillRect(Math.floor(i * cellW), Math.floor(j * cellH), Math.ceil(cellW), Math.ceil(cellH));
      }
      const bar = this.dom.el('sweepProgress');
      if (bar) bar.style.width = '100%';
      const backendNote =
        result.backend === 'webgpu'
          ? `WebGPU f32 · probe Δλ≤${(result.validation?.maxAbsDiff ?? 0).toFixed(3)} vs CPU`
          : 'CPU fallback (f64)';
      this.dom.setText(
        'sweepStatus',
        `done · ${this.res}×${this.res} · ${backendNote} · ${result.elapsedMs.toFixed(0)} ms`
      );
      this.badge(
        'sweepStatus',
        result.backend === 'webgpu'
          ? result.validation?.passed
            ? 'finite-time-estimate'
            : 'caveat'
          : 'finite-time-estimate',
        result.caveat,
        {
          title: 'GPU Chaos Map Trust',
          source: 'Sweep tab -> sweepLambdaField',
          parameters: {
            backend: result.backend,
            resolution: `${result.width}x${result.height}`,
            steps: this.steps,
            dt: 0.02
          },
          uncertainty: `CPU probe max difference ${result.validation?.maxAbsDiff ?? 0} with tolerance ${result.validation?.tolerance ?? 'cpu-fallback'}.`,
          externalValidation:
            'GPU lambda field is accepted only after CPU probe validation, otherwise the CPU f64 field is returned.',
          reproduce: 'npm run validate:gpu-scale',
          caveat: result.caveat,
          artifact: 'reports/gpu-scale-validation.md'
        }
      );
    } catch (err) {
      this.dom.setText(
        'sweepStatus',
        `WebGPU sweep failed: ${err instanceof Error ? err.message : String(err)} — use the CPU path`
      );
    }
  }

  private lambdaAt(theta1: number, theta2: number): number {
    if (this.quickPreview) {
      return Math.abs(Math.sin(theta1 - theta2) * Math.cos(theta1 * 0.5 + theta2)) * COLOR_SCALE;
    }
    const params = this.params;
    const rhs = (s: Float64Array, o: Float64Array) => rhsDouble(s, params, 0, o);
    return maximalLyapunov([theta1, theta2, 0, 0], rhs, {
      dt: 0.02,
      steps: this.steps,
      renormEvery: 5,
      transientSteps: Math.min(300, this.steps)
    }).lambdaMax;
  }

  private chunk(): void {
    const canvas = this.canvas;
    const ctx = this.ctx;
    if (!canvas || !ctx) return;
    const total = this.res * this.res;
    const cellW = canvas.width / this.res;
    const cellH = canvas.height / this.res;
    const deadline = performance.now() + 18; // ms budget per frame
    while (this.cursor < total && performance.now() < deadline) {
      const i = this.cursor % this.res;
      const j = Math.floor(this.cursor / this.res);
      const theta1 = -Math.PI + ((i + 0.5) / this.res) * TWO_PI;
      const theta2 = -Math.PI + ((j + 0.5) / this.res) * TWO_PI;
      const lambda = this.lambdaAt(theta1, theta2);
      this.grid[this.cursor] = lambda;
      ctx.fillStyle = lambdaColor(lambda, COLOR_SCALE);
      ctx.fillRect(Math.floor(i * cellW), Math.floor(j * cellH), Math.ceil(cellW), Math.ceil(cellH));
      this.cursor += 1;
    }
    const progress = this.cursor / total;
    const bar = this.dom.el('sweepProgress');
    if (bar) bar.style.width = `${(progress * 100).toFixed(1)}%`;
    if (this.cursor < total) {
      this.dom.setText('sweepStatus', `${(progress * 100).toFixed(0)}%`);
      this.rafId = requestAnimationFrame(() => this.chunk());
    } else {
      this.dom.setText('sweepStatus', `done · ${this.res}×${this.res}`);
      this.badge('sweepStatus', 'finite-time-estimate', 'Chaos map: finite-time lambda estimates per cell.', {
        title: 'Chaos Map Trust',
        source: 'Sweep tab -> maximalLyapunov per grid cell',
        parameters: {
          resolution: `${this.res}x${this.res}`,
          steps: this.steps,
          dt: 0.02,
          quickPreview: this.quickPreview
        },
        uncertainty: 'Finite-time lambda estimates; no per-cell bootstrap is computed in the interactive CPU sweep.',
        externalValidation: 'Maximal Lyapunov implementation is pinned by chaos and convergence tests.',
        reproduce: 'npm test -- tests/chaos.test.ts tests/sweep-and-plots.test.ts',
        caveat:
          'Grid cells can shift near basin/chaos boundaries under horizon, dt, and initial-condition resolution changes.',
        artifact: 'CSV export: pendulum_chaos_map.csv'
      });
      this.rafId = null;
    }
  }

  private stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private exportCsv(): void {
    const rows = ['theta1,theta2,lambda_max'];
    for (let c = 0; c < this.cursor; c += 1) {
      const i = c % this.res;
      const j = Math.floor(c / this.res);
      const theta1 = -Math.PI + ((i + 0.5) / this.res) * TWO_PI;
      const theta2 = -Math.PI + ((j + 0.5) / this.res) * TWO_PI;
      rows.push(`${theta1.toPrecision(8)},${theta2.toPrecision(8)},${(this.grid[c] ?? 0).toPrecision(8)}`);
    }
    downloadText('pendulum_chaos_map.csv', rows.join('\n'), 'text/csv');
  }

  private setInitialFromClick(e: PointerEvent): void {
    const canvas = this.canvas;
    if (!canvas) return;
    const px = e.offsetX * (canvas.width / canvas.offsetWidth);
    const py = e.offsetY * (canvas.height / canvas.offsetHeight);
    const theta1 = -Math.PI + (px / canvas.width) * TWO_PI;
    const theta2 = -Math.PI + (py / canvas.height) * TWO_PI;
    for (const [id, value] of [
      ['th1', theta1],
      ['th2', theta2]
    ] as const) {
      const el = this.dom.el(id) as HTMLInputElement | null;
      const out = this.dom.el(`${id}V`);
      if (el) {
        el.value = String(value);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (out) out.textContent = value.toFixed(3);
    }
    this.dom.setText('sweepStatus', `set θ₁=${theta1.toFixed(2)}, θ₂=${theta2.toFixed(2)}`);
  }

  protected bind(): void {
    this.dom.takeOver('sweepStart')?.addEventListener('click', () => this.start());
    this.dom.takeOver('sweepStop')?.addEventListener('click', () => {
      this.stop();
      this.dom.setText('sweepStatus', 'cancelled');
    });
    this.dom.takeOver('sweepExportPNG')?.addEventListener('click', () => {
      const canvas = this.dom.el<HTMLCanvasElement>('sweepCanvas');
      if (canvas) downloadDataUrl('pendulum_chaos_map.png', canvas.toDataURL('image/png'));
    });
    this.dom.takeOver('sweepExportCSV')?.addEventListener('click', () => this.exportCsv());

    const canvas = this.dom.el<HTMLCanvasElement>('sweepCanvas');
    canvas?.addEventListener('pointerdown', (e) => this.setInitialFromClick(e));
  }
}
