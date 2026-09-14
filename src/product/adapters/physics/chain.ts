import { createChainWorkspace, rhsChain, energyChain } from '../../../physics/nPendulum';
import { createTripleRhsWorkspace, rhsTriple } from '../../../physics/triple';
import { energyTriple } from '../../../physics/energy';
import { eulerStep, rk2Step, rk4Step } from '../../../physics/integrators';
import type { Derivative } from '../../../physics/types';
import { inspectSafeData } from '../../persistence/safe-data';
import { validateExperimentState } from '../../contracts/experiment-validation';
import { EXPERIMENT_SCHEMA, type ExperimentStateV1 } from '../../contracts/experiment';
import { issue, success, type ContractIssue, type ContractResult } from '../../contracts/validation';
import {
  CHAIN_SYSTEM_IDS,
  CHAIN_INTEGRATOR_IDS,
  CHAIN_MODEL_VERSION,
  CHAIN_INTEGRATOR_VERSION,
  MAX_CHAIN_LINKS,
  MAX_CHAIN_STEPS,
  type ChainConfig,
  type ChainSample
} from './chain-schema';
export * from './chain-schema';

export class ChainConfigurationError extends Error {
  constructor(readonly issues: readonly ContractIssue[]) {
    super(issues.map((entry) => `${entry.path}: ${entry.message}`).join('\n'));
    this.name = 'ChainConfigurationError';
  }
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function closedKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, issues: ContractIssue[]) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      issues.push(
        issue('unsupported-field', `${path}.${key}`, '지원하지 않는 설정입니다. 원본을 보존하세요.', 'keep-original')
      );
}
function rawCanonical(config: ChainConfig): ExperimentStateV1 {
  const n = config.parameters.masses.length;
  return {
    schema: EXPERIMENT_SCHEMA,
    systemId: config.systemId,
    modelVersion: CHAIN_MODEL_VERSION,
    parameters: {
      masses: { kind: 'vector', values: config.parameters.masses, unit: 'kg' },
      lengths: { kind: 'vector', values: config.parameters.lengths, unit: 'm' },
      g: { kind: 'scalar', value: config.parameters.g, unit: 'm/s^2' },
      gamma: { kind: 'scalar', value: config.gamma, unit: 'kg*m^2/s' }
    },
    initialConditions: {
      theta: { kind: 'vector', values: config.initialState.slice(0, n), unit: 'rad' },
      omega: { kind: 'vector', values: config.initialState.slice(n), unit: 'rad/s' }
    },
    integrator: { kind: 'selectable', id: config.integratorId, version: CHAIN_INTEGRATOR_VERSION, settings: {} },
    runtime: {
      domain: 'time',
      start: { value: config.startTime === undefined ? 0 : config.startTime, unit: 's' },
      duration: { value: config.duration, unit: 's' },
      step: { value: config.step, unit: 's' },
      sampleEvery: config.sampleEvery === undefined ? 1 : config.sampleEvery
    },
    analyses: config.analyses === undefined ? [] : config.analyses,
    ...(config.seed === undefined ? {} : { seed: config.seed }),
    ...(config.provenance === undefined ? {} : { provenance: config.provenance })
  };
}
function engine(config: ChainConfig) {
  const n = config.parameters.masses.length;
  if (config.systemId === 'system:triple') {
    const { masses: m, lengths: l, g } = config.parameters;
    const params = { m1: m[0]!, m2: m[1]!, m3: m[2]!, l1: l[0]!, l2: l[1]!, l3: l[2]!, g };
    const workspace = createTripleRhsWorkspace();
    return {
      derivative: ((s, out) => rhsTriple(s, params, config.gamma, out, workspace)) as Derivative,
      energy: (s: readonly number[] | Float64Array) => energyTriple(s, params)
    };
  }
  const workspace = createChainWorkspace(n);
  return {
    derivative: ((s, out) => rhsChain(s, config.parameters, config.gamma, out, workspace)) as Derivative,
    energy: (s: readonly number[] | Float64Array) => energyChain(s, config.parameters)
  };
}

/** Closed, detached restart contract, including a real evaluation of the legacy model. */
export function validateChainConfig(input: unknown): ContractResult<ChainConfig> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  const value = safe.value;
  if (!record(value)) return { ok: false, issues: [issue('invalid-config', '$', '사슬 설정 객체가 필요합니다.')] };
  const issues: ContractIssue[] = [];
  closedKeys(
    value,
    [
      'systemId',
      'parameters',
      'gamma',
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
  if (!(CHAIN_SYSTEM_IDS as readonly unknown[]).includes(value.systemId))
    issues.push(issue('unsupported-system', '$.systemId', '삼중 진자 또는 N중 사슬을 선택하세요.'));
  if (!(CHAIN_INTEGRATOR_IDS as readonly unknown[]).includes(value.integratorId))
    issues.push(issue('unsupported-integrator', '$.integratorId', 'RK4, RK2, 명시적 Euler만 지원합니다.'));
  const parameters = record(value.parameters) ? value.parameters : {};
  closedKeys(parameters, ['masses', 'lengths', 'g'], '$.parameters', issues);
  const masses = Array.isArray(parameters.masses) ? parameters.masses : [];
  const lengths = Array.isArray(parameters.lengths) ? parameters.lengths : [];
  const n = masses.length;
  if (n < 1 || n > MAX_CHAIN_LINKS || lengths.length !== n || (value.systemId === 'system:triple' && n !== 3))
    issues.push(
      issue('invalid-dimension', '$.parameters', '사슬은 1–128개, 삼중 진자는 3개의 질량·길이가 필요합니다.')
    );
  const range = (candidate: unknown, min: number, max: number, path: string) => {
    if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate < min || candidate > max)
      issues.push(issue('invalid-range', path, `${path}: ${min}–${max} 범위의 유한한 수가 필요합니다.`));
  };
  for (let i = 0; i < Math.min(n, MAX_CHAIN_LINKS); i++) {
    range(masses[i], 0.001, 1000, `$.parameters.masses[${i}]`);
    range(lengths[i], 0.001, 1000, `$.parameters.lengths[${i}]`);
  }
  range(parameters.g, value.systemId === 'system:triple' ? 0 : Number.MIN_VALUE, 1000, '$.parameters.g');
  range(value.gamma, 0, 1000, '$.gamma');
  const initial = Array.isArray(value.initialState) ? value.initialState : [];
  if (initial.length !== 2 * n)
    issues.push(issue('invalid-dimension', '$.initialState', 'N개 각도 뒤에 N개 각속도를 입력하세요.'));
  for (let i = 0; i < Math.min(initial.length, 2 * MAX_CHAIN_LINKS); i++)
    range(initial[i], i < n ? -1e6 : -1e4, i < n ? 1e6 : 1e4, `$.initialState[${i}]`);
  range(value.step, 1e-6, 0.05, '$.step');
  range(value.duration, 1e-6, 300, '$.duration');
  const sampleEvery = value.sampleEvery === undefined ? 1 : value.sampleEvery;
  if (!Number.isInteger(sampleEvery))
    issues.push(issue('invalid-sampling', '$.sampleEvery', '표본 간격은 정수여야 합니다.'));
  range(sampleEvery, 1, MAX_CHAIN_STEPS, '$.sampleEvery');
  if (
    typeof value.step === 'number' &&
    typeof value.duration === 'number' &&
    (value.step > value.duration ||
      Math.ceil(value.duration / value.step - (8 * Number.EPSILON * value.duration) / value.step) > MAX_CHAIN_STEPS)
  )
    issues.push(
      issue(
        'step-budget',
        '$.runtime',
        `시간 간격은 관찰 시간 이하여야 하며 최대 ${MAX_CHAIN_STEPS} 단계까지 지원합니다.`
      )
    );
  if (issues.length) return { ok: false, issues };
  const config = value as unknown as ChainConfig;
  const canonical = validateExperimentState(rawCanonical(config));
  if (!canonical.ok) return canonical;
  try {
    const { derivative, energy } = engine(config);
    const out = new Float64Array(2 * n);
    derivative(Float64Array.from(config.initialState), out);
    if (![...out, ...Object.values(energy(config.initialState))].every(Number.isFinite))
      throw new Error('초기 계산값이 유한하지 않습니다.');
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

export function createChainSimulation(input: ChainConfig) {
  const validated = validateChainConfig(input);
  if (!validated.ok) throw new ChainConfigurationError(validated.issues);
  const config = validated.value;
  const { derivative, energy } = engine(config);
  const state = Float64Array.from(config.initialState),
    next = new Float64Array(state.length);
  const ratio = config.duration / config.step;
  const total = Math.ceil(ratio - 8 * Number.EPSILON * ratio);
  const stepper =
    config.integratorId === 'integrator:rk4' ? rk4Step : config.integratorId === 'integrator:rk2' ? rk2Step : eulerStep;
  let index = 0;
  function sample(vector: Float64Array, step: number): ChainSample {
    const currentEnergy = energy(vector);
    if (![...vector, ...Object.values(currentEnergy)].every(Number.isFinite))
      throw new Error('계산값이 유한하지 않습니다. 시간 간격과 물성을 확인하세요.');
    let x = 0,
      y = 0;
    const positions = config.parameters.lengths.map((l, i) => {
      x += l * Math.sin(vector[i]!);
      y -= l * Math.cos(vector[i]!);
      return { x, y };
    });
    return {
      step,
      time: (config.startTime ?? 0) + Math.min(step * config.step, config.duration),
      state: Array.from(vector),
      energy: currentEnergy,
      positions
    };
  }
  return {
    get config() {
      return structuredClone(config);
    },
    get done() {
      return index >= total;
    },
    snapshot: () => sample(state, index),
    step() {
      if (index >= total) return sample(state, index);
      const remaining = config.duration - index * config.step;
      const dt =
        Math.abs(remaining - config.step) <= 8 * Number.EPSILON * config.duration
          ? config.step
          : Math.min(config.step, remaining);
      stepper(state, dt, derivative, next);
      const result = sample(next, index + 1);
      state.set(next);
      index++;
      return result;
    }
  };
}
export function toCanonicalChain(config: ChainConfig): ContractResult<ExperimentStateV1> {
  const checked = validateChainConfig(config);
  return checked.ok ? validateExperimentState(rawCanonical(checked.value)) : checked;
}
export function fromCanonicalChain(input: unknown): ContractResult<ChainConfig> {
  const parsed = validateExperimentState(input);
  if (!parsed.ok) return parsed;
  const v = parsed.value,
    issues: ContractIssue[] = [];
  if (v.modelVersion !== CHAIN_MODEL_VERSION || v.integrator.version !== CHAIN_INTEGRATOR_VERSION)
    issues.push(
      issue('unsupported-version', '$', '지원하지 않는 사슬 모델/적분기 버전입니다.', 'use-supported-version')
    );
  if (v.modelOptions !== undefined || v.integrator.options !== undefined || Object.keys(v.integrator.settings).length)
    issues.push(issue('unsupported-options', '$', '이 경로가 표현할 수 없는 모델·적분기 옵션입니다.', 'keep-original'));
  if (v.runtime.domain !== 'time' || v.integrator.kind !== 'selectable')
    return {
      ok: false,
      issues: [...issues, issue('unsupported-runtime', '$', '시간 기반 선택형 적분기가 필요합니다.')]
    };
  closedKeys(v.parameters, ['masses', 'lengths', 'g', 'gamma'], '$.parameters', issues);
  closedKeys(v.initialConditions, ['theta', 'omega'], '$.initialConditions', issues);
  const vectors: Record<string, readonly number[]> = {},
    scalars: Record<string, number> = {};
  for (const [name, unit, group, kind] of [
    ['masses', 'kg', 'parameters', 'vector'],
    ['lengths', 'm', 'parameters', 'vector'],
    ['g', 'm/s^2', 'parameters', 'scalar'],
    ['gamma', 'kg*m^2/s', 'parameters', 'scalar'],
    ['theta', 'rad', 'initialConditions', 'vector'],
    ['omega', 'rad/s', 'initialConditions', 'vector']
  ] as const) {
    const q = v[group][name];
    if (!q || q.kind !== kind || q.unit !== unit)
      issues.push(
        issue('invalid-unit', `$.${group}.${name}`, `${name}: ${unit} ${kind} 값이 필요합니다.`, 'keep-original')
      );
    else if (q.kind === 'vector') vectors[name] = q.values;
    else if (q.kind === 'scalar') scalars[name] = q.value;
  }
  if (issues.length) return { ok: false, issues };
  if (vectors.theta!.length !== vectors.masses!.length || vectors.omega!.length !== vectors.masses!.length)
    return {
      ok: false,
      issues: [issue('invalid-dimension', '$.initialConditions', '링크마다 각도와 각속도가 필요합니다.')]
    };
  return validateChainConfig({
    systemId: v.systemId,
    parameters: { masses: vectors.masses, lengths: vectors.lengths, g: scalars.g },
    gamma: scalars.gamma,
    initialState: [...vectors.theta!, ...vectors.omega!],
    integratorId: v.integrator.id,
    startTime: v.runtime.start.value,
    step: v.runtime.step.value,
    duration: v.runtime.duration.value,
    sampleEvery: v.runtime.sampleEvery,
    analyses: v.analyses,
    ...(v.seed === undefined ? {} : { seed: v.seed }),
    ...(v.provenance === undefined ? {} : { provenance: v.provenance })
  });
}
