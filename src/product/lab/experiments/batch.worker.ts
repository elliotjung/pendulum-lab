import { executeBatchRun } from './execute';
import type { BatchWorkerRequest, BatchWorkerEvent } from './contracts';
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<BatchWorkerRequest>) => {
  const request = event.data;
  const emit = (response: BatchWorkerEvent) => scope.postMessage(response);
  try {
    emit({
      type: 'result',
      id: request.run.id,
      result: executeBatchRun(request, (fraction) => emit({ type: 'progress', id: request.run.id, fraction }))
    });
  } catch (cause) {
    emit({
      type: 'error',
      id: request?.run?.id ?? '',
      message: cause instanceof Error ? cause.message : '다중 run 계산에 실패했습니다.'
    });
  }
};
