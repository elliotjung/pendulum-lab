import { createExpansionSystem } from '../../../physics/expandedModels-factory';
import { eulerStep, rk2Step, rk4Step } from '../../../physics/integrators';
import type { StateVector } from '../../../physics/types';
import { inspectSafeData } from '../../persistence/safe-data';
import { validateExperimentState } from '../../contracts/experiment-validation';
import { EXPERIMENT_SCHEMA, type ExperimentStateV1, type OptionMap } from '../../contracts/experiment';
import type { CanonicalUnit, QuantityValue } from '../../contracts/quantities';
import { issue, success, type ContractIssue, type ContractResult } from '../../contracts/validation';
import {
  DRIVEN_SYSTEM_IDS,
  DRIVEN_INTEGRATOR_IDS,
  DRIVEN_WAVEFORMS,
  DRIVEN_MODEL_VERSION,
  DRIVEN_INTEGRATOR_VERSION,
  MAX_DRIVEN_STEPS,
  drivenHasForcing,
  drivenSupportsController,
  type DrivenConfig,
  type DrivenForcing,
  type DrivenSample
} from './driven-schema';
export * from './driven-schema';

export class DrivenConfigurationError extends Error {
  constructor(readonly issues: readonly ContractIssue[]) {
    super(issues.map((entry) => `${entry.path}: ${entry.message}`).join('\n'));
    this.name = 'DrivenConfigurationError';
  }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function closed(v: Record<string, unknown>, keys: readonly string[], path: string, issues: ContractIssue[]) {
  for (const key of Object.keys(v))
    if (!keys.includes(key))
      issues.push(
        issue('unsupported-field', `${path}.${key}`, '지원하지 않는 설정입니다. 원본을 보존하세요.', 'keep-original')
      );
}
function parameterUnits(id: string): Record<string, CanonicalUnit> {
  return id === 'system:cartpole'
    ? { cartMass: 'kg', poleMass: 'kg', length: 'm', g: 'm/s^2', friction: 'N*s/m', force: 'N' }
    : { g: 'm/s^2', length: 'm', damping: 's^-1', ...(id === 'system:coupled' ? { coupling: 's^-2' as const } : {}) };
}
function stateFields(id: string): readonly (readonly [string, CanonicalUnit])[] {
  return id === 'system:cartpole'
    ? [
        ['x', 'm'],
        ['theta', 'rad'],
        ['v', 'm/s'],
        ['omega', 'rad/s']
      ]
    : id === 'system:coupled'
      ? [
          ['theta1', 'rad'],
          ['theta2', 'rad'],
          ['omega1', 'rad/s'],
          ['omega2', 'rad/s']
        ]
      : [['theta', 'rad'], ['omega', 'rad/s'], ...(id === 'system:inverted' ? [] : [['drivePhase', 'rad'] as const])];
}
function forcingUnits(id: string): Record<string, CanonicalUnit> {
  return {
    forcingAmplitude: id === 'system:cartpole' ? 'N' : id === 'system:parametric' ? '1' : 'rad/s^2',
    forcingFrequency: 'rad/s',
    forcingPhase: 'rad'
  };
}
function controllerUnits(id: string): Record<string, CanonicalUnit> {
  return {
    controllerKp: id === 'system:cartpole' ? 'N/rad' : 's^-2',
    controllerKd: id === 'system:cartpole' ? 'N*s/rad' : 's^-1',
    controllerKx: id === 'system:cartpole' ? 'N/m' : '1',
    controllerKv: id === 'system:cartpole' ? 'N*s/m' : '1',
    controllerReference: id === 'system:cartpole' ? 'm' : 'rad',
    controllerMaxOutput: id === 'system:cartpole' ? 'N' : 'rad/s^2'
  };
}
function rawCanonical(config: DrivenConfig): ExperimentStateV1 {
  const parameters: Record<string, QuantityValue> = {},
    initialConditions: Record<string, QuantityValue> = {},
    modelOptions: Record<string, string | boolean> = {};
  for (const [key, unit] of Object.entries(parameterUnits(config.systemId)))
    parameters[key] = { kind: 'scalar', value: config.parameters[key]!, unit };
  stateFields(config.systemId).forEach(([key, unit], i) => {
    initialConditions[key] = { kind: 'scalar', value: config.initialState[i]!, unit };
  });
  if (config.forcing) {
    const values = {
      forcingAmplitude: config.forcing.amplitude,
      forcingFrequency: config.forcing.frequency,
      forcingPhase: config.forcing.phase
    };
    for (const [key, unit] of Object.entries(forcingUnits(config.systemId)))
      parameters[key] = { kind: 'scalar', value: values[key as keyof typeof values], unit };
    modelOptions.forcingWaveform = config.forcing.waveform;
  }
  if (config.controller) {
    const c = config.controller,
      values = {
        controllerKp: c.kp,
        controllerKd: c.kd,
        controllerKx: c.kx,
        controllerKv: c.kv,
        controllerReference: c.reference,
        controllerMaxOutput: c.maxOutput
      };
    for (const [key, unit] of Object.entries(controllerUnits(config.systemId)))
      parameters[key] = { kind: 'scalar', value: values[key as keyof typeof values], unit };
    modelOptions.controllerEnabled = c.enabled;
  }
  return {
    schema: EXPERIMENT_SCHEMA,
    systemId: config.systemId,
    modelVersion: DRIVEN_MODEL_VERSION,
    parameters,
    initialConditions,
    ...(Object.keys(modelOptions).length ? { modelOptions } : {}),
    integrator: { kind: 'selectable', id: config.integratorId, version: DRIVEN_INTEGRATOR_VERSION, settings: {} },
    runtime: {
      domain: 'time',
      start: { value: config.startTime ?? 0, unit: 's' },
      duration: { value: config.duration, unit: 's' },
      step: { value: config.step, unit: 's' },
      sampleEvery: config.sampleEvery ?? 1
    },
    analyses: config.analyses ?? [],
    ...(config.seed === undefined ? {} : { seed: config.seed }),
    ...(config.provenance === undefined ? {} : { provenance: config.provenance })
  };
}
/** Closed, detached, finite native-state contract. Unknown actuator or controller fields cannot disappear on import. */
export function validateDrivenConfig(input: unknown): ContractResult<DrivenConfig> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  const v = safe.value;
  if (!record(v)) return { ok: false, issues: [issue('invalid-config', '$', '구동 시스템 설정 객체가 필요합니다.')] };
  const issues: ContractIssue[] = [];
  closed(
    v,
    [
      'systemId',
      'parameters',
      'initialState',
      'forcing',
      'controller',
      'integratorId',
      'step',
      'duration',
      'startTime',
      'sampleEvery',
      'analyses',
      'seed',
      'provenance'
    ],
    '$',
    issues
  );
  if (!(DRIVEN_SYSTEM_IDS as readonly unknown[]).includes(v.systemId))
    issues.push(issue('unsupported-system', '$.systemId', '지원하는 구동 시스템을 선택하세요.'));
  if (!(DRIVEN_INTEGRATOR_IDS as readonly unknown[]).includes(v.integratorId))
    issues.push(issue('unsupported-integrator', '$.integratorId', 'RK4/RK2/Euler 적분기를 선택하세요.'));
  const range = (x: unknown, min: number, max: number, path: string) => {
    if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max)
      issues.push(issue('invalid-range', path, `${min}–${max} 범위의 유한한 수가 필요합니다.`));
  };
  const id = String(v.systemId),
    p = record(v.parameters) ? v.parameters : {};
  closed(p, Object.keys(parameterUnits(id)), '$.parameters', issues);
  for (const key of Object.keys(parameterUnits(id)))
    range(
      p[key],
      key === 'force' ? -1000 : ['length', 'cartMass', 'poleMass'].includes(key) ? 0.001 : 0,
      1000,
      `$.parameters.${key}`
    );
  const initial = Array.isArray(v.initialState) ? v.initialState : [];
  if (initial.length !== stateFields(id).length)
    issues.push(issue('invalid-dimension', '$.initialState', '시스템의 원래 상태 차원에 맞게 입력하세요.'));
  initial.forEach((x, i) => range(x, -10000, 10000, `$.initialState[${i}]`));
  if (drivenHasForcing(id)) {
    const f = record(v.forcing) ? v.forcing : {};
    closed(f, ['waveform', 'amplitude', 'frequency', 'phase'], '$.forcing', issues);
    if (!(DRIVEN_WAVEFORMS as readonly unknown[]).includes(f.waveform))
      issues.push(issue('invalid-waveform', '$.forcing.waveform', 'sine/square/triangle 파형을 선택하세요.'));
    range(f.amplitude, 0, id === 'system:parametric' ? 1 : 1000, '$.forcing.amplitude');
    range(f.frequency, 0, 1000, '$.forcing.frequency');
    range(f.phase, -10000, 10000, '$.forcing.phase');
  } else if (Object.hasOwn(v, 'forcing'))
    issues.push(
      issue('unsupported-forcing', '$.forcing', '이 시스템은 외부 파형 입력을 지원하지 않습니다.', 'keep-original')
    );
  if (Object.hasOwn(v, 'controller')) {
    if (!drivenSupportsController(id))
      issues.push(
        issue('unsupported-controller', '$.controller', '역진자와 cart-pole만 제어기를 지원합니다.', 'keep-original')
      );
    const c = record(v.controller) ? v.controller : {};
    closed(c, ['enabled', 'kp', 'kd', 'kx', 'kv', 'reference', 'maxOutput'], '$.controller', issues);
    if (typeof c.enabled !== 'boolean')
      issues.push(issue('invalid-controller', '$.controller.enabled', '제어기 켜기/끄기 값을 선택하세요.'));
    for (const key of ['kp', 'kd', 'kx', 'kv'])
      range(c[key], 0, id === 'system:inverted' && ['kx', 'kv'].includes(key) ? 0 : 10000, `$.controller.${key}`);
    range(
      c.reference,
      id === 'system:inverted' ? -0.25 : -100,
      id === 'system:inverted' ? 0.25 : 100,
      '$.controller.reference'
    );
    range(c.maxOutput, 0.001, 1000, '$.controller.maxOutput');
    if (
      c.enabled === true &&
      typeof c.reference === 'number' &&
      typeof initial[id === 'system:cartpole' ? 1 : 0] === 'number' &&
      Math.abs(Number(initial[id === 'system:cartpole' ? 1 : 0]) - (id === 'system:inverted' ? c.reference : 0)) >
        Math.PI / 2
    )
      issues.push(
        issue('control-safety', '$.initialState', '제어 시작 각오차는 π/2 이하여야 합니다. 수직선 근처로 초기화하세요.')
      );
  } else if (drivenSupportsController(id))
    issues.push(
      issue(
        'missing-controller',
        '$.controller',
        '제어 지원 시스템은 명시적인 제어기 설정(끄기 포함)이 필요합니다.',
        'keep-original'
      )
    );
  range(v.step, 1e-6, 0.05, '$.step');
  range(v.duration, 1e-6, 300, '$.duration');
  if (Object.hasOwn(v, 'startTime')) range(v.startTime, 0, 1e9, '$.startTime');
  const sampleEvery = v.sampleEvery ?? 1;
  if (!Number.isInteger(sampleEvery))
    issues.push(issue('invalid-sampling', '$.sampleEvery', '표본 간격은 정수여야 합니다.'));
  range(sampleEvery, 1, MAX_DRIVEN_STEPS, '$.sampleEvery');
  if (Object.hasOwn(v, 'sampleEvery') && v.sampleEvery === null)
    issues.push(issue('invalid-sampling', '$.sampleEvery', '표본 간격을 생략하거나 정수를 입력하세요.'));
  if (v.analyses !== undefined && (!Array.isArray(v.analyses) || v.analyses.length))
    issues.push(
      issue(
        'unsupported-analysis',
        '$.analyses',
        '이 adapter는 기본 상태·에너지·위상 진단만 지원합니다. 별도 분석 요청은 원본을 보존하세요.',
        'keep-original'
      )
    );
  if (
    typeof v.step === 'number' &&
    typeof v.duration === 'number' &&
    (v.step > v.duration ||
      Math.ceil(v.duration / v.step - (8 * Number.EPSILON * v.duration) / v.step) > MAX_DRIVEN_STEPS)
  )
    issues.push(
      issue('step-budget', '$.runtime', `시간 간격은 관찰 시간 이하이며 최대 ${MAX_DRIVEN_STEPS}단계입니다.`)
    );
  if (issues.length) return { ok: false, issues };
  const config = v as unknown as DrivenConfig,
    canonical = validateExperimentState(rawCanonical(config));
  if (!canonical.ok) return canonical;
  try {
    createUncheckedSimulation(config).snapshot();
  } catch (cause) {
    return {
      ok: false,
      issues: [issue('physics-evaluation', '$', cause instanceof Error ? cause.message : '모델 평가 실패')]
    };
  }
  return success(config);
}

export function drivenWaveform(waveform: DrivenForcing['waveform'], phase: number): number {
  const sine = Math.sin(phase);
  return waveform === 'square'
    ? sine >= 0
      ? 1
      : -1
    : waveform === 'triangle'
      ? (2 * Math.asin(sine)) / Math.PI
      : sine;
}
const wrap = (theta: number) => ((((theta + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
function createUncheckedSimulation(config: DrivenConfig) {
  const id = config.systemId.slice(7) as 'driven' | 'coupled' | 'inverted' | 'cartpole' | 'parametric';
  const engine = createExpansionSystem(
    id,
    {
      ...config.parameters,
      driveAmplitude: 0,
      driveFrequency: config.forcing?.frequency ?? 0,
      amplitude: 0,
      frequency: config.forcing?.frequency ?? 0,
      force: 0
    },
    config.initialState
  );
  // A private clock lets the existing autonomous steppers evaluate cart force at their intermediate stage times.
  const nativeDimension = config.initialState.length;
  let state = Float64Array.from(id === 'cartpole' ? [...config.initialState, 0] : config.initialState),
    index = 0,
    failure: Error | undefined;
  const scratch = new Float64Array(state.length),
    ratio = config.duration / config.step,
    total = Math.ceil(ratio - 8 * Number.EPSILON * ratio);
  const reference = config.controller?.reference ?? 0;
  function assertState(s: ArrayLike<number>) {
    if (Array.from(s).some((x, i) => !Number.isFinite(x) || (i < nativeDimension && Math.abs(x) > 1e6)))
      throw new Error(
        '계산 상태가 유한 범위를 벗어나 마지막 유효 상태에서 중지했습니다. 시간 간격과 초기조건을 줄이세요.'
      );
    if (
      config.controller?.enabled &&
      Math.abs(Number(s[id === 'cartpole' ? 1 : 0]) - (id === 'inverted' ? reference : 0)) > Math.PI / 2
    )
      throw new Error(
        '제어 안전 범위(각오차 π/2)를 벗어나 마지막 유효 상태에서 중지했습니다. 초기조건·gain·출력 한계를 조절하세요.'
      );
  }
  function signals(s: ArrayLike<number>, time: number) {
    const f = config.forcing,
      c = config.controller;
    const forcing = f
      ? f.amplitude * drivenWaveform(f.waveform, (id === 'cartpole' ? f.frequency * time : Number(s[2])) + f.phase)
      : 0;
    const raw = !c?.enabled
      ? 0
      : id === 'inverted'
        ? c.kp * (reference - Number(s[0])) - c.kd * Number(s[1])
        : c.kp * Number(s[1]) + c.kd * Number(s[3]) + c.kx * (Number(s[0]) - reference) + c.kv * Number(s[2]);
    const control = c ? Math.max(-c.maxOutput, Math.min(c.maxOutput, raw)) : 0;
    return { forcing, control, saturated: control !== raw };
  }
  function rhs(s: StateVector, out: StateVector) {
    assertState(s);
    const sig = signals(s, id === 'cartpole' ? (config.startTime ?? 0) + Number(s[nativeDimension]) : 0);
    if (id === 'driven' || id === 'parametric') {
      // Transform only the phase presented to the original cosine RHS; the persisted phase is never replaced.
      scratch.set(s);
      scratch[2] = Math.acos(drivenWaveform(config.forcing!.waveform, Number(s[2]) + config.forcing!.phase));
      engine.parameters[id === 'driven' ? 'driveAmplitude' : 'amplitude'] = config.forcing!.amplitude;
      engine.rhs(scratch, out);
    } else {
      if (id === 'cartpole') engine.parameters.force = config.parameters.force! + sig.forcing + sig.control;
      engine.rhs(s, out);
      if (id === 'inverted') out[1] = out[1]! + sig.control;
      if (id === 'cartpole') out[nativeDimension] = 1;
    }
    if (Array.from(out).some((x) => !Number.isFinite(x)))
      throw new Error('유한하지 않은 도함수로 계산을 중지했습니다. 설정을 줄이세요.');
  }
  function sample(s: StateVector, step: number): DrivenSample {
    assertState(s);
    const time = (config.startTime ?? 0) + Math.min(step * config.step, config.duration),
      sig = signals(s, time);
    // Existing parametric coordinates animate a cosmetic length. The adapter reports the RHS model's fixed length.
    const oldAmplitude = engine.parameters.amplitude;
    if (id === 'parametric') engine.parameters.amplitude = 0;
    const positions = engine
      .coordinates(s)
      .map((point, i) => ({ x: point.x, y: id === 'inverted' || (id === 'cartpole' && i === 1) ? -point.y : point.y }));
    if (oldAmplitude !== undefined) engine.parameters.amplitude = oldAmplitude;
    const energy = engine.energy(s),
      angleIndex = id === 'cartpole' ? 1 : 0,
      rateIndex = id === 'cartpole' ? 3 : id === 'coupled' ? 2 : 1;
    const phase = {
      x: wrap(Number(s[angleIndex]) - (id === 'coupled' ? Number(s[1]) : 0)),
      y: Number(s[rateIndex]) - (id === 'coupled' ? Number(s[3]) : 0)
    };
    const error = reference - Number(s[0]);
    if (
      ![energy, sig.forcing, sig.control, error, ...positions.flatMap(Object.values), phase.x, phase.y].every(
        Number.isFinite
      )
    )
      throw new Error('유한하지 않은 진단값으로 계산을 중지했습니다.');
    return {
      step,
      time,
      state: Array.from(s).slice(0, nativeDimension),
      positions,
      energy,
      phase,
      forcing: sig.forcing,
      control: sig.control,
      reference,
      error,
      warnings: sig.saturated ? ['제어 출력이 포화 한계에 도달했습니다. 목표 추종이 보장되지 않습니다.'] : []
    };
  }
  let accepted = sample(state, 0);
  return {
    get config() {
      return structuredClone(config);
    },
    get done() {
      return index >= total;
    },
    snapshot: () => structuredClone(accepted),
    step() {
      if (failure) throw failure;
      if (index >= total) return structuredClone(accepted);
      try {
        const dt = Math.min(config.step, config.duration - index * config.step),
          next = new Float64Array(state.length);
        const stepper =
          config.integratorId === 'integrator:euler'
            ? eulerStep
            : config.integratorId === 'integrator:rk2'
              ? rk2Step
              : rk4Step;
        stepper(state, dt, rhs, next);
        const result = sample(next, index + 1);
        state = next;
        accepted = result;
        index++;
        return structuredClone(accepted);
      } catch (cause) {
        failure = cause instanceof Error ? cause : new Error('구동 시스템 계산 실패');
        throw failure;
      }
    }
  };
}
export function createDrivenSimulation(input: DrivenConfig) {
  const checked = validateDrivenConfig(input);
  if (!checked.ok) throw new DrivenConfigurationError(checked.issues);
  return createUncheckedSimulation(checked.value);
}
export function toCanonicalDriven(input: DrivenConfig): ContractResult<ExperimentStateV1> {
  const checked = validateDrivenConfig(input);
  return checked.ok ? validateExperimentState(rawCanonical(checked.value)) : checked;
}
export function fromCanonicalDriven(input: unknown): ContractResult<DrivenConfig> {
  const parsed = validateExperimentState(input);
  if (!parsed.ok) return parsed;
  const v = parsed.value,
    issues: ContractIssue[] = [],
    options: OptionMap = v.modelOptions ?? {};
  if (v.modelVersion !== DRIVEN_MODEL_VERSION || v.integrator.version !== DRIVEN_INTEGRATOR_VERSION)
    issues.push(
      issue('unsupported-version', '$', '지원하지 않는 구동 모델·적분기 버전입니다.', 'use-supported-version')
    );
  if (
    v.integrator.kind !== 'selectable' ||
    v.integrator.options !== undefined ||
    Object.keys(v.integrator.settings).length
  )
    issues.push(issue('unsupported-options', '$.integrator', '표현할 수 없는 적분기 옵션입니다.', 'keep-original'));
  if (v.runtime.domain !== 'time')
    return {
      ok: false,
      issues: [...issues, issue('unsupported-runtime', '$.runtime', '시간 기반 설정이 필요합니다.')]
    };
  closed(options, ['forcingWaveform', 'controllerEnabled'], '$.modelOptions', issues);
  const units = {
    ...parameterUnits(v.systemId),
    ...(drivenHasForcing(v.systemId) ? forcingUnits(v.systemId) : {}),
    ...(Object.hasOwn(options, 'controllerEnabled') ? controllerUnits(v.systemId) : {})
  };
  closed(v.parameters, Object.keys(units), '$.parameters', issues);
  closed(
    v.initialConditions,
    stateFields(v.systemId).map(([key]) => key),
    '$.initialConditions',
    issues
  );
  const read = (group: 'parameters' | 'initialConditions', key: string, unit: CanonicalUnit): number => {
    const q = v[group][key];
    if (!q || q.kind !== 'scalar' || q.unit !== unit) {
      issues.push(
        issue('invalid-unit', `$.${group}.${key}`, `${key}: ${unit} scalar 값이 필요합니다.`, 'keep-original')
      );
      return 0;
    }
    return q.value;
  };
  const parameters = Object.fromEntries(
    Object.entries(parameterUnits(v.systemId)).map(([key, unit]) => [key, read('parameters', key, unit)])
  );
  const initialState = stateFields(v.systemId).map(([key, unit]) => read('initialConditions', key, unit));
  if (!drivenHasForcing(v.systemId) && Object.hasOwn(options, 'forcingWaveform'))
    issues.push(
      issue('unsupported-forcing', '$.modelOptions', '이 시스템에 외부 파형을 복원할 수 없습니다.', 'keep-original')
    );
  const forcing = drivenHasForcing(v.systemId)
    ? {
        waveform: options.forcingWaveform,
        amplitude: read('parameters', 'forcingAmplitude', forcingUnits(v.systemId).forcingAmplitude!),
        frequency: read('parameters', 'forcingFrequency', 'rad/s'),
        phase: read('parameters', 'forcingPhase', 'rad')
      }
    : undefined;
  const cu = controllerUnits(v.systemId),
    controller = Object.hasOwn(options, 'controllerEnabled')
      ? {
          enabled: options.controllerEnabled,
          kp: read('parameters', 'controllerKp', cu.controllerKp!),
          kd: read('parameters', 'controllerKd', cu.controllerKd!),
          kx: read('parameters', 'controllerKx', cu.controllerKx!),
          kv: read('parameters', 'controllerKv', cu.controllerKv!),
          reference: read('parameters', 'controllerReference', cu.controllerReference!),
          maxOutput: read('parameters', 'controllerMaxOutput', cu.controllerMaxOutput!)
        }
      : undefined;
  if (issues.length) return { ok: false, issues };
  return validateDrivenConfig({
    systemId: v.systemId,
    parameters,
    initialState,
    ...(forcing ? { forcing } : {}),
    ...(controller ? { controller } : {}),
    integratorId: v.integrator.kind === 'selectable' ? v.integrator.id : 'internal',
    step: v.runtime.step.value,
    duration: v.runtime.duration.value,
    startTime: v.runtime.start.value,
    sampleEvery: v.runtime.sampleEvery,
    analyses: v.analyses,
    ...(v.seed === undefined ? {} : { seed: v.seed }),
    ...(v.provenance === undefined ? {} : { provenance: v.provenance })
  });
}
