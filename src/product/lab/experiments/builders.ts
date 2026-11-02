import type { ExperimentStateV1 } from '../../contracts/experiment';
import type { QuantityMap, QuantityValue } from '../../contracts/quantities';
import { readDiagnosticConfiguration } from '../../adapters/analysis/core/source-config';
import { createDiagnosticSeries } from '../../adapters/analysis/core/source';
import { integrators } from '../../catalog/integrators';
import { validateExperimentState } from '../../contracts/experiment-validation';
import { batchMetricMetadata, batchStepCount } from './metadata';
import {
  BATCH_KINDS,
  BATCH_LIMITS,
  BATCH_VERSION,
  type BatchAxis,
  type BatchBuilderSettings,
  type BatchField,
  type BatchPlan,
  type BatchRun
} from './contracts';
import { batchData, batchHash, closed } from './safe';

export function builderFields(experiment: ExperimentStateV1): readonly BatchField[] {
  readDiagnosticConfiguration(experiment);
  const output: BatchField[] = [];
  for (const group of ['parameters', 'initialConditions'] as const)
    for (const [key, quantity] of Object.entries(experiment[group])) {
      if (quantity.kind === 'scalar') output.push({ group, key, unit: quantity.unit, value: quantity.value });
      else if (quantity.kind === 'vector')
        quantity.values.forEach((value, index) => output.push({ group, key, index, unit: quantity.unit, value }));
    }
  return output;
}
export function compatibleBatchIntegrators(experiment: ExperimentStateV1): readonly string[] {
  if (experiment.integrator.kind === 'internal') return [];
  return integrators
    .map((entry) => entry.id)
    .filter((id) => {
      try {
        readDiagnosticConfiguration({
          ...experiment,
          integrator: { ...experiment.integrator, kind: 'selectable', id: id as `integrator:${string}` }
        });
        return true;
      } catch {
        return false;
      }
    });
}
export function defaultBatchSettings(experiment: ExperimentStateV1): BatchBuilderSettings {
  const fields = builderFields(experiment),
    field = fields.find((entry) => entry.group === 'initialConditions') ?? fields[0];
  return {
    kind: 'paired',
    axes: field
      ? [
          {
            group: field.group,
            key: field.key,
            ...(field.index === undefined ? {} : { index: field.index }),
            start: field.value,
            end: field.value + 0.001,
            count: 3
          }
        ]
      : [],
    count: 8,
    seed: 'batch-21',
    concurrency: 2,
    integratorIds: compatibleBatchIntegrators(experiment)
  };
}
const axisId = (a: Pick<BatchAxis, 'group' | 'key' | 'index'>) =>
  `${a.group}.${a.key}${a.index === undefined ? '' : `[${a.index}]`}`;
function random(seed: string): () => number {
  let state = parseInt(batchHash(seed).slice(0, 8), 16);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function setQuantity(experiment: ExperimentStateV1, axis: BatchAxis, value: number): ExperimentStateV1 {
  const old = experiment[axis.group][axis.key]!;
  let next: QuantityValue;
  if (old.kind === 'scalar' && axis.index === undefined) next = { ...old, value: value === 0 ? 0 : value };
  else if (old.kind === 'vector' && axis.index !== undefined) {
    const values = [...old.values];
    values[axis.index] = value === 0 ? 0 : value;
    next = { ...old, values };
  } else throw new Error('선택한 변수와 배열 성분이 맞지 않습니다.');
  const group: QuantityMap = { ...experiment[axis.group], [axis.key]: next };
  return { ...experiment, [axis.group]: group };
}
function checkSettings(experiment: ExperimentStateV1, input: BatchBuilderSettings): BatchBuilderSettings {
  const settings = batchData(input) as unknown as BatchBuilderSettings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings))
    throw new Error('다중 run 설정 객체가 필요합니다.');
  closed(settings, ['kind', 'axes', 'count', 'seed', 'concurrency', 'integratorIds']);
  if (!BATCH_KINDS.includes(settings.kind) || !Array.isArray(settings.axes) || settings.axes.length > BATCH_LIMITS.axes)
    throw new Error('실험 종류와 최대 세 변수를 확인하세요.');
  if (
    !Number.isInteger(settings.count) ||
    settings.count < 2 ||
    settings.count > BATCH_LIMITS.runs ||
    !Number.isInteger(settings.concurrency) ||
    settings.concurrency < 1 ||
    settings.concurrency > BATCH_LIMITS.concurrency
  )
    throw new Error('run 수는 2–512, 동시 실행은 1–4입니다.');
  if (typeof settings.seed !== 'string' || !/^[A-Za-z0-9._:-]{1,64}$/.test(settings.seed))
    throw new Error('seed는 1–64자 영문·숫자·점·밑줄·콜론·대시입니다.');
  if (
    !Array.isArray(settings.integratorIds) ||
    settings.integratorIds.length > 16 ||
    new Set(settings.integratorIds).size !== settings.integratorIds.length ||
    settings.integratorIds.some((id) => typeof id !== 'string')
  )
    throw new Error('최대 16개 중복 없는 적분기 목록을 선택하세요.');
  const available = builderFields(experiment),
    names = new Set<string>();
  for (const axis of settings.axes) {
    if (!axis || typeof axis !== 'object' || Array.isArray(axis)) throw new Error('변수 범위 객체가 필요합니다.');
    closed(axis, ['group', 'key', 'index', 'start', 'end', 'count']);
    const name = axisId(axis);
    if (!available.some((field) => axisId(field) === name) || names.has(name))
      throw new Error('존재하는 scalar/vector 변수를 중복 없이 선택하세요.');
    names.add(name);
    if (
      ![axis.start, axis.end].every(Number.isFinite) ||
      (settings.kind !== 'paired' && axis.start >= axis.end) ||
      !Number.isSafeInteger(axis.count) ||
      axis.count < 2 ||
      axis.count > BATCH_LIMITS.runs
    )
      throw new Error(
        '변수 시작은 끝보다 작고 분할 수는 2–512 정수여야 합니다. paired 비교는 끝 값만 원본과 비교합니다.'
      );
    if (settings.kind === 'log' && axis.start <= 0) throw new Error('로그 sweep의 양 끝 값은 양수여야 합니다.');
  }
  if (settings.kind === 'paired' && settings.axes.length !== 1)
    throw new Error('paired 비교는 정확히 한 변수를 바꿉니다.');
  if (['grid', 'log', 'lhs'].includes(settings.kind) && !settings.axes.length)
    throw new Error('sweep할 변수를 하나 이상 선택하세요.');
  if (settings.kind === 'integrators') {
    const ids = compatibleBatchIntegrators(experiment);
    if (settings.integratorIds.length < 2 || settings.integratorIds.some((id) => !ids.includes(id)))
      throw new Error(
        '현재 adapter에서 실제로 실행 가능한 두 개 이상의 적분기가 필요합니다. 내부 전용 stepper는 비교하지 않습니다.'
      );
    if (settings.axes.length) throw new Error('적분기 비교에서는 물성과 초기조건을 고정하세요.');
  }
  return settings;
}
function cost(experiment: ExperimentStateV1): number {
  const source = readDiagnosticConfiguration(experiment),
    runtime = experiment.runtime;
  const dimension = Math.max(1, source.config.initialState.length);
  if (dimension > BATCH_LIMITS.dimension) throw new Error('다중 run 상태 차원은 최대 512입니다.');
  if (runtime.domain === 'evaluation') {
    const c = source.config;
    return source.family === 'field'
      ? Math.max(1, source.config.grid.points * (source.config.parameters.maxIterations ?? 1))
      : Math.max(1, 'matrix' in c && c.matrix ? c.matrix.re.length ** 3 : dimension);
  }
  const steps = batchStepCount(experiment);
  if (steps > BATCH_LIMITS.steps) throw new Error('개별 run은 최대 100000단계입니다.');
  const multiplicity =
    source.family === 'field' && source.config.systemId === 'system:langevin' ? source.config.ensemble.members : 1;
  const dense =
    source.family === 'chain' || source.family === 'spatial' ? Math.max(1, Math.ceil(dimension / 4) ** 2) : 1;
  return Math.max(1, steps) * dimension * multiplicity * dense;
}

export function buildBatch(experiment: ExperimentStateV1, input: BatchBuilderSettings): BatchPlan {
  const source = batchData(experiment) as unknown as ExperimentStateV1;
  const canonical = validateExperimentState(source);
  if (!canonical.ok) throw new Error(canonical.issues.map((entry) => `${entry.path}: ${entry.message}`).join(' '));
  readDiagnosticConfiguration(source);
  const settings = checkSettings(source, input),
    axes = settings.axes,
    rng = random(settings.seed);
  let values: number[][] = [];
  if (settings.kind === 'paired') values = [[], [axes[0]!.end]];
  else if (settings.kind === 'integrators') values = settings.integratorIds.map(() => []);
  else if (settings.kind === 'grid' || settings.kind === 'log') {
    const count = axes.reduce((n, axis) => n * axis.count, 1);
    if (count > BATCH_LIMITS.runs) throw new Error('Cartesian 격자는 최대 512 run입니다. 변수별 분할 수를 줄이세요.');
    values = [[]];
    for (const axis of axes)
      values = values.flatMap((prefix) =>
        Array.from({ length: axis.count }, (_, i) => [
          ...prefix,
          i === 0
            ? axis.start
            : i === axis.count - 1
              ? axis.end
              : settings.kind === 'log'
                ? Math.exp(Math.log(axis.start) + (i / (axis.count - 1)) * (Math.log(axis.end) - Math.log(axis.start)))
                : axis.start + (i / (axis.count - 1)) * (axis.end - axis.start)
        ])
      );
  } else if (settings.kind === 'lhs') {
    values = Array.from({ length: settings.count }, () => []);
    for (const axis of axes) {
      const permutation = Array.from({ length: settings.count }, (_, i) => i);
      for (let i = permutation.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [permutation[i], permutation[j]] = [permutation[j]!, permutation[i]!];
      }
      values.forEach((row, i) =>
        row.push(axis.start + ((permutation[i]! + rng()) / settings.count) * (axis.end - axis.start))
      );
    }
  } else
    values = Array.from({ length: settings.count }, () =>
      axes.map((axis) => axis.start + rng() * (axis.end - axis.start))
    );
  if (values.length > BATCH_LIMITS.runs) throw new Error('다중 실험은 최대 512 run입니다.');
  const id = `batch-${batchHash({ source, settings })}`,
    sourceInputId = `input-${batchHash(source)}`;
  let estimatedWork = 0;
  const runs: BatchRun[] = values.map((row, index) => {
    let next = structuredClone(source);
    const assignments: { field: string; unit: string; value: number | string }[] = [];
    row.forEach((value, i) => {
      const axis = axes[i]!;
      next = setQuantity(next, axis, value);
      assignments.push({
        field: axisId(axis),
        unit: source[axis.group][axis.key]!.unit,
        value: value === 0 ? 0 : value
      });
    });
    if (settings.kind === 'ensemble') {
      const seed = `${settings.seed}:run-${index + 1}`;
      if (source.seed) next = { ...next, seed: { ...source.seed, value: seed } };
      assignments.push({ field: source.seed ? 'seed.value' : 'design.seed', unit: '1', value: seed });
    }
    if (settings.kind === 'integrators') {
      if (next.integrator.kind !== 'selectable') throw new Error('선택형 적분기가 필요합니다.');
      const integratorId = settings.integratorIds[index]! as `integrator:${string}`;
      next = { ...next, integrator: { ...next.integrator, id: integratorId } };
      assignments.push({ field: 'integrator.id', unit: '1', value: integratorId });
    }
    try {
      estimatedWork += cost(next);
      if (batchMetricMetadata(next).labels.length !== batchMetricMetadata(source).labels.length)
        throw new Error('비교 run의 관측 차원은 같아야 합니다. 격자·행렬 크기를 고정하세요.');
    } catch (error) {
      throw new Error(`run ${index + 1}: ${error instanceof Error ? error.message : '설정 오류'}`);
    }
    if (estimatedWork > BATCH_LIMITS.work)
      throw new Error('전체 실행 비용이 4000000 상태·단계 작업을 넘습니다. run 수·기간·차원·앙상블 크기를 줄이세요.');
    return { id: `${id}-run-${String(index + 1).padStart(4, '0')}`, index, experiment: next, assignments };
  });
  const warnings = [
    ...createDiagnosticSeries(source, []).warnings,
    '요약 통계는 sampleEvery에 따른 기록 표본의 산술 통계이며 시간 가중 평균이 아닙니다. 원시 궤적은 이 패키지에 저장하지 않습니다.',
    '재개는 완료 run을 보존하고 중단된 run만 원래 입력·seed에서 다시 시작합니다. 확률 stream의 중간 cursor를 이어 붙이지 않습니다.'
  ];
  if (settings.kind === 'ensemble' && !axes.length && source.systemId !== 'system:langevin')
    warnings.push(
      '이 결정론적 모델에서 seed만 바꾸면 동일한 run이 반복될 수 있습니다. 초기조건·물성 분포를 추가하세요.'
    );
  if (settings.kind === 'integrators')
    warnings.push(
      '첫 번째 적분기는 비교 기준이며 참해가 아닙니다. endpoint 차이와 에너지 변화는 절단오차의 인증값이 아닙니다.'
    );
  if (settings.kind === 'integrators')
    for (const id of settings.integratorIds)
      warnings.push(...(integrators.find((entry) => entry.id === id)?.limitations.map((entry) => entry.ko) ?? []));
  const plan: BatchPlan = {
    schema: 'pendulum-batch-plan/v1',
    algorithmVersion: BATCH_VERSION,
    id,
    sourceInputId,
    source,
    settings,
    runs,
    estimatedWork,
    warnings
  };
  batchData(plan);
  return plan;
}
