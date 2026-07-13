import { renderEnergyPlot, renderLyapunovConvergence, renderPoincareSection } from '../viz';
import { magnitudeSpectrum } from '../app/fft';
import { renderPhasePortrait, renderSpectrum, type PhaseSample } from '../app/labPlots';
import type { Ctx2D, Rect } from '../viz/types';
import { pairsToPoints, type LabSidePlotId, type LabSidePlotWorkerMessage } from '../app/LabSidePlotProtocol';

interface PlotTarget {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
}

const targets = new Map<LabSidePlotId, PlotTarget>();
const pending = new Map<LabSidePlotId, Extract<LabSidePlotWorkerMessage, { kind: 'render' }>>();
const priorities: Record<LabSidePlotId, number> = { energy: 1, lyap: 2, phase: 3, poincare: 4, fft: 5 };
let drainQueued = false;

self.addEventListener('message', (event: MessageEvent<LabSidePlotWorkerMessage>) => {
  const message = event.data;
  if (message.kind === 'canvas') {
    const ctx = message.canvas.getContext('2d');
    if (ctx) targets.set(message.plot, { canvas: message.canvas, ctx });
    return;
  }

  pending.set(message.plot, message);
  if (!drainQueued) {
    drainQueued = true;
    scheduleDrain();
  }
});

function scheduleDrain(): void {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(drainLatestJobs);
  } else {
    void Promise.resolve().then(drainLatestJobs);
  }
}

function drainLatestJobs(): void {
  drainQueued = false;
  const jobs = Array.from(pending.values()).sort((a, b) => priorities[b.plot] - priorities[a.plot]);
  pending.clear();
  for (const job of jobs) renderJob(job);
}

function renderJob(message: Extract<LabSidePlotWorkerMessage, { kind: 'render' }>): void {
  const target = targets.get(message.plot);
  if (!target) return;
  const started = now();
  const rect = configure(target, message.width, message.height, message.dpr);
  const ctx = target.ctx as unknown as Ctx2D;

  switch (message.payload.plot) {
    case 'energy':
      renderEnergyPlot(ctx, rect, message.payload.energy);
      break;
    case 'lyap': {
      const history =
        message.payload.history.length > 1 ? Array.from(message.payload.history) : [0, message.payload.value];
      renderLyapunovConvergence(ctx, rect, history);
      break;
    }
    case 'phase':
      renderPhasePortrait(ctx, rect, phaseSamples(message.payload.theta, message.payload.omega));
      break;
    case 'poincare':
      renderPoincareSection(ctx, rect, pairsToPoints(message.payload.points), { xLabel: 'θ₂', yLabel: 'ω₂' });
      break;
    case 'fft': {
      if (message.payload.theta1Frames.length < 16) {
        target.ctx.clearRect(0, 0, rect.width, rect.height);
        break;
      }
      const spectrum = magnitudeSpectrum(message.payload.theta1Frames, message.payload.sampleRate);
      renderSpectrum(ctx, rect, spectrum.mags, {
        log: true,
        nyquist: message.payload.sampleRate / 2
      });
      break;
    }
  }
  self.postMessage({ kind: 'rendered', plot: message.plot, elapsedMs: now() - started });
}

function phaseSamples(theta: Float32Array, omega: Float32Array): PhaseSample[] {
  const n = Math.min(theta.length, omega.length);
  const samples: PhaseSample[] = new Array(n);
  for (let i = 0; i < n; i += 1) samples[i] = { theta: theta[i] ?? 0, omega: omega[i] ?? 0 };
  return samples;
}

function configure(target: PlotTarget, width: number, height: number, dpr: number): Rect {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const safeDpr = Math.max(1, dpr || 1);
  const backingWidth = Math.max(1, Math.round(safeWidth * safeDpr));
  const backingHeight = Math.max(1, Math.round(safeHeight * safeDpr));
  if (target.canvas.width !== backingWidth) target.canvas.width = backingWidth;
  if (target.canvas.height !== backingHeight) target.canvas.height = backingHeight;
  target.ctx.setTransform(safeDpr, 0, 0, safeDpr, 0, 0);
  return { x: 0, y: 0, width: safeWidth, height: safeHeight };
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
