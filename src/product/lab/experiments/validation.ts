import { batchMetricMetadata, batchStepCount } from './metadata';
import {
  BATCH_LIMITS,
  BATCH_VERSION,
  type BatchRunResult,
  type BatchSnapshot,
  type BatchWorkerRequest
} from './contracts';
import { buildBatch } from './builders';
import { aggregateBatch } from './aggregate';
import { batchData, closed, stableBatchJson } from './safe';
const integer = (value: number, min: number, max: number) =>
  Number.isSafeInteger(value) && value >= min && value <= max;
export function batchProgress(runs: BatchSnapshot['runs']): number {
  return (
    runs.reduce((sum, run) => sum + (run.status === 'completed' || run.status === 'failed' ? 1 : run.progress), 0) /
    runs.length
  );
}
export function validateBatchResult(input: unknown, request: BatchWorkerRequest): BatchRunResult {
  const result = batchData(input) as unknown as BatchRunResult;
  if (!result || typeof result !== 'object') throw new Error('run 결과 객체가 필요합니다.');
  closed(result, ['schema', 'algorithmVersion', 'runId', 'batchId', 'inputIndex', 'summary']);
  if (
    result.schema !== 'pendulum-batch-run/v1' ||
    result.algorithmVersion !== BATCH_VERSION ||
    result.batchId !== request.batchId ||
    result.runId !== request.run.id ||
    result.inputIndex !== request.run.index
  )
    throw new Error('run 결과의 버전·입력 계보가 맞지 않습니다.');
  const s = result.summary,
    experiment = request.run.experiment,
    metadata = batchMetricMetadata(experiment),
    evaluation = experiment.runtime.domain === 'evaluation';
  if (!s || typeof s !== 'object') throw new Error('run 요약이 필요합니다.');
  closed(s, [
    'steps',
    'sampleCount',
    'axisUnit',
    'axisStart',
    'axisEnd',
    'metrics',
    'energy',
    'warnings',
    'evaluation'
  ]);
  const expectedSteps = batchStepCount(experiment);
  const expectedStart =
    experiment.runtime.domain === 'time'
      ? experiment.runtime.start.value
      : experiment.runtime.domain === 'iteration'
        ? experiment.runtime.start
        : 0;
  const expectedEnd =
    experiment.runtime.domain === 'time'
      ? expectedStart + experiment.runtime.duration.value
      : experiment.runtime.domain === 'iteration'
        ? expectedStart + experiment.runtime.iterations
        : 0;
  const stride = evaluation ? 1 : experiment.runtime.sampleEvery;
  if (
    s.evaluation !== evaluation ||
    s.steps !== expectedSteps ||
    s.sampleCount !== (evaluation ? 1 : 1 + Math.ceil(expectedSteps / stride)) ||
    s.axisUnit !== (evaluation ? 'evaluation' : metadata.axisUnit) ||
    s.axisStart !== expectedStart ||
    Math.abs(s.axisEnd - expectedEnd) > 1e-10 * Math.max(1, Math.abs(expectedEnd))
  )
    throw new Error('run 관측 축·표본 수·단계 수가 입력 설정과 다릅니다.');
  if (
    !Array.isArray(s.metrics) ||
    s.metrics.length > BATCH_LIMITS.dimension ||
    s.metrics.length !== metadata.labels.length
  )
    throw new Error('run metric 차원이 입력과 다릅니다.');
  s.metrics.forEach((m, i) => {
    if (!m || typeof m !== 'object') throw new Error('metric 객체가 필요합니다.');
    closed(m, ['key', 'label', 'unit', 'initial', 'final', 'min', 'max', 'mean', 'rms']);
    if (
      m.key !== `state-${i}` ||
      m.label !== metadata.labels[i] ||
      m.unit !== metadata.units[i] ||
      ![m.initial, m.final, m.min, m.max, m.mean, m.rms].every(Number.isFinite) ||
      m.min > Math.min(m.initial, m.final, m.mean) ||
      m.max < Math.max(m.initial, m.final, m.mean) ||
      m.rms < 0
    )
      throw new Error('metric의 이름·단위·유한 범위가 올바르지 않습니다.');
    if (
      s.sampleCount === 1 &&
      (m.initial !== m.final ||
        m.initial !== m.min ||
        m.initial !== m.max ||
        m.initial !== m.mean ||
        m.rms !== Math.abs(m.initial))
    )
      throw new Error('단일 관측 통계가 서로 일치하지 않습니다.');
  });
  if (!Array.isArray(s.warnings) || s.warnings.length > 256 || s.warnings.some((v) => typeof v !== 'string'))
    throw new Error('run 경고 목록이 올바르지 않습니다.');
  if (metadata.warnings.some((warning) => !s.warnings.includes(warning)))
    throw new Error('모델 해석·단위 경고가 누락되었습니다.');
  if ((s.energy !== undefined) !== (metadata.energyUnit !== undefined))
    throw new Error('모델의 에너지 진단 지원 여부와 결과가 다릅니다.');
  if (s.energy !== undefined) {
    closed(s.energy, ['initial', 'final', 'change', 'unit']);
    if (
      ![s.energy.initial, s.energy.final, s.energy.change].every(Number.isFinite) ||
      Math.abs(s.energy.change - (s.energy.final - s.energy.initial)) >
        1e-10 * Math.max(1, Math.abs(s.energy.change)) ||
      typeof s.energy.unit !== 'string' ||
      (metadata.energyUnit && s.energy.unit !== metadata.energyUnit)
    )
      throw new Error('에너지 변화·단위가 올바르지 않습니다.');
    if (evaluation && (s.energy.initial !== s.energy.final || s.energy.change !== 0))
      throw new Error('정적 평가에서 시간 전파 에너지 변화를 만들 수 없습니다.');
  }
  return result;
}

/** Validates structure/lineage/derived counts; imported numerical claims are not authenticated or recomputed. */
export function validateBatchSnapshot(input: unknown): BatchSnapshot {
  const snapshot = batchData(input) as unknown as BatchSnapshot;
  if (!snapshot || typeof snapshot !== 'object') throw new Error('다중 실험 객체가 필요합니다.');
  closed(snapshot, ['schema', 'algorithmVersion', 'plan', 'status', 'progress', 'runs', 'aggregate']);
  if (snapshot.schema !== 'pendulum-batch/v1' || snapshot.algorithmVersion !== BATCH_VERSION || !snapshot.plan)
    throw new Error('지원하지 않는 다중 실험 버전입니다. 원본을 보존하세요.');
  const rebuilt = buildBatch(snapshot.plan.source, snapshot.plan.settings);
  if (stableBatchJson(snapshot.plan) !== stableBatchJson(rebuilt))
    throw new Error('입력 설정·run 순서·할당·계보가 일치하지 않습니다.');
  if (!Array.isArray(snapshot.runs) || snapshot.runs.length !== rebuilt.runs.length)
    throw new Error('run 상태 개수가 일치하지 않습니다.');
  snapshot.runs.forEach((run, i) => {
    closed(run, ['id', 'index', 'status', 'attempts', 'progress', 'error', 'result']);
    if (
      run.id !== rebuilt.runs[i]!.id ||
      run.index !== i ||
      !['pending', 'running', 'completed', 'failed'].includes(run.status) ||
      !integer(run.attempts, 0, 1000) ||
      !Number.isFinite(run.progress) ||
      run.progress < 0 ||
      run.progress > 1
    )
      throw new Error('run 순서·상태·시도 횟수가 올바르지 않습니다.');
    if (run.status !== 'pending' && run.attempts < 1) throw new Error('시도하지 않은 run에 실행 결과가 있습니다.');
    if (
      (run.status === 'completed') !== (run.result !== undefined) ||
      (run.status === 'failed') !== (run.error !== undefined) ||
      (run.error !== undefined && (typeof run.error !== 'string' || !run.error.length))
    )
      throw new Error('run 종료 상태와 결과·오류가 일치하지 않습니다.');
    if ((run.status === 'completed' || run.status === 'failed') && run.progress !== 1)
      throw new Error('완료 run 진행률이 올바르지 않습니다.');
    if (run.status === 'pending' && run.progress !== 0) throw new Error('대기 run 진행률은 0이어야 합니다.');
    if (run.result) validateBatchResult(run.result, { batchId: rebuilt.id, run: rebuilt.runs[i]! });
  });
  const aggregate = aggregateBatch(rebuilt, snapshot.runs);
  if (
    stableBatchJson(snapshot.aggregate) !== stableBatchJson(aggregate) ||
    snapshot.progress !== batchProgress(snapshot.runs)
  )
    throw new Error('집계·진행률과 개별 run 결과가 일치하지 않습니다.');
  if (
    !['ready', 'running', 'cancelled', 'completed', 'partial'].includes(snapshot.status) ||
    snapshot.runs.filter((r) => r.status === 'running').length > rebuilt.settings.concurrency ||
    (snapshot.status !== 'running' && snapshot.runs.some((r) => r.status === 'running')) ||
    (snapshot.status === 'completed' && aggregate.completed !== snapshot.runs.length) ||
    (snapshot.status === 'partial' && (aggregate.failed === 0 || aggregate.pending !== 0))
  )
    throw new Error('대기열 상태가 개별 run과 일치하지 않습니다.');
  return snapshot;
}
