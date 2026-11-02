import type { InverseEvent, InverseRequest } from './contracts';
import { validateInverseRequest } from './validation';
import { validateInverseResult } from './artifact';
import { inverseData } from './data';

export interface InverseWorker {
  onmessage: ((event: MessageEvent<InverseEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: InverseRequest): void;
  terminate(): void;
}
export type InverseWorkerFactory = () => InverseWorker;
export interface InverseJob {
  cancel(): void;
  dispose(): void;
}
export const INVERSE_TIMEOUT_MS = 30_000;
const defaultFactory: InverseWorkerFactory = () =>
  new Worker(new URL('./inverse.worker.ts', import.meta.url), { type: 'module' });
/** One request snapshot, one terminable worker, bounded inactivity and validated terminal results. */
export function createInverseJob(
  request: InverseRequest,
  onEvent: (event: InverseEvent) => void,
  factory: InverseWorkerFactory = defaultFactory
): InverseJob {
  let worker: InverseWorker | undefined,
    finished = false,
    id = 'invalid',
    timer: ReturnType<typeof setTimeout> | undefined;
  let snapshot: InverseRequest,
    lastWork = 0,
    lastFraction = 0;
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
    onEvent({ type: 'error', id, message });
  };
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => fail('30초 동안 역문제·UQ worker 응답이 없습니다. 표본·기간·반복 수를 줄여 다시 실행하세요.'),
      INVERSE_TIMEOUT_MS
    );
  };
  try {
    validateInverseRequest(request);
    snapshot = structuredClone(request);
    id = snapshot.id;
    worker = factory();
    const receive = async (event: MessageEvent<InverseEvent>) => {
      if (finished) return;
      try {
        inverseData(event.data);
        if (event.data?.id !== id) return;
        const data = event.data;
        if (data.type === 'progress') {
          if (
            !Number.isSafeInteger(data.work) ||
            data.work < lastWork ||
            !(
              data.fraction === null ||
              (typeof data.fraction === 'number' && data.fraction >= lastFraction && data.fraction <= 1)
            )
          )
            throw new Error('역문제·UQ 진행 정보가 유효하지 않습니다.');
          lastWork = data.work;
          if (data.fraction !== null) lastFraction = data.fraction;
          arm();
        } else if (data.type === 'result') {
          await validateInverseResult(data.result, snapshot);
          if (finished) return;
        } else if (
          data.type !== 'error' ||
          typeof data.message !== 'string' ||
          !data.message ||
          data.message.length > 2000
        )
          throw new Error('역문제·UQ worker 응답이 유효하지 않습니다.');
        if (data.type !== 'progress') stop();
        onEvent(data);
      } catch (cause) {
        fail(cause instanceof Error ? cause.message : '역문제·UQ 결과 검증에 실패했습니다.');
      }
    };
    worker.onmessage = (event) => {
      void receive(event);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail('역문제·UQ worker 실행에 실패했습니다. 입력과 worker 정책을 확인하세요.');
    };
    worker.onmessageerror = () => fail('역문제·UQ worker 결과를 읽을 수 없습니다.');
    arm();
    worker.postMessage(snapshot);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message.slice(0, 1600) : '알 수 없는 오류';
    queueMicrotask(() => fail(`역문제·UQ worker를 시작하지 못했습니다. ${message}`));
  }
  return {
    cancel() {
      if (finished) return;
      stop();
      onEvent({ type: 'cancelled', id });
    },
    dispose: stop
  };
}
