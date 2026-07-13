import type { BobPosition } from './LabSimulation';
import {
  packBobPositions,
  type MainCanvasFrameStyle,
  type MainCanvasWorkerMessage,
  type MainCanvasWorkerResponse
} from './MainCanvasWorkerProtocol';

export interface MainCanvasWorkerLike {
  postMessage(message: MainCanvasWorkerMessage, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<MainCanvasWorkerResponse>) => void): void;
  addEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
  terminate(): void;
}

export interface MainCanvasWorkerClientOptions {
  createWorker?: () => MainCanvasWorkerLike;
  onFallback?: (replacement: HTMLCanvasElement, reason: string) => void;
  dprCap?: number;
}

export interface MainCanvasFrame {
  bobs: readonly BobPosition[];
  /** Ensemble final-bob positions in metres; the worker owns projection. */
  ensembleBobs: readonly BobPosition[];
  style: MainCanvasFrameStyle;
}

export function mainCanvasWorkerRequested(search = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(search).get('mainCanvasWorker') === '1';
}

export function mainCanvasWorkerSupported(canvas: HTMLCanvasElement): boolean {
  return typeof Worker !== 'undefined'
    && typeof OffscreenCanvas !== 'undefined'
    && typeof canvas.transferControlToOffscreen === 'function';
}

function defaultWorker(): MainCanvasWorkerLike {
  return new Worker(new URL('../workers/mainCanvas.worker.ts', import.meta.url), { type: 'module' });
}

function canvasMetrics(canvas: HTMLCanvasElement, dprCap: number): { width: number; height: number; dpr: number } {
  const rect = canvas.getBoundingClientRect();
  const attrWidth = Number.parseInt(canvas.getAttribute('width') ?? '', 10);
  const attrHeight = Number.parseInt(canvas.getAttribute('height') ?? '', 10);
  const width = rect.width > 8 ? Math.round(rect.width) : Math.max(1, attrWidth || canvas.width || 300);
  const height = rect.height > 8 ? Math.round(rect.height) : Math.max(1, attrHeight || canvas.height || 150);
  const dpr = Math.min(Math.max(1, dprCap), Math.max(1, window.devicePixelRatio || 1));
  return { width, height, dpr };
}

/**
 * Owns the transferred main canvas. Construction is attempted only after the
 * explicit query opt-in. A worker/runtime error replaces the transferred node
 * with an untouched clone, allowing LabApp's normal Canvas2D discovery to
 * resume on the next frame.
 */
export class MainCanvasWorkerClient {
  private active = true;
  private ready = false;
  private sequence = 0;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastDpr = 0;
  private readonly fallbackCanvas: HTMLCanvasElement;

  constructor(
    private readonly sourceCanvas: HTMLCanvasElement,
    private readonly worker: MainCanvasWorkerLike,
    private readonly options: MainCanvasWorkerClientOptions,
    offscreen: OffscreenCanvas
  ) {
    this.fallbackCanvas = sourceCanvas.cloneNode(false) as HTMLCanvasElement;
    worker.addEventListener('message', (event) => this.receive(event.data));
    worker.addEventListener('error', () => this.fallback('worker error'));
    worker.addEventListener('messageerror', () => this.fallback('worker message decode error'));

    const metrics = canvasMetrics(sourceCanvas, options.dprCap ?? 2);
    this.lastWidth = metrics.width;
    this.lastHeight = metrics.height;
    this.lastDpr = metrics.dpr;
    const message: MainCanvasWorkerMessage = { kind: 'init', canvas: offscreen, ...metrics };
    worker.postMessage(message, [offscreen]);
  }

  isActive(): boolean {
    return this.active;
  }

  isReady(): boolean {
    return this.ready;
  }

  draw(frame: MainCanvasFrame): boolean {
    if (!this.active) return false;
    this.resizeIfNeeded();
    const bobs = packBobPositions(frame.bobs);
    const ensembleBobs = packBobPositions(frame.ensembleBobs);
    const message: MainCanvasWorkerMessage = {
      kind: 'frame',
      sequence: ++this.sequence,
      bobs,
      ensembleBobs,
      style: frame.style
    };
    this.worker.postMessage(message, [bobs.buffer, ensembleBobs.buffer]);
    return true;
  }

  clear(): void {
    if (this.active) this.worker.postMessage({ kind: 'clear' });
  }

  dispose(): void {
    if (!this.active) return;
    this.worker.postMessage({ kind: 'dispose' });
    this.worker.terminate();
    this.active = false;
  }

  private resizeIfNeeded(): void {
    const metrics = canvasMetrics(this.sourceCanvas, this.options.dprCap ?? 2);
    if (metrics.width === this.lastWidth && metrics.height === this.lastHeight && metrics.dpr === this.lastDpr) return;
    this.lastWidth = metrics.width;
    this.lastHeight = metrics.height;
    this.lastDpr = metrics.dpr;
    this.worker.postMessage({ kind: 'resize', ...metrics });
  }

  private receive(response: MainCanvasWorkerResponse): void {
    if (response.kind === 'ready') this.ready = true;
    else if (response.kind === 'error') this.fallback(response.detail);
  }

  private fallback(reason: string): void {
    if (!this.active) return;
    this.active = false;
    this.worker.terminate();
    if (this.sourceCanvas.isConnected) this.sourceCanvas.replaceWith(this.fallbackCanvas);
    this.options.onFallback?.(this.fallbackCanvas, reason);
  }
}

/** Synchronous capability/transfer failures leave the original canvas intact. */
export function tryCreateMainCanvasWorkerClient(
  canvas: HTMLCanvasElement,
  options: MainCanvasWorkerClientOptions = {}
): MainCanvasWorkerClient | null {
  if (!mainCanvasWorkerSupported(canvas)) return null;
  let worker: MainCanvasWorkerLike | null = null;
  const fallbackCanvas = canvas.cloneNode(false) as HTMLCanvasElement;
  let transferred = false;
  try {
    worker = (options.createWorker ?? defaultWorker)();
    const offscreen = canvas.transferControlToOffscreen();
    transferred = true;
    return new MainCanvasWorkerClient(canvas, worker, options, offscreen);
  } catch {
    worker?.terminate();
    if (transferred && canvas.isConnected) canvas.replaceWith(fallbackCanvas);
    return null;
  }
}
