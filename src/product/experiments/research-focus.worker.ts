import type { ResearchEvent, ResearchRequest } from './research-focus-worker';
import { executeResearchFocus } from './research-focus-science';
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ResearchRequest>) => void) | null;
  postMessage(event: ResearchEvent): void;
};
scope.onmessage = ({ data }) => {
  try {
    if (!data || typeof data.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.id))
      throw new Error('전용 실험 요청 ID가 유효하지 않습니다.');
    const result = executeResearchFocus(data.unitId, data.fields, (fraction) =>
      scope.postMessage({ type: 'progress', id: data.id, fraction })
    );
    scope.postMessage({ type: 'result', id: data.id, result });
  } catch (error) {
    scope.postMessage({
      type: 'error',
      id: data?.id,
      message: error instanceof Error ? error.message.slice(0, 500) : '계산을 완료하지 못했습니다.'
    });
  }
};
