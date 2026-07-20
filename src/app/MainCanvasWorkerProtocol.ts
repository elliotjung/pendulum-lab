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

export const MAX_MAIN_CANVAS_POINTS = 100_000;
const MAX_CANVAS_EDGE = 16_384;
const MAX_TRAIL_LENGTH = 1_000_000;

function finiteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validPackedPoints(value: unknown): value is Float32Array {
  if (!(value instanceof Float32Array) || value.length % 2 !== 0 || value.length > MAX_MAIN_CANVAS_POINTS * 2) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Number.isFinite(value[index])) return false;
  }
  return true;
}

function validStyle(value: unknown): value is MainCanvasFrameStyle {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const style = value as Partial<MainCanvasFrameStyle>;
  return (
    finiteInRange(style.fade, 0, 1) &&
    (style.trailColor === undefined || (typeof style.trailColor === 'string' && style.trailColor.length <= 128)) &&
    typeof style.trailMode === 'string' &&
    style.trailMode.length > 0 &&
    style.trailMode.length <= 64 &&
    Number.isSafeInteger(style.trailLength) &&
    style.trailLength! >= 0 &&
    style.trailLength! <= MAX_TRAIL_LENGTH &&
    typeof style.glow === 'boolean' &&
    (style.trailBackend === 'canvas2d' || style.trailBackend === 'webgl2') &&
    (style.skipTrail === undefined || typeof style.skipTrail === 'boolean')
  );
}

/** Runtime guard for messages entering the OffscreenCanvas worker. */
export function isMainCanvasWorkerMessage(value: unknown): value is MainCanvasWorkerMessage {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as Partial<MainCanvasWorkerMessage>;
  if (message.kind === 'init') {
    const candidate = message as Extract<MainCanvasWorkerMessage, { kind: 'init' }>;
    return (
      candidate.canvas !== null &&
      typeof candidate.canvas === 'object' &&
      typeof candidate.canvas.getContext === 'function' &&
      finiteInRange(candidate.width, 1, MAX_CANVAS_EDGE) &&
      finiteInRange(candidate.height, 1, MAX_CANVAS_EDGE) &&
      finiteInRange(candidate.dpr, 0.25, 8)
    );
  }
  if (message.kind === 'resize') {
    const candidate = message as Extract<MainCanvasWorkerMessage, { kind: 'resize' }>;
    return (
      finiteInRange(candidate.width, 1, MAX_CANVAS_EDGE) &&
      finiteInRange(candidate.height, 1, MAX_CANVAS_EDGE) &&
      finiteInRange(candidate.dpr, 0.25, 8)
    );
  }
  if (message.kind === 'frame') {
    const candidate = message as Extract<MainCanvasWorkerMessage, { kind: 'frame' }>;
    return (
      Number.isSafeInteger(candidate.sequence) &&
      candidate.sequence > 0 &&
      validPackedPoints(candidate.bobs) &&
      validPackedPoints(candidate.ensembleBobs) &&
      validStyle(candidate.style)
    );
  }
  return message.kind === 'clear' || message.kind === 'dispose';
}

/** Runtime guard for responses before they mutate client backpressure state. */
export function isMainCanvasWorkerResponse(value: unknown): value is MainCanvasWorkerResponse {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const response = value as Partial<MainCanvasWorkerResponse>;
  if (response.kind === 'ready') return true;
  if (response.kind === 'rendered') {
    return (
      Number.isSafeInteger(response.sequence) &&
      response.sequence! > 0 &&
      finiteInRange(response.elapsedMs, 0, Number.MAX_VALUE)
    );
  }
  return (
    response.kind === 'error' &&
    typeof response.detail === 'string' &&
    response.detail.length > 0 &&
    response.detail.length <= 4_096
  );
}

/** Pack tiny per-frame object arrays before crossing the worker boundary. */
export function packBobPositions(points: readonly BobPosition[]): Float32Array {
  if (!Array.isArray(points) || points.length > MAX_MAIN_CANVAS_POINTS) {
    throw new RangeError(`main canvas points must contain at most ${MAX_MAIN_CANVAS_POINTS} entries`);
  }
  const packed = new Float32Array(points.length * 2);
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new RangeError(`main canvas point ${i} must contain finite x/y coordinates`);
    }
    packed[i * 2] = point.x;
    packed[i * 2 + 1] = point.y;
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
