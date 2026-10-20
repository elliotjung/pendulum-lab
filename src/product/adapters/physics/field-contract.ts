import { EXPERIMENT_SCHEMA, type ExperimentStateV1 } from '../../contracts/experiment';
import { validateExperimentState } from '../../contracts/experiment-validation';
import { fields, invalid, isRecord } from '../../contracts/contract-checks';
import type { QuantityValue } from '../../contracts/quantities';
import { issue, success, type ContractIssue, type ContractResult } from '../../contracts/validation';
import { inspectSafeData } from '../../persistence/safe-data';
import {
  FIELD_INTEGRATOR_VERSION,
  FIELD_MODEL_VERSION,
  FIELD_SEED_GENERATOR,
  FIELD_SYSTEM_IDS,
  MAX_FIELD_MEMBERS,
  MAX_FIELD_POINTS,
  MAX_FIELD_STEPS,
  MAX_FIELD_WORK,
  fieldIsDiagnostic,
  fieldParameterFields,
  type FieldConfig,
  type FieldSystemId
} from './field-schema';

export const fieldStepCount = (c: Pick<FieldConfig, 'systemId' | 'duration' | 'step'>) =>
  fieldIsDiagnostic(c.systemId) ? 0 : Math.round(c.duration / c.step);
export function validateFieldConfig(input: unknown): ContractResult<FieldConfig> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  const issues: ContractIssue[] = [];
  if (
    !fields(
      safe.value,
      ['systemId', 'parameters', 'grid', 'initialState', 'integratorId', 'step', 'duration', 'seed', 'ensemble'],
      ['previousField', 'startTime', 'sampleEvery', 'analyses', 'provenance'],
      '$',
      issues
    )
  )
    return { ok: false, issues };
  const c = safe.value;
  if (!(FIELD_SYSTEM_IDS as readonly unknown[]).includes(c.systemId))
    return { ok: false, issues: [issue('unsupported-system', '$.systemId', '지원하는 장 모델이 아닙니다.')] };
  const id = c.systemId as FieldSystemId;
  const range = (v: unknown, min: number, max: number, path: string, integer = false) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v)))
      invalid(issues, path, `${min}–${max} 범위의 유한${integer ? ' 정수' : '한 수'}가 필요합니다.`);
  };
  const fs = fieldParameterFields(id);
  if (
    fields(
      c.parameters,
      fs.map((f) => f.key),
      [],
      '$.parameters',
      issues
    )
  )
    for (const f of fs) range(c.parameters[f.key], f.min, f.max, `$.parameters.${f.key}`, f.key === 'maxIterations');
  const grid = isRecord(c.grid) ? c.grid : {};
  fields(c.grid, ['points', 'length', 'boundary'], [], '$.grid', issues);
  const min =
    id === 'system:langevin'
      ? 1
      : id === 'system:fput' || id === 'system:lattice-fk-limit'
        ? 2
        : id === 'system:frenkel-kontorova'
          ? 5
          : 3;
  range(grid.points, min, id === 'system:langevin' ? 1 : MAX_FIELD_POINTS, '$.grid.points', true);
  range(grid.length, 0.01, 1000, '$.grid.length');
  const boundary = id === 'system:lattice-fk-limit' ? 'periodic' : 'fixed';
  if (
    id === 'system:sine-gordon'
      ? typeof grid.boundary !== 'string' || !['periodic', 'fixed'].includes(grid.boundary)
      : grid.boundary !== boundary
  )
    invalid(issues, '$.grid.boundary', '이 native 모델에서 지원하는 경계 조건을 선택하세요.');
  if (id === 'system:langevin' && grid.length !== 1)
    invalid(issues, '$.grid.length', '단일 확률 진자의 격자 길이는 1입니다.');
  const initial = Array.isArray(c.initialState) ? c.initialState : [];
  const n = typeof grid.points === 'number' ? grid.points : 0;
  if (id !== 'system:langevin' && id !== 'system:sine-gordon' && grid.length !== n - 1)
    invalid(issues, '$.grid.length', '이 native 격자는 단위 사이트 간격을 사용하므로 표시 길이는 N−1이어야 합니다.');
  const dimension = fieldIsDiagnostic(id) ? 0 : id === 'system:langevin' ? 2 : 2 * n;
  if (!Array.isArray(c.initialState) || initial.length !== dimension)
    invalid(issues, '$.initialState', `상태 성분 ${dimension}개가 필요합니다.`);
  initial.forEach((v, i) => range(v, -1000, 1000, `$.initialState[${i}]`));
  if (c.integratorId !== 'internal') invalid(issues, '$.integratorId', '이 모델의 native 내부 stepper를 사용하세요.');
  range(c.step, 0.00001, 0.05, '$.step');
  range(c.duration, 0.00001, 300, '$.duration');
  if (c.startTime !== undefined) range(c.startTime, 0, 1e9, '$.startTime');
  if (c.sampleEvery !== undefined) range(c.sampleEvery, 1, MAX_FIELD_STEPS, '$.sampleEvery', true);
  if (fields(c.ensemble, ['members'], [], '$.ensemble', issues))
    range(
      c.ensemble.members,
      id === 'system:langevin' ? 2 : 1,
      id === 'system:langevin' ? MAX_FIELD_MEMBERS : 1,
      '$.ensemble.members',
      true
    );
  if (typeof c.step === 'number' && typeof c.duration === 'number') {
    const ratio = c.duration / c.step,
      steps = Math.round(ratio);
    if (
      !Number.isFinite(ratio) ||
      steps < 1 ||
      steps > MAX_FIELD_STEPS ||
      Math.abs(ratio - steps) > 32 * Number.EPSILON * Math.max(1, ratio)
    )
      invalid(issues, '$.runtime', `관찰 길이는 dt의 정수 배수이며 최대 ${MAX_FIELD_STEPS} 단계여야 합니다.`);
    const members = isRecord(c.ensemble) && typeof c.ensemble.members === 'number' ? c.ensemble.members : 0;
    if (!fieldIsDiagnostic(id) && steps * (id === 'system:langevin' ? members : n) > MAX_FIELD_WORK)
      invalid(issues, '$.runtime', '격자·멤버·단계의 전체 작업 예산을 초과했습니다. 규모 또는 관찰 길이를 줄이세요.');
    const start = typeof c.startTime === 'number' ? c.startTime : 0;
    if (!Number.isFinite(start + c.duration) || start + c.duration <= start || start + c.step <= start)
      invalid(issues, '$.startTime', '시작 시간에서 dt와 끝 시간이 구별되어야 합니다.');
    if (id === 'system:sine-gordon' && typeof grid.length === 'number') {
      const dx = grid.length / (grid.boundary === 'periodic' ? n : n - 1);
      if (c.step * Math.sqrt(1 + 4 / (dx * dx)) > 1.9)
        invalid(issues, '$.step', 'sine-Gordon 안정성 한계 dt·sqrt(1+4/dx²)≤1.9를 만족하도록 dt를 줄이세요.');
    }
  }
  if (c.previousField !== undefined) {
    if (id !== 'system:sine-gordon' || !Array.isArray(c.previousField) || c.previousField.length !== n)
      invalid(issues, '$.previousField', 'sine-Gordon의 이전 시간층 N개만 저장할 수 있습니다.');
    else
      c.previousField.forEach((v, i) => {
        range(v, -1000, 1000, `$.previousField[${i}]`);
        if (
          typeof v === 'number' &&
          typeof c.step === 'number' &&
          initial[n + i] !== ((initial[i] as number) - v) / c.step
        )
          invalid(
            issues,
            `$.initialState[${n + i}]`,
            '재시작 속도는 저장된 두 시간층의 backward difference여야 합니다.'
          );
      });
  }
  if (fields(c.seed, ['value', 'generator', 'generatorVersion'], [], '$.seed', issues)) {
    if (
      typeof c.seed.value !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(c.seed.value) ||
      c.seed.generator !== FIELD_SEED_GENERATOR ||
      c.seed.generatorVersion !== '1'
    )
      invalid(issues, '$.seed', '지원하는 seed 문자열·생성기 버전이 필요합니다.');
  }
  if (c.analyses !== undefined && (!Array.isArray(c.analyses) || c.analyses.length))
    issues.push(
      issue(
        'unsupported-analysis',
        '$.analyses',
        '이 adapter는 기본 진단만 지원합니다. 원본을 보존하세요.',
        'keep-original'
      )
    );
  if (issues.length) return { ok: false, issues };
  const config = c as unknown as FieldConfig;
  const checked = validateExperimentState(rawCanonical(config));
  return checked.ok ? success(config) : checked;
}
function rawCanonical(c: FieldConfig): ExperimentStateV1 {
  const parameters: Record<string, QuantityValue> = {};
  for (const [key, value] of Object.entries({
    ...c.parameters,
    gridPoints: c.grid.points,
    gridLength: c.grid.length,
    ensembleMembers: c.ensemble.members,
    configuredStep: c.step,
    configuredDuration: c.duration,
    configuredStart: c.startTime ?? 0,
    configuredSampleEvery: c.sampleEvery ?? 1
  }))
    parameters[key] = { kind: 'scalar', value, unit: '1' };
  const initialConditions: Record<string, QuantityValue> = {};
  if (c.initialState.length) initialConditions.state = { kind: 'vector', values: c.initialState, unit: '1' };
  if (c.previousField) initialConditions.previousField = { kind: 'vector', values: c.previousField, unit: '1' };
  return {
    schema: EXPERIMENT_SCHEMA,
    systemId: c.systemId,
    modelVersion: FIELD_MODEL_VERSION,
    parameters,
    initialConditions,
    modelOptions: { timeConvention: 'normalized', boundary: c.grid.boundary },
    integrator: { kind: 'internal', version: FIELD_INTEGRATOR_VERSION, settings: {} },
    runtime: fieldIsDiagnostic(c.systemId)
      ? { domain: 'evaluation' }
      : {
          domain: 'time',
          start: { value: c.startTime ?? 0, unit: 's' },
          duration: { value: c.duration, unit: 's' },
          step: { value: c.step, unit: 's' },
          sampleEvery: c.sampleEvery ?? 1
        },
    analyses: c.analyses ?? [],
    seed: c.seed,
    ...(c.provenance ? { provenance: c.provenance } : {})
  };
}
export function toCanonicalField(input: FieldConfig): ContractResult<ExperimentStateV1> {
  const checked = validateFieldConfig(input);
  return checked.ok ? validateExperimentState(rawCanonical(checked.value)) : checked;
}
export function fromCanonicalField(input: unknown): ContractResult<FieldConfig> {
  const checked = validateExperimentState(input);
  if (!checked.ok) return checked;
  const v = checked.value,
    issues: ContractIssue[] = [];
  if (!(FIELD_SYSTEM_IDS as readonly string[]).includes(v.systemId) || v.modelVersion !== FIELD_MODEL_VERSION)
    return {
      ok: false,
      issues: [issue('unsupported-version', '$', '지원하는 장 모델 버전을 선택하세요.', 'keep-original')]
    };
  const id = v.systemId as FieldSystemId;
  fields(v.modelOptions, ['timeConvention', 'boundary'], [], '$.modelOptions', issues);
  if (v.modelOptions?.timeConvention !== 'normalized')
    invalid(issues, '$.modelOptions.timeConvention', '정규화 단위 규약이 필요합니다.');
  if (v.topology !== undefined) invalid(issues, '$.topology', '장 모델에서 표현할 수 없는 graph topology입니다.');
  if (
    v.integrator.kind !== 'internal' ||
    v.integrator.version !== FIELD_INTEGRATOR_VERSION ||
    v.integrator.options !== undefined ||
    Object.keys(v.integrator.settings).length
  )
    invalid(issues, '$.integrator', '표현할 수 없는 내부 stepper 설정입니다.');
  const keys = [
    'gridPoints',
    'gridLength',
    'ensembleMembers',
    'configuredStep',
    'configuredDuration',
    'configuredStart',
    'configuredSampleEvery'
  ];
  fields(v.parameters, [...fieldParameterFields(id).map((f) => f.key), ...keys], [], '$.parameters', issues);
  fields(
    v.initialConditions,
    fieldIsDiagnostic(id) ? [] : ['state'],
    id === 'system:sine-gordon' ? ['previousField'] : [],
    '$.initialConditions',
    issues
  );
  const scalar = (key: string) => {
    const q = v.parameters[key];
    if (!q || q.kind !== 'scalar' || q.unit !== '1') {
      invalid(issues, `$.parameters.${key}`, '정규화 scalar가 필요합니다.');
      return 0;
    }
    return q.value;
  };
  const vector = (key: string) => {
    const q = v.initialConditions[key];
    if (!q || q.kind !== 'vector' || q.unit !== '1') {
      invalid(issues, `$.initialConditions.${key}`, '정규화 vector가 필요합니다.');
      return [];
    }
    return q.values;
  };
  const step = scalar('configuredStep'),
    duration = scalar('configuredDuration'),
    startTime = scalar('configuredStart'),
    sampleEvery = scalar('configuredSampleEvery');
  if (
    fieldIsDiagnostic(id)
      ? v.runtime.domain !== 'evaluation'
      : v.runtime.domain !== 'time' ||
        v.runtime.step.value !== step ||
        v.runtime.duration.value !== duration ||
        v.runtime.start.value !== startTime ||
        v.runtime.sampleEvery !== sampleEvery
  )
    invalid(issues, '$.runtime', '저장된 모델 실행 설정과 runtime이 일치해야 합니다.');
  const config = {
    systemId: id,
    parameters: Object.fromEntries(fieldParameterFields(id).map((f) => [f.key, scalar(f.key)])),
    grid: { points: scalar('gridPoints'), length: scalar('gridLength'), boundary: v.modelOptions?.boundary },
    initialState: fieldIsDiagnostic(id) ? [] : vector('state'),
    ...(v.initialConditions.previousField ? { previousField: vector('previousField') } : {}),
    integratorId: 'internal',
    step,
    duration,
    startTime,
    sampleEvery,
    seed: v.seed,
    ensemble: { members: scalar('ensembleMembers') },
    analyses: v.analyses,
    ...(v.provenance ? { provenance: v.provenance } : {})
  };
  return issues.length ? { ok: false, issues } : validateFieldConfig(config);
}
export const validateFieldExperiment = validateFieldConfig;
export const fieldToCanonical = toCanonicalField;
export const fieldFromCanonical = fromCanonicalField;
