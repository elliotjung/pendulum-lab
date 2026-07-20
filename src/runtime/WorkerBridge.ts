import { eventBus } from './EventBus';
import { eulerStep, rk2Step, rk4Step } from '../physics/integrators';
import { notifyWorkerFallback } from './workerFallbackNotice';

export interface WorkerStepRequest {
  state: number[];
  dt: number;
  steps: number;
  method: 'rk4' | 'rk2' | 'euler';
}

export interface WorkerStepResult {
  state: number[];
  elapsedMs: number;
  fallback: boolean;
  fallbackReason?: string;
}

export interface WorkerStepOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class WorkerBridgeTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`worker step timed out after ${timeoutMs}ms`);
    this.name = 'WorkerBridgeTimeoutError';
  }
}

export class WorkerBridgeAbortError extends Error {
  constructor() {
    super('worker step was aborted');
    this.name = 'WorkerBridgeAbortError';
  }
}

export class WorkerBridgeTerminatedError extends Error {
  constructor() {
    super('worker bridge was terminated');
    this.name = 'WorkerBridgeTerminatedError';
  }
}

interface PendingWorkerStep {
  cleanup: () => void;
  reject: (reason: Error) => void;
}

export class WorkerBridge {
  private worker: Worker | null = null;
  private readonly pending = new Map<string, PendingWorkerStep>();
  private startFailureReason = 'worker unavailable';

  constructor(private readonly url = new URL('../workers/physics.worker.ts', import.meta.url)) {}

  available(): boolean {
    return typeof Worker !== 'undefined';
  }

  start(): boolean {
    if (!this.available()) {
      this.startFailureReason = 'worker unavailable';
      notifyWorkerFallback('physics-worker', 'worker unavailable');
      return false;
    }
    if (this.worker) return true;
    try {
      this.worker = new Worker(this.url, { type: 'module', name: 'pendulum-physics-worker' });
      return true;
    } catch (error) {
      this.worker = null;
      this.startFailureReason = error instanceof Error ? error.message : String(error);
      notifyWorkerFallback('physics-worker', error);
      return false;
    }
  }

  async step(request: WorkerStepRequest, options: WorkerStepOptions = {}): Promise<WorkerStepResult> {
    this.validateRequest(request);
    const snapshot: WorkerStepRequest = { ...request, state: [...request.state] };
    const timeoutMs = options.timeoutMs ?? 2_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) {
      throw new RangeError('worker step timeout must be a safe integer in [1, 600000]');
    }
    if (options.signal?.aborted) throw new WorkerBridgeAbortError();
    if (!this.available()) {
      notifyWorkerFallback('physics-worker', 'worker unavailable');
      return this.fallbackStep(snapshot, 'worker unavailable');
    }
    if (!this.start() || !this.worker) return this.fallbackStep(snapshot, this.startFailureReason);
    const started = performance.now();
    const worker = this.worker;
    try {
      return await new Promise<WorkerStepResult>((resolve, reject) => {
        const id = crypto.randomUUID();
        const timeout = globalThis.setTimeout(() => {
          cleanup();
          reject(new WorkerBridgeTimeoutError(timeoutMs));
        }, timeoutMs);
        const cleanup = () => {
          globalThis.clearTimeout(timeout);
          try {
            worker.removeEventListener('message', onMessage);
          } catch {
            // Promise settlement must not depend on a Worker shim's cleanup.
          }
          try {
            worker.removeEventListener('error', onError);
          } catch {
            // Continue cleanup.
          }
          try {
            worker.removeEventListener('messageerror', onMessageError);
          } catch {
            // Continue cleanup.
          }
          options.signal?.removeEventListener('abort', onAbort);
          this.pending.delete(id);
        };
        const onError = (event: ErrorEvent) => {
          cleanup();
          reject(event.error instanceof Error ? event.error : new Error(event.message));
        };
        const onMessageError = () => {
          cleanup();
          reject(new Error('worker response could not be decoded'));
        };
        const onAbort = () => {
          cleanup();
          reject(new WorkerBridgeAbortError());
        };
        const onMessage = (event: MessageEvent<{ id: string; state: number[]; elapsedMs: number }>) => {
          try {
            if (event.data?.id !== id) return;
            this.validateResult(event.data, request.state.length);
            cleanup();
            const latencyMs = performance.now() - started;
            eventBus.emit('worker:latency', { latencyMs });
            resolve({ state: event.data.state, elapsedMs: event.data.elapsedMs, fallback: false });
          } catch (error) {
            cleanup();
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.addEventListener('messageerror', onMessageError);
        this.pending.set(id, { cleanup, reject });
        options.signal?.addEventListener('abort', onAbort, { once: true });
        if (options.signal?.aborted) {
          onAbort();
          return;
        }
        try {
          worker.postMessage({ ...snapshot, id });
        } catch (error) {
          cleanup();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    } catch (error) {
      if (error instanceof WorkerBridgeTerminatedError || error instanceof WorkerBridgeAbortError) throw error;
      this.terminate();
      const detail = notifyWorkerFallback('physics-worker', error, { once: false });
      const fallback = this.fallbackStep(snapshot, detail.reason);
      return { ...fallback, fallbackReason: detail.reason };
    }
  }

  terminate(): void {
    const terminationError = new WorkerBridgeTerminatedError();
    for (const pending of [...this.pending.values()]) {
      pending.cleanup();
      pending.reject(terminationError);
    }
    this.pending.clear();
    try {
      this.worker?.terminate();
    } catch {
      // Pending promises are already settled; a broken shim cannot block cleanup.
    }
    this.worker = null;
  }

  private validateRequest(request: WorkerStepRequest): void {
    if (!Array.isArray(request.state) || request.state.length !== 2) {
      throw new RangeError('worker step state must contain exactly 2 harmonic-oscillator values');
    }
    for (let index = 0; index < request.state.length; index += 1) {
      if (!Object.hasOwn(request.state, index) || !Number.isFinite(request.state[index])) {
        throw new RangeError('worker step state must be dense and finite');
      }
    }
    if (!Number.isFinite(request.dt) || request.dt <= 0 || request.dt > 1) {
      throw new RangeError('worker step dt must be finite and in (0, 1]');
    }
    if (!Number.isSafeInteger(request.steps) || request.steps < 1 || request.steps > 100_000) {
      throw new RangeError('worker step count must be a safe integer in [1, 100000]');
    }
    if (request.method !== 'rk4' && request.method !== 'rk2' && request.method !== 'euler') {
      throw new RangeError('worker step method is unsupported');
    }
    const stageMultiplier = request.method === 'rk4' ? 4 : request.method === 'rk2' ? 2 : 1;
    if (request.state.length * request.steps * stageMultiplier > 10_000_000) {
      throw new RangeError('worker step aggregate component work exceeds 10000000 stage-components');
    }
  }

  private validateResult(result: { state: number[]; elapsedMs: number }, expectedLength: number): void {
    if (!Array.isArray(result.state) || result.state.length !== expectedLength) {
      throw new Error('worker step returned a state with the wrong dimension');
    }
    for (let index = 0; index < result.state.length; index += 1) {
      if (!Object.hasOwn(result.state, index) || !Number.isFinite(result.state[index])) {
        throw new Error('worker step returned a sparse or non-finite state');
      }
    }
    if (!Number.isFinite(result.elapsedMs) || result.elapsedMs < 0) {
      throw new Error('worker step returned an invalid elapsed time');
    }
  }

  private fallbackStep(request: WorkerStepRequest, fallbackReason?: string): WorkerStepResult {
    const started = performance.now();
    const state = new Float64Array(request.state);
    const out = new Float64Array(state.length);
    const step = request.method === 'euler' ? eulerStep : request.method === 'rk2' ? rk2Step : rk4Step;
    const rhs = (s: Float64Array, o: Float64Array) => {
      o[0] = s[1] ?? 0;
      o[1] = -(s[0] ?? 0);
    };
    for (let i = 0; i < request.steps; i += 1) {
      step(state, request.dt, rhs, out);
      state.set(out);
    }
    const result = { state: Array.from(state), elapsedMs: performance.now() - started };
    this.validateResult(result, request.state.length);
    return { ...result, fallback: true, ...(fallbackReason ? { fallbackReason } : {}) };
  }
}

export const workerBridge = new WorkerBridge();
