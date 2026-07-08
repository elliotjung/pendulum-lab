import type { Point2D } from '../viz/poincare';
import type { PhaseSample } from './labPlots';

export type LabSidePlotId = 'energy' | 'lyap' | 'phase' | 'poincare' | 'fft';

export type LabSidePlotPayload =
  | { plot: 'energy'; energy: { time: number[]; total: number[]; drift: number[] } }
  | { plot: 'lyap'; history: number[]; value: number }
  | { plot: 'phase'; samples: PhaseSample[] }
  | { plot: 'poincare'; points: Point2D[] }
  | { plot: 'fft'; theta1Frames: number[]; sampleRate: number };

export type LabSidePlotWorkerMessage =
  | { kind: 'canvas'; plot: LabSidePlotId; canvas: OffscreenCanvas }
  | { kind: 'render'; plot: LabSidePlotId; width: number; height: number; dpr: number; payload: LabSidePlotPayload };
