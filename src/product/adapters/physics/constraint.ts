import { rhsSpring, energySpring, type SpringPendulumParameters } from '../../../physics/spring';
import { RopePendulum } from '../../../physics/rope';
import { DoubleStringPendulum, type DoubleStringParams } from '../../../physics/doubleString';
import { eulerStep, rk2Step, rk4Step } from '../../../physics/integrators';
import { inspectSafeData } from '../../persistence/safe-data';
import { validateExperimentState } from '../../contracts/experiment-validation';
import { EXPERIMENT_SCHEMA, type ExperimentStateV1 } from '../../contracts/experiment';
import type { CanonicalUnit, QuantityValue } from '../../contracts/quantities';
import { issue, success, type ContractIssue, type ContractResult } from '../../contracts/validation';
import {
  CONSTRAINT_SYSTEM_IDS,
  CONSTRAINT_INTEGRATOR_IDS,
  CONSTRAINT_MODEL_VERSION,
  CONSTRAINT_INTEGRATOR_VERSION,
  MAX_CONSTRAINT_STEPS,
  MAX_CONSTRAINT_EVENTS,
  MIN_SPRING_RADIUS,
  type ConstraintConfig,
  type ConstraintSample,
  type ConstraintEvent
} from './constraint-schema';
export * from './constraint-schema';

export class ConstraintConfigurationError extends Error {
  constructor(readonly issues: readonly ContractIssue[]) {
    super(issues.map((entry) => `${entry.path}: ${entry.message}`).join('\n'));
    this.name = 'ConstraintConfigurationError';
  }
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function closed(value: Record<string, unknown>, keys: readonly string[], path: string, issues: ContractIssue[]) {
  for (const key of Object.keys(value))
    if (!keys.includes(key))
      issues.push(
        issue('unsupported-field', `${path}.${key}`, '지원하지 않는 설정입니다. 원본을 보존하세요.', 'keep-original')
      );
}
function parameterUnits(systemId: string): Record<string, CanonicalUnit> {
  return systemId === 'system:spring'
    ? { mass: 'kg', stiffness: 'N/m', restLength: 'm', g: 'm/s^2' }
    : systemId === 'system:rope'
      ? { mass: 'kg', length: 'm', g: 'm/s^2', damping: 's^-1' }
      : { m1: 'kg', m2: 'kg', l1: 'm', l2: 'm', g: 'm/s^2', damping: '1' };
}
function initialFields(systemId: string): readonly (readonly [string, CanonicalUnit])[] {
  return systemId === 'system:spring'
    ? [
        ['r', 'm'],
        ['theta', 'rad'],
        ['rDot', 'm/s'],
        ['omega', 'rad/s']
      ]
    : systemId === 'system:rope'
      ? [
          ['theta', 'rad'],
          ['omega', 'rad/s']
        ]
      : [
          ['theta1', 'rad'],
          ['theta2', 'rad'],
          ['omega1', 'rad/s'],
          ['omega2', 'rad/s']
        ];
}
function rawCanonical(config: ConstraintConfig): ExperimentStateV1 {
  const parameters: Record<string, QuantityValue> = {},
    initialConditions: Record<string, QuantityValue> = {};
  for (const [key, unit] of Object.entries(parameterUnits(config.systemId)))
    parameters[key] = { kind: 'scalar', value: config.parameters[key]!, unit };
  initialFields(config.systemId).forEach(([key, unit], i) => {
    initialConditions[key] = { kind: 'scalar', value: config.initialState[i]!, unit };
  });
  return {
    schema: EXPERIMENT_SCHEMA,
    systemId: config.systemId,
    modelVersion: CONSTRAINT_MODEL_VERSION,
    parameters,
    initialConditions,
    integrator:
      config.integratorId === 'internal'
        ? { kind: 'internal', version: CONSTRAINT_INTEGRATOR_VERSION, settings: {} }
        : { kind: 'selectable', id: config.integratorId, version: CONSTRAINT_INTEGRATOR_VERSION, settings: {} },
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
function springParameters(config: ConstraintConfig): SpringPendulumParameters {
  const p = config.parameters;
  return { mass: p.mass!, stiffness: p.stiffness!, restLength: p.restLength!, g: p.g! };
}
function doubleParameters(config: ConstraintConfig): DoubleStringParams {
  const p = config.parameters;
  return { m1: p.m1!, m2: p.m2!, l1: p.l1!, l2: p.l2!, g: p.g!, damping: p.damping! };
}

/** Detached, closed restart contract; model evaluation rejects invalid finite-looking configurations. */
export function validateConstraintConfig(input: unknown): ContractResult<ConstraintConfig> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  const v = safe.value;
  if (!record(v)) return { ok: false, issues: [issue('invalid-config', '$', '구속계 설정 객체가 필요합니다.')] };
  const issues: ContractIssue[] = [];
  closed(
    v,
    [
      'systemId',
      'parameters',
      'initialState',
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
  for (const key of ['startTime', 'sampleEvery', 'analyses']) {
    if (Object.hasOwn(v, key) && v[key] === null)
      issues.push(
        issue('invalid-config', `$.${key}`, '선택 설정은 생략하거나 유효한 값을 입력하세요. null은 지원하지 않습니다.')
      );
  }
  if (!(CONSTRAINT_SYSTEM_IDS as readonly unknown[]).includes(v.systemId))
    issues.push(issue('unsupported-system', '$.systemId', '용수철·줄·이중 줄 시스템을 선택하세요.'));
  const spring = v.systemId === 'system:spring';
  if (
    spring ? !(CONSTRAINT_INTEGRATOR_IDS as readonly unknown[]).includes(v.integratorId) : v.integratorId !== 'internal'
  )
    issues.push(
      issue(
        'unsupported-integrator',
        '$.integratorId',
        '용수철은 RK4/RK2/Euler, 줄은 기존 내부 사건 적분기를 사용합니다.'
      )
    );
  const range = (value: unknown, min: number, max: number, path: string) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
      issues.push(issue('invalid-range', path, `${path}: ${min}–${max} 범위의 유한한 수가 필요합니다.`));
  };
  const p = record(v.parameters) ? v.parameters : {};
  closed(p, Object.keys(parameterUnits(String(v.systemId))), '$.parameters', issues);
  for (const key of Object.keys(parameterUnits(String(v.systemId)))) {
    const min =
      key === 'g'
        ? v.systemId === 'system:double-string'
          ? 0.001
          : 0
        : key === 'damping' || key === 'stiffness'
          ? 0
          : 0.001;
    range(p[key], min, key === 'stiffness' ? 100000 : 1000, `$.parameters.${key}`);
  }
  const initial = Array.isArray(v.initialState) ? v.initialState : [];
  if (initial.length !== (v.systemId === 'system:rope' ? 2 : 4))
    issues.push(issue('invalid-dimension', '$.initialState', '시스템에 필요한 초기 좌표와 속도를 입력하세요.'));
  initialFields(String(v.systemId)).forEach(([name], i) => {
    range(initial[i], name === 'r' ? MIN_SPRING_RADIUS * 2 : -10000, 10000, `$.initialState[${i}]`);
  });
  range(v.step, 1e-6, 0.05, '$.step');
  range(v.duration, 1e-6, 300, '$.duration');
  const sampleEvery = v.sampleEvery ?? 1;
  if (!Number.isInteger(sampleEvery))
    issues.push(issue('invalid-sampling', '$.sampleEvery', '표본 간격은 정수여야 합니다.'));
  range(sampleEvery, 1, MAX_CONSTRAINT_STEPS, '$.sampleEvery');
  if (
    typeof v.step === 'number' &&
    typeof v.duration === 'number' &&
    (v.step > v.duration ||
      Math.ceil(v.duration / v.step - (8 * Number.EPSILON * v.duration) / v.step) > MAX_CONSTRAINT_STEPS)
  )
    issues.push(
      issue(
        'step-budget',
        '$.runtime',
        `시간 간격은 관찰 시간 이하이며 최대 ${MAX_CONSTRAINT_STEPS} 단계를 지원합니다.`
      )
    );
  if (issues.length) return { ok: false, issues };
  const config = v as unknown as ConstraintConfig;
  const canonical = validateExperimentState(rawCanonical(config));
  if (!canonical.ok) return canonical;
  try {
    createUncheckedSimulation(config).snapshot();
  } catch (cause) {
    return {
      ok: false,
      issues: [
        issue('physics-evaluation', '$.parameters', cause instanceof Error ? cause.message : '물리 모델 평가 실패')
      ]
    };
  }
  return success(config);
}

function createUncheckedSimulation(config: ConstraintConfig) {
  const p = config.parameters,
    s = config.initialState;
  const rope =
    config.systemId === 'system:rope'
      ? new RopePendulum({ l: p.length!, g: p.g!, damping: p.damping! }, s[0]!, s[1]!)
      : undefined;
  const double =
    config.systemId === 'system:double-string'
      ? new DoubleStringPendulum(doubleParameters(config), s[0]!, s[1]!, s[2]!, s[3]!)
      : undefined;
  const vector = Float64Array.from(s),
    next = new Float64Array(s.length);
  const ratio = config.duration / config.step,
    total = Math.ceil(ratio - 8 * Number.EPSILON * ratio);
  let index = 0,
    eventCount = 0,
    captureLoss = 0,
    previousEventTime = -Infinity;
  let previousEnergy: number | undefined;
  let failure: Error | undefined;
  const start = config.startTime ?? 0;
  function sample(step: number): ConstraintSample {
    const time = start + Math.min(step * config.step, config.duration);
    let data: Omit<ConstraintSample, 'step' | 'time' | 'events' | 'captureLoss' | 'warnings'>;
    if (rope) {
      const r = rope.snapshot(),
        m = p.mass!,
        length = Math.hypot(r.x, r.y);
      const KE = 0.5 * m * (r.vx ** 2 + r.vy ** 2);
      data = {
        phase: r.phase,
        state: [r.x, r.y, r.vx, r.vy],
        positions: [{ x: r.x, y: r.y }],
        energy: { total: m * r.energy, KE, PE: m * r.energy - KE },
        lengths: [length],
        tensions: [m * r.tension],
        constraintErrors: [r.phase === 'taut' ? Math.abs(length - p.length!) : Math.max(0, length - p.length!)],
        gaps: [Math.abs(length - p.length!)]
      };
    } else if (double) {
      const r = double.snapshot(),
        lengths = [Math.hypot(r.x1, r.y1), Math.hypot(r.x2 - r.x1, r.y2 - r.y1)];
      const KE = 0.5 * p.m1! * (r.vx1 ** 2 + r.vy1 ** 2) + 0.5 * p.m2! * (r.vx2 ** 2 + r.vy2 ** 2);
      data = {
        phase: r.phase,
        state: [r.x1, r.y1, r.x2, r.y2, r.vx1, r.vy1, r.vx2, r.vy2],
        positions: [
          { x: r.x1, y: r.y1 },
          { x: r.x2, y: r.y2 }
        ],
        energy: { total: r.energy, KE, PE: r.energy - KE },
        lengths,
        tensions: [r.tension1, r.tension2],
        constraintErrors: lengths.map((length, i) => {
          const delta = length - p[i === 0 ? 'l1' : 'l2']!;
          const active = r.phase === 'taut' || (i === 0 && r.phase === 'outer-slack');
          return active ? Math.abs(delta) : Math.max(0, delta);
        }),
        gaps: [r.constraintError1, r.constraintError2]
      };
    } else {
      const r = vector[0]!,
        theta = vector[1]!;
      if (r <= MIN_SPRING_RADIUS)
        throw new Error('용수철 길이가 원점 특이점에 도달했습니다. 초기조건과 시간 간격을 조절하세요.');
      data = {
        phase: 'elastic',
        state: Array.from(vector),
        positions: [{ x: r * Math.sin(theta), y: -r * Math.cos(theta) }],
        energy: energySpring(vector, springParameters(config)),
        lengths: [r],
        tensions: [p.stiffness! * (r - p.restLength!)],
        constraintErrors: [0],
        gaps: [Math.abs(r - p.restLength!)]
      };
    }
    const rawEvents = rope?.events ?? double?.events ?? [];
    if (rawEvents.length > MAX_CONSTRAINT_EVENTS)
      throw new Error(`사건이 ${MAX_CONSTRAINT_EVENTS}개를 초과했습니다. 관찰 시간을 줄이세요.`);
    const events: ConstraintEvent[] = rawEvents.slice(eventCount).map((event, i) => ({
      sequence: eventCount + i,
      type: event.type,
      link: double?.events[eventCount + i]?.link ?? 'inner',
      time: start + event.time,
      energyLoss: event.energyLoss * (rope ? p.mass! : 1),
      residual: (event.residual ?? 0) * (rope && event.type === 'slack' ? p.mass! : 1),
      residualUnit: event.type === 'slack' ? 'N' : 'm',
      source: step === 0 ? 'initial-condition' : 'integration'
    }));
    let lastTime = previousEventTime,
      nextLoss = captureLoss;
    for (const event of events) {
      if (event.time < lastTime || event.time < start || event.time > time + 1e-8)
        throw new Error(
          '기존 사건 적분기의 사건 시각 순서가 일관되지 않습니다. 마지막 유효 상태에서 중지합니다. 시간 간격을 줄이세요.'
        );
      lastTime = event.time;
      nextLoss += event.energyLoss;
    }
    const values = [
      ...data.state,
      ...Object.values(data.energy),
      ...data.lengths,
      ...data.tensions,
      ...data.constraintErrors,
      ...data.gaps,
      nextLoss,
      ...events.flatMap((e) => [e.time, e.energyLoss, e.residual])
    ];
    if (!values.every(Number.isFinite))
      throw new Error('계산값이 유한하지 않습니다. 마지막 유효 상태에서 중지했습니다.');
    const warnings: string[] = [];
    if (!['taut', 'elastic'].includes(data.phase))
      warnings.push('줄이 느슨합니다. 해당 구속이 비활성화되어 자유 비행합니다.');
    if (data.constraintErrors.some((error) => error > 1e-6))
      warnings.push('길이 구속 잔차가 1 µm를 초과했습니다. 시간 간격과 모델 한계를 확인하세요.');
    if (events.some((e) => e.source === 'integration' && e.residual > 1e-6))
      warnings.push('사건 조건의 잔차가 큽니다. 표시된 단위와 간격 수렴을 확인하세요.');
    if (
      double &&
      previousEnergy !== undefined &&
      events.some((event) => event.type === 'capture') &&
      data.energy.total > previousEnergy + 1e-6
    )
      warnings.push(
        '이중 줄 재포획 전후에 에너지가 증가했습니다. 기존 단순화 모델의 한계이며, 기록된 포획 손실만으로 에너지 수지를 설명할 수 없습니다.'
      );
    if (data.phase === 'taut' && data.tensions.some((t) => t < 0.05 * p.g! * (p.mass ?? p.m1 ?? 1)))
      warnings.push('장력이 0에 가깝습니다. 이완 전환을 확인하세요.');
    eventCount = rawEvents.length;
    previousEventTime = lastTime;
    captureLoss = nextLoss;
    previousEnergy = data.energy.total;
    return { ...data, step, time, events, captureLoss, warnings };
  }
  let accepted = sample(0);
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
        const remaining = config.duration - index * config.step;
        const dt =
          Math.abs(remaining - config.step) <= 8 * Number.EPSILON * config.duration
            ? config.step
            : Math.min(config.step, remaining);
        if (rope) rope.step(dt);
        else if (double) double.step(dt);
        else {
          const integrator =
            config.integratorId === 'integrator:rk4'
              ? rk4Step
              : config.integratorId === 'integrator:rk2'
                ? rk2Step
                : eulerStep;
          integrator(
            vector,
            dt,
            (state, out) => {
              if (state[0]! <= MIN_SPRING_RADIUS)
                throw new Error('용수철 적분 중 원점 특이점에 접근했습니다. 시간 간격과 초기조건을 조절하세요.');
              return rhsSpring(state, springParameters(config), out);
            },
            next
          );
          vector.set(next);
        }
        const result = sample(index + 1);
        accepted = result;
        index++;
        return structuredClone(result);
      } catch (cause) {
        failure = cause instanceof Error ? cause : new Error('구속계 계산 실패');
        throw failure;
      }
    }
  };
}
export function createConstraintSimulation(input: ConstraintConfig) {
  const checked = validateConstraintConfig(input);
  if (!checked.ok) throw new ConstraintConfigurationError(checked.issues);
  return createUncheckedSimulation(checked.value);
}
export function toCanonicalConstraint(config: ConstraintConfig): ContractResult<ExperimentStateV1> {
  const checked = validateConstraintConfig(config);
  return checked.ok ? validateExperimentState(rawCanonical(checked.value)) : checked;
}
export function fromCanonicalConstraint(input: unknown): ContractResult<ConstraintConfig> {
  const parsed = validateExperimentState(input);
  if (!parsed.ok) return parsed;
  const v = parsed.value,
    issues: ContractIssue[] = [];
  if (v.modelVersion !== CONSTRAINT_MODEL_VERSION || v.integrator.version !== CONSTRAINT_INTEGRATOR_VERSION)
    issues.push(
      issue('unsupported-version', '$', '지원하지 않는 구속계 모델·적분기 버전입니다.', 'use-supported-version')
    );
  if (v.modelOptions !== undefined || v.integrator.options !== undefined || Object.keys(v.integrator.settings).length)
    issues.push(issue('unsupported-options', '$', '표현할 수 없는 모델·적분기 옵션입니다.', 'keep-original'));
  if (v.runtime.domain !== 'time')
    return {
      ok: false,
      issues: [...issues, issue('unsupported-runtime', '$.runtime', '시간 기반 설정이 필요합니다.')]
    };
  const units = parameterUnits(v.systemId),
    initial = initialFields(v.systemId);
  closed(v.parameters, Object.keys(units), '$.parameters', issues);
  closed(
    v.initialConditions,
    initial.map(([key]) => key),
    '$.initialConditions',
    issues
  );
  const read = (group: 'parameters' | 'initialConditions', key: string, unit: CanonicalUnit) => {
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
    Object.entries(units).map(([key, unit]) => [key, read('parameters', key, unit)])
  );
  const initialState = initial.map(([key, unit]) => read('initialConditions', key, unit));
  if (issues.length) return { ok: false, issues };
  return validateConstraintConfig({
    systemId: v.systemId,
    parameters,
    initialState,
    integratorId: v.integrator.kind === 'internal' ? 'internal' : v.integrator.id,
    startTime: v.runtime.start.value,
    step: v.runtime.step.value,
    duration: v.runtime.duration.value,
    sampleEvery: v.runtime.sampleEvery,
    analyses: v.analyses,
    ...(v.seed === undefined ? {} : { seed: v.seed }),
    ...(v.provenance === undefined ? {} : { provenance: v.provenance })
  });
}
