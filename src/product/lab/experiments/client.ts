import type { BatchExecutor, BatchWorkerEvent, BatchWorkerRequest } from './contracts';
import { validateBatchResult } from './validation';
export interface BatchWorker {
  onmessage: ((event: MessageEvent<BatchWorkerEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: BatchWorkerRequest): void;
  terminate(): void;
}
export type BatchWorkerFactory = () => BatchWorker;
export const BATCH_WORKER_TIMEOUT_MS = 30_000;
const defaultFactory: BatchWorkerFactory = () =>
  new Worker(new URL('./batch.worker.ts', import.meta.url), { type: 'module' });
export function createBatchExecutor(factory: BatchWorkerFactory = defaultFactory): BatchExecutor {
  return (request, onEvent) => {
    let worker: BatchWorker | undefined,
      finished = false,
      last = 0,
      timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
        worker.terminate();
      }
    };
    const fail = (message: string) => {
      if (finished) return;
      stop();
      onEvent({ type: 'error', id: request.run.id, message });
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => fail('30초 동안 run worker 응답이 없습니다. 기간·차원을 줄여 실패 run을 다시 실행하세요.'),
        BATCH_WORKER_TIMEOUT_MS
      );
    };
    try {
      worker = factory();
      worker.onmessage = (event) => {
        const data = event.data;
        if (finished || data?.id !== request.run.id) return;
        if (data.type === 'progress') {
          if (!Number.isFinite(data.fraction) || data.fraction < last || data.fraction > 1) {
            fail('run worker 진행률이 올바르지 않습니다.');
            return;
          }
          last = data.fraction;
          arm();
        } else if (data.type === 'result') {
          try {
            validateBatchResult(data.result, request);
          } catch {
            fail('run worker 결과·단위·입력 계보가 올바르지 않습니다.');
            return;
          }
          stop();
        } else if (data.type === 'error') {
          if (typeof data.message !== 'string' || !data.message.length) {
            fail('run worker 오류 응답이 올바르지 않습니다.');
            return;
          }
          stop();
        } else {
          fail('지원하지 않는 run worker 응답입니다.');
          return;
        }
        onEvent(data);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        fail('run worker 계산에 실패했습니다. 실패 run을 다시 실행하세요.');
      };
      worker.onmessageerror = () => fail('run worker 응답을 읽지 못했습니다.');
      arm();
      worker.postMessage(request);
    } catch {
      queueMicrotask(() => fail('이 환경에서 run worker를 시작하지 못했습니다. worker 정책·지원을 확인하세요.'));
    }
    return { dispose: stop };
  };
}
