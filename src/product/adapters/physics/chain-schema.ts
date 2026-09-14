import type { EnergyBreakdown } from '../../../types/domain';
import { MAX_DENSE_PHYSICS_DIMENSION } from '../../../physics/errors';
import type { ChainParameters } from '../../../physics/nPendulum';
import type { AnalysisState, ExperimentProvenance, SeedState } from '../../contracts/experiment';

export const CHAIN_SYSTEM_IDS = ['system:triple', 'system:chain'] as const;
export type ChainSystemId = (typeof CHAIN_SYSTEM_IDS)[number];
export const CHAIN_INTEGRATOR_IDS = ['integrator:rk4', 'integrator:rk2', 'integrator:euler'] as const;
export type ChainIntegratorId = (typeof CHAIN_INTEGRATOR_IDS)[number];
export const CHAIN_MODEL_VERSION = 'chain-model-v1';
export const CHAIN_INTEGRATOR_VERSION = 'chain-integrator-v1';
export const MAX_CHAIN_LINKS = MAX_DENSE_PHYSICS_DIMENSION;
export const MAX_CHAIN_STEPS = 100_000;

/** Restart configuration: all N absolute angles precede all N angular velocities. */
export interface ChainConfig {
  readonly systemId: ChainSystemId;
  readonly parameters: ChainParameters;
  readonly gamma: number;
  readonly initialState: readonly number[];
  readonly integratorId: ChainIntegratorId;
  readonly step: number;
  readonly duration: number;
  readonly startTime?: number;
  readonly sampleEvery?: number;
  readonly analyses?: readonly AnalysisState[];
  readonly seed?: SeedState;
  readonly provenance?: ExperimentProvenance;
}

export interface ChainPoint {
  readonly x: number;
  readonly y: number;
}

export interface ChainSample {
  readonly step: number;
  readonly time: number;
  readonly state: readonly number[];
  readonly energy: EnergyBreakdown;
  /** Bob positions in metres, positive y upwards; the fixed pivot is (0, 0). */
  readonly positions: readonly ChainPoint[];
}

export type ChainBulkField = 'mass' | 'length' | 'theta' | 'omega';

export function defaultChainConfig(
  systemId: ChainSystemId = 'system:chain',
  n = systemId === 'system:triple' ? 3 : 4
): ChainConfig {
  if (
    !CHAIN_SYSTEM_IDS.includes(systemId) ||
    !Number.isInteger(n) ||
    n < 1 ||
    n > MAX_CHAIN_LINKS ||
    (systemId === 'system:triple' && n !== 3)
  )
    throw new RangeError(`사슬은 1–${MAX_CHAIN_LINKS}개, 삼중 진자는 정확히 3개 링크가 필요합니다.`);
  return {
    systemId,
    parameters: { masses: Array<number>(n).fill(1), lengths: Array<number>(n).fill(1), g: 9.81 },
    gamma: 0,
    initialState: [...Array.from({ length: n }, (_, i) => (0.4 * (n - i)) / n), ...Array<number>(n).fill(0)],
    integratorId: 'integrator:rk4',
    step: 0.002,
    duration: 10,
    startTime: 0,
    sampleEvery: 1,
    analyses: []
  };
}

export function chainWarnings(config: ChainConfig): readonly string[] {
  const n = config.parameters.masses.length;
  return [
    '각도는 아래 수직선 기준 절대각(rad)이며 회전 횟수를 보존합니다. 위치에너지의 기준 높이는 고정점입니다.',
    `지원 범위는 사슬 1–${MAX_CHAIN_LINKS}개, 삼중 진자 3개 링크입니다. 밀집 질량행렬의 메모리는 N², 직접 해법의 계산량은 N³에 비례합니다.`,
    ...(n >= 16
      ? [
          '링크가 많아 계산이 느려질 수 있습니다. 계산은 worker에서 실행되며 언제든 취소할 수 있습니다. 관찰 시간과 표본 수를 줄여 비용을 조절하세요.'
        ]
      : []),
    ...(config.gamma > 0
      ? ['감쇠 계수는 힌지 토크 계수 kg·m²/s입니다. 감쇠 중 총역학에너지는 보존되지 않습니다.']
      : []),
    ...(config.integratorId === 'integrator:euler'
      ? ['명시적 오일러는 비교용이며 큰 에너지 오차가 생길 수 있습니다.']
      : []),
    ...(config.step > 0.006 ? ['시간 간격이 큽니다. 간격을 줄여 궤적과 에너지 오차의 수렴을 확인하세요.'] : [])
  ];
}
