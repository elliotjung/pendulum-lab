import { parseLegacyExpansion, type LegacyExpansionArchive, type LegacyExpansionRequest } from './legacy-expansion';
import { stableBatchJson } from './safe';
export type LegacyExpansionEvent =
  | { type: 'started'; id: string }
  | { type: 'calculated'; id: string }
  | { type: 'result'; id: string; archive: LegacyExpansionArchive }
  | { type: 'error'; id: string; message: string };
export interface LegacyExpansionWorker {
  onmessage: ((event: MessageEvent<LegacyExpansionEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: LegacyExpansionRequest): void;
  terminate(): void;
}
export type LegacyExpansionExecutor = (
  request: LegacyExpansionRequest,
  listener: (event: LegacyExpansionEvent) => void
) => { dispose(): void };
export function createLegacyExpansionExecutor(
  factory: () => LegacyExpansionWorker = () =>
    new Worker(new URL('./legacy-expansion.worker.ts', import.meta.url), { type: 'module' })
): LegacyExpansionExecutor {
  return (request, listener) => {
    let stopped = false,
      worker: LegacyExpansionWorker | undefined,
      stage = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
        worker.terminate();
      }
    }
    function fail(message: string) {
      if (stopped) return;
      stop();
      listener({ type: 'error', id: request.id, message });
    }
    function arm() {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          fail('120초 동안 native suite 응답이 없습니다. 실행을 중지했습니다. 원본 설정과 기존 결과는 보존했습니다.'),
        120_000
      );
    }
    try {
      worker = factory();
      worker.onmessage = (event) => {
        if (stopped || event.data?.id !== request.id) return;
        const response = event.data;
        if (response.type === 'started' || response.type === 'calculated') {
          const next = response.type === 'started' ? 1 : 2;
          if (next !== stage + 1) {
            fail('native suite 단계 응답 순서가 맞지 않습니다.');
            return;
          }
          stage = next;
          arm();
          listener(response);
        } else if (response.type === 'error')
          fail(typeof response.message === 'string' ? response.message : 'native suite 실행 오류');
        else if (response.type === 'result') {
          if (stage !== 2) {
            fail('계산 완료 단계가 없는 결과입니다.');
            return;
          }
          stage = 3;
          void parseLegacyExpansion(JSON.stringify(response.archive))
            .then((archive) => {
              if (stopped) return;
              if (stableBatchJson(archive.request) !== stableBatchJson(request)) {
                fail('native suite 결과의 입력 ID가 다릅니다.');
                return;
              }
              stop();
              listener({ type: 'result', id: request.id, archive });
            })
            .catch(() => fail('native suite 결과·checksum·입력 계보 검증에 실패했습니다.'));
        } else fail('지원하지 않는 native suite worker 응답입니다.');
      };
      worker.onerror = (event) => {
        event.preventDefault();
        fail('native suite worker 계산 오류입니다.');
      };
      worker.onmessageerror = () => fail('native suite worker 응답을 읽지 못했습니다.');
      arm();
      worker.postMessage(structuredClone(request));
    } catch {
      queueMicrotask(() => fail('이 환경에서 native suite worker를 시작하지 못했습니다.'));
    }
    return { dispose: stop };
  };
}
