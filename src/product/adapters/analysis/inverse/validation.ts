import type { ExperimentStateV1 } from '../../../contracts/experiment';
import { validateExperimentState } from '../../../contracts/experiment-validation';
import { builderFields, buildBatch, defaultBatchSettings } from '../../../lab/experiments/builders';
import { batchMetricMetadata } from '../../../lab/experiments/metadata';
import { closed } from '../../../lab/experiments/safe';
import { PLANAR_FIELDS } from '../../physics/planar-schema';
import { readDiagnosticConfiguration } from '../core/source-config';
import { totalDegreeMultiIndices } from '../../../../research/surrogate';
import { INVERSE_LIMITS, type InverseRequest, type UqSettings, type UqVariable } from './contracts';
import { inverseData } from './data';

export const variableName = (v: UqVariable) => `${v.group}.${v.key}${v.index === undefined ? '' : `[${v.index}]`}`;
export function withVariables(
  experiment: ExperimentStateV1,
  variables: readonly UqVariable[],
  values: readonly number[]
): ExperimentStateV1 {
  let result = experiment;
  variables.forEach((variable, index) => {
    const quantity = result[variable.group][variable.key]!;
    const value = values[index]!;
    if (!Number.isFinite(value)) throw new Error('평가 입력은 유한해야 합니다.');
    const updated =
      quantity.kind === 'scalar' && variable.index === undefined
        ? { ...quantity, value: value === 0 ? 0 : value }
        : quantity.kind === 'vector' && variable.index !== undefined
          ? {
              ...quantity,
              values: quantity.values.map((v, i) => (i === variable.index ? (value === 0 ? 0 : value) : v))
            }
          : undefined;
    if (!updated) throw new Error('변수 차원이 일치하지 않습니다.');
    result = { ...result, [variable.group]: { ...result[variable.group], [variable.key]: updated } };
  });
  readDiagnosticConfiguration(result);
  return result;
}
export function uqEvaluationCount(settings: UqSettings): number {
  return settings.kind === 'sobol'
    ? settings.samples * (settings.variables.length + 2)
    : settings.samples + Math.max(8, Math.ceil(settings.samples / 4));
}
function validateUq(request: InverseRequest, settings: UqSettings): void {
  closed(settings, ['kind', 'variables', 'metric', 'samples', 'degree', 'seed']);
  if (
    !Array.isArray(settings.variables) ||
    !settings.variables.length ||
    settings.variables.length > INVERSE_LIMITS.variables
  )
    throw new Error('UQ는 1–3개의 독립 변수를 지원합니다.');
  if (!Number.isSafeInteger(settings.samples) || settings.samples < 8 || settings.samples > INVERSE_LIMITS.samples)
    throw new Error('기본 표본 수는 8–256 정수입니다.');
  if (!Number.isSafeInteger(settings.degree) || settings.degree < 1 || settings.degree > 3)
    throw new Error('PCE 차수는 1–3 정수입니다.');
  if (typeof settings.seed !== 'string' || !/^[A-Za-z0-9._:-]{1,64}$/.test(settings.seed))
    throw new Error('설계 seed는 1–64자 영문·숫자·점·밑줄·콜론·대시입니다.');
  if (!settings.metric || typeof settings.metric !== 'object' || Array.isArray(settings.metric))
    throw new Error('출력 metric이 필요합니다.');
  closed(settings.metric, ['index', 'statistic']);
  const metadata = batchMetricMetadata(request.experiment);
  if (
    !Number.isSafeInteger(settings.metric.index) ||
    settings.metric.index < 0 ||
    settings.metric.index >= metadata.labels.length ||
    !['final', 'mean', 'rms'].includes(settings.metric.statistic)
  )
    throw new Error('존재하는 출력 성분과 통계를 선택하세요.');
  const available = builderFields(request.experiment),
    names = new Set<string>();
  for (const variable of settings.variables) {
    if (!variable || typeof variable !== 'object' || Array.isArray(variable))
      throw new Error('변수 범위 객체가 필요합니다.');
    closed(variable, ['group', 'key', 'index', 'min', 'max']);
    const name = variableName(variable);
    if (names.has(name) || !available.some((v) => variableName({ ...v, min: 0, max: 1 }) === name))
      throw new Error('변수는 존재하는 독립 필드이며 중복이 없어야 합니다.');
    names.add(name);
    if (variable.group === 'parameters' && ['ensembleMembers', 'maxIterations'].includes(variable.key))
      throw new Error(
        '정수 전용 계산량 설정은 연속 균등분포 UQ 변수가 아닙니다. 앙상블 크기·Newton 반복 수를 고정하세요.'
      );
    if (
      ![variable.min, variable.max].every(Number.isFinite) ||
      !(variable.max > variable.min) ||
      !Number.isFinite(variable.max - variable.min)
    )
      throw new Error('변수의 유한한 최소·최대 범위를 확인하세요.');
  }
  const plan = buildBatch(request.experiment, {
    ...defaultBatchSettings(request.experiment),
    kind: 'grid',
    axes: settings.variables.map((v) => ({
      group: v.group,
      key: v.key,
      ...(v.index === undefined ? {} : { index: v.index }),
      start: v.min,
      end: v.max,
      count: 2
    }))
  });
  // Each corner is budgeted independently: averaging differently sized native
  // workloads could understate a box's maximum. No physical trajectory runs here.
  const workPerPoint = Math.max(
    1,
    ...plan.runs.map(
      (run) =>
        buildBatch(run.experiment, {
          ...defaultBatchSettings(run.experiment),
          kind: 'ensemble',
          axes: [],
          count: 2
        }).estimatedWork / 2
    )
  );
  if (workPerPoint * uqEvaluationCount(settings) > INVERSE_LIMITS.work)
    throw new Error('UQ 추정 계산량 한도 400만을 넘습니다. 표본·기간·차원을 줄이세요.');
  const terms = totalDegreeMultiIndices(settings.variables.length, settings.degree).length;
  if (settings.kind === 'pce' && settings.samples < 2 * terms)
    throw new Error(`PCE 훈련 표본은 최소 ${2 * terms}개여야 합니다. 차수를 낮추거나 표본 수를 늘리세요.`);
}
/** Synchronous transport validation precedes worker allocation. Observation SHA/replay is validated asynchronously by run/import. */
export function validateInverseRequest(input: unknown): asserts input is InverseRequest {
  inverseData(input);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('역문제 요청 객체가 필요합니다.');
  const request = input as InverseRequest;
  closed(request, ['schema', 'id', 'experiment', 'settings']);
  if (
    request.schema !== 'pendulum-inverse-request/v1' ||
    typeof request.id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(request.id)
  )
    throw new Error('지원하지 않는 요청 버전 또는 ID입니다.');
  const canonical = validateExperimentState(request.experiment);
  if (!canonical.ok) throw new Error(canonical.issues.map((i) => `${i.path}: ${i.message}`).join(' '));
  const source = readDiagnosticConfiguration(request.experiment),
    settings = request.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings))
    throw new Error('역문제·UQ 설정 객체가 필요합니다.');
  if (settings.kind === 'sobol' || settings.kind === 'pce') return validateUq(request, settings);
  if (settings.kind !== 'estimate') throw new Error('지원하지 않는 역문제 도구입니다.');
  closed(settings, ['kind', 'observation', 'parameters', 'maxIterations']);
  if (
    source.family !== 'planar' ||
    source.config.systemId !== 'system:double' ||
    source.config.integratorId !== 'integrator:rk4' ||
    (source.config.startTime ?? 0) !== 0
  )
    throw new Error(
      '현재 native 추정기는 시작 시간 0의 이중진자와 RK4만 지원합니다. 다른 모델·방법을 기본값으로 대체하지 않습니다.'
    );
  if (
    !Number.isSafeInteger(settings.maxIterations) ||
    settings.maxIterations < 1 ||
    settings.maxIterations > INVERSE_LIMITS.iterations
  )
    throw new Error('추정 반복 한도는 1–80 정수입니다.');
  if (!Array.isArray(settings.parameters) || !settings.parameters.length || settings.parameters.length > 3)
    throw new Error('추정할 물성 1–3개를 선택하세요.');
  const names = new Set<string>();
  for (const parameter of settings.parameters) {
    if (!parameter || typeof parameter !== 'object' || Array.isArray(parameter))
      throw new Error('추정 매개변수 범위가 필요합니다.');
    closed(parameter, ['key', 'min', 'max']);
    const field = PLANAR_FIELDS.find((f) => f.id === parameter.key && ['m1', 'm2', 'l1', 'l2', 'g'].includes(f.id));
    if (
      !field ||
      names.has(parameter.key) ||
      ![parameter.min, parameter.max].every(Number.isFinite) ||
      parameter.min < field.min ||
      parameter.max > field.max ||
      parameter.min >= parameter.max
    )
      throw new Error('추정 물성의 이름·중복·물리적 범위를 확인하세요.');
    names.add(parameter.key);
    const initial = source.config.parameters[field.id as keyof typeof source.config.parameters];
    if (initial < parameter.min || initial > parameter.max)
      throw new Error('현재 물성의 초기 추정값이 추정 범위 안에 있어야 합니다.');
  }
  // Joint scaling of both masses is invisible in angle trajectories at zero damping.
  if (source.config.gamma === 0 && names.has('m1') && names.has('m2'))
    throw new Error('무감쇠 각도 관측으로 두 질량의 공통 배율은 식별할 수 없습니다. 한 질량을 고정하세요.');
  if (source.config.gamma === 0 && ['l1', 'l2', 'g'].every((name) => names.has(name)))
    throw new Error(
      '무감쇠 각도 관측으로 두 길이와 중력의 공통 배율은 식별할 수 없습니다. 길이 또는 중력을 고정하세요.'
    );
}
