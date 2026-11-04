import type { ExtendedEvent, ExtendedRequest } from './extended-worker';
import { executeExtendedExperiment } from './extended-science';
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ExtendedRequest>) => void) | null;
  postMessage(event: ExtendedEvent): void;
};
scope.onmessage = ({ data }) => {
  try {
    const result = executeExtendedExperiment(
      data.unitId,
      data.fields,
      (fraction) => scope.postMessage({ type: 'progress', id: data.id, fraction }),
      data.batch
    );
    scope.postMessage({ type: 'result', id: data.id, result });
  } catch (error) {
    scope.postMessage({
      type: 'error',
      id: data.id,
      message: error instanceof Error ? error.message.slice(0, 500) : '전용 실험 계산에 실패했습니다.'
    });
  }
};
