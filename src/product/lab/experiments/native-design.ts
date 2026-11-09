import type { ExperimentStateV1 } from '../../contracts/experiment';
import { validateExperimentState } from '../../contracts/experiment-validation';
import { readDiagnosticConfiguration } from '../../adapters/analysis/core/source-config';
import {
  generateDesign,
  adaptiveRefinement,
  boundaryRefinement,
  uncertaintyResampling,
  type StudyVariable,
  type DesignPoint,
  type DesignBudget,
  type MultiStrategy,
  type EvaluatedPoint
} from '../../../research/experimentDesign';
import type {
  StudyPointRequest,
  StudyPointResponse,
  StudyPointJobSettings
} from '../../../workers/chaosProtocolSchema';
import { validateChaosJobRequest } from '../../../workers/jobProtocol';
import { batchData, batchHash, closed, stableBatchJson } from './safe';

export const NATIVE_DESIGN_LIMITS = Object.freeze({ points: 256, work: 64_000_000, bytes: 16 * 1024 * 1024 });
export const DESIGN_KEYS = [
  'theta1',
  'theta2',
  'omega1',
  'omega2',
  'damping',
  'dt',
  'mass-ratio',
  'length-ratio'
] as const;
export interface NativeDesignSettings {
  variables: StudyVariable[];
  strategy: MultiStrategy;
  count: number;
  replicates: number;
  seedText: string;
  budget: DesignBudget;
  /** Native studyPoint owns these independent analysis windows, not the main trajectory integrator. */
  evaluation: StudyPointJobSettings;
}
export interface NativeDesignPoint extends DesignPoint {
  id: string;
  experiment: ExperimentStateV1;
  request: StudyPointRequest | null;
  unsupported: string | null;
  work: number;
}
export interface NativeDesignRefinement {
  kind: 'adaptive' | 'boundary' | 'uncertainty';
  maxNew: number;
  relativeThreshold: number;
  evidenceSource: string;
  evaluated: EvaluatedPoint[];
}
export interface NativeDesignPlan {
  schema: 'pendulum-native-design/v1';
  id: string;
  source: ExperimentStateV1;
  settings: NativeDesignSettings;
  refinements: NativeDesignRefinement[];
  points: NativeDesignPoint[];
  estimatedWork: number;
}
export function defaultNativeDesignSettings(): NativeDesignSettings {
  return {
    variables: [{ key: 'theta1', min: 0.8, max: 1.2 }],
    strategy: 'sobol',
    count: 4,
    replicates: 1,
    seedText: 'pendulum-native-design',
    budget: { maxPoints: 64, maxTimeMs: 600_000, maxFailures: 12 },
    evaluation: {
      lyapunov: { dt: 0.01, steps: 8000, transientSteps: 2000, renormEvery: 10, seed: 0x9e37, method: 'rk4' },
      rqa: { dt: 0.01, sampleEvery: 20, samples: 360, transientSteps: 2000 },
      ftleHorizon: 5,
      ftleDt: 0.01
    }
  };
}
function integer(value: number, min: number, max: number, label: string) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`${label}: ${min}–${max} 정수가 필요합니다.`);
}
function checkedSettings(input: NativeDesignSettings): NativeDesignSettings {
  const settings = batchData(input) as unknown as NativeDesignSettings;
  closed(settings, ['variables', 'strategy', 'count', 'replicates', 'seedText', 'budget', 'evaluation']);
  if (!Array.isArray(settings.variables) || !settings.variables.length || settings.variables.length > 8)
    throw new Error('변수1–8개가 필요합니다.');
  if (new Set(settings.variables.map((v) => v.key)).size !== settings.variables.length)
    throw new Error('변수 키가 중복되었습니다.');
  for (const variable of settings.variables) {
    closed(variable, ['key', 'min', 'max']);
    if (
      !(DESIGN_KEYS as readonly string[]).includes(variable.key) ||
      !Number.isFinite(variable.min) ||
      !Number.isFinite(variable.max) ||
      variable.min > variable.max ||
      Math.max(Math.abs(variable.min), Math.abs(variable.max)) > 1000
    )
      throw new Error('지원하는 변수와 유한한 오름차순 범위가 필요합니다.');
  }
  if (!['sobol', 'latin-hypercube', 'grid'].includes(settings.strategy))
    throw new Error('native Sobol/LHS/grid 전략이 필요합니다.');
  integer(settings.count, 1, 256, '설계 수');
  integer(settings.replicates, 1, 8, '반복 수');
  if (typeof settings.seedText !== 'string' || !settings.seedText.length || settings.seedText.length > 256)
    throw new Error('seed1–256자가 필요합니다.');
  closed(settings.budget, ['maxPoints', 'maxTimeMs', 'maxFailures']);
  integer(settings.budget.maxPoints, 1, 256, '점 예산');
  integer(settings.budget.maxTimeMs, 1000, 3_600_000, '시간 예산(ms)');
  integer(settings.budget.maxFailures, 1, 64, '실패 예산');
  if (settings.count * settings.replicates > settings.budget.maxPoints)
    throw new Error('설계×반복 수가 점 예산을 넘습니다. 입력을 줄이세요.');
  closed(settings.evaluation, ['lyapunov', 'rqa', 'ftleHorizon', 'ftleDt']);
  if (settings.evaluation.lyapunov)
    closed(settings.evaluation.lyapunov, ['dt', 'steps', 'transientSteps', 'renormEvery', 'seed', 'method']);
  // Native JobEngine's studyPoint phase supports exactly these RQA options.
  if (settings.evaluation.rqa)
    closed(settings.evaluation.rqa, [
      'dt',
      'sampleEvery',
      'samples',
      'transientSteps',
      'dimension',
      'delay',
      'targetRecurrenceRate'
    ]);
  validateChaosJobRequest({
    id: 'design-settings-validation',
    kind: 'studyPoint',
    spec: { kind: 'double', m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
    state0: [1, 1, 0, 0],
    settings: settings.evaluation
  });
  return settings;
}
/** A condition adapter only. Native equations, samplers and numerical diagnostics remain unchanged. */
export function designCondition(source: ExperimentStateV1, values: Record<string, number>): ExperimentStateV1 {
  const experiment = structuredClone(source),
    parameters = { ...experiment.parameters },
    initial = { ...experiment.initialConditions };
  let runtime = experiment.runtime;
  const setScalar = (target: typeof parameters, key: string, value: number) => {
    const old = target[key];
    if (!old || old.kind !== 'scalar') throw new Error(`스칼라 조건이 없습니다: ${key}`);
    target[key] = { ...old, value };
  };
  const triple = experiment.systemId === 'system:triple';
  if (!['system:double', 'system:compound-double', 'system:triple'].includes(experiment.systemId))
    throw new Error('native 설계는 이중·복합·삼중 진자 조건을 지원합니다. 원본은 보존됩니다.');
  for (const [key, value] of Object.entries(values)) {
    if (!Number.isFinite(value) || !(DESIGN_KEYS as readonly string[]).includes(key))
      throw new Error(`지원하지 않는 설계 값: ${key}`);
    if (['theta1', 'theta2', 'omega1', 'omega2'].includes(key)) {
      if (triple) {
        const target = key.startsWith('theta') ? 'theta' : 'omega',
          old = initial[target];
        if (!old || old.kind !== 'vector') throw new Error('삼중 진자 상태 벡터가 없습니다.');
        const vector = [...old.values];
        vector[Number(key.slice(-1)) - 1] = value;
        initial[target] = { ...old, values: vector };
      } else setScalar(initial, key, value);
    } else if (key === 'dt') {
      if (runtime.domain !== 'time') throw new Error('시간 step이 없습니다.');
      runtime = { ...runtime, step: { value, unit: 's' } };
    } else if (key === 'damping') setScalar(parameters, 'gamma', value);
    else if (triple) {
      const target = key === 'mass-ratio' ? 'masses' : 'lengths',
        old = parameters[target];
      if (!old || old.kind !== 'vector') throw new Error('삼중 진자 물성 벡터가 없습니다.');
      const vector = [...old.values];
      vector[1] = vector[0]! * value;
      parameters[target] = { ...old, values: vector };
    } else {
      const first = parameters[key === 'mass-ratio' ? 'm1' : 'l1'];
      if (!first || first.kind !== 'scalar') throw new Error('첫 번째 물성이 없습니다.');
      setScalar(parameters, key === 'mass-ratio' ? 'm2' : 'l2', first.value * value);
    }
  }
  const result = { ...experiment, parameters, initialConditions: initial, runtime };
  const validation = validateExperimentState(result);
  if (!validation.ok) throw new Error(validation.issues.map((i) => i.message).join(' '));
  readDiagnosticConfiguration(result); // Model-specific ranges are validated without clamping.
  return result;
}
function nativeRequest(experiment: ExperimentStateV1, settings: StudyPointJobSettings, id: string): StudyPointRequest {
  const source = readDiagnosticConfiguration(experiment);
  if (source.family !== 'planar' && !(source.family === 'chain' && source.config.systemId === 'system:triple'))
    throw new Error('native studyPoint가 지원하지 않는 모델입니다.');
  const config = source.config;
  if (config.gamma !== 0)
    throw new Error(
      'γ>0 조건의 자동 λ 평가는 지원하지 않습니다. native studyPoint의 이중·삼중 spec은 감쇠를 생략합니다. γ=0 원본을 명시적으로 선택하세요.'
    );
  const spec =
    source.family === 'planar'
      ? source.config.systemId === 'system:double'
        ? { kind: 'double' as const, ...source.config.parameters }
        : { kind: 'compound-double' as const, ...source.config.parameters, damping: 0 }
      : {
          kind: 'triple' as const,
          m1: source.config.parameters.masses[0]!,
          m2: source.config.parameters.masses[1]!,
          m3: source.config.parameters.masses[2]!,
          l1: source.config.parameters.lengths[0]!,
          l2: source.config.parameters.lengths[1]!,
          l3: source.config.parameters.lengths[2]!,
          g: source.config.parameters.g
        };
  const request: StudyPointRequest = {
    id,
    kind: 'studyPoint',
    spec,
    state0: [...config.initialState],
    settings: {
      ...structuredClone(settings),
      lyapunov: { ...structuredClone(settings.lyapunov ?? {}), dt: Math.min(0.01, config.step) }
    }
  };
  validateChaosJobRequest(request);
  return request;
}
function buildPoint(
  source: ExperimentStateV1,
  settings: NativeDesignSettings,
  point: DesignPoint,
  index: number
): NativeDesignPoint {
  const id = `design-point-${String(index + 1).padStart(4, '0')}`,
    experiment = designCondition(source, point.values);
  let request: StudyPointRequest | null = null,
    unsupported: string | null = null;
  // Unsupported physical scope is retained as an exact canonical condition, never evaluated as a different model.
  const gamma = experiment.parameters.gamma,
    sourceGamma = source.parameters.gamma;
  if ((sourceGamma?.kind === 'scalar' && sourceGamma.value !== 0) || (gamma?.kind === 'scalar' && gamma.value !== 0))
    unsupported =
      '원본 또는 실효 γ>0 자동 λ 평가는 지원하지 않습니다. γ=0 원본을 실험실에서 명시적으로 선택하세요. 원래 감쇠 조건은 별도 일반 조건 큐에서 실행할 수 있습니다.';
  else request = nativeRequest(experiment, settings.evaluation, id);
  return { ...point, id, experiment, request, unsupported, work: request ? validateChaosJobRequest(request) : 0 };
}
function evaluated(input: EvaluatedPoint[], variables: StudyVariable[]): EvaluatedPoint[] {
  const values = batchData(input) as unknown as EvaluatedPoint[];
  if (!Array.isArray(values) || values.length > 256) throw new Error('평가점은 최대256개입니다.');
  for (const point of values) {
    closed(point, ['values', 'lambdaMax', 'lambdaStdError']);
    if (
      typeof point.lambdaMax !== 'number' ||
      typeof point.lambdaStdError !== 'number' ||
      !Number.isFinite(point.lambdaMax) ||
      !Number.isFinite(point.lambdaStdError) ||
      point.lambdaStdError < 0
    )
      throw new Error('유한한 native λ와0 이상 block 표준오차가 필요합니다.');
    if (
      Object.keys(point.values).length !== variables.length ||
      variables.some(
        (v) =>
          typeof point.values[v.key] !== 'number' ||
          !Number.isFinite(point.values[v.key]) ||
          point.values[v.key]! < v.min ||
          point.values[v.key]! > v.max
      )
    )
      throw new Error('평가점이 원래 변수 범위와 맞지 않습니다.');
  }
  return values;
}
function finalize(
  source: ExperimentStateV1,
  settings: NativeDesignSettings,
  refinements: NativeDesignRefinement[]
): NativeDesignPlan {
  const raw = generateDesign(settings.variables, settings.strategy, settings.count, {
    seedText: settings.seedText,
    replicates: settings.replicates,
    budget: settings.budget
  });
  for (const refinement of refinements) {
    closed(refinement, ['kind', 'maxNew', 'relativeThreshold', 'evidenceSource', 'evaluated']);
    if (!['adaptive', 'boundary', 'uncertainty'].includes(refinement.kind))
      throw new Error('지원하는 native refinement 종류가 필요합니다.');
    integer(refinement.maxNew, 1, 32, '추가 점');
    if (
      typeof refinement.relativeThreshold !== 'number' ||
      !Number.isFinite(refinement.relativeThreshold) ||
      refinement.relativeThreshold <= 0 ||
      refinement.relativeThreshold > 1000
    )
      throw new Error('불확실도 상대 임계값은0보다 크고1000 이하여야 합니다.');
    if (
      typeof refinement.evidenceSource !== 'string' ||
      refinement.evidenceSource.length < 3 ||
      refinement.evidenceSource.length > 512
    )
      throw new Error('λ·SE의 실제 출처를 명시하세요.');
    const points = evaluated(refinement.evaluated, settings.variables),
      room = settings.budget.maxPoints - raw.length;
    const next =
      refinement.kind === 'adaptive'
        ? adaptiveRefinement(points, settings.variables, refinement.maxNew)
        : refinement.kind === 'boundary'
          ? boundaryRefinement(points, settings.variables, refinement.maxNew)
          : uncertaintyResampling(points, refinement.maxNew, refinement.relativeThreshold);
    if (next.length > room) throw new Error('refinement 결과가 남은 점 예산을 넘습니다. 추가 점 수를 줄이세요.');
    raw.push(...next);
  }
  const points = raw.map((p, i) => buildPoint(source, settings, p, i)),
    estimatedWork = points.reduce((sum, p) => sum + p.work, 0);
  if (estimatedWork > NATIVE_DESIGN_LIMITS.work)
    throw new Error('native studyPoint 합계 작업 예산64000000을 넘습니다.');
  const identity = { source, settings, refinements };
  const plan: NativeDesignPlan = {
    schema: 'pendulum-native-design/v1',
    id: `native-design-${batchHash(identity)}`,
    ...identity,
    points,
    estimatedWork
  };
  batchData(plan);
  return plan;
}
export function generateNativeDesign(sourceInput: ExperimentStateV1, input: NativeDesignSettings): NativeDesignPlan {
  const source = batchData(sourceInput) as unknown as ExperimentStateV1;
  const check = validateExperimentState(source);
  if (!check.ok) throw new Error(check.issues.map((i) => i.message).join(' '));
  return finalize(source, checkedSettings(input), []);
}
export function refineNativeDesign(plan: NativeDesignPlan, input: NativeDesignRefinement): NativeDesignPlan {
  const checked = validateNativeDesign(plan);
  if (checked.refinements.length >= 16) throw new Error('한 설계에서 refinement는 최대16회입니다.');
  return finalize(checked.source, checked.settings, [
    ...checked.refinements,
    batchData(input) as unknown as NativeDesignRefinement
  ]);
}
export function validateNativeDesign(input: unknown): NativeDesignPlan {
  const value = batchData(input) as unknown as NativeDesignPlan;
  closed(value, ['schema', 'id', 'source', 'settings', 'refinements', 'points', 'estimatedWork']);
  if (
    value.schema !== 'pendulum-native-design/v1' ||
    !Array.isArray(value.refinements) ||
    value.refinements.length > 16
  )
    throw new Error('native 설계 파일 버전·refinement 목록이 잘못되었습니다.');
  const original = generateNativeDesign(value.source, value.settings);
  const rebuilt = finalize(original.source, original.settings, value.refinements);
  if (stableBatchJson(rebuilt) !== stableBatchJson(value))
    throw new Error('설계 입력·native 생성점·요청·작업량이 맞지 않습니다. 원본을 보존하세요.');
  return rebuilt;
}
export function validateStudyPointResult(input: unknown, request: StudyPointRequest): StudyPointResponse {
  const result = batchData(input) as unknown as StudyPointResponse;
  closed(result, [
    'id',
    'kind',
    'ok',
    'lambdaMax',
    'lambdaBlockStdError',
    'rqaDeterminism',
    'rqaDivergence',
    'ftle',
    'ftleHorizon'
  ]);
  if (
    result.id !== request.id ||
    result.kind !== 'studyPoint' ||
    result.ok !== true ||
    ['lambdaMax', 'lambdaBlockStdError', 'rqaDeterminism', 'rqaDivergence', 'ftle', 'ftleHorizon'].some(
      (k) =>
        typeof result[k as keyof StudyPointResponse] !== 'number' ||
        !Number.isFinite(result[k as keyof StudyPointResponse] as number)
    ) ||
    result.lambdaBlockStdError < 0 ||
    result.rqaDeterminism < 0 ||
    result.rqaDeterminism > 1 ||
    result.rqaDivergence < 0 ||
    result.rqaDivergence > 1 ||
    result.ftleHorizon !== (request.settings?.ftleHorizon ?? 5)
  )
    throw new Error('native studyPoint 결과 ID·필드·유한성·horizon이 잘못되었습니다.');
  return result;
}
