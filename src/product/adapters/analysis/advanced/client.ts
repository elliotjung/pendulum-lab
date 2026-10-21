import type { AdvancedDiagnosticEvent, AdvancedDiagnosticRequest } from './contracts';
import { validateAdvancedDiagnosticRequest } from './validation';
import {
  validateAdvancedDiagnosticResult,
  validateAdvancedRequestData,
  validateAdvancedSourceMetadata
} from './artifact-validation';

export interface AdvancedDiagnosticWorker {
  onmessage: ((event: MessageEvent<AdvancedDiagnosticEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: AdvancedDiagnosticRequest): void;
  terminate(): void;
}
export type AdvancedDiagnosticWorkerFactory = () => AdvancedDiagnosticWorker;
export interface AdvancedDiagnosticJob {
  cancel(): void;
  dispose(): void;
}
export const ADVANCED_DIAGNOSTIC_TIMEOUT_MS = 30_000;
const defaultFactory: AdvancedDiagnosticWorkerFactory = () =>
  new Worker(new URL('./advanced.worker.ts', import.meta.url), { type: 'module' });

/** A job owns an immutable input snapshot and one terminable, isolated native calculation. */
export function createAdvancedDiagnosticJob(
  request: AdvancedDiagnosticRequest,
  onEvent: (event: AdvancedDiagnosticEvent) => void,
  factory: AdvancedDiagnosticWorkerFactory = defaultFactory
): AdvancedDiagnosticJob {
  let worker: AdvancedDiagnosticWorker | undefined;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastWork = 0;
  let lastFraction = 0;
  let snapshot: AdvancedDiagnosticRequest;
  let id = 'invalid';
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
      () =>
        fail(
          '30초 동안 고급 분석 worker 응답이 없습니다. 작업을 중지했습니다. 해상도·표본·기간을 줄여 다시 실행하세요.'
        ),
      ADVANCED_DIAGNOSTIC_TIMEOUT_MS
    );
  };
  try {
    validateAdvancedRequestData(request);
    if (typeof request.id === 'string') id = request.id.slice(0, 128);
    validateAdvancedDiagnosticRequest(request);
    validateAdvancedSourceMetadata(request);
    snapshot = structuredClone(request);
    worker = factory();
    worker.onmessage = (event) => {
      if (finished || event.data?.id !== id) return;
      const data = event.data;
      if (!['progress', 'result', 'error'].includes(data.type)) {
        fail('고급 분석 worker가 지원하지 않는 응답을 보냈습니다.');
        return;
      }
      if (data.type === 'progress') {
        if (
          !['calculating', 'complete'].includes(data.phase) ||
          !Number.isSafeInteger(data.work) ||
          data.work < lastWork ||
          !(
            data.fraction === null ||
            (Number.isFinite(data.fraction) && data.fraction >= lastFraction && data.fraction <= 1)
          ) ||
          (data.phase === 'complete' && data.fraction !== 1)
        ) {
          fail('고급 분석 worker 진행 정보가 유효하지 않습니다.');
          return;
        }
        lastWork = data.work;
        if (data.fraction !== null) lastFraction = data.fraction;
        arm();
      } else if (data.type === 'result') {
        try {
          validateAdvancedDiagnosticResult(data.result, snapshot);
        } catch {
          fail('고급 분석 worker 결과의 모양·수치·종류·단위가 유효하지 않습니다.');
          return;
        }
      } else if (
        data.type !== 'error' ||
        typeof data.message !== 'string' ||
        !data.message ||
        data.message.length > 2000
      ) {
        fail('고급 분석 worker 오류 응답이 유효하지 않습니다.');
        return;
      }
      if (data.type !== 'progress') stop();
      onEvent(data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail('고급 분석 worker 실행에 실패했습니다. 다시 실행하세요.');
    };
    worker.onmessageerror = () => fail('고급 분석 worker 결과를 읽지 못했습니다. 다시 실행하세요.');
    arm();
    worker.postMessage(snapshot);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message.slice(0, 1600) : '';
    queueMicrotask(() =>
      fail(`고급 분석 worker를 시작하지 못했습니다. 입력과 worker 지원·정책을 확인하세요. ${message}`)
    );
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
