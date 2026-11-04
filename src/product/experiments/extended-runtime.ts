import type { LearnUnit } from '../learn/schema';
import type { ContractResult } from '../contracts/validation';
import { issue, success } from '../contracts/validation';
import { inspectSafeData } from '../persistence/safe-data';
import { createBatchQueue, type BatchQueue } from '../lab/experiments/queue';
import type { BatchExecutor, BatchSnapshot } from '../lab/experiments/contracts';
import { createExtendedExecutor } from './extended-client';
import type { ExtendedExecutor } from './extended-worker';
import type { ExtendedResult } from './extended-results';
import {
  extendedCanonical,
  extendedPresetFields,
  validateExtendedFields,
  type ExtendedFields
} from './extended-config';
import { extendedFocusDeclaration } from './extended-definitions';
import { extendedBatchPlan } from './extended-science';

export interface ExtendedSnapshot {
  readonly status: 'idle' | 'running' | 'completed' | 'cancelled' | 'error';
  readonly fields: ExtendedFields;
  readonly progress: number;
  readonly error: string | null;
  readonly result: ExtendedResult | null;
}
export interface ExtendedRuntimeOptions {
  readonly fields?: ExtendedFields;
  readonly executor?: ExtendedExecutor;
  readonly batchExecutor?: BatchExecutor;
}
/** Long calculations run in workers; cancellation terminates them, including S21 run workers. */
export function createExtendedRuntime(unit: LearnUnit, options: ExtendedRuntimeOptions = {}) {
  unit = structuredClone(unit);
  const declaration = extendedFocusDeclaration(unit.id);
  let fields = validateExtendedFields(unit.id, options.fields ?? extendedPresetFields(unit.id));
  extendedCanonical(unit, fields);
  const listeners = new Set<(snapshot: ExtendedSnapshot) => void>(),
    executor = options.executor ?? createExtendedExecutor();
  let status: ExtendedSnapshot['status'] = 'idle',
    progress = 0,
    error: string | null = null,
    result: ExtendedResult | null = null,
    epoch = 0,
    disposed = false;
  let job: { dispose(): void } | undefined, queue: BatchQueue | undefined, unsubscribe: (() => void) | undefined;
  const snapshot = (): ExtendedSnapshot => structuredClone({ status, fields, progress, error, result });
  const emit = () => {
    if (!disposed) for (const listener of listeners) listener(snapshot());
  };
  const stop = () => {
    epoch++;
    job?.dispose();
    job = undefined;
    unsubscribe?.();
    unsubscribe = undefined;
    queue?.dispose();
    queue = undefined;
  };
  const fail = (message: string) => {
    stop();
    status = 'error';
    error = message.slice(0, 500);
    emit();
  };
  function execute(token: number, batch?: BatchSnapshot) {
    const created = executor(
      { id: `learn-${unit.id}-${token}`, unitId: unit.id, fields, ...(batch ? { batch } : {}) },
      (event) => {
        if (disposed || token !== epoch || status !== 'running') return;
        if (event.type === 'progress') {
          progress = batch ? 0.8 + 0.2 * event.fraction : event.fraction;
          emit();
        } else if (event.type === 'error') fail(event.message);
        else {
          result = { ...event.result, canonical: extendedCanonical(unit, fields) };
          progress = 1;
          status = 'completed';
          stop();
          emit();
        }
      }
    );
    if (disposed || token !== epoch || status !== 'running') created.dispose();
    else job = created;
  }
  return {
    getSnapshot: snapshot,
    subscribe(listener: (snapshot: ExtendedSnapshot) => void) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setFields(values: ExtendedFields): ContractResult<ExtendedFields> {
      if (disposed || status === 'running')
        return { ok: false, issues: [issue('focus-busy', '$', '실험을 취소한 뒤 설정을 바꾸세요.')] };
      try {
        const safe = inspectSafeData(values);
        if (!safe.ok) throw new Error(safe.issues.map((i) => i.message).join(' '));
        values = safe.value as ExtendedFields;
        for (const id of Object.keys(values))
          if (!declaration.exposed.includes(id)) throw new Error('이 변수는 단원에서 고정되어 있습니다.');
        const next = validateExtendedFields(unit.id, { ...fields, ...values });
        extendedCanonical(unit, next);
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
      emit();
      try {
        if (unit.id !== '2.9') {
          execute(token);
          return;
        }
        queue = createBatchQueue(
          extendedBatchPlan(unit.id, fields),
          options.batchExecutor ? { executor: options.batchExecutor } : {}
        );
        unsubscribe = queue.subscribe((batch) => {
          if (disposed || token !== epoch || status !== 'running') return;
          progress = 0.8 * batch.progress;
          emit();
          if (batch.status === 'partial') {
            fail('적분기 비교의 일부 run이 실패했습니다. 간격·기간을 줄여 다시 실행하세요.');
            return;
          }
          if (batch.status === 'completed') {
            unsubscribe?.();
            unsubscribe = undefined;
            queue?.dispose();
            queue = undefined;
            execute(token, batch);
          }
        });
        queue.start();
      } catch (cause) {
        fail(cause instanceof Error ? cause.message : '실험을 시작하지 못했습니다.');
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
export type ExtendedRuntime = ReturnType<typeof createExtendedRuntime>;
