import type { EnergyBreakdown, PendulumParameters } from '../../../types/domain';
import type { AnalysisState, ExperimentProvenance, SeedState } from '../../contracts/experiment';
import type { CanonicalUnit } from '../../contracts/quantities';
import { LEGACY_ODE_INTEGRATOR_IDS, odeIntegratorWarnings } from './planar-integrators';

export const PLANAR_SYSTEM_IDS = ['system:double', 'system:compound-double'] as const;
export type PlanarSystemId = (typeof PLANAR_SYSTEM_IDS)[number];
/** Only methods whose product execution paths have parity evidence are offered. */
export const PLANAR_INTEGRATOR_IDS = LEGACY_ODE_INTEGRATOR_IDS;
export type PlanarIntegratorId = (typeof PLANAR_INTEGRATOR_IDS)[number];
export const PLANAR_MODEL_VERSION = 'planar-model-v1';
export const PLANAR_INTEGRATOR_VERSION = 'planar-integrator-v1';
export const MAX_PLANAR_STEPS = 100_000;
export type PlanarState = readonly [number, number, number, number];

/** Restart configuration. Solver buffers and an interrupted trajectory are not serialized. */
export interface PlanarConfig {
  readonly systemId: PlanarSystemId;
  readonly parameters: Pick<PendulumParameters, 'm1' | 'm2' | 'l1' | 'l2' | 'g'>;
  readonly gamma: number;
  readonly initialState: PlanarState;
  readonly integratorId: PlanarIntegratorId;
  /** Absent preserves each native method's existing default residual tolerance. */
  readonly tolerance?: number;
  readonly step: number;
  readonly duration: number;
  readonly startTime?: number;
  readonly sampleEvery?: number;
  readonly analyses?: readonly AnalysisState[];
  readonly seed?: SeedState;
  readonly provenance?: ExperimentProvenance;
}

export interface PlanarPoint {
  readonly x: number;
  readonly y: number;
}
export interface PlanarPositions {
  readonly pivot: PlanarPoint;
  readonly first: PlanarPoint;
  readonly second: PlanarPoint;
  /** Uniform rods' centers of mass, present only for the compound model. */
  readonly centers?: readonly [PlanarPoint, PlanarPoint];
}
export interface PlanarSample {
  readonly step: number;
  readonly time: number;
  readonly state: PlanarState;
  readonly energy: EnergyBreakdown;
  readonly positions: PlanarPositions;
}
export interface PlanarField {
  readonly id: string;
  readonly label: string;
  readonly unit: CanonicalUnit;
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number;
  readonly group: 'parameters' | 'initialConditions' | 'runtime';
  readonly advanced: boolean;
}

export const PLANAR_FIELDS: readonly PlanarField[] = [
  {
    id: 'm1',
    label: '첫 번째 질량',
    unit: 'kg',
    defaultValue: 1,
    min: 0.001,
    max: 1000,
    group: 'parameters',
    advanced: false
  },
  {
    id: 'm2',
    label: '두 번째 질량',
    unit: 'kg',
    defaultValue: 1,
    min: 0.001,
    max: 1000,
    group: 'parameters',
    advanced: false
  },
  {
    id: 'l1',
    label: '첫 번째 길이',
    unit: 'm',
    defaultValue: 1,
    min: 0.001,
    max: 1000,
    group: 'parameters',
    advanced: false
  },
  {
    id: 'l2',
    label: '두 번째 길이',
    unit: 'm',
    defaultValue: 1,
    min: 0.001,
    max: 1000,
    group: 'parameters',
    advanced: false
  },
  {
    id: 'g',
    label: '중력 가속도',
    unit: 'm/s^2',
    defaultValue: 9.81,
    min: 0,
    max: 1000,
    group: 'parameters',
    advanced: true
  },
  {
    id: 'gamma',
    label: '힌지 감쇠 계수',
    unit: 'kg*m^2/s',
    defaultValue: 0,
    min: 0,
    max: 1000,
    group: 'parameters',
    advanced: true
  },
  {
    id: 'theta1',
    label: '첫 번째 시작 각도',
    unit: 'rad',
    defaultValue: 1.2,
    min: -1e6,
    max: 1e6,
    group: 'initialConditions',
    advanced: false
  },
  {
    id: 'theta2',
    label: '두 번째 시작 각도',
    unit: 'rad',
    defaultValue: 0.6,
    min: -1e6,
    max: 1e6,
    group: 'initialConditions',
    advanced: false
  },
  {
    id: 'omega1',
    label: '첫 번째 각속도',
    unit: 'rad/s',
    defaultValue: 0,
    min: -1e4,
    max: 1e4,
    group: 'initialConditions',
    advanced: true
  },
  {
    id: 'omega2',
    label: '두 번째 각속도',
    unit: 'rad/s',
    defaultValue: 0,
    min: -1e4,
    max: 1e4,
    group: 'initialConditions',
    advanced: true
  },
  {
    id: 'duration',
    label: '관찰 시간',
    unit: 's',
    defaultValue: 10,
    min: 0.000001,
    max: 300,
    group: 'runtime',
    advanced: false
  },
  {
    id: 'step',
    label: '시간 간격',
    unit: 's',
    defaultValue: 0.002,
    min: 0.000001,
    max: 0.05,
    group: 'runtime',
    advanced: true
  }
];

export function defaultPlanarConfig(systemId: PlanarSystemId = 'system:double'): PlanarConfig {
  return {
    systemId,
    parameters: { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
    gamma: 0,
    initialState: [1.2, 0.6, 0, 0],
    integratorId: 'integrator:rk4',
    step: 0.002,
    duration: 10,
    startTime: 0,
    sampleEvery: 1,
    analyses: []
  };
}

/** Warnings describe interpretation; numerical failures still stop the run. */
export function planarWarnings(config: PlanarConfig): readonly string[] {
  return [
    '각도는 아래쪽 수직선 기준 절대각(rad)이며 회전 횟수를 보존합니다. 에너지의 위치 기준은 고정점 높이입니다.',
    ...(config.systemId === 'system:compound-double'
      ? ['복합진자는 두 균일 막대의 질량중심 병진과 자체 회전 에너지를 포함합니다.']
      : []),
    ...(config.gamma > 0
      ? ['감쇠 계수는 힌지 토크 계수 kg·m²/s입니다. 감쇠 중 총역학에너지는 보존되지 않습니다.']
      : []),
    ...(config.integratorId === 'integrator:euler'
      ? ['명시적 오일러는 비교용이며 큰 에너지 오차가 생길 수 있습니다.']
      : []),
    ...odeIntegratorWarnings(config.integratorId, config.tolerance),
    ...(config.step > 0.006 ? ['시간 간격이 큽니다. 간격을 줄여 결과와 에너지 오차의 수렴을 확인하세요.'] : [])
  ];
}
