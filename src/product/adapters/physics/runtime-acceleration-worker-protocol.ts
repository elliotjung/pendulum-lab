import { fields } from '../../contracts/contract-checks';
import type { ContractIssue } from '../../contracts/validation';
import { inspectSafeData } from '../../persistence/safe-data';
import { computeRuntimeAcceleration } from './runtime-acceleration';
import type { RuntimeAccelerationEvent } from './runtime-acceleration-client';

export async function handleRuntimeAcceleration(request: unknown): Promise<RuntimeAccelerationEvent> {
  const safe = inspectSafeData(request),
    issues: ContractIssue[] = [];
  if (!safe.ok || !fields(safe.value, ['type', 'id', 'experiment', 'settings'], [], '$', issues) || issues.length)
    return { type: 'error', id: '', message: 'backend 요청은 안전한 plain data 형식이어야 합니다.' };
  const value = safe.value,
    id = typeof value.id === 'string' ? value.id : '';
  try {
    if (value.type !== 'calculate' || !id || id.length > 128)
      throw new Error('backend 요청 종류·실행 ID가 유효하지 않습니다.');
    return { type: 'result', id, result: await computeRuntimeAcceleration(value.experiment, value.settings) };
  } catch (cause) {
    return {
      type: 'error',
      id,
      message: cause instanceof Error ? cause.message : 'native backend 작업에 실패했습니다.'
    };
  }
}
