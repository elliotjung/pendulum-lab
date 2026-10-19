import { expansionModelDefinition } from '../../../physics/expandedModels-factory';
import type { AnalysisState, ExperimentProvenance, SeedState } from '../../contracts/experiment';

export const DRIVEN_SYSTEM_IDS = [
  'system:driven',
  'system:coupled',
  'system:inverted',
  'system:cartpole',
  'system:parametric'
] as const;
export type DrivenSystemId = (typeof DRIVEN_SYSTEM_IDS)[number];
export const DRIVEN_INTEGRATOR_IDS = ['integrator:rk4', 'integrator:rk2', 'integrator:euler'] as const;
export type DrivenIntegratorId = (typeof DRIVEN_INTEGRATOR_IDS)[number];
export const DRIVEN_MODEL_VERSION = 'driven-model-v1';
export const DRIVEN_INTEGRATOR_VERSION = 'driven-integrator-v1';
export const MAX_DRIVEN_STEPS = 100_000;
export const DRIVEN_WAVEFORMS = ['sine', 'square', 'triangle'] as const;
export interface DrivenForcing {
  readonly waveform: (typeof DRIVEN_WAVEFORMS)[number];
  readonly amplitude: number;
  /** Angular frequency in rad/s, not Hz. */
  readonly frequency: number;
  /** Offset added to the native drive phase, or frequency*time for cart-pole. */
  readonly phase: number;
}
export interface DrivenController {
  readonly enabled: boolean;
  readonly kp: number;
  readonly kd: number;
  readonly kx: number;
  readonly kv: number;
  /** Inverted: target angle(rad). Cart-pole: target cart position(m), upright angle remains zero. */
  readonly reference: number;
  readonly maxOutput: number;
}
export interface DrivenConfig {
  readonly systemId: DrivenSystemId;
  /** Physical plant only; waveform and controller never share this map. */
  readonly parameters: Readonly<Record<string, number>>;
  /** Native legacy state, including the advancing phase for driven/parametric. */
  readonly initialState: readonly number[];
  readonly forcing?: DrivenForcing;
  readonly controller?: DrivenController;
  readonly integratorId: DrivenIntegratorId;
  readonly step: number;
  readonly duration: number;
  readonly startTime?: number;
  readonly sampleEvery?: number;
  readonly analyses?: readonly AnalysisState[];
  readonly seed?: SeedState;
  readonly provenance?: ExperimentProvenance;
}
export interface DrivenPoint {
  readonly x: number;
  readonly y: number;
}
export interface DrivenSample {
  readonly step: number;
  readonly time: number;
  readonly state: readonly number[];
  readonly positions: readonly DrivenPoint[];
  /** Legacy mechanical diagnostic in J, not a conservation error. */
  readonly energy: number;
  readonly phase: DrivenPoint;
  readonly forcing: number;
  readonly control: number;
  readonly reference: number;
  readonly error: number;
  readonly warnings: readonly string[];
}
export const drivenHasForcing = (id: string): boolean =>
  ['system:driven', 'system:parametric', 'system:cartpole'].includes(id);
export const drivenSupportsController = (id: string): boolean => ['system:inverted', 'system:cartpole'].includes(id);
export function defaultDrivenConfig(systemId: DrivenSystemId = 'system:driven'): DrivenConfig {
  if (!(DRIVEN_SYSTEM_IDS as readonly string[]).includes(systemId))
    throw new RangeError('지원하는 구동 시스템을 선택하세요.');
  const definition = expansionModelDefinition(systemId.slice(7) as 'driven'),
    parameters = { ...definition.defaultParameters };
  delete parameters.driveAmplitude;
  delete parameters.driveFrequency;
  delete parameters.amplitude;
  delete parameters.frequency;
  return {
    systemId,
    parameters,
    initialState: [...definition.defaultState],
    integratorId: 'integrator:rk4',
    step: 0.002,
    duration: 8,
    startTime: 0,
    sampleEvery: 1,
    analyses: [],
    ...(drivenHasForcing(systemId)
      ? {
          forcing: {
            waveform: 'sine',
            amplitude: systemId === 'system:driven' ? 1.15 : systemId === 'system:parametric' ? 0.34 : 0,
            frequency: systemId === 'system:driven' ? 2 / 3 : systemId === 'system:parametric' ? 6.25 : 1,
            phase: Math.PI / 2
          } as DrivenForcing
        }
      : {}),
    ...(drivenSupportsController(systemId)
      ? {
          controller: {
            enabled: false,
            kp: systemId === 'system:inverted' ? 20 : 40,
            kd: systemId === 'system:inverted' ? 6 : 10,
            kx: systemId === 'system:inverted' ? 0 : 1,
            kv: systemId === 'system:inverted' ? 0 : 2,
            reference: 0,
            maxOutput: 50
          }
        }
      : {})
  };
}
export function drivenWarnings(config: DrivenConfig): readonly string[] {
  return [
    'SI 단위와 rad를 사용합니다. 구동 주파수 Ω는 rad/s이며 Hz가 아닙니다. sine는 sin(ψ+φ₀), square는 그 부호, triangle은 2 asin(sin(ψ+φ₀))/π입니다.',
    'driven·parametric의 ψ는 저장되는 진행 위상입니다. φ₀는 별도 위상 오프셋이며 기본 π/2는 기존 cos ψ 구동을 재현합니다. cart-pole의 ψ=Ωt는 절대 시작 시간을 사용합니다.',
    '표시 에너지는 기존 엔진의 기계적 진단값(J)입니다. 구동·감쇠·제어가 있으면 보존되지 않으며 에너지 변화량을 적분 오차로 해석하지 마세요.',
    ...(config.systemId === 'system:coupled'
      ? [
          '두 단위 질량 진자를 각도 차이에 비례하는 교육용 결합으로 연결합니다. 기존 결합 에너지 ½k(θ₁−θ₂)²에는 길이² 인자가 없어 길이≠1에서는 운동방정식과 일관된 보존량이 아닙니다. 표시값은 진단으로만 사용하세요.'
        ]
      : []),
    ...(config.systemId === 'system:parametric'
      ? ['막대 길이는 고정이고 g[1+a·wave(ψ+φ₀)]가 변합니다. 실제 지지대 운동이나 길이 변조 모델은 아닙니다.']
      : []),
    ...(config.systemId === 'system:cartpole'
      ? [
          '기존 cart-pole 운동방정식의 4/3 관성 계수와 질점 bob 에너지 진단값은 서로 다른 관성 근사를 사용합니다. 이 에너지로 보존 정확도를 판정하지 마세요. θ=0은 위쪽이며 x는 카트 위치입니다.'
        ]
      : []),
    ...(config.systemId === 'system:inverted'
      ? ['θ=0은 위쪽 불안정 평형입니다. 제어 출력은 단위 질량·길이 기준 각가속도(rad/s²)에 더해집니다.']
      : []),
    ...(config.controller
      ? [
          '선형 상태 피드백은 국소 안정화 예제이며 전역 안정성을 보장하지 않습니다. 출력은 ±maxOutput으로 포화되며, 제어 중 수직선 기준 각오차가 π/2를 넘으면 마지막 유효 상태에서 안전 중지합니다.'
        ]
      : []),
    ...(config.forcing?.waveform === 'square'
      ? [
          '사각파 불연속은 고정 간격으로 적분합니다. 전환 시점을 정확히 찾지 않으므로 시간 간격을 줄여 응답의 수렴을 비교하세요.'
        ]
      : []),
    ...(config.integratorId === 'integrator:euler'
      ? ['명시적 Euler는 비교용이며 큰 오차나 제어 불안정이 생길 수 있습니다.']
      : [])
  ];
}
