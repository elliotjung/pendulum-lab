import type { ResearchExecutor, ResearchWorker } from './research-focus-worker';
import { validateResearchResult } from './research-focus-validation';
export const RESEARCH_FOCUS_TIMEOUT_MS = 30_000;
/** A fresh module worker per run: termination cancels even synchronous native analysis. */
export function createResearchExecutor(
  factory: () => ResearchWorker = () =>
    new Worker(new URL('./research-focus.worker.ts', import.meta.url), { type: 'module' })
): ResearchExecutor {
  return (input, onEvent) => {
    const request = structuredClone(input);
    let worker: ResearchWorker | undefined,
      finished = false,
      last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
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
        () => fail('30초 동안 계산 응답이 없습니다. 설정과 표본 수를 줄여 다시 실행하세요.'),
        RESEARCH_FOCUS_TIMEOUT_MS
      );
    };
    try {
      worker = factory();
      worker.onmessage = ({ data }) => {
        if (finished || data?.id !== request.id) return;
        if (data.type === 'progress') {
          if (!Number.isFinite(data.fraction) || data.fraction < last || data.fraction > 1) {
            fail('전용 실험 진행률이 유효하지 않습니다.');
            return;
          }
          last = data.fraction;
          arm();
          onEvent(data);
        } else if (data.type === 'error' && typeof data.message === 'string' && data.message.length) {
          fail(data.message.slice(0, 500));
        } else if (data.type === 'result') {
          try {
            const result = validateResearchResult(data.result, request);
            stop();
            onEvent({ type: 'result', id: request.id, result });
          } catch {
            fail('전용 실험 결과·단위·입력 계보가 유효하지 않습니다.');
          }
        } else fail('전용 실험 응답을 읽지 못했습니다.');
      };
      worker.onerror = (event) => {
        event.preventDefault();
        fail('계산에 실패했습니다. 설정을 확인해 다시 실행하세요.');
      };
      worker.onmessageerror = () => fail('전용 실험 응답을 읽지 못했습니다.');
      arm();
      worker.postMessage(request);
    } catch {
      queueMicrotask(() => fail('전용 실험 worker를 시작하지 못했습니다. 이 환경의 worker 지원과 정책을 확인하세요.'));
    }
    return { dispose: stop };
  };
}
