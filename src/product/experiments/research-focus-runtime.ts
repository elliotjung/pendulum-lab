import type { LearnUnit } from '../learn/schema';
import { issue, success, type ContractResult } from '../contracts/validation';
import { inspectSafeData } from '../persistence/safe-data';
import { createResearchExecutor } from './research-focus-client';
import type { ResearchExecutor } from './research-focus-worker';
import type { ResearchFields, ResearchFocusResult } from './research-focus-contracts';
import { researchCanonical } from './research-focus-config';
import { researchFocusDeclaration, researchPresetFields, validateResearchFields } from './research-focus-definitions';
import { validateResearchResult } from './research-focus-validation';
export interface ResearchSnapshot {
  readonly status: 'idle' | 'running' | 'completed' | 'cancelled' | 'error';
  readonly fields: ResearchFields;
  readonly progress: number;
  readonly error: string | null;
  readonly result: ResearchFocusResult | null;
}
export function createResearchRuntime(
  unit: LearnUnit,
  options: { fields?: ResearchFields; executor?: ResearchExecutor } = {}
) {
  unit = structuredClone(unit);
  const declaration = researchFocusDeclaration(unit.id);
  let fields = validateResearchFields(unit.id, options.fields ?? researchPresetFields(unit.id));
  researchCanonical(unit, fields);
  const listeners = new Set<(snapshot: ResearchSnapshot) => void>();
  const executor = options.executor ?? createResearchExecutor();
  let status: ResearchSnapshot['status'] = 'idle',
    progress = 0,
    error: string | null = null;
  let result: ResearchFocusResult | null = null,
    epoch = 0,
    disposed = false;
  let job: { dispose(): void } | undefined;
  const snapshot = (): ResearchSnapshot => structuredClone({ status, fields, progress, error, result });
  const emit = () => {
    if (!disposed) for (const listener of listeners) listener(snapshot());
  };
  const stop = () => {
    epoch++;
    job?.dispose();
    job = undefined;
  };
  const fail = (message: string) => {
    stop();
    status = 'error';
    error = message.slice(0, 500);
    emit();
  };
  return {
    getSnapshot: snapshot,
    subscribe(listener: (snapshot: ResearchSnapshot) => void) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setFields(values: ResearchFields): ContractResult<ResearchFields> {
      if (disposed || status === 'running')
        return { ok: false, issues: [issue('focus-busy', '$', '계산을 취소한 뒤 설정을 바꾸세요.')] };
      try {
        const safe = inspectSafeData(values);
        if (!safe.ok || !safe.value || typeof safe.value !== 'object' || Array.isArray(safe.value))
          throw new Error('설정을 확인하세요.');
        for (const id of Object.keys(safe.value))
          if (!declaration.exposed.includes(id)) throw new Error('이 변수는 단원에서 고정되어 있습니다.');
        const next = validateResearchFields(unit.id, { ...fields, ...safe.value });
        researchCanonical(unit, next);
        stop();
        fields = next;
        status = 'idle';
        progress = 0;
        error = null;
        result = null;
        emit();
        return success(structuredClone(fields));
      } catch (cause) {
        return {
          ok: false,
          issues: [issue('invalid-focus', '$', cause instanceof Error ? cause.message : '설정을 확인하세요.')]
        };
      }
    },
    run() {
      if (disposed || status === 'running') return;
      stop();
      status = 'running';
      progress = 0;
      error = null;
      result = null;
      const token = epoch;
      const request = {
        id: `learn_${unit.id.replace('.', '_')}_${token}`,
        unitId: unit.id,
        fields: structuredClone(fields)
      };
      emit();
      if (disposed || token !== epoch || status !== 'running') return;
      try {
        const created = executor(request, (event) => {
          if (disposed || token !== epoch || status !== 'running' || event.id !== request.id) return;
          if (event.type === 'progress') {
            if (!Number.isFinite(event.fraction) || event.fraction < progress || event.fraction > 1) {
              fail('계산 진행률이 유효하지 않습니다.');
              return;
            }
            progress = event.fraction;
            emit();
          } else if (event.type === 'error') fail(event.message);
          else {
            try {
              result = validateResearchResult(event.result, request);
            } catch {
              fail('전용 실험 결과의 단위·계보를 확인하지 못했습니다.');
              return;
            }
            progress = 1;
            status = 'completed';
            stop();
            emit();
          }
        });
        if (disposed || token !== epoch || status !== 'running') created.dispose();
        else job = created;
      } catch (cause) {
        fail(cause instanceof Error ? cause.message : '계산을 시작하지 못했습니다.');
      }
    },
    cancel() {
      if (disposed || status !== 'running') return;
      stop();
      status = 'cancelled';
      emit();
    },
    restart() {
      if (disposed) return;
      stop();
      status = 'idle';
      progress = 0;
      error = null;
      result = null;
      emit();
    },
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      listeners.clear();
    }
  };
}
export type ResearchRuntime = ReturnType<typeof createResearchRuntime>;
