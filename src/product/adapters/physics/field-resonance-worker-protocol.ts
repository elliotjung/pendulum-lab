import type { SrResponse } from '../../../physics/stochasticResonance';
import { inspectSafeData } from '../../persistence/safe-data';
import { fields } from '../../contracts/contract-checks';
import type { ContractIssue } from '../../contracts/validation';
import {
  createFieldResonanceResult,
  fieldResonanceSigmas,
  nativeFieldResonanceResponse,
  validateFieldResonanceSettings,
  type FieldResonanceResult,
  type FieldResonanceSettings
} from './field-resonance';

export type FieldResonanceRequest =
  | {
      readonly type: 'initialize';
      readonly id: string;
      readonly sequence: number;
      readonly settings: FieldResonanceSettings;
    }
  | { readonly type: 'advance' | 'cancel'; readonly id: string; readonly sequence: number };
export type FieldResonanceEvent =
  | {
      readonly type: 'ready' | 'progress';
      readonly id: string;
      readonly sequence: number;
      readonly completed: number;
      readonly total: number;
      readonly done: boolean;
      readonly result?: FieldResonanceResult;
    }
  | { readonly type: 'cancelled'; readonly id: string; readonly sequence: number }
  | { readonly type: 'error'; readonly id: string; readonly sequence: number; readonly message: string };

export function createFieldResonanceWorkerSession() {
  let settings: FieldResonanceSettings | undefined,
    id: string | undefined,
    sequence = -1,
    closed = false,
    completed = 0;
  const rows: SrResponse[] = [];
  let sum = { responseAmplitude: 0, signalPower: 0, rightWellFraction: 0, transitions: 0 };
  return {
    handle(request: FieldResonanceRequest): FieldResonanceEvent {
      const safe = inspectSafeData(request);
      if (!safe.ok) {
        closed = true;
        return { type: 'error', id: '', sequence: -1, message: '확률 공명 요청은 안전한 plain data여야 합니다.' };
      }
      request = safe.value as unknown as FieldResonanceRequest;
      const shapeIssues: ContractIssue[] = [];
      if (
        !fields(
          request,
          ['type', 'id', 'sequence', ...(request?.type === 'initialize' ? ['settings'] : [])],
          [],
          '$',
          shapeIssues
        )
      ) {
        closed = true;
        return { type: 'error', id: '', sequence: -1, message: '확률 공명 요청 형식이 유효하지 않습니다.' };
      }
      const nextId = typeof request?.id === 'string' ? request.id : '',
        nextSequence = request?.sequence;
      try {
        if (
          closed ||
          !nextId ||
          nextId.length > 128 ||
          !Number.isSafeInteger(nextSequence) ||
          nextSequence !== sequence + 1 ||
          (id !== undefined && id !== nextId)
        )
          throw new Error('확률 공명 실행 ID·요청 순서 또는 종료 상태를 확인하세요.');
        id = nextId;
        sequence = nextSequence;
        if (request.type === 'cancel') {
          closed = true;
          settings = undefined;
          return { type: 'cancelled', id, sequence };
        }
        if (request.type === 'initialize') {
          if (settings) throw new Error('확률 공명을 중복 초기화할 수 없습니다.');
          const checked = validateFieldResonanceSettings(request.settings);
          if (!checked.ok) throw new Error(checked.issues.map((entry) => entry.message).join(' '));
          settings = checked.value;
          return {
            type: 'ready',
            id,
            sequence,
            completed: 0,
            total: settings.sigmaCount * settings.realizations,
            done: false
          };
        }
        if (request.type !== 'advance' || !settings) throw new Error('확률 공명 설정을 먼저 초기화하세요.');
        const total = settings.sigmaCount * settings.realizations;
        if (completed >= total) throw new Error('이미 끝난 확률 공명 계산입니다.');
        const sigma = fieldResonanceSigmas(settings)[Math.floor(completed / settings.realizations)]!;
        const row = nativeFieldResonanceResponse(settings, sigma, completed % settings.realizations);
        for (const key of ['responseAmplitude', 'signalPower', 'rightWellFraction', 'transitions'] as const)
          sum[key] += row[key];
        completed++;
        if (completed % settings.realizations === 0) {
          rows.push({
            sigma,
            responseAmplitude: sum.responseAmplitude / settings.realizations,
            signalPower: sum.signalPower / settings.realizations,
            rightWellFraction: sum.rightWellFraction / settings.realizations,
            transitions: sum.transitions / settings.realizations
          });
          sum = { responseAmplitude: 0, signalPower: 0, rightWellFraction: 0, transitions: 0 };
        }
        const done = completed === total;
        if (done) closed = true;
        return {
          type: 'progress',
          id,
          sequence,
          completed,
          total,
          done,
          ...(done ? { result: createFieldResonanceResult(settings, rows) } : {})
        };
      } catch (cause) {
        closed = true;
        return {
          type: 'error',
          id: nextId,
          sequence: typeof nextSequence === 'number' ? nextSequence : -1,
          message: cause instanceof Error ? cause.message : '확률 공명 계산에 실패했습니다.'
        };
      }
    }
  };
}
