import type { BobPosition } from './LabSimulation';
import type { Point2D } from '../viz/poincare';

export interface MainCanvasFrameStyle {
  fade: number;
  trailColor?: string;
  trailMode: string;
  trailLength: number;
  glow: boolean;
  trailBackend: 'canvas2d' | 'webgl2';
  skipTrail?: boolean;
}

export type MainCanvasWorkerMessage =
  | {
      kind: 'init';
      canvas: OffscreenCanvas;
      width: number;
      height: number;
      dpr: number;
    }
  | {
      kind: 'frame';
      sequence: number;
      bobs: Float32Array;
      ensembleBobs: Float32Array;
      style: MainCanvasFrameStyle;
    }
  | { kind: 'resize'; width: number; height: number; dpr: number }
  | { kind: 'clear' }
  | { kind: 'dispose' };

export type MainCanvasWorkerResponse =
  { kind: 'ready' } | { kind: 'rendered'; sequence: number; elapsedMs: number } | { kind: 'error'; detail: string };

/** Pack tiny per-frame object arrays before crossing the worker boundary. */
export function packBobPositions(points: readonly BobPosition[]): Float32Array {
  const packed = new Float32Array(points.length * 2);
  for (let i = 0; i < points.length; i += 1) {
    packed[i * 2] = points[i]?.x ?? 0;
    packed[i * 2 + 1] = points[i]?.y ?? 0;
  }
  return packed;
}

export function unpackBobPositions(points: Float32Array): BobPosition[] {
  const unpacked: BobPosition[] = new Array(Math.floor(points.length / 2));
  for (let i = 0; i < unpacked.length; i += 1) {
    unpacked[i] = { x: points[i * 2] ?? 0, y: points[i * 2 + 1] ?? 0 };
  }
  return unpacked;
}

export function packPixelPoints(points: readonly Point2D[]): Float32Array {
  return packBobPositions(points);
}

export function unpackPixelPoints(points: Float32Array): Point2D[] {
  return unpackBobPositions(points);
}
