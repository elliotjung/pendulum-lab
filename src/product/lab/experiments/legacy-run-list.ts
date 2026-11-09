import type { ExperimentStateV1 } from '../../contracts/experiment';
import { validateExperimentState } from '../../contracts/experiment-validation';
import { readDiagnosticConfiguration } from '../../adapters/analysis/core/source-config';
import { scanJsonResources } from '../../../app/parity/storage-json-resource-scanner';
import { BATCH_LIMITS, BATCH_VERSION, type BatchRun, type BatchRunState, type BatchStatus } from './contracts';
import { batchMetricMetadata, batchStepCount } from './metadata';
import { batchData, batchHash, closed, stableBatchJson } from './safe';
import { batchProgress, validateBatchResult } from './validation';

export interface LegacyRunEntry {
  readonly sourceId: string;
  readonly experiment: ExperimentStateV1;
}
export interface LegacyRunList {
  readonly schema: 'pendulum-legacy-run-list/v1';
  readonly algorithmVersion: typeof BATCH_VERSION;
  readonly id: string;
  readonly entries: readonly LegacyRunEntry[];
  readonly runs: readonly BatchRun[];
  readonly estimatedWork: number;
  readonly estimatedArtifactBytes: number;
}
export interface LegacyRunSnapshot {
  readonly schema: 'pendulum-legacy-run-queue/v1';
  readonly plan: LegacyRunList;
  readonly concurrency: number;
  readonly status: BatchStatus;
  readonly progress: number;
  readonly runs: readonly BatchRunState[];
}

/** Same native-work bounds as S21, without regenerating or relabeling a legacy design. */
function runCost(experiment: ExperimentStateV1): number {
  const source = readDiagnosticConfiguration(experiment),
    runtime = experiment.runtime;
  const dimension = Math.max(1, source.config.initialState.length);
  if (dimension > BATCH_LIMITS.dimension) throw new Error('run 상태 차원은 최대 512입니다.');
  if (runtime.domain === 'evaluation') {
    const configuration = source.config;
    return source.family === 'field'
      ? Math.max(1, source.config.grid.points * (source.config.parameters.maxIterations ?? 1))
      : Math.max(
          1,
          'matrix' in configuration && configuration.matrix ? configuration.matrix.re.length ** 3 : dimension
        );
  }
  const steps = batchStepCount(experiment);
  if (steps > BATCH_LIMITS.steps) throw new Error('개별 run은 최대100000단계입니다.');
  const multiplicity =
    source.family === 'field' && source.config.systemId === 'system:langevin' ? source.config.ensemble.members : 1;
  const dense =
    source.family === 'chain' || source.family === 'spatial' ? Math.max(1, Math.ceil(dimension / 4) ** 2) : 1;
  return Math.max(1, steps) * dimension * multiplicity * dense;
}
function checkedEntry(input: unknown): LegacyRunEntry {
  const entry = batchData(input) as unknown as LegacyRunEntry;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('원본 run 입력 객체가 필요합니다.');
  closed(entry, ['sourceId', 'experiment']);
  if (typeof entry.sourceId !== 'string' || !entry.sourceId.length || entry.sourceId.length > 1024)
    throw new Error('각 원본 run ID는1–1024자여야 합니다.');
  const validation = validateExperimentState(entry.experiment);
  if (!validation.ok) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join(' '));
  readDiagnosticConfiguration(entry.experiment);
  return entry;
}
/** Bounds full summaries, including worst-case escaped4096-character worker errors. */
export function legacyRunResultByteBudget(experiment: ExperimentStateV1): number {
  const metadata = batchMetricMetadata(experiment);
  const labels = new TextEncoder().encode(JSON.stringify([metadata.labels, metadata.units, metadata.warnings])).length;
  return Math.max(24_576, labels + metadata.labels.length * 384 + 8192);
}
function entryByteBudget(entry: LegacyRunEntry): number {
  // Snapshot stores each exact experiment in entries and runs, then adds one result/state.
  return (
    2 * new TextEncoder().encode(JSON.stringify(entry)).length + legacyRunResultByteBudget(entry.experiment) + 2048
  );
}
export function buildLegacyRunList(input: readonly LegacyRunEntry[]): LegacyRunList {
  const entries = batchData(input) as unknown as LegacyRunEntry[];
  if (!Array.isArray(entries) || !entries.length || entries.length > BATCH_LIMITS.runs)
    throw new Error(
      '한 실행 part는1–512개의 원본 run을 포함해야 합니다. 전체 목록은 partitionLegacyRunList로 나누세요.'
    );
  const checked = entries.map(checkedEntry);
  if (new Set(checked.map((entry) => entry.sourceId)).size !== checked.length)
    throw new Error('원본 run ID가 중복되었습니다.');
  const estimatedWork = checked.reduce((total, entry) => total + runCost(entry.experiment), 0);
  if (estimatedWork > BATCH_LIMITS.work)
    throw new Error('실행 part가4000000 상태·단계 작업을 넘습니다. 원래 순서를 유지하며 part를 나누세요.');
  const estimatedArtifactBytes = 4096 + checked.reduce((total, entry) => total + entryByteBudget(entry), 0);
  if (estimatedArtifactBytes > BATCH_LIMITS.artifactBytes)
    throw new Error('전체 입력·결과·오류의16MiB 보관 예산을 넘습니다. 원래 순서를 유지하며 part를 나누세요.');
  const id = `legacy-list-${batchHash(checked)}`;
  const plan: LegacyRunList = {
    schema: 'pendulum-legacy-run-list/v1',
    algorithmVersion: BATCH_VERSION,
    id,
    entries: checked,
    runs: checked.map((entry, index) => ({
      id: `${id}-run-${String(index + 1).padStart(4, '0')}`,
      index,
      experiment: entry.experiment,
      assignments: [{ field: 'legacy.sourceId', unit: '1', value: entry.sourceId }]
    })),
    estimatedWork,
    estimatedArtifactBytes
  };
  batchData(plan);
  return plan;
}

/** Explicit contiguous partitioning; never samples, changes seeds, or drops oversized tail entries. */
export function partitionLegacyRunList(input: readonly LegacyRunEntry[]): readonly LegacyRunList[] {
  if (
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    !input.length ||
    input.length > 25_000
  )
    throw new Error('전체 원본 목록은1–25000개의 연속 입력이어야 합니다.');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== input.length + 1)
    throw new Error('희소·추가 속성 run 목록은 허용하지 않습니다.');
  const plans: LegacyRunList[] = [],
    ids = new Set<string>();
  let entries: LegacyRunEntry[] = [],
    work = 0,
    bytes = 4096;
  for (let index = 0; index < input.length; index++) {
    const descriptor = descriptors[String(index)];
    if (!descriptor?.enumerable || !('value' in descriptor))
      throw new Error('run 접근자·희소 입력은 허용하지 않습니다.');
    const entry = checkedEntry(descriptor.value),
      cost = runCost(entry.experiment),
      byteBudget = entryByteBudget(entry);
    if (ids.has(entry.sourceId)) throw new Error(`원본 run ID가 중복되었습니다: ${entry.sourceId}`);
    ids.add(entry.sourceId);
    if (cost > BATCH_LIMITS.work)
      throw new Error(`원본 run ${entry.sourceId} 하나가 작업 한도를 넘습니다. 입력을 임의로 줄이지 않았습니다.`);
    if (4096 + byteBudget > BATCH_LIMITS.artifactBytes)
      throw new Error(`원본 run ${entry.sourceId} 하나가16MiB 보관 예산을 넘습니다. 원본 입력을 보존하세요.`);
    if (
      entries.length &&
      (entries.length === BATCH_LIMITS.runs ||
        work + cost > BATCH_LIMITS.work ||
        bytes + byteBudget > BATCH_LIMITS.artifactBytes)
    ) {
      plans.push(buildLegacyRunList(entries));
      entries = [];
      work = 0;
      bytes = 4096;
    }
    entries.push(entry);
    work += cost;
    bytes += byteBudget;
  }
  if (entries.length) plans.push(buildLegacyRunList(entries));
  return plans;
}

/** Imported numerical values are structurally checked, not scientifically authenticated. */
export function validateLegacyRunSnapshot(input: unknown): LegacyRunSnapshot {
  const snapshot = batchData(input) as unknown as LegacyRunSnapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))
    throw new Error('원본 run 대기열 객체가 필요합니다.');
  closed(snapshot, ['schema', 'plan', 'concurrency', 'status', 'progress', 'runs']);
  if (snapshot.schema !== 'pendulum-legacy-run-queue/v1' || !snapshot.plan)
    throw new Error('지원하지 않는 원본 run 파일 버전입니다.');
  const plan = buildLegacyRunList(snapshot.plan.entries);
  if (stableBatchJson(plan) !== stableBatchJson(snapshot.plan))
    throw new Error('원본 입력·순서·seed·ID·작업량 계보가 일치하지 않습니다.');
  if (
    !Number.isSafeInteger(snapshot.concurrency) ||
    snapshot.concurrency < 1 ||
    snapshot.concurrency > BATCH_LIMITS.concurrency
  )
    throw new Error('동시 실행은1–4여야 합니다.');
  if (!Array.isArray(snapshot.runs) || snapshot.runs.length !== plan.runs.length)
    throw new Error('run 상태 개수가 다릅니다.');
  snapshot.runs.forEach((run, index) => {
    if (!run || typeof run !== 'object' || Array.isArray(run)) throw new Error('run 상태 객체가 필요합니다.');
    closed(run, ['id', 'index', 'status', 'attempts', 'progress', 'error', 'result']);
    if (
      run.id !== plan.runs[index]!.id ||
      run.index !== index ||
      !['pending', 'running', 'completed', 'failed'].includes(run.status) ||
      !Number.isSafeInteger(run.attempts) ||
      run.attempts < 0 ||
      run.attempts > 1000 ||
      !Number.isFinite(run.progress) ||
      run.progress < 0 ||
      run.progress > 1
    )
      throw new Error('run ID·순서·상태·시도 횟수가 올바르지 않습니다.');
    if (
      (run.status !== 'pending' && run.attempts < 1) ||
      (run.status === 'pending' && run.progress !== 0) ||
      ((run.status === 'failed' || run.status === 'completed') && run.progress !== 1) ||
      (run.status === 'completed') !== (run.result !== undefined) ||
      (run.status === 'failed') !== (run.error !== undefined) ||
      (run.error !== undefined && (typeof run.error !== 'string' || !run.error.length || run.error.length > 4096))
    )
      throw new Error('run 종료 상태와 결과·오류·진행률이 맞지 않습니다.');
    if (run.result) {
      validateBatchResult(run.result, { batchId: plan.id, run: plan.runs[index]! });
      if (
        new TextEncoder().encode(JSON.stringify(run.result)).length >
        legacyRunResultByteBudget(plan.entries[index]!.experiment)
      )
        throw new Error('개별 native 결과가 해당 run의 보관 byte 예산을 넘습니다.');
    }
  });
  const pending = snapshot.runs.some((run) => run.status === 'pending' || run.status === 'running');
  if (
    !['ready', 'running', 'cancelled', 'completed', 'partial'].includes(snapshot.status) ||
    snapshot.progress !== batchProgress(snapshot.runs) ||
    snapshot.runs.filter((run) => run.status === 'running').length > snapshot.concurrency ||
    (snapshot.status !== 'running' && snapshot.runs.some((run) => run.status === 'running')) ||
    (snapshot.status === 'ready' && !snapshot.runs.some((run) => run.status === 'pending')) ||
    (snapshot.status === 'completed' && snapshot.runs.some((run) => run.status !== 'completed')) ||
    (snapshot.status === 'partial' && (pending || !snapshot.runs.some((run) => run.status === 'failed')))
  )
    throw new Error('전체 대기열 상태·진행률이 개별 run과 맞지 않습니다.');
  return snapshot;
}
export function serializeLegacyRunQueue(input: LegacyRunSnapshot): string {
  return JSON.stringify(validateLegacyRunSnapshot(input));
}
export function parseLegacyRunQueue(text: string): LegacyRunSnapshot {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > BATCH_LIMITS.artifactBytes)
    throw new Error('원본 run 파일은 최대16MiB입니다.');
  const scanned = scanJsonResources(text, {
    depth: 32,
    nodes: 1_000_000,
    arrayItems: 8192,
    objectProperties: 512,
    stringCodeUnits: 16384,
    totalStringCodeUnits: BATCH_LIMITS.artifactBytes,
    keyCodeUnits: 256
  });
  if (!scanned.ok) throw new Error(scanned.message);
  return validateLegacyRunSnapshot(JSON.parse(text) as unknown);
}
