import { JobClient, type JobHandle } from '../../../runtime/JobClient';
import type { StudyPointResponse } from '../../../workers/chaosProtocolSchema';
import { scanJsonResources } from '../../../app/parity/storage-json-resource-scanner';
import {
  NATIVE_DESIGN_LIMITS,
  validateNativeDesign,
  validateStudyPointResult,
  type NativeDesignPlan
} from './native-design';
import { batchData, closed, stableBatchJson } from './safe';

export interface NativeDesignRun {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'unsupported';
  attempts: number;
  failures: number;
  progress: number;
  result?: StudyPointResponse;
  error?: string;
}
export interface NativeDesignSnapshot {
  schema: 'pendulum-native-design-queue/v1';
  plan: NativeDesignPlan;
  status: 'ready' | 'running' | 'cancelled' | 'completed' | 'partial';
  runs: NativeDesignRun[];
  elapsedMs: number;
  workConsumed: number;
  usesWorkers: boolean;
  stopReason: string | null;
}
export function validateNativeDesignSnapshot(input: unknown): NativeDesignSnapshot {
  const snapshot = batchData(input) as unknown as NativeDesignSnapshot;
  closed(snapshot, ['schema', 'plan', 'status', 'runs', 'elapsedMs', 'workConsumed', 'usesWorkers', 'stopReason']);
  if (
    snapshot.schema !== 'pendulum-native-design-queue/v1' ||
    !['ready', 'running', 'cancelled', 'completed', 'partial'].includes(snapshot.status)
  )
    throw new Error('native 설계 재개 파일 버전·상태가 잘못되었습니다.');
  const plan = validateNativeDesign(snapshot.plan);
  if (
    !Array.isArray(snapshot.runs) ||
    snapshot.runs.length !== plan.points.length ||
    typeof snapshot.elapsedMs !== 'number' ||
    !Number.isFinite(snapshot.elapsedMs) ||
    snapshot.elapsedMs < 0 ||
    typeof snapshot.usesWorkers !== 'boolean' ||
    !(snapshot.stopReason === null || typeof snapshot.stopReason === 'string')
  )
    throw new Error('native 설계 재개 목록·시간·실행 메타데이터가 잘못되었습니다.');
  let work = 0;
  snapshot.runs.forEach((run, i) => {
    closed(run, ['id', 'status', 'attempts', 'failures', 'progress', 'result', 'error']);
    const point = plan.points[i]!;
    if (
      run.id !== point.id ||
      !['pending', 'running', 'completed', 'failed', 'unsupported'].includes(run.status) ||
      !Number.isSafeInteger(run.attempts) ||
      run.attempts < 0 ||
      run.attempts > 10 ||
      !Number.isSafeInteger(run.failures) ||
      run.failures < 0 ||
      run.failures > run.attempts ||
      typeof run.progress !== 'number' ||
      run.progress < 0 ||
      run.progress > 1 ||
      (run.error !== undefined && (typeof run.error !== 'string' || run.error.length > 4096))
    )
      throw new Error('native 설계 run 상태·시도·진행률이 잘못되었습니다.');
    if (
      ((run.status === 'running' || run.status === 'completed') && (!run.attempts || run.failures >= run.attempts)) ||
      (run.status !== 'running' && run.status !== 'completed' && run.progress !== 0) ||
      (run.status !== 'failed' && run.status !== 'unsupported' && run.error !== undefined)
    )
      throw new Error('native 설계 run 이력·진행률·오류가 서로 맞지 않습니다.');
    if (point.unsupported !== null) {
      if (
        run.status !== 'unsupported' ||
        run.attempts ||
        run.failures ||
        run.result !== undefined ||
        run.error !== point.unsupported ||
        run.progress !== 0
      )
        throw new Error('지원하지 않는 원본 조건을 평가 결과로 바꿀 수 없습니다.');
    } else if (run.status === 'unsupported') throw new Error('지원 여부가 원래 조건과 다릅니다.');
    if (run.status === 'completed') {
      if (!run.attempts || run.progress !== 1 || run.error !== undefined || !point.request)
        throw new Error('완료 run의 결과·진행률이 잘못되었습니다.');
      validateStudyPointResult(run.result, point.request);
    } else if (run.result !== undefined || (run.status === 'failed' && (!run.failures || !run.error)))
      throw new Error('미완료 run에 완료 결과를 넣을 수 없습니다.');
    work += point.work * run.attempts;
  });
  if (
    snapshot.workConsumed !== work ||
    work > NATIVE_DESIGN_LIMITS.work ||
    snapshot.runs.filter((run) => run.status === 'running').length > 1 ||
    (snapshot.status !== 'running' && snapshot.runs.some((run) => run.status === 'running')) ||
    (snapshot.status === 'ready' && snapshot.runs.every((run) => run.status === 'completed')) ||
    (snapshot.status === 'partial' && snapshot.runs.every((run) => run.status === 'completed')) ||
    (snapshot.status === 'completed' && snapshot.runs.some((r) => r.status !== 'completed'))
  )
    throw new Error('누적 native 작업량·완료 상태가 맞지 않습니다.');
  return { ...snapshot, plan };
}
/** Bounded sequential native-worker queue. Cancellation/reload restarts only the interrupted point. */
export function createNativeDesignQueue(
  input: NativeDesignPlan | NativeDesignSnapshot,
  options: { client?: JobClient; now?: () => number } = {}
) {
  const detached = batchData(input) as unknown as NativeDesignPlan | NativeDesignSnapshot;
  const restored =
    detached.schema === 'pendulum-native-design-queue/v1' ? validateNativeDesignSnapshot(detached) : undefined;
  const plan = restored?.plan ?? validateNativeDesign(detached);
  const client = options.client ?? new JobClient(undefined, { poolSize: 1, maxQueued: 1 }),
    now = options.now ?? (() => performance.now());
  let runs: NativeDesignRun[] = restored
    ? restored.runs.map((run) => (run.status === 'running' ? { ...run, status: 'pending', progress: 0 } : run))
    : plan.points.map((point) => ({
        id: point.id,
        status: point.unsupported ? 'unsupported' : 'pending',
        attempts: 0,
        failures: 0,
        progress: 0,
        ...(point.unsupported ? { error: point.unsupported } : {})
      }));
  let status: NativeDesignSnapshot['status'] = restored
    ? restored.status === 'running'
      ? 'cancelled'
      : restored.status
    : 'ready';
  let elapsedMs = restored?.elapsedMs ?? 0,
    workConsumed = restored?.workConsumed ?? 0,
    usesWorkers = restored?.usesWorkers ?? false,
    stopReason = restored?.stopReason ?? null,
    active: JobHandle | undefined,
    started = 0,
    epoch = 0,
    disposed = false;
  const listeners = new Set<(value: NativeDesignSnapshot) => void>();
  const elapsed = () => elapsedMs + (status === 'running' ? Math.max(0, now() - started) : 0);
  const snapshot = (): NativeDesignSnapshot =>
    structuredClone({
      schema: 'pendulum-native-design-queue/v1',
      plan,
      status,
      runs,
      elapsedMs: elapsed(),
      workConsumed,
      usesWorkers,
      stopReason
    });
  const emit = () => {
    if (!disposed) for (const listener of listeners) listener(snapshot());
  };
  const stop = (reason: string | null, next: NativeDesignSnapshot['status']) => {
    elapsedMs = elapsed();
    status = next;
    stopReason = reason;
    active = undefined;
    emit();
  };
  async function pump(token: number): Promise<void> {
    if (disposed || token !== epoch || status !== 'running') return;
    const index = runs.findIndex((run) => run.status === 'pending');
    if (index < 0) {
      stop(null, runs.every((r) => r.status === 'completed') ? 'completed' : 'partial');
      return;
    }
    const point = plan.points[index]!,
      run = runs[index]!;
    const remaining = plan.settings.budget.maxTimeMs - elapsed();
    const failures = runs.reduce((sum, item) => sum + item.failures, 0);
    if (
      remaining < 1 ||
      failures >= plan.settings.budget.maxFailures ||
      workConsumed + point.work > NATIVE_DESIGN_LIMITS.work ||
      run.attempts >= 10
    ) {
      stop(
        remaining < 1
          ? '시간 예산 소진'
          : failures >= plan.settings.budget.maxFailures
            ? '실패 예산 소진'
            : '누적 작업·재시도 예산 소진',
        'partial'
      );
      return;
    }
    if (!point.request) {
      stop('지원하지 않는 자동 평가 조건', 'partial');
      return;
    }
    run.status = 'running';
    run.attempts += 1;
    run.progress = 0;
    delete run.error;
    workConsumed += point.work;
    try {
      usesWorkers = client.usesWorkers();
      active = client.submit(point.request, {
        timeoutMs: Math.max(1, Math.min(45_000, Math.floor(remaining))),
        onProgress: (_phase, completed, total) => {
          if (token === epoch && status === 'running') {
            run.progress = total > 0 ? completed / total : 0;
            emit();
          }
        }
      });
      emit();
      const result = await active.result;
      if (disposed || token !== epoch || status !== 'running') return;
      if (!result.ok) throw new Error(result.error);
      run.result = validateStudyPointResult(result, point.request);
      run.status = 'completed';
      run.progress = 1;
    } catch (cause) {
      if (disposed || token !== epoch || status !== 'running') return;
      run.status = 'failed';
      run.failures += 1;
      run.progress = 0;
      run.error = (cause instanceof Error ? cause.message : String(cause)).slice(0, 4096);
    }
    active = undefined;
    emit();
    await pump(token);
  }
  return {
    snapshot,
    subscribe(listener: (value: NativeDesignSnapshot) => void) {
      listeners.add(listener);
      listener(snapshot());
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (disposed || status === 'running') return;
      if (!runs.some((run) => run.status === 'pending')) {
        status = runs.every((r) => r.status === 'completed') ? 'completed' : 'partial';
        emit();
        return;
      }
      started = now();
      status = 'running';
      stopReason = null;
      emit();
      void pump(++epoch);
    },
    cancel() {
      if (status !== 'running') return;
      const handle = active;
      epoch += 1;
      runs = runs.map((run) => (run.status === 'running' ? { ...run, status: 'pending', progress: 0 } : run));
      stop('현재 점은 처음부터 재개합니다. 완료점은 보존됩니다.', 'cancelled');
      handle?.cancel();
    },
    retryFailed() {
      if (disposed || status === 'running') return;
      runs = runs.map((run) =>
        run.status === 'failed' && run.attempts < 10
          ? { id: run.id, status: 'pending', attempts: run.attempts, failures: run.failures, progress: 0 }
          : run
      );
      status = runs.some((run) => run.status === 'pending')
        ? 'ready'
        : runs.every((run) => run.status === 'completed')
          ? 'completed'
          : 'partial';
      stopReason = null;
      emit();
    },
    dispose() {
      if (disposed) return;
      this.cancel();
      disposed = true;
      client.terminate();
      listeners.clear();
    }
  };
}
export function serializeNativeDesignQueue(snapshot: NativeDesignSnapshot): string {
  return stableBatchJson(validateNativeDesignSnapshot(snapshot));
}
export function parseNativeDesignQueue(text: string): NativeDesignSnapshot {
  if (new TextEncoder().encode(text).length > NATIVE_DESIGN_LIMITS.bytes)
    throw new Error('설계 파일은 최대16MiB입니다.');
  const scanned = scanJsonResources(text, {
    depth: 32,
    nodes: 1_000_000,
    arrayItems: 8192,
    objectProperties: 512,
    stringCodeUnits: 16384,
    totalStringCodeUnits: NATIVE_DESIGN_LIMITS.bytes,
    keyCodeUnits: 256
  });
  if (!scanned.ok) throw new Error(scanned.message);
  return validateNativeDesignSnapshot(JSON.parse(text));
}
export type NativeDesignQueue = ReturnType<typeof createNativeDesignQueue>;
