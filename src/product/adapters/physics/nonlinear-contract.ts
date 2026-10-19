import { EXPERIMENT_SCHEMA, type ExperimentStateV1 } from '../../contracts/experiment';
import { validateExperimentState } from '../../contracts/experiment-validation';
import type { CanonicalUnit, QuantityValue } from '../../contracts/quantities';
import { issue, success, type ContractIssue, type ContractResult } from '../../contracts/validation';
import { inspectSafeData } from '../../persistence/safe-data';
import {
  MAX_NONLINEAR_DELAY_POINTS,
  MAX_NONLINEAR_STEPS,
  NONLINEAR_INTEGRATOR_VERSION,
  NONLINEAR_MODEL_VERSION,
  NONLINEAR_SYSTEM_IDS,
  nonlinearIsInternal,
  nonlinearParameterFields,
  nonlinearStateFields,
  type NonlinearConfig,
  type NonlinearSystemId
} from './nonlinear-schema';

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function closed(v: Record<string, unknown>, keys: readonly string[], path: string, issues: ContractIssue[]) {
  for (const key of Object.keys(v))
    if (!keys.includes(key))
      issues.push(
        issue('unsupported-field', `${path}.${key}`, '지원하지 않는 설정입니다. 원본을 보존하세요.', 'keep-original')
      );
}
export function nonlinearStepCount(config: Pick<NonlinearConfig, 'duration' | 'step'>): number {
  const ratio = config.duration / config.step;
  return Math.ceil(ratio - 8 * Number.EPSILON * ratio);
}
function rawCanonical(c: NonlinearConfig): ExperimentStateV1 {
  const parameters: Record<string, QuantityValue> = {},
    initialConditions: Record<string, QuantityValue> = {};
  for (const f of nonlinearParameterFields(c.systemId))
    parameters[f.key] = { kind: 'scalar', value: c.parameters[f.key]!, unit: f.canonicalUnit };
  nonlinearStateFields(c.systemId).forEach((f, i) => {
    initialConditions[f.key] = { kind: 'scalar', value: c.initialState[i]!, unit: f.canonicalUnit };
  });
  if (c.history) {
    initialConditions.historyTheta = { kind: 'scalar', value: c.history.state[0]!, unit: 'rad' };
    initialConditions.historyOmega = { kind: 'scalar', value: c.history.state[1]!, unit: 'rad/s' };
  }
  if (c.delayState) {
    initialConditions.delayTimes = { kind: 'vector', values: c.delayState.times, unit: 's' };
    initialConditions.delayTheta = { kind: 'vector', values: c.delayState.states.map((s) => s[0]!), unit: 'rad' };
    initialConditions.delayOmega = { kind: 'vector', values: c.delayState.states.map((s) => s[1]!), unit: 'rad/s' };
    if (c.delayState.historyBoundary !== undefined)
      initialConditions.delayHistoryBoundary = { kind: 'scalar', value: c.delayState.historyBoundary, unit: 's' };
  }
  return {
    schema: EXPERIMENT_SCHEMA,
    systemId: c.systemId,
    modelVersion: NONLINEAR_MODEL_VERSION,
    parameters,
    initialConditions,
    modelOptions: {
      timeConvention: ['system:duffing', 'system:van-der-pol', 'system:mathieu'].includes(c.systemId)
        ? 'normalized'
        : 'si',
      ...(c.history ? { historyKind: c.history.kind } : {})
    },
    integrator:
      c.integratorId === 'internal'
        ? { kind: 'internal', version: NONLINEAR_INTEGRATOR_VERSION, settings: {} }
        : { kind: 'selectable', id: c.integratorId, version: NONLINEAR_INTEGRATOR_VERSION, settings: {} },
    runtime: {
      domain: 'time',
      start: { value: c.startTime ?? 0, unit: 's' },
      duration: { value: c.duration, unit: 's' },
      step: { value: c.step, unit: 's' },
      sampleEvery: c.sampleEvery ?? 1
    },
    analyses: c.analyses ?? [],
    ...(c.seed === undefined ? {} : { seed: c.seed }),
    ...(c.provenance === undefined ? {} : { provenance: c.provenance })
  };
}
/** Closed plain-data contract. Validating detaches caller data and rejects callbacks/getters before use. */
export function validateNonlinearConfig(input: unknown): ContractResult<NonlinearConfig> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  if (!record(safe.value))
    return { ok: false, issues: [issue('invalid-config', '$', '비선형 설정 객체가 필요합니다.')] };
  const c = safe.value,
    issues: ContractIssue[] = [];
  closed(
    c,
    [
      'systemId',
      'parameters',
      'initialState',
      'integratorId',
      'step',
      'duration',
      'startTime',
      'sampleEvery',
      'history',
      'delayState',
      'analyses',
      'seed',
      'provenance'
    ],
    '$',
    issues
  );
  if (!(NONLINEAR_SYSTEM_IDS as readonly unknown[]).includes(c.systemId))
    return {
      ok: false,
      issues: [...issues, issue('unsupported-system', '$.systemId', '지원하는 비선형 모델을 선택하세요.')]
    };
  const id = c.systemId as NonlinearSystemId;
  if (c.integratorId !== (nonlinearIsInternal(id) ? 'internal' : 'integrator:rk4'))
    issues.push(
      issue(
        'unsupported-integrator',
        '$.integratorId',
        '이 모델의 고정 RK4 또는 전용 내부 적분기를 사용하세요.',
        'keep-original'
      )
    );
  const range = (v: unknown, min: number, max: number, path: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
      issues.push(issue('invalid-range', path, `${min}–${max} 범위의 유한한 수가 필요합니다.`));
  };
  const p = record(c.parameters) ? c.parameters : {};
  closed(
    p,
    nonlinearParameterFields(id).map((f) => f.key),
    '$.parameters',
    issues
  );
  for (const f of nonlinearParameterFields(id)) range(p[f.key], f.min, f.max, `$.parameters.${f.key}`);
  const initial = Array.isArray(c.initialState) ? c.initialState : [];
  if (initial.length !== nonlinearStateFields(id).length)
    issues.push(issue('invalid-dimension', '$.initialState', '모델의 원래 상태 차원과 일치해야 합니다.'));
  initial.forEach((v, i) => {
    const f = nonlinearStateFields(id)[i];
    range(v, f?.min ?? -10000, f?.max ?? 10000, `$.initialState[${i}]`);
  });
  range(c.step, 1e-6, 0.05, '$.step');
  range(c.duration, 1e-6, 300, '$.duration');
  if (c.startTime !== undefined) range(c.startTime, 0, Number.MAX_VALUE, '$.startTime');
  if (
    typeof c.startTime === 'number' &&
    typeof c.step === 'number' &&
    (c.startTime + c.step === c.startTime || !Number.isFinite(c.startTime + Number(c.duration)))
  )
    issues.push(
      issue(
        'time-resolution',
        '$.startTime',
        '시작 시간이 너무 커서 주어진 시간 간격을 표현할 수 없습니다. 시간 원점을 줄이세요.'
      )
    );
  const every = c.sampleEvery ?? 1;
  if (!Number.isInteger(every)) issues.push(issue('invalid-sampling', '$.sampleEvery', '표본 간격은 정수여야 합니다.'));
  range(every, 1, MAX_NONLINEAR_STEPS, '$.sampleEvery');
  if (c.sampleEvery === null)
    issues.push(issue('invalid-sampling', '$.sampleEvery', '표본 간격을 생략하거나 정수를 입력하세요.'));
  if (c.analyses !== undefined && (!Array.isArray(c.analyses) || c.analyses.length !== 0))
    issues.push(
      issue(
        'unsupported-analysis',
        '$.analyses',
        '이 adapter는 기본 진단만 지원합니다. 다른 분석 설정의 원본을 보존하세요.',
        'keep-original'
      )
    );
  if (
    typeof c.step === 'number' &&
    typeof c.duration === 'number' &&
    (c.step > c.duration || nonlinearStepCount({ step: c.step, duration: c.duration }) > MAX_NONLINEAR_STEPS)
  )
    issues.push(
      issue('step-budget', '$.runtime', `최대 ${MAX_NONLINEAR_STEPS} 단계이며 시간 간격은 관찰 길이 이하여야 합니다.`)
    );
  if (id === 'system:kapitza' && Number(c.step) * Number(p.driveFrequency) > 0.2)
    issues.push(
      issue(
        'drive-resolution',
        '$.step',
        '빠른 가진을 해상하려면 dt·Ω≤0.2가 필요합니다. 추가 수렴 검증은 별도로 필요합니다.'
      )
    );
  if (id === 'system:van-der-pol' && Number(c.step) * Number(p.mu) > 0.1)
    issues.push(issue('stiff-resolution', '$.step', '큰 μ의 고정 RK4 비교는 dt·μ≤0.1로 제한됩니다.'));
  if (id === 'system:friction' && Number(p.dynamicFriction) > Number(p.staticFriction))
    issues.push(issue('friction-cone', '$.parameters.dynamicFriction', '운동 마찰은 정지 마찰 한계 이하여야 합니다.'));
  if (id === 'system:pyragas') {
    const h = record(c.history) ? c.history : {};
    closed(h, ['kind', 'state'], '$.history', issues);
    if (!['constant', 'linear'].includes(String(h.kind)))
      issues.push(issue('invalid-history', '$.history.kind', '상수 또는 선형 과거 이력을 명시하세요.'));
    if (!Array.isArray(h.state) || h.state.length !== 2)
      issues.push(issue('invalid-history', '$.history.state', '과거 이력 θ와 ω가 필요합니다.'));
    else h.state.forEach((v, i) => range(v, -100, 100, `$.history.state[${i}]`));
    if (Number(p.delay) + 1e-15 < Number(c.step))
      issues.push(issue('delay-resolution', '$.parameters.delay', '명시적 method-of-steps는 delay ≥ dt가 필요합니다.'));
    if (Math.ceil(Number(p.delay) / Number(c.step)) + 3 > MAX_NONLINEAR_DELAY_POINTS)
      issues.push(
        issue(
          'history-budget',
          '$.step',
          `지연 구간은 최대 ${MAX_NONLINEAR_DELAY_POINTS}개 이력 점으로 제한됩니다. dt 또는 지연을 조절하세요.`
        )
      );
    if (c.delayState !== undefined) {
      const tape = record(c.delayState) ? c.delayState : {};
      closed(tape, ['times', 'states', 'historyBoundary'], '$.delayState', issues);
      const times = Array.isArray(tape.times) ? tape.times : [],
        states = Array.isArray(tape.states) ? tape.states : [];
      if (times.length < 2 || times.length > MAX_NONLINEAR_DELAY_POINTS || times.length !== states.length)
        issues.push(issue('invalid-history', '$.delayState', '일치하는 유한한 시간·상태 이력이 필요합니다.'));
      const delay = Number(p.delay),
        dt = Number(c.step);
      if (
        times.at(-1) !== 0 ||
        typeof times[0] !== 'number' ||
        times[0] > -delay + 1e-12 ||
        times[0] < -delay - dt - 1e-12
      )
        issues.push(
          issue(
            'invalid-history',
            '$.delayState.times',
            '이력은 -delay를 감싸는 점부터 시작해 상대 시간 0에서 끝나야 합니다.'
          )
        );
      times.forEach((v, i) => {
        range(v, -delay - dt - 1e-12, 0, `$.delayState.times[${i}]`);
        if (i && Number(v) <= Number(times[i - 1]))
          issues.push(issue('invalid-history', '$.delayState.times', '시간은 엄격한 오름차순이어야 합니다.'));
      });
      if (tape.historyBoundary !== undefined) {
        range(tape.historyBoundary, Number(times[0]), 0, '$.delayState.historyBoundary');
        if (!times.includes(tape.historyBoundary))
          issues.push(
            issue('invalid-history', '$.delayState.historyBoundary', '초기 이력 경계는 저장된 시간 점이어야 합니다.')
          );
      }
      states.forEach((s, i) => {
        if (!Array.isArray(s) || s.length !== 2)
          issues.push(issue('invalid-history', `$.delayState.states[${i}]`, 'θ와 ω 두 성분이 필요합니다.'));
        else s.forEach((v, j) => range(v, -1e6, 1e6, `$.delayState.states[${i}][${j}]`));
      });
      if (!Array.isArray(states.at(-1)) || initial.some((v, i) => v !== (states.at(-1) as unknown[])?.[i]))
        issues.push(
          issue('invalid-history', '$.delayState.states', '마지막 이력 상태는 현재 초기 상태와 같아야 합니다.')
        );
    }
  } else {
    if (c.history !== undefined)
      issues.push(issue('unsupported-history', '$.history', 'Pyragas만 과거 이력을 사용합니다.', 'keep-original'));
    if (c.delayState !== undefined)
      issues.push(issue('unsupported-history', '$.delayState', 'Pyragas만 지연 상태를 사용합니다.', 'keep-original'));
  }
  if (issues.length) return { ok: false, issues };
  const config = c as unknown as NonlinearConfig;
  const canonical = validateExperimentState(rawCanonical(config));
  return canonical.ok ? success(config) : canonical;
}
export function toCanonicalNonlinear(input: NonlinearConfig): ContractResult<ExperimentStateV1> {
  const checked = validateNonlinearConfig(input);
  return checked.ok ? validateExperimentState(rawCanonical(checked.value)) : checked;
}
export function fromCanonicalNonlinear(input: unknown): ContractResult<NonlinearConfig> {
  const checked = validateExperimentState(input);
  if (!checked.ok) return checked;
  const v = checked.value,
    issues: ContractIssue[] = [];
  if (!(NONLINEAR_SYSTEM_IDS as readonly string[]).includes(v.systemId))
    return {
      ok: false,
      issues: [issue('unsupported-system', '$.systemId', '지원하는 비선형 모델이 아닙니다.', 'keep-original')]
    };
  const id = v.systemId as NonlinearSystemId;
  if (v.modelVersion !== NONLINEAR_MODEL_VERSION || v.integrator.version !== NONLINEAR_INTEGRATOR_VERSION)
    issues.push(issue('unsupported-version', '$', '지원하지 않는 모델·적분기 버전입니다.', 'use-supported-version'));
  if (v.runtime.domain !== 'time')
    return {
      ok: false,
      issues: [...issues, issue('unsupported-runtime', '$.runtime', '시간 기반 실행 설정이 필요합니다.')]
    };
  if (
    v.integrator.options !== undefined ||
    Object.keys(v.integrator.settings).length ||
    (nonlinearIsInternal(id)
      ? v.integrator.kind !== 'internal'
      : v.integrator.kind !== 'selectable' || v.integrator.id !== 'integrator:rk4')
  )
    issues.push(issue('unsupported-integrator', '$.integrator', '표현할 수 없는 적분기 설정입니다.', 'keep-original'));
  const options = v.modelOptions ?? {};
  closed(
    options,
    id === 'system:pyragas' ? ['timeConvention', 'historyKind'] : ['timeConvention'],
    '$.modelOptions',
    issues
  );
  if (
    options.timeConvention !==
    (['system:duffing', 'system:van-der-pol', 'system:mathieu'].includes(id) ? 'normalized' : 'si')
  )
    issues.push(
      issue(
        'invalid-time-convention',
        '$.modelOptions.timeConvention',
        '모델의 정규화/SI 시간 규약과 일치해야 합니다.',
        'keep-original'
      )
    );
  const parameterFields = nonlinearParameterFields(id),
    stateFields = nonlinearStateFields(id);
  closed(
    v.parameters,
    parameterFields.map((f) => f.key),
    '$.parameters',
    issues
  );
  const hasTape = ['delayTimes', 'delayTheta', 'delayOmega'].some((k) => Object.hasOwn(v.initialConditions, k));
  closed(
    v.initialConditions,
    [
      ...stateFields.map((f) => f.key),
      ...(id === 'system:pyragas'
        ? [
            'historyTheta',
            'historyOmega',
            ...(hasTape ? ['delayTimes', 'delayTheta', 'delayOmega', 'delayHistoryBoundary'] : [])
          ]
        : [])
    ],
    '$.initialConditions',
    issues
  );
  const read = (group: 'parameters' | 'initialConditions', key: string, unit: CanonicalUnit) => {
    const q = v[group][key];
    if (!q || q.kind !== 'scalar' || q.unit !== unit) {
      issues.push(issue('invalid-unit', `$.${group}.${key}`, `${unit} scalar 값이 필요합니다.`, 'keep-original'));
      return 0;
    }
    return q.value;
  };
  const vector = (key: string, unit: CanonicalUnit): readonly number[] => {
    const q = v.initialConditions[key];
    if (!q || q.kind !== 'vector' || q.unit !== unit) {
      issues.push(
        issue('invalid-unit', `$.initialConditions.${key}`, `${unit} vector 값이 필요합니다.`, 'keep-original')
      );
      return [];
    }
    return q.values;
  };
  const parameters = Object.fromEntries(
      parameterFields.map((f) => [f.key, read('parameters', f.key, f.canonicalUnit)])
    ),
    initialState = stateFields.map((f) => read('initialConditions', f.key, f.canonicalUnit));
  const history =
    id === 'system:pyragas'
      ? {
          kind: options.historyKind,
          state: [read('initialConditions', 'historyTheta', 'rad'), read('initialConditions', 'historyOmega', 'rad/s')]
        }
      : undefined;
  let delayState;
  if (hasTape) {
    const times = vector('delayTimes', 's'),
      theta = vector('delayTheta', 'rad'),
      omega = vector('delayOmega', 'rad/s');
    if (times.length !== theta.length || times.length !== omega.length)
      issues.push(issue('invalid-history', '$.initialConditions', '지연 이력 벡터 길이가 일치해야 합니다.'));
    delayState = {
      times,
      states: theta.map((x, i) => [x, omega[i]]),
      ...(v.initialConditions.delayHistoryBoundary
        ? { historyBoundary: read('initialConditions', 'delayHistoryBoundary', 's') }
        : {})
    };
  }
  if (issues.length) return { ok: false, issues };
  return validateNonlinearConfig({
    systemId: id,
    parameters,
    initialState,
    integratorId: v.integrator.kind === 'internal' ? 'internal' : v.integrator.id,
    step: v.runtime.step.value,
    duration: v.runtime.duration.value,
    startTime: v.runtime.start.value,
    sampleEvery: v.runtime.sampleEvery,
    analyses: v.analyses,
    ...(history ? { history } : {}),
    ...(delayState ? { delayState } : {}),
    ...(v.seed === undefined ? {} : { seed: v.seed }),
    ...(v.provenance === undefined ? {} : { provenance: v.provenance })
  });
}
export const nonlinearToCanonical = toCanonicalNonlinear;
export const nonlinearFromCanonical = fromCanonicalNonlinear;
