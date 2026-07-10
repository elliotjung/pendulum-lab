import { renderEnergyPlot, renderLyapunovConvergence, renderPoincareSection } from '../viz';
import { renderPhasePortrait, renderSpectrum, type PhaseSample } from './labPlots';
import { magnitudeSpectrum } from './fft';
import { pageDom as dom } from './DomBinder';
import { configureCanvas2D, type ManagedCanvas2D } from './canvasQuality';
import { LabSidePlotWorkerClient } from './LabSidePlotWorkerClient';
import { pairsToPoints, type LabSidePlotId, type LabSidePlotPayload } from './LabSidePlotProtocol';

/**
 * Pull-based data sources for each side plot. The coordinator asks for a
 * payload only when its slice is actually drawn, so `LabApp` keeps ownership
 * of the histories without copying them every frame.
 */
export interface LabSidePlotSources {
  energy(): { time: Float32Array; total: Float32Array; drift: Float32Array };
  lyapunov(): { history: Float32Array; value: number };
  phase(): { theta: Float32Array; omega: Float32Array };
  poincarePairs(): Float32Array;
  fft(): { theta1Frames: Float32Array; sampleRate: number };
}

const SIDE_PLOT_IDS: readonly LabSidePlotId[] = ['energy', 'lyap', 'phase', 'poincare', 'fft'];

function ctxOf(id: LabSidePlotId): ManagedCanvas2D | null {
  const canvas = dom.el<HTMLCanvasElement>(id);
  if (!canvas) return null;
  try {
    return configureCanvas2D(canvas);
  } catch {
    return null;
  }
}

function phaseSamples(theta: Float32Array, omega: Float32Array): PhaseSample[] {
  const n = Math.min(theta.length, omega.length);
  const samples: PhaseSample[] = new Array(n);
  for (let i = 0; i < n; i += 1) samples[i] = { theta: theta[i] ?? 0, omega: omega[i] ?? 0 };
  return samples;
}

/**
 * Drives the five side plots (energy/drift, Lyapunov convergence, phase
 * portrait, Poincaré section, FFT): builds the worker payload for a slice,
 * prefers the OffscreenCanvas worker, and falls back to main-thread canvas
 * rendering when the worker is unavailable. Extracted from `LabApp`.
 */
export class LabSidePlotCoordinator {
  private readonly worker = new LabSidePlotWorkerClient();

  constructor(private readonly sources: LabSidePlotSources) {}

  /** Render one plot slice (0..4), via the worker when possible. */
  drawSlice(plotIndex: number): void {
    const payload = this.payload(plotIndex);
    if (!payload) return;
    if (this.ensureWorker() && this.worker.render(payload)) return;
    this.drawOnMain(payload);
  }

  usesWorker(): boolean {
    return this.worker.usesWorker();
  }

  renderMs(): number {
    return this.worker.renderMs();
  }

  private ensureWorker(): boolean {
    if (!dom.bool('useWorker', true)) return false;
    const canvases: Partial<Record<LabSidePlotId, HTMLCanvasElement | undefined>> = {};
    for (const id of SIDE_PLOT_IDS) canvases[id] = dom.el<HTMLCanvasElement>(id) ?? undefined;
    return this.worker.ensure(canvases);
  }

  private payload(plotIndex: number): LabSidePlotPayload | null {
    if (plotIndex === 0) return { plot: 'energy', energy: this.sources.energy() };
    if (plotIndex === 1) {
      const lyap = this.sources.lyapunov();
      return { plot: 'lyap', history: lyap.history, value: lyap.value };
    }
    if (plotIndex === 2) return { plot: 'phase', ...this.sources.phase() };
    if (plotIndex === 3) return { plot: 'poincare', points: this.sources.poincarePairs() };
    return { plot: 'fft', ...this.sources.fft() };
  }

  private drawOnMain(payload: LabSidePlotPayload): void {
    if (payload.plot === 'energy') {
      const energy = ctxOf('energy');
      if (energy) renderEnergyPlot(energy.ctx, { x: 0, y: 0, width: energy.width, height: energy.height }, payload.energy);
      return;
    }
    if (payload.plot === 'lyap') {
      const lyap = ctxOf('lyap');
      if (lyap) {
        const history = payload.history.length > 1 ? Array.from(payload.history) : [0, payload.value];
        renderLyapunovConvergence(lyap.ctx, { x: 0, y: 0, width: lyap.width, height: lyap.height }, history);
      }
      return;
    }
    if (payload.plot === 'phase') {
      const phase = ctxOf('phase');
      if (phase) renderPhasePortrait(phase.ctx, { x: 0, y: 0, width: phase.width, height: phase.height }, phaseSamples(payload.theta, payload.omega));
      return;
    }
    if (payload.plot === 'poincare') {
      const poincare = ctxOf('poincare');
      if (poincare) {
        renderPoincareSection(
          poincare.ctx,
          { x: 0, y: 0, width: poincare.width, height: poincare.height },
          pairsToPoints(payload.points),
          { xLabel: 'θ₂', yLabel: 'ω₂' }
        );
      }
      return;
    }
    const fft = ctxOf('fft');
    if (fft && payload.theta1Frames.length >= 16) {
      const spectrum = magnitudeSpectrum(payload.theta1Frames, payload.sampleRate);
      renderSpectrum(fft.ctx, { x: 0, y: 0, width: fft.width, height: fft.height }, spectrum.mags, {
        log: true,
        nyquist: payload.sampleRate / 2
      });
    }
  }
}
