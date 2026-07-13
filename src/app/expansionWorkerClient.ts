import {
  runExpansionJob,
  type ExpansionJobRequest,
  type ExpansionJobResult,
  type ExpansionWorkerResponse
} from '../workers/expansionJobProtocol';
import { notifyWorkerFallback } from '../runtime/workerFallbackNotice';

/**
 * Shared client that runs an Expansion-family job (`suite` / `matrix` /
 * `golden`) on the dedicated worker, with a transparent main-thread fallback —
 * the same pattern as `ChaosClient`. The three Expansion tabs use this so their
 * heavy compute never blocks the simulation/render loop, and none of them has
 * to hand-roll worker lifecycle, timeout, and fallback logic.
 */

export interface ExpansionJobOutcome {
  result: ExpansionJobResult;
  /** True when the result came from the worker, false when the main-thread fallback ran. */
  worker: boolean;
  elapsedMs: number;
  fallbackReason?: string;
}

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `exp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function runOnMainThread(request: ExpansionJobRequest, fallbackReason?: string): ExpansionJobOutcome {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const result = runExpansionJob(request);
  const elapsedMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
  return { result, worker: false, elapsedMs, ...(fallbackReason ? { fallbackReason } : {}) };
}

function workerLoadError(message: string): Error {
  const error = new Error(message);
  error.name = 'ExpansionWorkerLoadError';
  return error;
}

export async function runExpansionWorkerJob(
  request: ExpansionJobRequest,
  timeoutMs = 30_000
): Promise<ExpansionJobOutcome> {
  if (typeof Worker === 'undefined') {
    const reason = 'worker unavailable';
    notifyWorkerFallback('expansion-worker', reason);
    return runOnMainThread(request, reason);
  }
  let worker: Worker;
  try {
    worker = new Worker(new URL('../workers/expansion.worker.ts', import.meta.url), {
      type: 'module',
      name: 'pendulum-expansion-worker'
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'worker creation failed';
    notifyWorkerFallback('expansion-worker', reason);
    return runOnMainThread(request, reason);
  }
  const id = uid();
  const started = performance.now();
  try {
    const result = await new Promise<ExpansionJobResult>((resolve, reject) => {
      const cleanup = (): void => {
        window.clearTimeout(timeout);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        worker.terminate();
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('expansion worker timed out'));
      }, timeoutMs);
      const onError = (event: ErrorEvent): void => {
        cleanup();
        reject(workerLoadError(event.message || 'worker script failed to load'));
      };
      const onMessage = (event: MessageEvent<ExpansionWorkerResponse>): void => {
        if (event.data.id !== id) return;
        cleanup();
        if (event.data.ok) resolve(event.data.result);
        else reject(new Error(`expansion worker job failed: ${event.data.error}`));
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.postMessage({ id, request });
    });
    return { result, worker: true, elapsedMs: performance.now() - started };
  } catch (error) {
    if (error instanceof Error && error.name === 'ExpansionWorkerLoadError') {
      notifyWorkerFallback('expansion-worker', error.message);
      return runOnMainThread(request, error.message);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}
