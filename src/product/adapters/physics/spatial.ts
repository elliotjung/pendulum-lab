import { SphericalPendulum, sphericalEnergy, type SphericalState } from '../../../physics/spherical';
import {
  EmbeddedSphericalPendulum,
  sphericalEmbeddedEnergy,
  angleToEmbedded,
  type EmbeddedSphericalState
} from '../../../physics/sphericalEmbedded';
import { SphericalChain, sphericalChainEnergy, sphericalChainVelocities } from '../../../physics/sphericalChain';
import {
  EmbeddedSphericalChain,
  embeddedChainEnergy,
  embeddedChainVelocities,
  angleChainToEmbedded
} from '../../../physics/sphericalEmbeddedChain';
import { inspectSafeData } from '../../persistence/safe-data';
import { validateExperimentState } from '../../contracts/experiment-validation';
import { EXPERIMENT_SCHEMA, type ExperimentStateV1 } from '../../contracts/experiment';
import type { CanonicalUnit, QuantityValue } from '../../contracts/quantities';
import { issue, success, type ContractIssue, type ContractResult } from '../../contracts/validation';
import {
  SPATIAL_SYSTEM_IDS,
  SPATIAL_INTEGRATOR_IDS,
  SPATIAL_MODEL_VERSION,
  SPATIAL_INTEGRATOR_VERSION,
  MAX_SPATIAL_LINKS,
  MAX_SPATIAL_STEPS,
  spatialIsChain,
  spatialIsEmbedded,
  type SpatialConfig,
  type SpatialSample
} from './spatial-schema';
export * from './spatial-schema';

export class SpatialConfigurationError extends Error {
  constructor(readonly issues: readonly ContractIssue[]) {
    super(issues.map((entry) => `${entry.path}: ${entry.message}`).join('\n'));
    this.name = 'SpatialConfigurationError';
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
function rawCanonical(config: SpatialConfig): ExperimentStateV1 {
  const embedded = spatialIsEmbedded(config.systemId),
    n = config.parameters.masses.length,
    p = config.parameters,
    s = config.initialState;
  const initialConditions: Record<string, QuantityValue> = embedded
    ? {
        direction: { kind: 'vector', values: s.slice(0, 3 * n), unit: '1' },
        directionRate: { kind: 'vector', values: s.slice(3 * n), unit: 's^-1' }
      }
    : {
        angles: { kind: 'vector', values: s.slice(0, 2 * n), unit: 'rad' },
        angularRates: { kind: 'vector', values: s.slice(2 * n), unit: 'rad/s' }
      };
  return {
    schema: EXPERIMENT_SCHEMA,
    systemId: config.systemId,
    modelVersion: SPATIAL_MODEL_VERSION,
    parameters: {
      masses: { kind: 'vector', values: p.masses, unit: 'kg' },
      lengths: { kind: 'vector', values: p.lengths, unit: 'm' },
      g: { kind: 'scalar', value: p.g, unit: 'm/s^2' },
      damping: { kind: 'scalar', value: p.damping, unit: 's^-1' }
    },
    initialConditions,
    integrator:
      config.integratorId === 'internal'
        ? { kind: 'internal', version: SPATIAL_INTEGRATOR_VERSION, settings: {} }
        : { kind: 'selectable', id: config.integratorId, version: SPATIAL_INTEGRATOR_VERSION, settings: {} },
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
/** Closed, detached native-coordinate restart contract. Invalid embedded constraints are rejected, never silently repaired. */
export function validateSpatialConfig(input: unknown): ContractResult<SpatialConfig> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  const v = safe.value;
  if (!record(v)) return { ok: false, issues: [issue('invalid-config', '$', '공간 진자 설정 객체가 필요합니다.')] };
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
  for (const key of ['startTime', 'sampleEvery', 'analyses'])
    if (Object.hasOwn(v, key) && v[key] === null)
      issues.push(issue('invalid-config', `$.${key}`, '선택 설정은 생략하거나 유효한 값을 입력하세요.'));
  if (Array.isArray(v.analyses) && v.analyses.length)
    issues.push(
      issue(
        'unsupported-analysis',
        '$.analyses',
        '공간 진자는 에너지·각운동량·구속 잔차를 기본으로 표시합니다. 별도 분석 요청은 아직 지원하지 않으므로 원본을 보존하세요.',
        'keep-original'
      )
    );
  if (!(SPATIAL_SYSTEM_IDS as readonly unknown[]).includes(v.systemId))
    issues.push(issue('unsupported-system', '$.systemId', '지원하는 구면·매입 좌표 시스템을 선택하세요.'));
  if (
    v.systemId === 'system:spherical-chain'
      ? !(SPATIAL_INTEGRATOR_IDS as readonly unknown[]).includes(v.integratorId)
      : v.integratorId !== 'internal'
  )
    issues.push(
      issue(
        'unsupported-integrator',
        '$.integratorId',
        '극좌표 사슬은 RK4/RK2/Euler, 나머지는 기존 내부 RK4를 사용합니다.'
      )
    );
  const p = record(v.parameters) ? v.parameters : {};
  closed(p, ['masses', 'lengths', 'g', 'damping'], '$.parameters', issues);
  const masses = Array.isArray(p.masses) ? p.masses : [],
    lengths = Array.isArray(p.lengths) ? p.lengths : [],
    n = masses.length;
  if (n < 1 || n > MAX_SPATIAL_LINKS || n !== lengths.length || (!spatialIsChain(String(v.systemId)) && n !== 1))
    issues.push(
      issue(
        'invalid-dimension',
        '$.parameters',
        `단일은 1개, 사슬은 1–${MAX_SPATIAL_LINKS}개 질량과 길이가 필요합니다.`
      )
    );
  const range = (x: unknown, min: number, max: number, path: string) => {
    if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max)
      issues.push(issue('invalid-range', path, `${min}–${max} 범위의 유한한 수가 필요합니다.`));
  };
  for (let i = 0; i < Math.min(n, MAX_SPATIAL_LINKS); i++) {
    range(masses[i], 0.001, 1000, `$.parameters.masses[${i}]`);
    range(lengths[i], 0.001, 1000, `$.parameters.lengths[${i}]`);
  }
  range(p.g, spatialIsChain(String(v.systemId)) ? 0.001 : 0, 1000, '$.parameters.g');
  range(p.damping, 0, 1000, '$.parameters.damping');
  const embedded = spatialIsEmbedded(String(v.systemId)),
    initial = Array.isArray(v.initialState) ? v.initialState : [];
  if (initial.length !== (embedded ? 6 : 4) * n)
    issues.push(issue('invalid-dimension', '$.initialState', '선택한 좌표계와 링크 수에 맞는 상태 차원이 필요합니다.'));
  for (let i = 0; i < Math.min(initial.length, 6 * MAX_SPATIAL_LINKS); i++)
    range(initial[i], -10000, 10000, `$.initialState[${i}]`);
  if (embedded && initial.length === 6 * n)
    for (let k = 0; k < n; k++) {
      const u = initial.slice(3 * k, 3 * k + 3) as number[],
        w = initial.slice(3 * n + 3 * k, 3 * n + 3 * k + 3) as number[];
      if (Math.abs(Math.hypot(...u) - 1) > 1e-9 || Math.abs(u.reduce((sum, x, i) => sum + x * w[i]!, 0)) > 1e-9)
        issues.push(
          issue(
            'invalid-constraint',
            `$.initialState[${3 * k}]`,
            '매입 방향은 단위벡터이고 방향 속도는 접선이어야 합니다: |u|=1, u·w=0.'
          )
        );
    }
  range(v.step, 1e-6, 0.05, '$.step');
  range(v.duration, 1e-6, 300, '$.duration');
  const sampleEvery = v.sampleEvery ?? 1;
  if (!Number.isInteger(sampleEvery))
    issues.push(issue('invalid-sampling', '$.sampleEvery', '표본 간격은 정수여야 합니다.'));
  range(sampleEvery, 1, MAX_SPATIAL_STEPS, '$.sampleEvery');
  if (
    typeof v.step === 'number' &&
    typeof v.duration === 'number' &&
    (v.step > v.duration ||
      Math.ceil(v.duration / v.step - (8 * Number.EPSILON * v.duration) / v.step) > MAX_SPATIAL_STEPS)
  )
    issues.push(
      issue('step-budget', '$.runtime', `시간 간격은 관찰 시간 이하이며 최대 ${MAX_SPATIAL_STEPS}단계를 지원합니다.`)
    );
  if (issues.length) return { ok: false, issues };
  const config = v as unknown as SpatialConfig,
    canonical = validateExperimentState(rawCanonical(config));
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
function createUncheckedSimulation(config: SpatialConfig) {
  const p = config.parameters,
    n = p.masses.length,
    embedded = spatialIsEmbedded(config.systemId),
    single = !spatialIsChain(config.systemId);
  const params = { l: p.lengths[0]!, g: p.g, damping: p.damping };
  const engine =
    config.systemId === 'system:spherical'
      ? new SphericalPendulum(params, config.initialState as unknown as SphericalState, config.step)
      : config.systemId === 'system:spherical-embedded'
        ? new EmbeddedSphericalPendulum(params, config.initialState as unknown as EmbeddedSphericalState, config.step)
        : config.systemId === 'system:spherical-chain'
          ? new SphericalChain(p, config.initialState, {
              dt: config.step,
              method:
                config.integratorId === 'integrator:euler'
                  ? 'euler'
                  : config.integratorId === 'integrator:rk2'
                    ? 'rk2'
                    : 'rk4'
            })
          : new EmbeddedSphericalChain(p, Float64Array.from(config.initialState), config.step);
  const ratio = config.duration / config.step,
    total = Math.ceil(ratio - 8 * Number.EPSILON * ratio);
  let index = 0,
    failure: Error | undefined;
  function sample(step: number): SpatialSample {
    const state = Array.from(engine.current());
    const positions = 'positions' in engine ? engine.positions() : [engine.position()];
    // All single-model kinematics pass through the legacy coordinate conversion, including zero gravity.
    const nativeEmbedded = embedded
      ? state
      : single
        ? [...angleToEmbedded(state as unknown as SphericalState)]
        : Array.from(angleChainToEmbedded(state, n));
    const velocities = single
      ? [{ x: params.l * nativeEmbedded[3]!, y: params.l * nativeEmbedded[4]!, z: params.l * nativeEmbedded[5]! }]
      : embedded
        ? embeddedChainVelocities(state, p)
        : sphericalChainVelocities(state, p);
    let energy;
    if (single) {
      const totalEnergy =
        p.masses[0]! *
        (embedded
          ? sphericalEmbeddedEnergy(state as unknown as EmbeddedSphericalState, params)
          : sphericalEnergy(state as unknown as SphericalState, params));
      const PE = p.masses[0]! * p.g * positions[0]!.y;
      energy = { total: totalEnergy, PE, KE: totalEnergy - PE };
    } else energy = embedded ? embeddedChainEnergy(state, p) : sphericalChainEnergy(state, p);
    const angularMomentum = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < n; i++) {
      const r = positions[i]!,
        v = velocities[i]!,
        m = p.masses[i]!;
      angularMomentum.x += m * (r.y * v.z - r.z * v.y);
      angularMomentum.y += m * (r.z * v.x - r.x * v.z);
      angularMomentum.z += m * (r.x * v.y - r.y * v.x);
    }
    const constraintErrors: number[] = [],
      unitConstraintErrors: number[] = [],
      tangentConstraintErrors: number[] = [],
      poleProximity: number[] = [];
    for (let k = 0; k < n; k++) {
      const u = nativeEmbedded.slice(3 * k, 3 * k + 3),
        w = nativeEmbedded.slice(3 * n + 3 * k, 3 * n + 3 * k + 3),
        r = positions[k]!,
        prev = positions[k - 1] ?? { x: 0, y: 0, z: 0 };
      constraintErrors.push(Math.abs(Math.hypot(r.x - prev.x, r.y - prev.y, r.z - prev.z) - p.lengths[k]!));
      unitConstraintErrors.push(Math.abs(Math.hypot(...u) - 1));
      tangentConstraintErrors.push(Math.abs(u.reduce((sum, x, i) => sum + x * w[i]!, 0)));
      poleProximity.push(Math.hypot(u[0]!, u[2]!));
    }
    const values = [
      ...state,
      ...positions.flatMap(Object.values),
      ...velocities.flatMap(Object.values),
      ...Object.values(energy),
      ...Object.values(angularMomentum),
      ...constraintErrors,
      ...unitConstraintErrors,
      ...tangentConstraintErrors,
      ...poleProximity
    ];
    if (!values.every(Number.isFinite))
      throw new Error(
        '계산값이 유한하지 않습니다. 마지막 유효 상태에서 중지했습니다. 시간 간격과 초기조건을 조절하세요.'
      );
    const warnings: string[] = [];
    if (poleProximity.some((x) => x < 1e-3))
      warnings.push(
        embedded
          ? '극점 부근입니다. 매입 좌표는 유효하지만 방위각은 정의되지 않거나 불안정합니다.'
          : '극좌표 특이점 부근입니다. 정규화 오차를 확인하고 매입 좌표로 비교하세요.'
      );
    if (constraintErrors.some((x) => x > 1e-6) || tangentConstraintErrors.some((x) => x > 1e-6))
      warnings.push('구속 잔차가 큽니다. 시간 간격을 줄여 결과를 비교하세요.');
    return {
      step,
      time: (config.startTime ?? 0) + Math.min(step * config.step, config.duration),
      state,
      positions,
      velocities,
      energy,
      angularMomentum,
      verticalMomentum: angularMomentum.y,
      constraintErrors,
      unitConstraintErrors,
      tangentConstraintErrors,
      poleProximity,
      warnings
    };
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
        const remaining = config.duration - index * config.step,
          dt =
            Math.abs(remaining - config.step) <= 8 * Number.EPSILON * config.duration
              ? config.step
              : Math.min(config.step, remaining);
        engine.step(dt);
        accepted = sample(index + 1);
        index++;
        return structuredClone(accepted);
      } catch (cause) {
        failure = cause instanceof Error ? cause : new Error('공간 진자 계산 실패');
        throw failure;
      }
    }
  };
}
export function createSpatialSimulation(input: SpatialConfig) {
  const checked = validateSpatialConfig(input);
  if (!checked.ok) throw new SpatialConfigurationError(checked.issues);
  return createUncheckedSimulation(checked.value);
}
export function toCanonicalSpatial(config: SpatialConfig): ContractResult<ExperimentStateV1> {
  const checked = validateSpatialConfig(config);
  return checked.ok ? validateExperimentState(rawCanonical(checked.value)) : checked;
}
export function fromCanonicalSpatial(input: unknown): ContractResult<SpatialConfig> {
  const parsed = validateExperimentState(input);
  if (!parsed.ok) return parsed;
  const v = parsed.value,
    issues: ContractIssue[] = [];
  if (v.modelVersion !== SPATIAL_MODEL_VERSION || v.integrator.version !== SPATIAL_INTEGRATOR_VERSION)
    issues.push(
      issue('unsupported-version', '$', '지원하지 않는 공간 모델·적분기 버전입니다.', 'use-supported-version')
    );
  if (v.modelOptions !== undefined || v.integrator.options !== undefined || Object.keys(v.integrator.settings).length)
    issues.push(issue('unsupported-options', '$', '표현할 수 없는 모델·적분기 옵션입니다.', 'keep-original'));
  if (v.runtime.domain !== 'time')
    return {
      ok: false,
      issues: [...issues, issue('unsupported-runtime', '$.runtime', '시간 기반 설정이 필요합니다.')]
    };
  const embedded = spatialIsEmbedded(v.systemId),
    names = embedded ? ['direction', 'directionRate'] : ['angles', 'angularRates'];
  closed(v.parameters, ['masses', 'lengths', 'g', 'damping'], '$.parameters', issues);
  closed(v.initialConditions, names, '$.initialConditions', issues);
  const read = (
    group: 'parameters' | 'initialConditions',
    key: string,
    unit: CanonicalUnit,
    kind: 'scalar' | 'vector'
  ): number | readonly number[] => {
    const q = v[group][key];
    if (!q || q.kind !== kind || q.unit !== unit) {
      issues.push(
        issue('invalid-unit', `$.${group}.${key}`, `${key}: ${unit} ${kind} 값이 필요합니다.`, 'keep-original')
      );
      return kind === 'scalar' ? 0 : [];
    }
    return q.kind === 'scalar' ? q.value : q.kind === 'vector' ? q.values : [];
  };
  const parameters = {
    masses: read('parameters', 'masses', 'kg', 'vector') as readonly number[],
    lengths: read('parameters', 'lengths', 'm', 'vector') as readonly number[],
    g: read('parameters', 'g', 'm/s^2', 'scalar') as number,
    damping: read('parameters', 'damping', 's^-1', 'scalar') as number
  };
  const initialState = [
    ...(read('initialConditions', names[0]!, embedded ? '1' : 'rad', 'vector') as readonly number[]),
    ...(read('initialConditions', names[1]!, embedded ? 's^-1' : 'rad/s', 'vector') as readonly number[])
  ];
  const width = (embedded ? 3 : 2) * parameters.masses.length;
  if (
    names.some((name) => {
      const q = v.initialConditions[name];
      return q?.kind !== 'vector' || q.values.length !== width;
    })
  )
    issues.push(issue('invalid-dimension', '$.initialConditions', '좌표와 속도 벡터 차원이 링크 수에 맞아야 합니다.'));
  if (issues.length) return { ok: false, issues };
  return validateSpatialConfig({
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
