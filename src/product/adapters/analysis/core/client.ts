import type { CoreDiagnosticEvent, CoreDiagnosticRequest } from './contracts';
import { validateCoreDiagnosticResult } from './artifact-validation';
export interface CoreDiagnosticWorker {
  onmessage: ((event: MessageEvent<CoreDiagnosticEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: CoreDiagnosticRequest): void;
  terminate(): void;
}
export type CoreDiagnosticWorkerFactory = () => CoreDiagnosticWorker;
export interface CoreDiagnosticJob {
  cancel(): void;
  dispose(): void;
}
const defaultFactory: CoreDiagnosticWorkerFactory = () =>
  new Worker(new URL('./core.worker.ts', import.meta.url), { type: 'module' });
export const CORE_DIAGNOSTIC_TIMEOUT_MS = 30_000;
export function createCoreDiagnosticJob(
  request: CoreDiagnosticRequest,
  onEvent: (event: CoreDiagnosticEvent) => void,
  factory: CoreDiagnosticWorkerFactory = defaultFactory
): CoreDiagnosticJob {
  let worker: CoreDiagnosticWorker | undefined,
    finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined,
    lastWork = 0;
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
    onEvent({ type: 'error', id: request.id, message });
  };
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => fail('30초 동안 진단 worker 응답이 없습니다. 작업을 중지했습니다. 기간·차원을 줄여 다시 실행하세요.'),
      CORE_DIAGNOSTIC_TIMEOUT_MS
    );
  };
  try {
    worker = factory();
    worker.onmessage = (event) => {
      if (finished || event.data?.id !== request.id) return;
      if (!['progress', 'result', 'error'].includes(event.data.type)) {
        fail('진단 worker가 지원하지 않는 응답을 보냈습니다.');
        return;
      }
      if (event.data.type === 'progress') {
        if (
          !['calculating', 'complete'].includes(event.data.phase) ||
          !Number.isSafeInteger(event.data.work) ||
          event.data.work < lastWork ||
          !(
            event.data.fraction === null ||
            (Number.isFinite(event.data.fraction) && event.data.fraction >= 0 && event.data.fraction <= 1)
          )
        ) {
          fail('진단 worker 진행 정보가 유효하지 않습니다.');
          return;
        }
        lastWork = event.data.work;
        arm();
      }
      if (event.data.type === 'result') {
        try {
          validateCoreDiagnosticResult(event.data.result);
          if (event.data.result.kind !== request.kind) throw new Error('kind');
        } catch {
          fail('진단 worker 결과의 모양·수치·종류가 유효하지 않습니다.');
          return;
        }
      }
      if (event.data.type !== 'progress') stop();
      onEvent(event.data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail('진단 worker 실행에 실패했습니다. 다시 실행하세요.');
    };
    worker.onmessageerror = () => fail('진단 worker 결과를 읽지 못했습니다. 다시 실행하세요.');
    arm();
    worker.postMessage(request);
  } catch {
    queueMicrotask(() => fail('이 환경에서 핵심 진단 worker를 시작하지 못했습니다. worker 지원과 정책을 확인하세요.'));
  }
  return {
    cancel() {
      if (finished) return;
      stop();
      onEvent({ type: 'cancelled', id: request.id });
    },
    dispose: stop
  };
}
