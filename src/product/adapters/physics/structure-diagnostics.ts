import { energyDouble } from '../../../physics/double';
import { energyCompoundDouble } from '../../../physics/compoundDouble';
import { energyTriple } from '../../../physics/energy';
import { createChainWorkspace, energyChain, rhsChain } from '../../../physics/nPendulum';
import { createTripleRhsWorkspace, rhsTriple } from '../../../physics/triple';
import { step } from '../../../physics/integrators';
import {
  canonicalRhs,
  canonicalStepThetaOmega,
  implicitMidpointCanonical,
  omegaToMomentum
} from '../../../physics/canonical';
import type { Derivative, StateVector, StepDiagnostics } from '../../../physics/types';
import { energyDriftProfile, type EnergyDriftProfile } from '../../../research/structurePreservation';
import {
  compareDoublePendulumFormulations,
  type FormulationComparisonPolicy,
  type FormulationComparisonResult
} from '../../../validation/formulationEquivalence';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import { fields, invalid } from '../../contracts/contract-checks';
import { issue, success, type ContractIssue, type ContractResult } from '../../contracts/validation';
import { canonicalJson, inspectSafeData, type JsonValue } from '../../persistence/safe-data';
import { createPlanarDerivative, fromCanonicalPlanar, type PlanarConfig } from './planar';
import { fromCanonicalChain, type ChainConfig } from './chain';
import { nativeOdeMethod } from './planar-integrators';

/** These are independent diagnostic settings, never edits to a running experiment. */
export interface StructureEnergySettings {
  readonly dt: number;
  readonly totalTime: number;
  readonly samples: number;
  readonly tolerance: number;
}
export interface StructureCanonicalSettings {
  readonly dt: number;
  readonly horizon: number;
  readonly tolerance: number;
  readonly maxIterations: number;
  readonly comparisonPolicy: FormulationComparisonPolicy;
}
export const STRUCTURE_ENERGY_DEFAULTS: StructureEnergySettings = Object.freeze({
  dt: 0.01,
  totalTime: 1,
  samples: 10,
  tolerance: 1e-12
});
export const STRUCTURE_CANONICAL_DEFAULTS: StructureCanonicalSettings = Object.freeze({
  dt: 0.01,
  horizon: 1,
  tolerance: 1e-12,
  maxIterations: 40,
  comparisonPolicy: 'reference'
});
export const STRUCTURE_MAX_STEPS = 10_000;
export const STRUCTURE_MAX_WEIGHTED_WORK = 10_000_000;

export interface StructureEnergyResult {
  readonly schema: 'pendulum-structure-energy/v1';
  readonly algorithmVersion: 'energy-drift-profile-native-v1';
  readonly source: 'energyDriftProfile';
  readonly experiment: ExperimentStateV1;
  readonly settings: StructureEnergySettings;
  readonly acceptance: {
    readonly policy: 'raw-native-no-retry';
    readonly steps: number;
    readonly acceptedSteps: number;
    readonly rejectedSteps: 0;
  };
  readonly profile: EnergyDriftProfile;
  readonly warnings: readonly string[];
}
type PlainComparison = Omit<
  FormulationComparisonResult,
  'finalThetaOmega' | 'finalCanonical' | 'finalCanonicalAsThetaOmega'
> & {
  readonly finalThetaOmega: readonly number[];
  readonly finalCanonical: readonly number[];
  readonly finalCanonicalAsThetaOmega: readonly number[];
};
type PlainCanonicalStep = {
  readonly state: readonly number[];
  readonly stats: { readonly residual: number; readonly iterations: number; readonly converged: boolean };
};
export interface StructureCanonicalResult {
  readonly schema: 'pendulum-structure-canonical/v1';
  readonly algorithmVersion: 'canonical-native-comparison-v1';
  readonly experiment: ExperimentStateV1;
  readonly settings: StructureCanonicalSettings;
  readonly initialCanonical: readonly number[];
  readonly rhs: { readonly source: 'canonicalRhs'; readonly value: readonly number[] };
  readonly midpoint: { readonly source: 'implicitMidpointCanonical' } & PlainCanonicalStep;
  readonly thetaOmegaStep: {
    readonly source: 'canonicalStepThetaOmega';
    readonly tolerance: 1e-10;
    readonly maxIterations: 12;
  } & PlainCanonicalStep;
  readonly coordinateComparison: {
    readonly source: 'compareDoublePendulumFormulations';
    readonly result: PlainComparison;
  };
  readonly warnings: readonly string[];
}
export type StructureDiagnosticResult = StructureEnergyResult | StructureCanonicalResult;

function numberIn(value: unknown, min: number, max: number, path: string, issues: ContractIssue[], integer = false) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    invalid(issues, path, `${min}–${max}${integer ? ' 정수' : ''} 범위의 유한한 수가 필요합니다.`);
}
function stepCount(totalTime: number, dt: number): number {
  return Math.round(totalTime / dt);
}
export function validateStructureEnergySettings(input: unknown): ContractResult<StructureEnergySettings> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  const issues: ContractIssue[] = [];
  if (!fields(safe.value, ['dt', 'totalTime', 'samples', 'tolerance'], [], '$', issues)) return { ok: false, issues };
  const value = safe.value;
  numberIn(value.dt, 1e-6, 0.05, '$.dt', issues);
  numberIn(value.totalTime, 1e-6, 100, '$.totalTime', issues);
  numberIn(value.samples, 3, 100, '$.samples', issues, true);
  numberIn(value.tolerance, 1e-15, 1, '$.tolerance', issues);
  if (issues.length) return { ok: false, issues };
  const settings = value as unknown as StructureEnergySettings,
    ratio = settings.totalTime / settings.dt,
    steps = stepCount(settings.totalTime, settings.dt);
  if (
    !Number.isSafeInteger(steps) ||
    steps < settings.samples ||
    steps > STRUCTURE_MAX_STEPS ||
    Math.abs(ratio - steps) > 32 * Number.EPSILON * Math.max(1, ratio) ||
    steps % settings.samples !== 0
  )
    invalid(
      issues,
      '$.totalTime',
      `관찰 시간/Δt는 표본 수로 나누어지는 ${settings.samples}–${STRUCTURE_MAX_STEPS} 정수여야 합니다. native 표본 시각을 반올림하거나 끝점을 생략하지 않습니다.`
    );
  return issues.length ? { ok: false, issues } : success(settings);
}
export function validateStructureCanonicalSettings(input: unknown): ContractResult<StructureCanonicalSettings> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  const issues: ContractIssue[] = [];
  if (!fields(safe.value, ['dt', 'horizon', 'tolerance', 'maxIterations', 'comparisonPolicy'], [], '$', issues))
    return { ok: false, issues };
  const value = safe.value;
  numberIn(value.dt, 1e-6, 0.05, '$.dt', issues);
  numberIn(value.horizon, 1e-6, 10, '$.horizon', issues);
  numberIn(value.tolerance, 1e-15, 1, '$.tolerance', issues);
  numberIn(value.maxIterations, 1, 100, '$.maxIterations', issues, true);
  if (value.comparisonPolicy !== 'interactive' && value.comparisonPolicy !== 'reference')
    invalid(issues, '$.comparisonPolicy', 'interactive 또는 reference 비교 정책이 필요합니다.');
  if (issues.length) return { ok: false, issues };
  const settings = value as unknown as StructureCanonicalSettings;
  if (settings.horizon < settings.dt || Math.ceil(settings.horizon / settings.dt) > STRUCTURE_MAX_STEPS)
    invalid(issues, '$.horizon', `비교 시간은 Δt 이상이고 최대 ${STRUCTURE_MAX_STEPS} 단계여야 합니다.`);
  return issues.length ? { ok: false, issues } : success(settings);
}
function requireValue<T>(result: ContractResult<T>): T {
  if (!result.ok) throw new Error(result.issues.map((entry) => `${entry.path}: ${entry.message}`).join(' '));
  return result.value;
}
function readConfig(experiment: unknown): ContractResult<PlanarConfig | ChainConfig> {
  const safe = inspectSafeData(experiment);
  if (!safe.ok) return safe;
  const value = safe.value;
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    if (value.systemId === 'system:double' || value.systemId === 'system:compound-double')
      return fromCanonicalPlanar(value);
    if (value.systemId === 'system:triple' || value.systemId === 'system:chain') return fromCanonicalChain(value);
  }
  return {
    ok: false,
    issues: [issue('unsupported-system', '$.systemId', '이 진단은 이중·복합·삼중·평면 사슬을 지원합니다.')]
  };
}
function engine(config: PlanarConfig | ChainConfig): {
  rhs: Derivative;
  energy: (state: StateVector) => number;
} {
  if (config.systemId === 'system:double' || config.systemId === 'system:compound-double') {
    const planar = config as PlanarConfig;
    return {
      rhs: createPlanarDerivative(planar),
      energy: (state) =>
        (planar.systemId === 'system:double' ? energyDouble : energyCompoundDouble)(state, planar.parameters).total
    };
  }
  const chain = config as ChainConfig;
  if (chain.systemId === 'system:triple') {
    const { masses: m, lengths: l, g } = chain.parameters,
      parameters = { m1: m[0]!, m2: m[1]!, m3: m[2]!, l1: l[0]!, l2: l[1]!, l3: l[2]!, g },
      workspace = createTripleRhsWorkspace();
    return {
      rhs: (state, out) => rhsTriple(state, parameters, chain.gamma, out, workspace),
      energy: (state) => energyTriple(state, parameters).total
    };
  }
  const workspace = createChainWorkspace(chain.parameters.masses.length);
  return {
    rhs: (state, out) => rhsChain(state, chain.parameters, chain.gamma, out, workspace),
    energy: (state) => energyChain(state, chain.parameters).total
  };
}
function conservative(config: PlanarConfig | ChainConfig) {
  if (config.gamma !== 0)
    throw new Error('보존계 구조 진단에는 감쇠 γ=0이 필요합니다. 현재 감쇠와 run은 바꾸지 않았습니다.');
}

/**
 * The existing profile ignores native rejected-step diagnostics. First replay
 * the exact raw stepping policy and refuse any unaccepted/nonfinite interval,
 * then call the unchanged native profile. No retry or replacement solver is used.
 */
export function computeStructureEnergy(experiment: unknown, input: unknown): StructureEnergyResult {
  const config = requireValue(readConfig(experiment)),
    settings = requireValue(validateStructureEnergySettings(input));
  conservative(config);
  const steps = stepCount(settings.totalTime, settings.dt),
    dimension = config.initialState.length;
  if (2 * steps * dimension ** 3 > STRUCTURE_MAX_WEIGHTED_WORK)
    throw new Error('구조 진단의 차원·단계 작업 상한을 넘었습니다. 관찰 시간을 줄이거나 Δt를 늘리세요.');
  const native = engine(config),
    method = nativeOdeMethod(config.integratorId),
    state = Float64Array.from(config.initialState),
    out = new Float64Array(dimension),
    previousError = { value: 0 };
  const energy0 = native.energy(state);
  if (!Number.isFinite(energy0)) throw new Error('초기 에너지가 유한하지 않습니다.');
  for (let index = 0; index < steps; index++) {
    const diagnostics: Partial<StepDiagnostics> = {};
    step(method, state, settings.dt, native.rhs, out, {
      previousError,
      tolerance: settings.tolerance,
      diagnostics
    });
    if (diagnostics.accepted === false || diagnostics.converged === false)
      throw new Error(
        `native ${method} ${index + 1}단계를 수락하지 못했습니다 (${diagnostics.failureReason ?? '미수렴'}). 거부된 상태를 에너지 보존으로 판정하지 않습니다.`
      );
    if (![...out, native.energy(out)].every(Number.isFinite))
      throw new Error('native 적분 상태·에너지가 유한하지 않습니다.');
    state.set(out);
  }
  const profile = energyDriftProfile({
    method,
    rhs: native.rhs,
    energy: native.energy,
    initialState: config.initialState,
    ...settings
  });
  requireValue(inspectSafeData(profile));
  return {
    schema: 'pendulum-structure-energy/v1',
    algorithmVersion: 'energy-drift-profile-native-v1',
    source: 'energyDriftProfile',
    experiment: requireValue(inspectSafeData(experiment)) as unknown as ExperimentStateV1,
    settings,
    acceptance: { policy: 'raw-native-no-retry', steps, acceptedSteps: steps, rejectedSteps: 0 },
    profile,
    warnings: [
      '현재 설정의 초기 상태에서 별도 진단을 실행했습니다. 실행 중인 진자의 상태·시간을 변경하지 않습니다.',
      'native energyDriftProfile의 고정 간격·이전 오차 상태·명시한 허용오차를 그대로 사용했습니다. Lab의 two-half-step 재시도 정책과 구분하세요.',
      '유한 시간의 bounded/secular 분류는 관찰된 에너지 추세입니다. θ/ω 좌표의 심플렉틱성이나 장시간 보존을 증명하지 않습니다.',
      ...(energy0 === 0
        ? ['초기 총에너지가 0이므로 native 함수는 분모 1을 사용합니다. drift는 상대 오차가 아닌 에너지 차이입니다.']
        : [])
    ]
  };
}
function convergedFinite(
  result: { state: Float64Array; stats: { residual: number; converged: boolean } },
  name: string
) {
  if (!result.stats.converged || ![...result.state, result.stats.residual].every(Number.isFinite))
    throw new Error(`${name} native 한 단계가 미수렴 또는 비유한 상태입니다. 원래 run을 보존했습니다.`);
}
/** Three actual native canonical functions, plus an independently labeled RK4 coordinate comparison. */
export function computeStructureCanonical(experiment: unknown, input: unknown): StructureCanonicalResult {
  const config = requireValue(readConfig(experiment)),
    settings = requireValue(validateStructureCanonicalSettings(input));
  if (config.systemId !== 'system:double')
    throw new Error(
      '정준 RHS·한 단계·좌표 비교는 점질량 이중진자만 지원합니다. 현재 모델을 다른 방정식으로 바꾸지 않습니다.'
    );
  conservative(config);
  const planar = config as PlanarConfig,
    initialCanonical = omegaToMomentum(planar.initialState, planar.parameters),
    rhs = canonicalRhs(initialCanonical, planar.parameters, 0),
    midpoint = implicitMidpointCanonical(
      initialCanonical,
      settings.dt,
      planar.parameters,
      0,
      settings.tolerance,
      settings.maxIterations
    ),
    thetaOmegaStep = canonicalStepThetaOmega(planar.initialState, settings.dt, planar.parameters, 0);
  convergedFinite(midpoint, 'implicitMidpointCanonical');
  convergedFinite(thetaOmegaStep, 'canonicalStepThetaOmega');
  const compared = compareDoublePendulumFormulations({
    parameters: planar.parameters,
    initialState: planar.initialState,
    gamma: 0,
    dt: settings.dt,
    horizon: settings.horizon,
    comparisonPolicy: settings.comparisonPolicy
  });
  const result: StructureCanonicalResult = {
    schema: 'pendulum-structure-canonical/v1',
    algorithmVersion: 'canonical-native-comparison-v1',
    experiment: requireValue(inspectSafeData(experiment)) as unknown as ExperimentStateV1,
    settings,
    initialCanonical: [...initialCanonical],
    rhs: { source: 'canonicalRhs', value: [...rhs] },
    midpoint: { source: 'implicitMidpointCanonical', state: [...midpoint.state], stats: midpoint.stats },
    thetaOmegaStep: {
      source: 'canonicalStepThetaOmega',
      state: [...thetaOmegaStep.state],
      stats: thetaOmegaStep.stats,
      tolerance: 1e-10,
      maxIterations: 12
    },
    coordinateComparison: {
      source: 'compareDoublePendulumFormulations',
      result: {
        ...compared,
        finalThetaOmega: [...compared.finalThetaOmega],
        finalCanonical: [...compared.finalCanonical],
        finalCanonicalAsThetaOmega: [...compared.finalCanonicalAsThetaOmega]
      }
    },
    warnings: [
      '정준 RHS와 두 native 한 단계는 현재 초기 상태의 독립 진단입니다. 기존 실행 적분기·run을 변경하지 않습니다.',
      'implicitMidpointCanonical은 명시한 허용오차·최대 반복 수를 사용합니다. canonicalStepThetaOmega는 native 기본 허용오차 1e-10·최대 12회를 유지합니다.',
      '좌표 비교는 두 좌표계에 같은 고정 RK4를 적용합니다. 이 결과는 implicit midpoint 궤적 비교나 장시간 혼돈 궤적의 일치를 뜻하지 않습니다.',
      compared.caveat
    ]
  };
  requireValue(inspectSafeData(result));
  return result;
}
export function serializeStructureArtifact(result: StructureDiagnosticResult): string {
  const safe = requireValue(inspectSafeData(result));
  return canonicalJson(safe as JsonValue);
}
