import { renderEnergyPlot, renderLyapunovConvergence, renderPoincareSection } from '../viz';
import { magnitudeSpectrum } from '../app/fft';
import { renderPhasePortrait, renderSpectrum, type PhaseSample } from '../app/labPlots';
import { sharedMemoryCapability } from '../runtime/sharedRingBuffer';
import type { Ctx2D, Rect } from '../viz/types';
import {
  LAB_SIDE_PLOT_SHARED_RING_PROTOCOL,
  isLabSidePlotWorkerMessage,
  pairsToPoints,
  type LabSidePlotId,
  type LabSidePlotPayload,
  type LabSidePlotWorkerMessage,
  type LabSidePlotWorkerResponse
} from '../app/LabSidePlotProtocol';
import { LabSidePlotSharedRingReader } from '../app/LabSidePlotSharedTransport';

interface PlotTarget {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
}

const targets = new Map<LabSidePlotId, PlotTarget>();
type QueuedRender = Extract<LabSidePlotWorkerMessage, { kind: 'render' | 'render-shared' }>;

const pending = new Map<LabSidePlotId, QueuedRender>();
const priorities: Record<LabSidePlotId, number> = { energy: 1, lyap: 2, phase: 3, poincare: 4, fft: 5 };
let drainQueued = false;
let sharedTransport: LabSidePlotSharedRingReader | null = null;

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isLabSidePlotWorkerMessage(event.data)) {
    post({ kind: 'error', detail: 'side-plot worker received a malformed message' });
    return;
  }
  const message = event.data;
  if (message.kind === 'shared-init') {
    initializeSharedTransport(message.transport);
    return;
  }
  if (message.kind === 'canvas') {
    try {
      const ctx = message.canvas.getContext('2d');
      if (!ctx) throw new Error('could not acquire a 2D context');
      targets.set(message.plot, { canvas: message.canvas, ctx });
      post({ kind: 'ready', plot: message.plot });
    } catch (error) {
      post({
        kind: 'error',
        plot: message.plot,
        detail: error instanceof Error ? error.message : 'side-plot canvas initialization failed'
      });
    }
    return;
  }

  if (pending.has(message.plot)) post({ kind: 'dropped', plot: message.plot });
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
  for (const job of jobs) {
    try {
      renderJob(job);
    } catch (error) {
      post({
        kind: 'error',
        plot: job.plot,
        detail: error instanceof Error ? error.message : 'side-plot rendering failed'
      });
    }
  }
}

function initializeSharedTransport(
  transport: Extract<LabSidePlotWorkerMessage, { kind: 'shared-init' }>['transport']
): void {
  if (!sharedMemoryCapability().supported) {
    post({ kind: 'shared-unavailable', detail: 'side-plot shared transport requires cross-origin isolation' });
    return;
  }
  if (sharedTransport) {
    post({ kind: 'shared-unavailable', detail: 'side-plot shared transport was already initialized' });
    return;
  }
  try {
    sharedTransport = new LabSidePlotSharedRingReader(transport);
    post({ kind: 'shared-ready', protocol: LAB_SIDE_PLOT_SHARED_RING_PROTOCOL });
  } catch (error) {
    sharedTransport = null;
    post({
      kind: 'shared-unavailable',
      detail: error instanceof Error ? error.message : 'side-plot shared transport initialization failed'
    });
  }
}

function renderJob(message: QueuedRender): void {
  const started = now();
  if (message.kind === 'render-shared') {
    const transport = sharedTransport;
    if (!transport) throw new Error('side-plot shared render arrived before transport initialization');
    const lease = transport.acquire({ slot: message.slot, sequence: message.sequence });
    try {
      renderPayload(message.plot, message.width, message.height, message.dpr, lease.payload);
    } finally {
      lease.release();
    }
    post({
      kind: 'rendered',
      plot: message.plot,
      elapsedMs: now() - started,
      transport: 'shared',
      slot: message.slot,
      sequence: message.sequence
    });
    return;
  }
  renderPayload(message.plot, message.width, message.height, message.dpr, message.payload);
  post({ kind: 'rendered', plot: message.plot, elapsedMs: now() - started, transport: 'transfer' });
}

function renderPayload(
  plot: LabSidePlotId,
  width: number,
  height: number,
  dpr: number,
  payload: LabSidePlotPayload
): void {
  const target = targets.get(plot);
  if (!target) return;
  const rect = configure(target, width, height, dpr);
  const ctx = target.ctx as unknown as Ctx2D;

  switch (payload.plot) {
    case 'energy':
      renderEnergyPlot(ctx, rect, payload.energy);
      break;
    case 'lyap': {
      const history = payload.history.length > 1 ? Array.from(payload.history) : [0, payload.value];
      renderLyapunovConvergence(ctx, rect, history);
      break;
    }
    case 'phase':
      renderPhasePortrait(ctx, rect, phaseSamples(payload.theta, payload.omega));
      break;
    case 'poincare':
      renderPoincareSection(ctx, rect, pairsToPoints(payload.points), { xLabel: 'θ₂', yLabel: 'ω₂' });
      break;
    case 'fft': {
      if (payload.theta1Frames.length < 16) {
        target.ctx.clearRect(0, 0, rect.width, rect.height);
        break;
      }
      const spectrum = magnitudeSpectrum(payload.theta1Frames, payload.sampleRate);
      renderSpectrum(ctx, rect, spectrum.mags, {
        log: true,
        nyquist: payload.sampleRate / 2
      });
      break;
    }
  }
}

function post(response: LabSidePlotWorkerResponse): void {
  self.postMessage(response);
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
