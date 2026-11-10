import type { OgyArtifact, OgyRequest, OgyWorkerMessage } from './contracts';

export interface OgyJob {
  readonly result: Promise<OgyArtifact>;
  cancel(): void;
}
export function createOgyJob(
  request: OgyRequest,
  onProgress: (value: number, message: string) => void,
  createWorker: () => Worker = () => new Worker(new URL('./ogy.worker.ts', import.meta.url), { type: 'module' })
): OgyJob {
  let worker: Worker | undefined;
  let complete = false;
  let rejectResult: (cause: Error) => void = () => {};
  const result = new Promise<OgyArtifact>((resolve, reject) => {
    rejectResult = reject;
    try {
      worker = createWorker();
      worker.onmessage = (event: MessageEvent<OgyWorkerMessage>) => {
        if (complete || event.data.id !== request.id) return;
        const message = event.data;
        if (message.type === 'progress') {
          if (Number.isFinite(message.value) && message.value >= 0 && message.value <= 1)
            onProgress(message.value, message.message);
          return;
        }
        complete = true;
        worker?.terminate();
        if (message.type === 'result') resolve(message.artifact);
        else reject(new Error(message.message));
      };
      worker.onerror = () => {
        if (complete) return;
        complete = true;
        worker?.terminate();
        reject(new Error('OGY worker를 실행할 수 없습니다. 원 실험을 유지하고 다시 시도하세요.'));
      };
      worker.postMessage(structuredClone(request));
    } catch {
      complete = true;
      worker?.terminate();
      reject(new Error('OGY worker를 불러올 수 없습니다. 연결을 확인하고 다시 시도하세요.'));
    }
  });
  return {
    result,
    cancel() {
      if (complete) return;
      complete = true;
      worker?.terminate();
      const error = new Error('OGY 계산을 취소했습니다. 부분 결과는 내보내지 않습니다.');
      error.name = 'AbortError';
      rejectResult(error);
    }
  };
}
