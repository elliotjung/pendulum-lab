import { fields } from '../../contracts/contract-checks';
import type { ContractIssue } from '../../contracts/validation';
import { inspectSafeData } from '../../persistence/safe-data';
import {
  computeStructureCanonical,
  computeStructureEnergy,
  type StructureDiagnosticResult
} from './structure-diagnostics';

export type StructureDiagnosticKind = 'energy' | 'canonical';
export interface StructureDiagnosticRequest {
  readonly type: 'calculate';
  readonly id: string;
  readonly kind: StructureDiagnosticKind;
  readonly experiment: unknown;
  readonly settings: unknown;
}
export type StructureDiagnosticEvent =
  | { readonly type: 'result'; readonly id: string; readonly result: StructureDiagnosticResult }
  | { readonly type: 'error'; readonly id: string; readonly message: string };

/** One indivisible native diagnostic per worker; cancellation terminates the worker. */
export function handleStructureDiagnostic(request: unknown): StructureDiagnosticEvent {
  const safe = inspectSafeData(request);
  if (!safe.ok) return { type: 'error', id: '', message: '구조 진단 요청은 안전한 plain data여야 합니다.' };
  const issues: ContractIssue[] = [];
  if (!fields(safe.value, ['type', 'id', 'kind', 'experiment', 'settings'], [], '$', issues) || issues.length)
    return { type: 'error', id: '', message: '구조 진단 요청 형식이 유효하지 않습니다.' };
  const value = safe.value,
    id = typeof value.id === 'string' ? value.id : '';
  try {
    if (value.type !== 'calculate' || !id || id.length > 128 || (value.kind !== 'energy' && value.kind !== 'canonical'))
      throw new Error('구조 진단 종류·실행 ID가 유효하지 않습니다.');
    return {
      type: 'result',
      id,
      result:
        value.kind === 'energy'
          ? computeStructureEnergy(value.experiment, value.settings)
          : computeStructureCanonical(value.experiment, value.settings)
    };
  } catch (cause) {
    return { type: 'error', id, message: cause instanceof Error ? cause.message : 'native 구조 진단에 실패했습니다.' };
  }
}
