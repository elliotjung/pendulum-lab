import type { EnergyBreakdown } from '../../../types/domain';
import type { SphericalChainParams } from '../../../physics/sphericalChain';
import { angleChainToEmbedded, embeddedChainToAngle } from '../../../physics/sphericalEmbeddedChain';
import type { AnalysisState, ExperimentProvenance, SeedState } from '../../contracts/experiment';

export const SPATIAL_SYSTEM_IDS = [
  'system:spherical',
  'system:spherical-chain',
  'system:spherical-embedded',
  'system:spherical-embedded-chain'
] as const;
export type SpatialSystemId = (typeof SPATIAL_SYSTEM_IDS)[number];
export const SPATIAL_INTEGRATOR_IDS = ['integrator:rk4', 'integrator:rk2', 'integrator:euler'] as const;
export type SpatialIntegratorId = (typeof SPATIAL_INTEGRATOR_IDS)[number] | 'internal';
export const SPATIAL_MODEL_VERSION = 'spatial-model-v1';
export const SPATIAL_INTEGRATOR_VERSION = 'spatial-integrator-v1';
export const MAX_SPATIAL_LINKS = 16;
export const MAX_SPATIAL_STEPS = 100_000;
export interface SpatialConfig {
  readonly systemId: SpatialSystemId;
  readonly parameters: SphericalChainParams;
  /** Polar: all theta/phi pairs then all rates. Embedded: all xyz directions then all tangent rates. */
  readonly initialState: readonly number[];
  readonly integratorId: SpatialIntegratorId;
  readonly step: number;
  readonly duration: number;
  readonly startTime?: number;
  readonly sampleEvery?: number;
  readonly analyses?: readonly AnalysisState[];
  readonly seed?: SeedState;
  readonly provenance?: ExperimentProvenance;
}
export interface SpatialPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface SpatialSample {
  readonly step: number;
  readonly time: number;
  readonly state: readonly number[];
  readonly positions: readonly SpatialPoint[];
  readonly velocities: readonly SpatialPoint[];
  readonly energy: EnergyBreakdown;
  /** Right-handed r cross mv, kg*m^2/s. Gravity is along negative y. */
  readonly angularMomentum: SpatialPoint;
  /** True +y component, consistently normalized across the legacy engines' different Lz conventions. */
  readonly verticalMomentum: number;
  /** Absolute link-length residuals in m. */
  readonly constraintErrors: readonly number[];
  readonly unitConstraintErrors: readonly number[];
  /** Absolute u dot w in 1/s. */
  readonly tangentConstraintErrors: readonly number[];
  /** Horizontal direction magnitude |sin(theta)|; zero at either pole. */
  readonly poleProximity: readonly number[];
  readonly warnings: readonly string[];
}
export const spatialIsEmbedded = (id: string): boolean => id.includes('embedded');
export const spatialIsChain = (id: string): boolean => id.endsWith('chain');
export function spatialInitialAngles(config: SpatialConfig): number[] {
  return spatialIsEmbedded(config.systemId)
    ? Array.from(embeddedChainToAngle(config.initialState, config.parameters.masses.length))
    : [...config.initialState];
}
export function withSpatialAngles(config: SpatialConfig, angles: readonly number[]): SpatialConfig {
  const n = config.parameters.masses.length;
  if (angles.length !== 4 * n || !angles.every(Number.isFinite))
    throw new RangeError('링크당 두 각도와 두 각속도가 필요합니다.');
  return {
    ...structuredClone(config),
    initialState: spatialIsEmbedded(config.systemId) ? Array.from(angleChainToEmbedded(angles, n)) : [...angles]
  };
}
export function defaultSpatialConfig(
  systemId: SpatialSystemId = 'system:spherical',
  n = spatialIsChain(systemId) ? 2 : 1
): SpatialConfig {
  if (
    !SPATIAL_SYSTEM_IDS.includes(systemId) ||
    !Number.isInteger(n) ||
    n < 1 ||
    n > MAX_SPATIAL_LINKS ||
    (!spatialIsChain(systemId) && n !== 1)
  )
    throw new RangeError(`단일 진자는 1개, 사슬은 1–${MAX_SPATIAL_LINKS}개 링크가 필요합니다.`);
  const angles = [
    ...Array.from({ length: n }, (_, i) => [0.6 - (0.2 * i) / n, 0.35 * i]).flat(),
    ...Array.from({ length: n }, (_, i) => [0, 1.2 - (0.2 * i) / n]).flat()
  ];
  return {
    systemId,
    parameters: { masses: Array<number>(n).fill(1), lengths: Array<number>(n).fill(1), g: 9.81, damping: 0 },
    initialState: spatialIsEmbedded(systemId) ? Array.from(angleChainToEmbedded(angles, n)) : angles,
    integratorId: systemId === 'system:spherical-chain' ? 'integrator:rk4' : 'internal',
    step: 0.002,
    duration: 8,
    startTime: 0,
    sampleEvery: 1,
    analyses: []
  };
}
export function spatialWarnings(config: SpatialConfig): readonly string[] {
  return [
    '오른손 xyz 좌표계에서 y가 위쪽, 중력은 −y 방향입니다. θ는 아래 수직선 기준, φ는 +x에서 +z 방향의 방위각(rad)입니다.',
    '위치 m, 속도 m/s, 에너지 J, 각운동량 kg·m²/s입니다. 위치에너지의 기준 높이는 고정점입니다.',
    '수직 각운동량 Ly = Σm(z vx − x vz)입니다. 기존 단일 구면 엔진의 Lz 표기와 부호가 반대이며 사슬과 동일한 +y 축으로 통일했습니다.',
    '고정 길이의 질량 없는 강체 막대입니다. 줄의 이완·충돌·자기 접촉은 모델링하지 않습니다.',
    ...(spatialIsEmbedded(config.systemId)
      ? [
          '매입 상태는 단위 방향 u와 접선 속도 w(1/s)를 저장합니다. 매 단계 정규화·접선 투영이 적용되며 극점에서도 적분합니다. 각도로 다시 표현하면 극점의 방위각은 유일하지 않습니다.'
        ]
      : [
          '극좌표는 극점에서 특이합니다. 기존 엔진의 sin θ 정규화 근처에서는 오차가 커질 수 있으므로 극점을 통과하는 실험은 매입 좌표를 사용하세요.'
        ]),
    ...(config.parameters.damping > 0
      ? ['감쇠 γ(1/s)가 작용하면 에너지와 수직 각운동량의 변화는 물리적 소산을 포함합니다.']
      : ['중력 때문에 전체 각운동량 벡터는 보존되지 않습니다. 무감쇠에서 에너지와 수직 성분 Ly의 보존을 확인하세요.']),
    ...(config.integratorId === 'integrator:euler'
      ? ['명시적 Euler는 비교용이며 큰 에너지 오차가 생길 수 있습니다.']
      : []),
    ...(config.step > 0.006 ? ['시간 간격이 큽니다. 간격을 줄여 궤적과 보존량의 수렴을 확인하세요.'] : [])
  ];
}
