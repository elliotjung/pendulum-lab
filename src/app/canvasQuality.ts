export interface ManagedCanvas2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
}

const MAX_DPR = 2;
let dynamicDprCap = MAX_DPR;
const qualityEvents: CanvasQualityEvent[] = [];

export interface CanvasQualityEvent {
  timestamp: number;
  dprCap: number;
  reason: string;
  fps?: number;
  physicsMs?: number;
  renderMs?: number;
  sidePlotMs?: number;
  stepsPerFrame?: number;
}

export function setCanvasDprCap(cap: number, reason = 'manual'): void {
  dynamicDprCap = Math.max(1, Math.min(MAX_DPR, cap));
  recordCanvasQualityEvent({ dprCap: dynamicDprCap, reason });
}

export function getCanvasDprCap(): number {
  return dynamicDprCap;
}

export function recordCanvasQualityEvent(event: Omit<CanvasQualityEvent, 'timestamp'>): void {
  qualityEvents.push({ ...event, timestamp: now() });
  if (qualityEvents.length > 24) qualityEvents.splice(0, qualityEvents.length - 24);
}

export function canvasQualityDiagnostics(): readonly CanvasQualityEvent[] {
  return qualityEvents;
}

export function latestCanvasQualityReason(): string {
  return qualityEvents[qualityEvents.length - 1]?.reason ?? 'not adjusted';
}

function attrNumber(canvas: HTMLCanvasElement, name: 'width' | 'height', fallback: number): number {
  const value = Number.parseInt(canvas.getAttribute(name) ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function configureCanvas2D(canvas: HTMLCanvasElement): ManagedCanvas2D | null {
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) return null;

  const dpr = Math.min(dynamicDprCap, Math.max(1, window.devicePixelRatio || 1));
  const rect = canvas.getBoundingClientRect();
  const attrW = attrNumber(canvas, 'width', canvas.width || 300);
  const attrH = attrNumber(canvas, 'height', canvas.height || 150);
  const logicalW = rect.width > 8 ? Math.round(rect.width) : attrW;
  const logicalH = rect.height > 8 ? Math.round(rect.height) : attrH;
  const pixelW = Math.max(1, Math.round(logicalW * dpr));
  const pixelH = Math.max(1, Math.round(logicalH * dpr));

  if (canvas.width !== pixelW) canvas.width = pixelW;
  if (canvas.height !== pixelH) canvas.height = pixelH;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  return { canvas, ctx, width: logicalW, height: logicalH, dpr };
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
