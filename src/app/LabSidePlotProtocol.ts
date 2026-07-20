import type { Point2D } from '../viz/poincare';

export type LabSidePlotId = 'energy' | 'lyap' | 'phase' | 'poincare' | 'fft';

export interface LabSidePlotEnergyPayload {
  plot: 'energy';
  energy: { time: Float32Array; total: Float32Array; drift: Float32Array };
}

export interface LabSidePlotPhasePayload {
  plot: 'phase';
  theta: Float32Array;
  omega: Float32Array;
}

export interface LabSidePlotPoincarePayload {
  plot: 'poincare';
  points: Float32Array;
}

export type LabSidePlotPayload =
  | LabSidePlotEnergyPayload
  | { plot: 'lyap'; history: Float32Array; value: number }
  | LabSidePlotPhasePayload
  | LabSidePlotPoincarePayload
  | { plot: 'fft'; theta1Frames: Float32Array; sampleRate: number };

export type LabSidePlotWorkerMessage =
  | { kind: 'canvas'; plot: LabSidePlotId; canvas: OffscreenCanvas }
  | { kind: 'render'; plot: LabSidePlotId; width: number; height: number; dpr: number; payload: LabSidePlotPayload };

export type LabSidePlotWorkerResponse =
  | { kind: 'ready'; plot: LabSidePlotId }
  | { kind: 'rendered'; plot: LabSidePlotId; elapsedMs: number }
  | { kind: 'dropped'; plot: LabSidePlotId }
  | { kind: 'error'; plot?: LabSidePlotId; detail: string };

export const LAB_SIDE_PLOT_IDS: readonly LabSidePlotId[] = ['energy', 'lyap', 'phase', 'poincare', 'fft'];
export const MAX_SIDE_PLOT_FLOATS = 1_000_000;
const MAX_CANVAS_EDGE = 16_384;

function isPlot(value: unknown): value is LabSidePlotId {
  return typeof value === 'string' && LAB_SIDE_PLOT_IDS.includes(value as LabSidePlotId);
}

function finiteArray(value: unknown, maximum = MAX_SIDE_PLOT_FLOATS): value is Float32Array {
  if (!(value instanceof Float32Array) || value.length > maximum) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Number.isFinite(value[index])) return false;
  }
  return true;
}

function finiteDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= MAX_CANVAS_EDGE;
}

export function isLabSidePlotPayload(value: unknown): value is LabSidePlotPayload {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Partial<LabSidePlotPayload>;
  if (payload.plot === 'energy') {
    const energy = payload.energy;
    return (
      energy !== null &&
      typeof energy === 'object' &&
      finiteArray(energy.time) &&
      finiteArray(energy.total) &&
      finiteArray(energy.drift) &&
      energy.time.length === energy.total.length &&
      energy.time.length === energy.drift.length &&
      energy.time.length * 3 <= MAX_SIDE_PLOT_FLOATS
    );
  }
  if (payload.plot === 'lyap') {
    return finiteArray(payload.history) && typeof payload.value === 'number' && Number.isFinite(payload.value);
  }
  if (payload.plot === 'phase') {
    return (
      finiteArray(payload.theta) &&
      finiteArray(payload.omega) &&
      payload.theta.length === payload.omega.length &&
      payload.theta.length * 2 <= MAX_SIDE_PLOT_FLOATS
    );
  }
  if (payload.plot === 'poincare') {
    return finiteArray(payload.points) && payload.points.length % 2 === 0;
  }
  if (payload.plot === 'fft') {
    return (
      finiteArray(payload.theta1Frames) &&
      typeof payload.sampleRate === 'number' &&
      Number.isFinite(payload.sampleRate) &&
      payload.sampleRate > 0 &&
      payload.sampleRate <= 1_000_000_000
    );
  }
  return false;
}

export function isLabSidePlotWorkerMessage(value: unknown): value is LabSidePlotWorkerMessage {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as Partial<LabSidePlotWorkerMessage>;
  if (message.kind === 'canvas') {
    const canvas = message.canvas;
    return (
      isPlot(message.plot) && canvas !== null && typeof canvas === 'object' && typeof canvas.getContext === 'function'
    );
  }
  if (message.kind !== 'render') return false;
  return (
    isPlot(message.plot) &&
    finiteDimension(message.width) &&
    finiteDimension(message.height) &&
    typeof message.dpr === 'number' &&
    Number.isFinite(message.dpr) &&
    message.dpr >= 0.25 &&
    message.dpr <= 8 &&
    isLabSidePlotPayload(message.payload) &&
    message.payload.plot === message.plot
  );
}

export function isLabSidePlotWorkerResponse(value: unknown): value is LabSidePlotWorkerResponse {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const response = value as Partial<LabSidePlotWorkerResponse>;
  if (response.kind === 'ready' || response.kind === 'dropped') return isPlot(response.plot);
  if (response.kind === 'rendered') {
    return (
      isPlot(response.plot) &&
      typeof response.elapsedMs === 'number' &&
      Number.isFinite(response.elapsedMs) &&
      response.elapsedMs >= 0
    );
  }
  return (
    response.kind === 'error' &&
    (response.plot === undefined || isPlot(response.plot)) &&
    typeof response.detail === 'string' &&
    response.detail.length > 0 &&
    response.detail.length <= 4_096
  );
}

export function sidePlotTransferables(payload: LabSidePlotPayload): Transferable[] {
  if (!isLabSidePlotPayload(payload)) throw new RangeError('side-plot payload is malformed or exceeds its work budget');
  const buffers: ArrayBuffer[] = [];
  const seen = new Set<ArrayBuffer>();
  const add = (view: Float32Array): void => {
    if (view.buffer instanceof ArrayBuffer && !seen.has(view.buffer)) {
      seen.add(view.buffer);
      buffers.push(view.buffer);
    }
  };

  switch (payload.plot) {
    case 'energy':
      add(payload.energy.time);
      add(payload.energy.total);
      add(payload.energy.drift);
      break;
    case 'lyap':
      add(payload.history);
      break;
    case 'phase':
      add(payload.theta);
      add(payload.omega);
      break;
    case 'poincare':
      add(payload.points);
      break;
    case 'fft':
      add(payload.theta1Frames);
      break;
  }
  return buffers;
}

export function pairsToPoints(pairs: Float32Array): Point2D[] {
  if (!finiteArray(pairs) || pairs.length % 2 !== 0) {
    throw new RangeError('Poincare pairs must be a finite, even-length Float32Array within budget');
  }
  const n = Math.floor(pairs.length / 2);
  const points: Point2D[] = new Array(n);
  for (let i = 0; i < n; i += 1) points[i] = { x: pairs[i * 2] ?? 0, y: pairs[i * 2 + 1] ?? 0 };
  return points;
}
