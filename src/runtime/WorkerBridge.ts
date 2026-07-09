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

export class WorkerBridge {
  private worker: Worker | null = null;

  constructor(private readonly url = new URL('../workers/physics.worker.ts', import.meta.url)) {}

  available(): boolean {
    return typeof Worker !== 'undefined';
  }

  start(): boolean {
    if (!this.available()) {
      notifyWorkerFallback('physics-worker', 'worker unavailable');
      return false;
    }
    if (this.worker) return true;
    try {
      this.worker = new Worker(this.url, { type: 'module', name: 'pendulum-physics-worker' });
      return true;
    } catch (error) {
      this.worker = null;
      notifyWorkerFallback('physics-worker', error);
      return false;
    }
  }

  async step(request: WorkerStepRequest): Promise<WorkerStepResult> {
    if (!this.available()) {
      notifyWorkerFallback('physics-worker', 'worker unavailable');
      return this.fallbackStep(request);
    }
    if (!this.start() || !this.worker) return this.fallbackStep(request);
    const started = performance.now();
    const worker = this.worker;
    try {
      return await new Promise<WorkerStepResult>((resolve, reject) => {
        const id = crypto.randomUUID();
        const timeout = globalThis.setTimeout(() => {
          cleanup();
          reject(new Error('worker step timed out'));
        }, 2_000);
        const cleanup = () => {
          globalThis.clearTimeout(timeout);
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
        };
        const onError = (event: ErrorEvent) => {
          cleanup();
          reject(event.error instanceof Error ? event.error : new Error(event.message));
        };
        const onMessage = (event: MessageEvent<{ id: string; state: number[]; elapsedMs: number }>) => {
          if (event.data.id !== id) return;
          cleanup();
          const latencyMs = performance.now() - started;
          eventBus.emit('worker:latency', { latencyMs });
          resolve({ state: event.data.state, elapsedMs: event.data.elapsedMs, fallback: false });
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        try {
          worker.postMessage({ ...request, id });
        } catch (error) {
          cleanup();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    } catch (error) {
      this.terminate();
      const detail = notifyWorkerFallback('physics-worker', error, { once: false });
      const fallback = this.fallbackStep(request);
      return { ...fallback, fallbackReason: detail.reason };
    }
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private fallbackStep(request: WorkerStepRequest): WorkerStepResult {
    const started = performance.now();
    const state = new Float64Array(request.state);
    const out = new Float64Array(state.length);
    const step = request.method === 'euler' ? eulerStep : request.method === 'rk2' ? rk2Step : rk4Step;
    const rhs = (s: Float64Array, o: Float64Array) => {
      o[0] = s[1] ?? 0;
      o[1] = -(s[0] ?? 0);
    };
    for (let i = 0; i < Math.max(1, request.steps); i += 1) {
      step(state, request.dt, rhs, out);
      state.set(out);
    }
    return { state: Array.from(state), elapsedMs: performance.now() - started, fallback: true };
  }
}

export const workerBridge = new WorkerBridge();
