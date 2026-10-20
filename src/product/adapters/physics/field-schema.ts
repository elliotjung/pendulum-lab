import { createFputModeState } from '../../../physics/fput';
import { sineGordonKink, sineGordonKinkRate } from '../../../physics/sineGordon';
import type { AnalysisState, ExperimentProvenance, SeedState } from '../../contracts/experiment';
import type { CanonicalUnit } from '../../contracts/quantities';

export const FIELD_SYSTEM_IDS = [
  'system:langevin',
  'system:fput',
  'system:lattice-fk-limit',
  'system:sine-gordon',
  'system:frenkel-kontorova'
] as const;
export type FieldSystemId = (typeof FIELD_SYSTEM_IDS)[number];
export const FIELD_MODEL_VERSION = 'field-model-v1';
export const FIELD_INTEGRATOR_VERSION = 'field-native-v1';
export const FIELD_SEED_GENERATOR = 'fnv1a-mulberry32-boxmuller';
export const MAX_FIELD_POINTS = 128;
export const MAX_FIELD_MEMBERS = 64;
export const MAX_FIELD_STEPS = 100_000;
export const MAX_FIELD_WORK = 2_000_000;
export const FIELD_MAX_SAMPLES = 1001;
export const fieldIsDiagnostic = (id: string) => id === 'system:lattice-fk-limit' || id === 'system:frenkel-kontorova';
export interface FieldGrid {
  readonly points: number;
  readonly length: number;
  readonly boundary: 'fixed' | 'periodic';
}
export interface FieldConfig {
  readonly systemId: FieldSystemId;
  readonly parameters: Readonly<Record<string, number>>;
  readonly grid: FieldGrid;
  readonly initialState: readonly number[];
  readonly previousField?: readonly number[];
  readonly integratorId: 'internal';
  readonly step: number;
  readonly duration: number;
  readonly startTime?: number;
  readonly sampleEvery?: number;
  readonly seed: SeedState;
  readonly ensemble: { readonly members: number };
  readonly analyses?: readonly AnalysisState[];
  readonly provenance?: ExperimentProvenance;
}
export type FieldRunConfig = FieldConfig;
export interface FieldEnsembleProvenance {
  readonly members: number;
  readonly seeds: readonly number[];
  readonly generator: string;
  readonly generatorVersion: string;
  readonly seedValue: string;
  readonly memberIds: readonly string[];
}
export interface FieldSample {
  readonly step: number;
  readonly time: number;
  readonly state: readonly number[];
  readonly profile: readonly number[];
  readonly variance: readonly number[];
  readonly mean: readonly number[];
  readonly memberStates: readonly (readonly number[])[];
  readonly previousField: readonly number[];
  readonly energy: number;
  readonly energyUnit: string;
  readonly modeEnergies: readonly number[];
  readonly charge: number;
  readonly gradNorm: number;
  readonly converged: boolean;
  readonly iterations: number;
  readonly ensemble: FieldEnsembleProvenance;
  readonly warnings: readonly string[];
}
export interface FieldParameterField {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly canonicalUnit: CanonicalUnit;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}
const f = (key: string, label: string, min: number, max: number, step = 0.01): FieldParameterField => ({
  key,
  label,
  unit: '정규화',
  canonicalUnit: '1',
  min,
  max,
  step
});
export function fieldParameterFields(id: FieldSystemId): readonly FieldParameterField[] {
  if (id === 'system:langevin') return [f('damping', '감쇠 γ', 0, 10), f('noise', '가산 속도 잡음 σ', 0, 5)];
  if (id === 'system:fput') return [f('alpha', '3차 결합 α', -2, 2), f('beta', '4차 결합 β', 0, 5)];
  if (id === 'system:lattice-fk-limit')
    return [f('onsiteOmegaSq', '기판 고유진동수 제곱', 0, 20), f('couplingRate', '결합률', 0, 20)];
  if (id === 'system:frenkel-kontorova')
    return [
      f('coupling', '기판 상대 결합 K', 0.01, 20),
      f('centerOffset', '초기 중심 오프셋', -1, 1),
      f('maxIterations', 'Newton 최대 반복', 1, 200, 1),
      f('tolerance', '기울기 허용치', 1e-12, 0.01, 1e-9)
    ];
  return [];
}
/** Stable member identities own independent native Gaussian streams, independent of ensemble size. */
export function fieldMemberSeed(value: string, index: number): number {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value))
    throw new RangeError('지원하는 ASCII seed 문자열이 필요합니다.');
  if (!Number.isInteger(index) || index < 0 || index >= MAX_FIELD_MEMBERS)
    throw new RangeError('앙상블 멤버 번호를 확인하세요.');
  let hash = 2166136261;
  for (const char of `${value}:member-${index + 1}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
export function fieldEnsembleProvenance(c: FieldConfig): FieldEnsembleProvenance {
  return {
    members: c.ensemble.members,
    seeds: Array.from({ length: c.ensemble.members }, (_, i) => fieldMemberSeed(c.seed.value, i)),
    generator: c.seed.generator,
    generatorVersion: c.seed.generatorVersion,
    seedValue: c.seed.value,
    memberIds: Array.from({ length: c.ensemble.members }, (_, i) => `member-${i + 1}`)
  };
}
export function defaultFieldConfig(systemId: FieldSystemId = 'system:langevin'): FieldConfig {
  if (!(FIELD_SYSTEM_IDS as readonly string[]).includes(systemId))
    throw new RangeError('지원하는 장 모델을 선택하세요.');
  const points =
    systemId === 'system:langevin'
      ? 1
      : systemId === 'system:fput'
        ? 16
        : systemId === 'system:lattice-fk-limit'
          ? 32
          : 81;
  const length = systemId === 'system:sine-gordon' ? 30 : systemId === 'system:langevin' ? 1 : points - 1;
  const base: FieldConfig = {
    systemId,
    parameters:
      systemId === 'system:langevin'
        ? { damping: 0.2, noise: 0.4 }
        : systemId === 'system:fput'
          ? { alpha: 0.25, beta: 0 }
          : systemId === 'system:lattice-fk-limit'
            ? { onsiteOmegaSq: 1, couplingRate: 1 }
            : systemId === 'system:frenkel-kontorova'
              ? { coupling: 1, centerOffset: 0, maxIterations: 80, tolerance: 1e-9 }
              : {},
    grid: { points, length, boundary: systemId === 'system:lattice-fk-limit' ? 'periodic' : 'fixed' },
    initialState: [],
    integratorId: 'internal',
    step: 0.01,
    duration: 10,
    startTime: 0,
    sampleEvery: 1,
    seed: { value: 'field-16', generator: FIELD_SEED_GENERATOR, generatorVersion: '1' },
    ensemble: { members: systemId === 'system:langevin' ? 16 : 1 },
    analyses: []
  };
  return resizeFieldConfig(base, points);
}
/** Grid changes explicitly reset initial data; a previous leapfrog level cannot survive a changed mesh. */
export function resizeFieldConfig(c: FieldConfig, points: number): FieldConfig {
  const min =
    c.systemId === 'system:langevin'
      ? 1
      : c.systemId === 'system:fput' || c.systemId === 'system:lattice-fk-limit'
        ? 2
        : c.systemId === 'system:frenkel-kontorova'
          ? 5
          : 3;
  if (
    !Number.isInteger(points) ||
    points < min ||
    points > MAX_FIELD_POINTS ||
    (c.systemId === 'system:langevin' && points !== 1)
  )
    throw new RangeError('이 모델의 격자 범위를 확인하세요.');
  const { previousField: _previous, ...rest } = c;
  const grid = {
    ...c.grid,
    points,
    length: c.systemId === 'system:sine-gordon' ? c.grid.length : c.systemId === 'system:langevin' ? 1 : points - 1
  };
  const initialState =
    c.systemId === 'system:langevin'
      ? [0.5, 0]
      : c.systemId === 'system:fput'
        ? Array.from(createFputModeState(points, 1, 0.5))
        : c.systemId === 'system:sine-gordon'
          ? [
              ...Array.from({ length: points }, (_, i) =>
                sineGordonKink((i * grid.length) / (grid.boundary === 'periodic' ? points : points - 1), 0, {
                  velocity: 0.2,
                  center: grid.length / 2
                })
              ),
              ...Array.from({ length: points }, (_, i) =>
                sineGordonKinkRate((i * grid.length) / (grid.boundary === 'periodic' ? points : points - 1), 0, {
                  velocity: 0.2,
                  center: grid.length / 2
                })
              )
            ]
          : [];
  return { ...structuredClone(rest), grid, initialState };
}
export function fieldWarnings(c: FieldConfig): string[] {
  return [
    '이 adapter의 시간·공간·상태·에너지는 정규화 값입니다. canonical 시간 슬롯의 s는 저장 호환용이며 modelOptions.timeConvention=normalized가 해석을 지정합니다.',
    `격자 최대 ${MAX_FIELD_POINTS}, 앙상블 최대 ${MAX_FIELD_MEMBERS}, 최대 ${MAX_FIELD_STEPS} 단계·${MAX_FIELD_WORK} member/grid 작업. 시간 간격과 공간 격자를 세분화하여 수렴을 확인하세요.`,
    ...(c.systemId === 'system:langevin'
      ? [
          '단위 질량·길이·중력의 단일 진자에 속도 가산 Itô 잡음을 넣은 Euler–Maruyama 모델입니다. 잡음과 감쇠는 독립 설정이며 열평형 fluctuation–dissipation 관계를 강제하지 않습니다. 평균은 unwrapped θ의 산술 평균이며 분산은 n−1 표본 분산입니다. 같은 seed·설정·버전에서 같은 경로를 재현하며 dt 변경 시 동일 Brownian path를 보장하지 않습니다.'
        ]
      : []),
    ...(c.systemId === 'system:fput'
      ? [
          'FPUT는 양 끝에 변위 0인 벽을 가진 단위 질량 사슬이며 native velocity-Verlet를 사용합니다. mode energy는 조화 성분만 나타냅니다. α≠0, β=0인 cubic potential은 전역적으로 구속하지 않습니다.'
        ]
      : []),
    ...(c.systemId === 'system:sine-gordon'
      ? [
          'c=1, 기판 진동수=1인 연속체 장의 격자 근사입니다. dt·sqrt(4/dx²+1)≤1.9의 보수적 안정성 한계와 일정 dt를 요구합니다. fixed는 끝 값을 유지하고 periodic은 양 끝을 잇습니다. 관측 속도·에너지는 backward time difference로 계산합니다. native 초기 uPrev는 끝점도 Taylor back-step으로 만들므로 fixed 경계의 초기 에너지·속도에 시작 오차가 있습니다. 끝점 차이의 charge는 periodic winding의 증명이 아닙니다.'
        ]
      : []),
    ...(c.systemId === 'system:lattice-fk-limit'
      ? [
          '고리의 작은 진폭 조화 phonon 분산을 직접 평가합니다. 프로필은 격자 위치가 아닌 모드별 진동수 제곱 ω²이며 시간 전파·비선형 breather·depinning 계산이 아닙니다.'
        ]
      : []),
    ...(c.systemId === 'system:frenkel-kontorova'
      ? [
          '고정 0→2π 경계의 native Newton stationary kink 계산입니다. 기울기 허용치·반복 수와 함께 판단하세요. stationary 해는 saddle일 수 있으며 pinning 장벽·depinning·비정합 동역학을 계산하지 않습니다.'
        ]
      : [])
  ];
}
export const createFieldExperiment = defaultFieldConfig;
