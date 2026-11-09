import {
  type BatchExecutor,
  type BatchJob,
  type BatchRunState,
  type BatchStatus,
  type BatchWorkerEvent
} from './contracts';
import {
  buildLegacyRunList,
  validateLegacyRunSnapshot,
  legacyRunResultByteBudget,
  type LegacyRunEntry,
  type LegacyRunSnapshot
} from './legacy-run-list';
import { createBatchExecutor } from './client';
import { batchProgress, validateBatchResult } from './validation';

/** A resumable run-boundary queue. An interrupted run restarts from its immutable canonical input. */
export function createLegacyRunQueue(
  input: readonly LegacyRunEntry[] | LegacyRunSnapshot,
  options: { executor?: BatchExecutor; concurrency?: number } = {}
) {
  const restored = Array.isArray(input) ? undefined : validateLegacyRunSnapshot(input);
  const plan = restored?.plan ?? buildLegacyRunList(input as readonly LegacyRunEntry[]);
  const concurrency = restored?.concurrency ?? options.concurrency ?? 2;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4)
    throw new Error('동시 실행은1–4여야 합니다.');
  if (restored && options.concurrency !== undefined && options.concurrency !== concurrency)
    throw new Error('재개 파일의 동시 실행 설정을 임의로 바꿀 수 없습니다.');
  const executor = options.executor ?? createBatchExecutor(),
    listeners = new Set<(state: LegacyRunSnapshot) => void>();
  let runs: BatchRunState[] = restored
    ? restored.runs.map((run) =>
        run.status === 'running'
          ? { id: run.id, index: run.index, status: 'pending', attempts: run.attempts, progress: 0 }
          : structuredClone(run)
      )
    : plan.runs.map((run) => ({ id: run.id, index: run.index, status: 'pending', attempts: 0, progress: 0 }));
  let status: BatchStatus = restored ? (restored.status === 'running' ? 'cancelled' : restored.status) : 'ready',
    disposed = false,
    epoch = 0,
    scheduled = false,
    announced = false;
  const active = new Map<number, { token: number; job?: BatchJob }>();
  const snapshot = (): LegacyRunSnapshot =>
    structuredClone({
      schema: 'pendulum-legacy-run-queue/v1',
      plan,
      concurrency,
      status,
      progress: batchProgress(runs),
      runs
    });
  let notification: ReturnType<typeof setTimeout> | undefined;
  const emitNow = () => {
    clearTimeout(notification);
    notification = undefined;
    if (!disposed && listeners.size) {
      const state = snapshot();
      for (const listener of listeners) listener(state);
    }
  };
  const emit = () => {
    if (!notification && !disposed && listeners.size) notification = setTimeout(emitNow, 16);
  };
  const schedule = () => {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      pump();
    });
  };
  function finish(index: number, token: number, event: BatchWorkerEvent) {
    const slot = active.get(index);
    if (
      disposed ||
      status !== 'running' ||
      slot?.token !== token ||
      token !== epoch ||
      event.id !== plan.runs[index]!.id
    )
      return;
    if (event.type === 'progress') {
      if (!Number.isFinite(event.fraction) || event.fraction < runs[index]!.progress || event.fraction > 1) {
        finish(index, token, { type: 'error', id: event.id, message: 'run 진행률이 올바르지 않습니다.' });
        return;
      }
      runs[index] = { ...runs[index]!, progress: event.fraction };
      emit();
      return;
    }
    active.delete(index);
    slot.job?.dispose();
    if (event.type === 'result') {
      try {
        const result = validateBatchResult(event.result, { batchId: plan.id, run: plan.runs[index]! });
        if (
          new TextEncoder().encode(JSON.stringify(result)).length >
          legacyRunResultByteBudget(plan.runs[index]!.experiment)
        )
          throw new Error('native 결과가 이 run의 보관 byte 예산을 넘었습니다. 원본 입력은 보존했습니다.');
        runs[index] = { ...runs[index]!, status: 'completed', progress: 1, result };
      } catch (error) {
        runs[index] = {
          ...runs[index]!,
          status: 'failed',
          progress: 1,
          error: error instanceof Error ? error.message : 'run 결과 검증 실패'
        };
      }
    } else
      runs[index] = {
        ...runs[index]!,
        status: 'failed',
        progress: 1,
        error:
          typeof event.message === 'string' && event.message.length ? event.message.slice(0, 4096) : 'run 실행 실패'
      };
    emit();
    schedule();
  }
  function pump() {
    if (disposed || status !== 'running') return;
    while (active.size < concurrency && status === 'running' && !disposed) {
      const index = runs.findIndex((run) => run.status === 'pending');
      if (index < 0) break;
      if (runs[index]!.attempts >= 1000) {
        runs[index] = {
          ...runs[index]!,
          status: 'failed',
          progress: 1,
          error: 'run 재시도 한도 1000회에 도달했습니다.'
        };
        continue;
      }
      const token = epoch,
        slot: { token: number; job?: BatchJob } = { token };
      active.set(index, slot);
      runs[index] = { id: runs[index]!.id, index, status: 'running', attempts: runs[index]!.attempts + 1, progress: 0 };
      if (!announced) {
        announced = true;
        emitNow();
      } else emit();
      if (disposed || status !== 'running' || active.get(index) !== slot) continue;
      try {
        const job = executor({ batchId: plan.id, run: structuredClone(plan.runs[index]!) }, (event) =>
          finish(index, token, event)
        );
        if (active.get(index) === slot && !disposed) slot.job = job;
        else job.dispose();
      } catch (error) {
        finish(index, token, {
          type: 'error',
          id: plan.runs[index]!.id,
          message: error instanceof Error ? error.message : 'run 시작 실패'
        });
      }
    }
    if (!active.size && !runs.some((run) => run.status === 'pending')) {
      status = runs.some((run) => run.status === 'failed') ? 'partial' : 'completed';
      emit();
    }
  }
  function start(): boolean {
    if (disposed || status === 'running' || !runs.some((run) => run.status === 'pending')) return false;
    status = 'running';
    epoch++;
    announced = false;
    emitNow();
    schedule();
    return true;
  }
  function stop() {
    epoch++;
    const jobs = [...active.values()];
    active.clear();
    runs = runs.map((run) =>
      run.status === 'running'
        ? { id: run.id, index: run.index, status: 'pending', attempts: run.attempts, progress: 0 }
        : run
    );
    jobs.forEach((slot) => slot.job?.dispose());
  }
  return {
    get state() {
      return snapshot();
    },
    snapshot,
    subscribe(listener: (state: LegacyRunSnapshot) => void) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start,
    resume: start,
    cancel(): boolean {
      if (disposed || status !== 'running') return false;
      status = 'cancelled';
      stop();
      emitNow();
      return true;
    },
    retryFailed(ids?: readonly string[]): boolean {
      if (disposed || status === 'running') return false;
      const selected = ids ? new Set(ids) : undefined;
      if (ids && (!ids.length || ids.some((id) => !runs.some((run) => run.id === id && run.status === 'failed'))))
        return false;
      let changed = false;
      runs = runs.map((run) => {
        if (run.status !== 'failed' || (selected && !selected.has(run.id))) return run;
        changed = true;
        return { id: run.id, index: run.index, status: 'pending', attempts: run.attempts, progress: 0 };
      });
      if (!changed) return false;
      status = 'ready';
      return start();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(notification);
      stop();
      listeners.clear();
    }
  };
}
export type LegacyRunQueue = ReturnType<typeof createLegacyRunQueue>;
