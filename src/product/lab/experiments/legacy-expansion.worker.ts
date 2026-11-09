import { runExpansionSuite } from '../../../physics/expandedModels-runners';
import { buildLegacyExpansionRequest, archiveLegacyExpansion, type LegacyExpansionRequest } from './legacy-expansion';
import { stableBatchJson } from './safe';
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<LegacyExpansionRequest>) => {
  const original = event.data;
  void (async () => {
    try {
      const request = buildLegacyExpansionRequest(original.config, {
        includeLyapunov: original.includeLyapunov,
        ...(original.sourceText === null ? {} : { sourceText: original.sourceText })
      });
      if (stableBatchJson(request) !== stableBatchJson(original))
        throw new Error('native suite 요청 계보가 맞지 않습니다.');
      scope.postMessage({ type: 'started', id: request.id });
      const result = runExpansionSuite(request.config, { includeLyapunov: request.includeLyapunov });
      scope.postMessage({ type: 'calculated', id: request.id });
      const archive = await archiveLegacyExpansion(request, result);
      scope.postMessage({ type: 'result', id: request.id, archive });
    } catch (cause) {
      scope.postMessage({
        type: 'error',
        id: original?.id ?? '',
        message: cause instanceof Error ? cause.message : '기존 확장 suite 계산에 실패했습니다.'
      });
    }
  })();
};
