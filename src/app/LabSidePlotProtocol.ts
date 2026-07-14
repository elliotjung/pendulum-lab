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
  { kind: 'rendered'; plot: LabSidePlotId; elapsedMs: number } | { kind: 'dropped'; plot: LabSidePlotId };

export function sidePlotTransferables(payload: LabSidePlotPayload): Transferable[] {
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
  const n = Math.floor(pairs.length / 2);
  const points: Point2D[] = new Array(n);
  for (let i = 0; i < n; i += 1) points[i] = { x: pairs[i * 2] ?? 0, y: pairs[i * 2 + 1] ?? 0 };
  return points;
}
