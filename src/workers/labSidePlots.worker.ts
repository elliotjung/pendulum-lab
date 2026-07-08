import { renderEnergyPlot, renderLyapunovConvergence, renderPoincareSection } from '../viz';
import { magnitudeSpectrum } from '../app/fft';
import { renderPhasePortrait, renderSpectrum } from '../app/labPlots';
import type { Ctx2D, Rect } from '../viz/types';
import type { LabSidePlotId, LabSidePlotWorkerMessage } from '../app/LabSidePlotProtocol';

interface PlotTarget {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
}

const targets = new Map<LabSidePlotId, PlotTarget>();

self.addEventListener('message', (event: MessageEvent<LabSidePlotWorkerMessage>) => {
  const message = event.data;
  if (message.kind === 'canvas') {
    const ctx = message.canvas.getContext('2d');
    if (ctx) targets.set(message.plot, { canvas: message.canvas, ctx });
    return;
  }

  const target = targets.get(message.plot);
  if (!target) return;
  const rect = configure(target, message.width, message.height, message.dpr);
  const ctx = target.ctx as unknown as Ctx2D;

  switch (message.payload.plot) {
    case 'energy':
      renderEnergyPlot(ctx, rect, message.payload.energy);
      break;
    case 'lyap': {
      const history = message.payload.history.length > 1 ? message.payload.history : [0, message.payload.value];
      renderLyapunovConvergence(ctx, rect, history);
      break;
    }
    case 'phase':
      renderPhasePortrait(ctx, rect, message.payload.samples);
      break;
    case 'poincare':
      renderPoincareSection(ctx, rect, message.payload.points, { xLabel: 'θ₂', yLabel: 'ω₂' });
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
});

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
