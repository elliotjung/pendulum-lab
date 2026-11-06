import { createDoublePendulumDerivative, energyDouble } from '../../../physics/double';
import { createCompoundDoublePendulumDerivative, energyCompoundDouble } from '../../../physics/compoundDouble';
import { physicsAdapter } from '../../../physics';
import type { Derivative } from '../../../physics/types';
import { inspectSafeData } from '../../persistence/safe-data';
import { issue, success, type ContractIssue, type ContractResult } from '../../contracts/validation';
import { validateExperimentState } from '../../contracts/experiment-validation';
import { EXPERIMENT_SCHEMA, type ExperimentStateV1 } from '../../contracts/experiment';
import type { QuantityMap } from '../../contracts/quantities';
import { odeIntegratorSettings, readOdeTolerance, validateOdeTolerance } from './planar-integrators';
import { createLegacyOdeIntervalStepper } from './planar-step-policy';
import type { LabStepReport } from '../../../app/LabSimulation';
import {
  PLANAR_FIELDS,
  PLANAR_SYSTEM_IDS,
  PLANAR_INTEGRATOR_IDS,
  PLANAR_MODEL_VERSION,
  PLANAR_INTEGRATOR_VERSION,
  MAX_PLANAR_STEPS,
  type PlanarConfig,
  type PlanarPositions,
  type PlanarSample,
  type PlanarState
} from './planar-schema';
export * from './planar-schema';

export class PlanarConfigurationError extends Error {
  constructor(readonly issues: readonly ContractIssue[]) {
    super(issues.map((entry) => `${entry.path}: ${entry.message}`).join('\n'));
    this.name = 'PlanarConfigurationError';
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const initialNames = ['theta1', 'theta2', 'omega1', 'omega2'] as const;

function closedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: ContractIssue[]
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key))
      issues.push(
        issue('unsupported-field', `${path}.${key}`, '지원하지 않는 설정입니다. 원본을 보존하세요.', 'keep-original')
      );
  }
}

function rawCanonical(config: PlanarConfig): ExperimentStateV1 {
  const parameters: Record<string, QuantityMap[string]> = {};
  const initialConditions: Record<string, QuantityMap[string]> = {};
  for (const field of PLANAR_FIELDS) {
    if (field.group === 'parameters') {
      const value =
        field.id === 'gamma' ? config.gamma : config.parameters[field.id as keyof PlanarConfig['parameters']];
      parameters[field.id] = { kind: 'scalar', value, unit: field.unit };
    } else if (field.group === 'initialConditions') {
      initialConditions[field.id] = {
        kind: 'scalar',
        value: config.initialState[initialNames.indexOf(field.id as (typeof initialNames)[number])]!,
        unit: field.unit
      };
    }
  }
  return {
    schema: EXPERIMENT_SCHEMA,
    systemId: config.systemId,
    modelVersion: PLANAR_MODEL_VERSION,
    parameters,
    initialConditions,
    integrator: {
      kind: 'selectable',
      id: config.integratorId,
      version: PLANAR_INTEGRATOR_VERSION,
      settings: odeIntegratorSettings(config.tolerance)
    },
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

function derivativeUnchecked(config: PlanarConfig): Derivative {
  return config.systemId === 'system:double'
    ? createDoublePendulumDerivative(config.parameters, config.gamma)
    : createCompoundDoublePendulumDerivative(config.parameters, config.gamma);
}

/** Validate detached plain data and model evaluation before allocating a long run. */
export function validatePlanarConfig(input: unknown): ContractResult<PlanarConfig> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  const value = safe.value;
  if (!record(value)) return { ok: false, issues: [issue('invalid-config', '$', '진자 설정 객체가 필요합니다.')] };
  const issues: ContractIssue[] = [];
  closedKeys(
    value,
    [
      'systemId',
      'parameters',
      'gamma',
      'initialState',
      'integratorId',
      'tolerance',
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
  if (!(PLANAR_SYSTEM_IDS as readonly unknown[]).includes(value.systemId))
    issues.push(issue('unsupported-system', '$.systemId', '이중 또는 복합진자만 지원합니다.'));
  if (!(PLANAR_INTEGRATOR_IDS as readonly unknown[]).includes(value.integratorId))
    issues.push(issue('unsupported-integrator', '$.integratorId', '기존 ODE 적분기 16개 중 하나를 선택하세요.'));
  validateOdeTolerance(value.tolerance, issues);
  const parameters = record(value.parameters) ? value.parameters : {};
  if (!record(value.parameters))
    issues.push(issue('invalid-parameter', '$.parameters', '질량·길이·중력 설정이 필요합니다.'));
  closedKeys(parameters, ['m1', 'm2', 'l1', 'l2', 'g'], '$.parameters', issues);
  const initial = Array.isArray(value.initialState) ? value.initialState : [];
  if (initial.length !== 4)
    issues.push(issue('invalid-dimension', '$.initialState', 'theta1, theta2, omega1, omega2의 네 값이 필요합니다.'));
  for (const field of PLANAR_FIELDS) {
    const candidate =
      field.group === 'parameters'
        ? field.id === 'gamma'
          ? value.gamma
          : parameters[field.id]
        : field.group === 'initialConditions'
          ? initial[initialNames.indexOf(field.id as (typeof initialNames)[number])]
          : value[field.id];
    if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate < field.min || candidate > field.max)
      issues.push(
        issue(
          'invalid-range',
          `$.${field.id}`,
          `${field.label}: ${field.min}–${field.max} ${field.unit} 범위의 유한한 수를 입력하세요.`
        )
      );
  }
  const start = value.startTime === undefined ? 0 : value.startTime;
  if (typeof start !== 'number' || !Number.isFinite(start))
    issues.push(issue('invalid-time', '$.startTime', '시작 시간은 유한해야 합니다.'));
  const sampleEvery = value.sampleEvery === undefined ? 1 : value.sampleEvery;
  if (
    typeof sampleEvery !== 'number' ||
    !Number.isInteger(sampleEvery) ||
    sampleEvery < 1 ||
    sampleEvery > MAX_PLANAR_STEPS
  )
    issues.push(issue('invalid-sampling', '$.sampleEvery', `표본 간격은 1–${MAX_PLANAR_STEPS} 정수여야 합니다.`));
  if (
    typeof value.step === 'number' &&
    typeof value.duration === 'number' &&
    (value.step > value.duration || Math.ceil(value.duration / value.step) > MAX_PLANAR_STEPS)
  )
    issues.push(
      issue(
        'step-budget',
        '$.runtime',
        `시간 간격은 관찰 시간 이하여야 하며 최대 ${MAX_PLANAR_STEPS} 단계까지 실행할 수 있습니다.`
      )
    );
  if (issues.length) return { ok: false, issues };
  const config = value as unknown as PlanarConfig;
  const canonical = validateExperimentState(rawCanonical(config));
  if (!canonical.ok) return canonical;
  try {
    derivativeUnchecked(config)(Float64Array.from(config.initialState), new Float64Array(4));
    const energy = (config.systemId === 'system:double' ? energyDouble : energyCompoundDouble)(
      config.initialState,
      config.parameters
    );
    if (![energy.KE, energy.PE, energy.total].every(Number.isFinite))
      throw new Error('초기 에너지가 유한하지 않습니다.');
  } catch (error) {
    return {
      ok: false,
      issues: [
        issue(
          'physics-evaluation',
          '$.parameters',
          error instanceof Error ? error.message : '물리 모델 평가에 실패했습니다.'
        )
      ]
    };
  }
  return success(config);
}

export function createPlanarDerivative(input: PlanarConfig): Derivative {
  const validated = validatePlanarConfig(input);
  if (!validated.ok) throw new PlanarConfigurationError(validated.issues);
  return derivativeUnchecked(validated.value);
}

/** Cartesian positions in metres, positive y upwards; UI projection may invert y. */
export function planarPositions(config: PlanarConfig, state: PlanarState): PlanarPositions {
  const { l1, l2 } = config.parameters;
  const first = { x: l1 * Math.sin(state[0]), y: -l1 * Math.cos(state[0]) };
  const second = { x: first.x + l2 * Math.sin(state[1]), y: first.y - l2 * Math.cos(state[1]) };
  return {
    pivot: { x: 0, y: 0 },
    first,
    second,
    ...(config.systemId === 'system:compound-double'
      ? {
          centers: [
            { x: first.x / 2, y: first.y / 2 },
            { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
          ] as const
        }
      : {})
  };
}

export interface PlanarSimulation {
  readonly config: PlanarConfig;
  readonly derivative: Derivative;
  readonly done: boolean;
  snapshot(): PlanarSample;
  step(): PlanarSample;
}

/** Caller schedules chunks; no timers, rendering, workers, storage or application globals. */
export function createPlanarSimulation(input: PlanarConfig): PlanarSimulation & { lastStepReport(): LabStepReport } {
  const validated = validatePlanarConfig(input);
  if (!validated.ok) throw new PlanarConfigurationError(validated.issues);
  const config = validated.value;
  // Preserve the native live-Lab Jacobian policy: double exposes its analytic
  // callback; compound uses the adapter callback and fixed-point fallback.
  const derivative = derivativeUnchecked(config);
  const stepDerivative: Derivative =
    config.systemId === 'system:double'
      ? derivative
      : (s, out) => {
          physicsAdapter.derivative('compound-double', s, config.parameters, config.gamma, out);
        };
  const energy = config.systemId === 'system:double' ? energyDouble : energyCompoundDouble;
  const stepper = createLegacyOdeIntervalStepper(config.integratorId, stepDerivative, 4, config.tolerance);
  const state = Float64Array.from(config.initialState);
  const next = new Float64Array(4);
  const ratio = config.duration / config.step;
  const totalSteps = Math.ceil(ratio - 8 * Number.EPSILON * ratio);
  let index = 0;
  function sample(vector: Float64Array, stepIndex: number): PlanarSample {
    const stateCopy = Array.from(vector) as unknown as PlanarState;
    const currentEnergy = energy(vector, config.parameters);
    if (![...vector, currentEnergy.KE, currentEnergy.PE, currentEnergy.total].every(Number.isFinite))
      throw new Error('계산 결과가 유한하지 않습니다. 시간 간격을 줄이거나 물성을 확인하세요.');
    return {
      step: stepIndex,
      time: (config.startTime ?? 0) + Math.min(stepIndex * config.step, config.duration),
      state: stateCopy,
      energy: currentEnergy,
      positions: planarPositions(config, stateCopy)
    };
  }
  return {
    // A separate copy prevents a consumer from altering this run through the inspection API.
    get config() {
      return structuredClone(config);
    },
    derivative,
    get done() {
      return index >= totalSteps;
    },
    snapshot: () => sample(state, index),
    lastStepReport: stepper.lastStepReport,
    step() {
      if (index >= totalSteps) return sample(state, index);
      const remaining = config.duration - index * config.step;
      const dt =
        Math.abs(remaining - config.step) <= 8 * Number.EPSILON * config.duration
          ? config.step
          : Math.min(config.step, remaining);
      stepper.advance(state, dt, next);
      let result: PlanarSample;
      try {
        result = sample(next, index + 1);
      } catch (cause) {
        stepper.rejectCandidate();
        throw cause;
      }
      // Commit after all checks: failed steps leave the previous state and time intact.
      state.set(next);
      index += 1;
      return result;
    }
  };
}

export function toCanonicalPlanar(input: PlanarConfig): ContractResult<ExperimentStateV1> {
  const validated = validatePlanarConfig(input);
  return validated.ok ? validateExperimentState(rawCanonical(validated.value)) : validated;
}

/** Strict restart reader: unsupported versions/options/units are rejected, never defaulted away. */
export function fromCanonicalPlanar(input: unknown): ContractResult<PlanarConfig> {
  const parsed = validateExperimentState(input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const issues: ContractIssue[] = [];
  if (value.modelVersion !== PLANAR_MODEL_VERSION)
    issues.push(
      issue('unsupported-version', '$.modelVersion', '지원하지 않는 진자 모델 버전입니다.', 'use-supported-version')
    );
  if (value.integrator.version !== PLANAR_INTEGRATOR_VERSION)
    issues.push(
      issue('unsupported-version', '$.integrator.version', '지원하지 않는 적분기 버전입니다.', 'use-supported-version')
    );
  if (value.modelOptions !== undefined || value.integrator.options !== undefined)
    issues.push(
      issue('unsupported-options', '$', '이 경로에서 표현할 수 없는 모델·적분기 설정입니다.', 'keep-original')
    );
  const tolerance = readOdeTolerance(value.integrator.settings, issues);
  if (value.integrator.kind !== 'selectable' || value.runtime.domain !== 'time')
    return {
      ok: false,
      issues: [...issues, issue('unsupported-runtime', '$', '선택형 적분기와 시간 기반 설정이 필요합니다.')]
    };
  closedKeys(value.parameters, ['m1', 'm2', 'l1', 'l2', 'g', 'gamma'], '$.parameters', issues);
  closedKeys(value.initialConditions, initialNames, '$.initialConditions', issues);
  const values: Record<string, number> = {};
  for (const field of PLANAR_FIELDS.filter((entry) => entry.group !== 'runtime')) {
    const quantity = (field.group === 'parameters' ? value.parameters : value.initialConditions)[field.id];
    if (!quantity || quantity.kind !== 'scalar' || quantity.unit !== field.unit)
      issues.push(
        issue(
          'invalid-unit',
          `$.${field.group}.${field.id}`,
          `${field.label}의 단위는 ${field.unit}인 스칼라여야 합니다.`,
          'keep-original'
        )
      );
    else values[field.id] = quantity.value;
  }
  if (issues.length) return { ok: false, issues };
  return validatePlanarConfig({
    systemId: value.systemId,
    parameters: { m1: values.m1, m2: values.m2, l1: values.l1, l2: values.l2, g: values.g },
    gamma: values.gamma,
    initialState: initialNames.map((name) => values[name]),
    integratorId: value.integrator.id,
    ...(tolerance === undefined ? {} : { tolerance }),
    startTime: value.runtime.start.value,
    step: value.runtime.step.value,
    duration: value.runtime.duration.value,
    sampleEvery: value.runtime.sampleEvery,
    analyses: value.analyses,
    ...(value.seed === undefined ? {} : { seed: value.seed }),
    ...(value.provenance === undefined ? {} : { provenance: value.provenance })
  });
}
