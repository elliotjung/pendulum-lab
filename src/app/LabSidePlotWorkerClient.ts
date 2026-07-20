import { getCanvasDprCap } from './canvasQuality';
import {
  isLabSidePlotPayload,
  isLabSidePlotWorkerResponse,
  sidePlotTransferables,
  type LabSidePlotId,
  type LabSidePlotPayload,
  type LabSidePlotWorkerMessage,
  type LabSidePlotWorkerResponse
} from './LabSidePlotProtocol';

type SidePlotCanvasMap = Partial<Record<LabSidePlotId, HTMLCanvasElement | undefined>>;
export type SidePlotReplacementMap = Partial<Record<LabSidePlotId, HTMLCanvasElement>>;

export interface LabSidePlotWorkerLike {
  postMessage(message: LabSidePlotWorkerMessage, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<LabSidePlotWorkerResponse>) => void): void;
  addEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<LabSidePlotWorkerResponse>) => void): void;
  removeEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
  terminate(): void;
}

export interface LabSidePlotWorkerClientOptions {
  createWorker?: () => LabSidePlotWorkerLike;
  onFallback?: (replacements: SidePlotReplacementMap, reason: string) => void;
  readyTimeoutMs?: number;
}

function defaultWorker(): LabSidePlotWorkerLike {
  return new Worker(new URL('../workers/labSidePlots.worker.ts', import.meta.url), {
    type: 'module',
    name: 'pendulum-lab-side-plots'
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message
    ? error.message
    : typeof error === 'string' && error.length > 0
      ? error
      : fallback;
}

export class LabSidePlotWorkerClient {
  private worker: LabSidePlotWorkerLike | null = null;
  private enabled = false;
  private failed = false;
  private disposed = false;
  private readonly canvases: SidePlotCanvasMap = {};
  private readonly fallbacks: SidePlotReplacementMap = {};
  private readonly ready = new Set<LabSidePlotId>();
  private readonly inFlight = new Set<LabSidePlotId>();
  private readonly pending = new Map<LabSidePlotId, LabSidePlotPayload>();
  private lastRenderElapsedMs = 0;
  private failureReason: string | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly onMessage = (event: MessageEvent<LabSidePlotWorkerResponse>): void => this.receive(event.data);
  private readonly onError = (): void => this.fail('side-plot worker error');
  private readonly onMessageError = (): void => this.fail('side-plot worker message decode error');

  constructor(private readonly options: LabSidePlotWorkerClientOptions = {}) {}

  ensure(canvases: SidePlotCanvasMap): boolean {
    if (this.enabled) return true;
    if (this.failed || this.disposed) return false;
    if (!this.options.createWorker && !canUseOffscreenWorker()) {
      this.failureReason = 'OffscreenCanvas worker unavailable';
      this.failed = true;
      return false;
    }

    let worker: LabSidePlotWorkerLike;
    const readyTimeoutMs = this.options.readyTimeoutMs ?? 2_000;
    if (!Number.isSafeInteger(readyTimeoutMs) || readyTimeoutMs < 1 || readyTimeoutMs > 60_000) {
      this.failureReason = 'side-plot worker ready timeout must be a safe integer in [1, 60000]';
      this.failed = true;
      return false;
    }
    try {
      worker = (this.options.createWorker ?? defaultWorker)();
    } catch (error) {
      this.failureReason = `side-plot worker creation failed: ${errorMessage(error, 'unknown error')}`;
      this.failed = true;
      return false;
    }

    try {
      this.worker = worker;
      this.enabled = true;
      worker.addEventListener('message', this.onMessage);
      worker.addEventListener('messageerror', this.onMessageError);
      worker.addEventListener('error', this.onError);
      for (const [plot, canvas] of Object.entries(canvases) as Array<[LabSidePlotId, HTMLCanvasElement | undefined]>) {
        if (!canvas || typeof canvas.transferControlToOffscreen !== 'function') continue;
        const fallback = canvas.cloneNode(false) as HTMLCanvasElement;
        const offscreen = canvas.transferControlToOffscreen();
        this.canvases[plot] = canvas;
        this.fallbacks[plot] = fallback;
        worker.postMessage({ kind: 'canvas', plot, canvas: offscreen }, [offscreen]);
      }
    } catch (error) {
      this.fail(`side-plot canvas transfer failed: ${errorMessage(error, 'unknown transfer error')}`);
      return false;
    }

    if (Object.keys(this.canvases).length === 0) {
      this.fail('no transferable side-plot canvas was available', false);
      return false;
    }
    if (this.ready.size < Object.keys(this.canvases).length) {
      this.readyTimer = setTimeout(() => this.fail('side-plot worker ready timeout'), readyTimeoutMs);
    }
    return this.enabled;
  }

  render(payload: LabSidePlotPayload): boolean {
    if (!this.enabled || !this.worker) return false;
    if (!isLabSidePlotPayload(payload) || !this.canvases[payload.plot]) {
      this.fail('side-plot payload is malformed or has no transferred canvas');
      return false;
    }
    if (!this.ready.has(payload.plot) || this.inFlight.has(payload.plot)) {
      // At most one render per plot crosses the boundary; newer data replaces
      // the queued snapshot while the worker is initializing or rendering.
      this.pending.set(payload.plot, payload);
      return true;
    }
    return this.send(payload);
  }

  usesWorker(): boolean {
    return this.enabled;
  }

  renderMs(): number {
    return this.lastRenderElapsedMs;
  }

  lastFailureReason(): string | null {
    return this.failureReason;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.shutdown(true, false);
  }

  private send(payload: LabSidePlotPayload): boolean {
    const worker = this.worker;
    const canvas = this.canvases[payload.plot];
    if (!worker || !canvas) return false;
    try {
      const size = measureCanvas(canvas);
      const message = {
        kind: 'render',
        plot: payload.plot,
        width: size.width,
        height: size.height,
        dpr: size.dpr,
        payload
      } satisfies LabSidePlotWorkerMessage;
      const transfer = sidePlotTransferables(payload);
      this.inFlight.add(payload.plot);
      worker.postMessage(message, transfer);
      return true;
    } catch (error) {
      this.inFlight.delete(payload.plot);
      this.fail(`side-plot postMessage failed: ${errorMessage(error, 'unknown transfer error')}`);
      return false;
    }
  }

  private receive(value: unknown): void {
    if (!this.enabled) return;
    if (!isLabSidePlotWorkerResponse(value)) {
      this.fail('side-plot worker emitted a malformed response');
      return;
    }
    const response = value;
    if (response.kind === 'error') {
      this.fail(response.detail);
      return;
    }
    if (!this.canvases[response.plot]) {
      this.fail('side-plot worker responded for an unowned canvas');
      return;
    }
    if (response.kind === 'ready') {
      if (this.ready.has(response.plot)) {
        this.fail('side-plot worker emitted duplicate ready');
        return;
      }
      this.ready.add(response.plot);
      if (this.ready.size === Object.keys(this.canvases).length) this.clearReadyTimer();
      this.flush(response.plot);
      return;
    }
    if (response.kind === 'dropped') {
      this.fail('side-plot worker dropped a frame outside the client backpressure contract');
      return;
    }
    if (!this.inFlight.delete(response.plot)) {
      this.fail('side-plot worker rendered a frame that was not in flight');
      return;
    }
    this.lastRenderElapsedMs = response.elapsedMs;
    this.flush(response.plot);
  }

  private flush(plot: LabSidePlotId): void {
    if (!this.enabled || !this.ready.has(plot) || this.inFlight.has(plot)) return;
    const payload = this.pending.get(plot);
    if (!payload) return;
    this.pending.delete(plot);
    this.send(payload);
  }

  private fail(reason: string, recover = true): void {
    if (!this.enabled && !this.worker && Object.keys(this.canvases).length === 0) {
      this.failureReason ??= reason;
      this.failed = true;
      return;
    }
    this.failureReason = reason;
    this.failed = true;
    this.shutdown(recover, true);
  }

  private shutdown(recover: boolean, notify: boolean): void {
    const worker = this.worker;
    this.worker = null;
    this.enabled = false;
    this.ready.clear();
    this.inFlight.clear();
    this.pending.clear();
    this.clearReadyTimer();
    if (worker) {
      try {
        worker.removeEventListener('message', this.onMessage);
      } catch {
        // Continue removing the remaining listeners.
      }
      try {
        worker.removeEventListener('messageerror', this.onMessageError);
      } catch {
        // Continue removing the remaining listeners.
      }
      try {
        worker.removeEventListener('error', this.onError);
      } catch {
        // Continue with termination and DOM recovery.
      }
      try {
        worker.terminate();
      } catch {
        // A broken worker cannot block replacement of transferred canvases.
      }
    }

    const replacements: SidePlotReplacementMap = {};
    if (recover) {
      for (const plot of Object.keys(this.canvases) as LabSidePlotId[]) {
        const source = this.canvases[plot];
        const fallback = this.fallbacks[plot];
        if (!source || !fallback) continue;
        if (source.isConnected) source.replaceWith(fallback);
        replacements[plot] = fallback;
      }
    }
    this.canvasesClear();
    if (notify && this.failureReason) {
      try {
        this.options.onFallback?.(replacements, this.failureReason);
      } catch {
        // Host diagnostics are best-effort; recovery is already complete.
      }
    }
  }

  private canvasesClear(): void {
    for (const key of Object.keys(this.canvases) as LabSidePlotId[]) delete this.canvases[key];
    for (const key of Object.keys(this.fallbacks) as LabSidePlotId[]) delete this.fallbacks[key];
  }

  private clearReadyTimer(): void {
    if (this.readyTimer === null) return;
    clearTimeout(this.readyTimer);
    this.readyTimer = null;
  }
}

function canUseOffscreenWorker(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

function measureCanvas(canvas: HTMLCanvasElement): { width: number; height: number; dpr: number } {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width || canvas.clientWidth || canvas.width || 1));
  const height = Math.max(1, Math.floor(rect.height || canvas.clientHeight || canvas.height || 1));
  const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const dpr = Math.min(getCanvasDprCap(), Math.max(1, devicePixelRatio));
  return { width, height, dpr };
}
