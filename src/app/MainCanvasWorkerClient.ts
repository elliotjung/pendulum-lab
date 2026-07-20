import type { BobPosition } from './LabSimulation';
import {
  isMainCanvasWorkerResponse,
  packBobPositions,
  type MainCanvasFrameStyle,
  type MainCanvasWorkerMessage,
  type MainCanvasWorkerResponse
} from './MainCanvasWorkerProtocol';

export interface MainCanvasWorkerLike {
  postMessage(message: MainCanvasWorkerMessage, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<MainCanvasWorkerResponse>) => void): void;
  addEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<MainCanvasWorkerResponse>) => void): void;
  removeEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
  terminate(): void;
}

export interface MainCanvasWorkerClientOptions {
  createWorker?: () => MainCanvasWorkerLike;
  onFallback?: (replacement: HTMLCanvasElement, reason: string) => void;
  dprCap?: number;
  readyTimeoutMs?: number;
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
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof canvas.transferControlToOffscreen === 'function'
  );
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
  const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const dpr = Math.min(Math.max(1, dprCap), Math.max(1, devicePixelRatio));
  return { width, height, dpr };
}

function safeTerminate(worker: MainCanvasWorkerLike): void {
  try {
    worker.terminate();
  } catch {
    // Canvas recovery must continue even for a broken Worker shim.
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === 'string' && error.length > 0 ? error : fallback;
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
  private inFlightSequence: number | null = null;
  private pendingFrame: MainCanvasFrame | null = null;
  private pendingResize = false;
  private pendingClear = false;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastDpr = 0;
  private readonly fallbackCanvas: HTMLCanvasElement;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly onMessage = (event: MessageEvent<MainCanvasWorkerResponse>): void => this.receive(event.data);
  private readonly onError = (): void => this.fallback('worker error');
  private readonly onMessageError = (): void => this.fallback('worker message decode error');

  constructor(
    private readonly sourceCanvas: HTMLCanvasElement,
    private readonly worker: MainCanvasWorkerLike,
    private readonly options: MainCanvasWorkerClientOptions,
    offscreen: OffscreenCanvas
  ) {
    this.fallbackCanvas = sourceCanvas.cloneNode(false) as HTMLCanvasElement;
    worker.addEventListener('message', this.onMessage);
    worker.addEventListener('error', this.onError);
    worker.addEventListener('messageerror', this.onMessageError);

    const metrics = canvasMetrics(sourceCanvas, options.dprCap ?? 2);
    this.lastWidth = metrics.width;
    this.lastHeight = metrics.height;
    this.lastDpr = metrics.dpr;
    const message: MainCanvasWorkerMessage = { kind: 'init', canvas: offscreen, ...metrics };
    const readyTimeoutMs = options.readyTimeoutMs ?? 2_000;
    if (!Number.isSafeInteger(readyTimeoutMs) || readyTimeoutMs < 1 || readyTimeoutMs > 60_000) {
      this.detachListeners();
      throw new RangeError('main canvas worker ready timeout must be a safe integer in [1, 60000]');
    }
    this.readyTimer = setTimeout(() => this.fallback('worker ready timeout'), readyTimeoutMs);
    try {
      worker.postMessage(message, [offscreen]);
    } catch (error) {
      this.clearReadyTimer();
      this.detachListeners();
      throw error;
    }
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
    if (!this.active) return false;
    // Before ready, and while one render is in flight, keep only the newest
    // frame. This bounds structured-clone traffic to one transferable frame.
    this.pendingFrame = frame;
    this.flushFrame();
    return this.active;
  }

  clear(): void {
    if (!this.active) return;
    this.pendingFrame = null;
    if (!this.ready) {
      this.pendingClear = true;
      return;
    }
    this.safePost({ kind: 'clear' });
  }

  dispose(): void {
    if (!this.active) return;
    this.active = false;
    this.ready = false;
    this.pendingFrame = null;
    this.clearReadyTimer();
    this.detachListeners();
    try {
      this.worker.postMessage({ kind: 'dispose' });
    } catch {
      // Termination below is the authoritative cleanup path.
    }
    safeTerminate(this.worker);
  }

  private resizeIfNeeded(): void {
    const metrics = canvasMetrics(this.sourceCanvas, this.options.dprCap ?? 2);
    if (metrics.width === this.lastWidth && metrics.height === this.lastHeight && metrics.dpr === this.lastDpr) return;
    this.lastWidth = metrics.width;
    this.lastHeight = metrics.height;
    this.lastDpr = metrics.dpr;
    if (!this.ready) {
      this.pendingResize = true;
      return;
    }
    this.safePost({ kind: 'resize', ...metrics });
  }

  private receive(value: unknown): void {
    if (!this.active) return;
    if (!isMainCanvasWorkerResponse(value)) {
      this.fallback('worker emitted a malformed response');
      return;
    }
    const response = value;
    if (response.kind === 'ready') {
      if (this.ready) {
        this.fallback('worker emitted duplicate ready');
        return;
      }
      this.ready = true;
      this.clearReadyTimer();
      if (this.pendingResize) {
        this.pendingResize = false;
        if (!this.safePost({ kind: 'resize', width: this.lastWidth, height: this.lastHeight, dpr: this.lastDpr }))
          return;
      }
      if (this.pendingClear) {
        this.pendingClear = false;
        if (!this.safePost({ kind: 'clear' })) return;
      }
      this.flushFrame();
      return;
    }
    if (response.kind === 'error') {
      this.fallback(response.detail);
      return;
    }
    if (this.inFlightSequence === null || response.sequence !== this.inFlightSequence) {
      this.fallback('worker rendered an unexpected frame sequence');
      return;
    }
    this.inFlightSequence = null;
    this.flushFrame();
  }

  private flushFrame(): void {
    if (!this.active || !this.ready || this.inFlightSequence !== null || !this.pendingFrame) return;
    const frame = this.pendingFrame;
    this.pendingFrame = null;
    try {
      const bobs = packBobPositions(frame.bobs);
      const ensembleBobs = packBobPositions(frame.ensembleBobs);
      const sequence = ++this.sequence;
      const message: MainCanvasWorkerMessage = {
        kind: 'frame',
        sequence,
        bobs,
        ensembleBobs,
        style: { ...frame.style }
      };
      this.inFlightSequence = sequence;
      if (!this.safePost(message, [bobs.buffer, ensembleBobs.buffer])) this.inFlightSequence = null;
    } catch (error) {
      this.fallback(`invalid main canvas frame: ${errorMessage(error, 'frame validation failed')}`);
    }
  }

  private safePost(message: MainCanvasWorkerMessage, transfer?: Transferable[]): boolean {
    if (!this.active) return false;
    try {
      this.worker.postMessage(message, transfer);
      return true;
    } catch (error) {
      this.fallback(`worker postMessage failed: ${errorMessage(error, 'unknown transfer failure')}`);
      return false;
    }
  }

  private fallback(reason: string): void {
    if (!this.active) return;
    this.active = false;
    this.ready = false;
    this.pendingFrame = null;
    this.inFlightSequence = null;
    this.clearReadyTimer();
    this.detachListeners();
    safeTerminate(this.worker);
    if (this.sourceCanvas.isConnected) this.sourceCanvas.replaceWith(this.fallbackCanvas);
    try {
      this.options.onFallback?.(this.fallbackCanvas, reason);
    } catch {
      // Host callbacks cannot prevent Canvas2D recovery.
    }
  }

  private clearReadyTimer(): void {
    if (this.readyTimer === null) return;
    clearTimeout(this.readyTimer);
    this.readyTimer = null;
  }

  private detachListeners(): void {
    try {
      this.worker.removeEventListener('message', this.onMessage);
    } catch {
      // Continue removing the remaining listeners.
    }
    try {
      this.worker.removeEventListener('error', this.onError);
    } catch {
      // Continue removing the remaining listeners.
    }
    try {
      this.worker.removeEventListener('messageerror', this.onMessageError);
    } catch {
      // Worker shims may reject listener cleanup; termination still proceeds.
    }
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
  } catch (error) {
    if (worker) safeTerminate(worker);
    if (transferred && canvas.isConnected) canvas.replaceWith(fallbackCanvas);
    if (transferred) {
      try {
        options.onFallback?.(fallbackCanvas, `worker initialization failed: ${errorMessage(error, 'unknown error')}`);
      } catch {
        // Recovery is already complete; callback diagnostics are best-effort.
      }
    }
    return null;
  }
}
