import { executeS27ResearchFocus } from './s27-science';
import type { ResearchEvent, ResearchRequest } from './research-focus-worker';
import { executeResearchFocus } from './research-focus-science';
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ResearchRequest>) => void) | null;
  postMessage(event: ResearchEvent): void;
};
async function handleRequest(data: ResearchRequest) {
  try {
    if (!data || typeof data.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.id))
      throw new Error('전용 실험 요청 ID가 유효하지 않습니다.');
    const onProgress = (fraction: number) => scope.postMessage({ type: 'progress', id: data.id, fraction });
    const result = data.unitId.startsWith('8.')
      ? await executeS27ResearchFocus(data.unitId, data.fields, onProgress)
      : executeResearchFocus(data.unitId, data.fields, onProgress);
    scope.postMessage({ type: 'result', id: data.id, result });
  } catch (error) {
    scope.postMessage({
      type: 'error',
      id: data?.id,
      message: error instanceof Error ? error.message.slice(0, 500) : '계산을 완료하지 못했습니다.'
    });
  }
}
scope.onmessage = ({ data }) => {
  void handleRequest(data);
};
