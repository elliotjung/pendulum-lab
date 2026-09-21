import type { EnergyBreakdown } from '../../../types/domain';
import type { AnalysisState, ExperimentProvenance, SeedState } from '../../contracts/experiment';

export const CONSTRAINT_SYSTEM_IDS = ['system:spring', 'system:rope', 'system:double-string'] as const;
export type ConstraintSystemId = (typeof CONSTRAINT_SYSTEM_IDS)[number];
export const CONSTRAINT_INTEGRATOR_IDS = ['integrator:rk4', 'integrator:rk2', 'integrator:euler'] as const;
export type ConstraintIntegratorId = (typeof CONSTRAINT_INTEGRATOR_IDS)[number] | 'internal';
export const CONSTRAINT_MODEL_VERSION = 'constraint-model-v1';
export const CONSTRAINT_INTEGRATOR_VERSION = 'constraint-integrator-v1';
export const MAX_CONSTRAINT_STEPS = 100_000;
export const MAX_CONSTRAINT_EVENTS = 10_000;
export const MIN_SPRING_RADIUS = 1e-6;

/** Restart settings, never a claim to restore a midflight hybrid state. */
export interface ConstraintConfig {
  readonly systemId: ConstraintSystemId;
  readonly parameters: Readonly<Record<string, number>>;
  /** Spring: r,theta,rDot,omega; rope: theta,omega; double string: theta1,theta2,omega1,omega2. */
  readonly initialState: readonly number[];
  readonly integratorId: ConstraintIntegratorId;
  readonly step: number;
  readonly duration: number;
  readonly startTime?: number;
  readonly sampleEvery?: number;
  readonly analyses?: readonly AnalysisState[];
  readonly seed?: SeedState;
  readonly provenance?: ExperimentProvenance;
}
export interface ConstraintEvent {
  readonly sequence: number;
  readonly type: 'slack' | 'capture';
  readonly link: 'inner' | 'outer' | 'both';
  readonly time: number;
  /** All product energies are J, all tensions are N. */
  readonly energyLoss: number;
  readonly residual: number;
  readonly residualUnit: 'N' | 'm';
  /** A t=0 release is a validity gate, not a located zero crossing. */
  readonly source: 'initial-condition' | 'integration';
}
export interface ConstraintSample {
  readonly step: number;
  readonly time: number;
  /** Spring polar state; rope x,y,vx,vy; double string x1,y1,x2,y2,vx1,vy1,vx2,vy2. */
  readonly state: readonly number[];
  readonly energy: EnergyBreakdown;
  readonly positions: readonly { readonly x: number; readonly y: number }[];
  readonly lengths: readonly number[];
  /** Spring is signed elastic force (negative under compression). */
  readonly tensions: readonly number[];
  readonly phase: 'elastic' | 'taut' | 'slack' | 'outer-slack' | 'full-slack';
  /** Active constraint absolute residual; inactive constraint overextension only. */
  readonly constraintErrors: readonly number[];
  /** Absolute distance from maximum/rest length, not necessarily a violation. */
  readonly gaps: readonly number[];
  /** Only events emitted during this step; snapshot repeats the last accepted step. */
  readonly events: readonly ConstraintEvent[];
  readonly captureLoss: number;
  readonly warnings: readonly string[];
}
export function defaultConstraintConfig(systemId: ConstraintSystemId = 'system:spring'): ConstraintConfig {
  if (!CONSTRAINT_SYSTEM_IDS.includes(systemId)) throw new RangeError('지원하지 않는 구속계입니다.');
  return {
    systemId,
    parameters:
      systemId === 'system:spring'
        ? { mass: 1, stiffness: 40, restLength: 1, g: 9.81 }
        : systemId === 'system:rope'
          ? { mass: 1, length: 1, g: 9.81, damping: 0 }
          : { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81, damping: 0 },
    initialState:
      systemId === 'system:spring' ? [1.3, 0.4, 0, 0] : systemId === 'system:rope' ? [0.6, 0] : [0.4, 0.2, 0, 0],
    integratorId: systemId === 'system:spring' ? 'integrator:rk4' : 'internal',
    step: 0.002,
    duration: 8,
    startTime: 0,
    sampleEvery: 1,
    analyses: []
  };
}
export function constraintWarnings(config: ConstraintConfig): readonly string[] {
  return [
    '각도는 아래 수직선 기준 rad, 위치는 고정점 기준 m(위쪽 y 양수), 에너지는 J, 장력은 N입니다.',
    ...(config.systemId === 'system:spring'
      ? [
          '용수철 힘 k(r−L₀)는 압축 시 음수입니다. 원점 근처의 극좌표 특이점에서는 계산을 중지합니다.',
          ...(config.integratorId === 'integrator:euler'
            ? ['명시적 Euler는 비교용으로 에너지 오차가 커질 수 있습니다.']
            : [])
        ]
      : [
          '줄은 당길 수만 있습니다. 느슨한 줄의 짧아진 길이는 구속 위반이 아닙니다.',
          '기존 사건 적분기가 최대 2 ms 내부 간격과 비탄성 재포획을 사용합니다. 포획 손실과 감쇠로 역학에너지는 보존되지 않습니다.',
          '초기각·초기각속도로 재시작하며, 비행 중의 상태를 저장하거나 복원하지 않습니다.',
          '사건 시각은 기존 적분기의 추정값입니다. 초기 이완은 장력 유효성 검사이며 0 교차 검출이 아닙니다.',
          ...(config.systemId === 'system:double-string'
            ? [
                '기존 이중 줄 모델은 taut/outer-slack/full-slack 세 모드를 사용합니다. 안쪽 줄만 느슨하고 바깥쪽 줄만 팽팽한 모드는 따로 풀지 않으며 비행·재포획은 단순화된 모델입니다.',
                '이중 줄의 단순화된 모드 전환·재포획에서는 에너지가 증가할 수도 있습니다. 기록된 포획 손실만으로 에너지 수지를 설명할 수 없습니다.',
                '이중 줄 모드 전환의 큰 구속 잔차나 에너지 변화는 수치·모델 한계를 나타냅니다. 간격 수렴을 확인하세요.'
              ]
            : []),
          ...(config.parameters.damping! > 0
            ? [
                config.systemId === 'system:rope'
                  ? '줄 감쇠는 두 모드에서 선형 항 γ(1/s)로 적용됩니다.'
                  : '기존 이중 줄 감쇠는 taut에서 힌지 토크 계수, slack에서 선형 감쇠로 적용됩니다. 동일 물리 마찰 법칙이 아니므로 정량 에너지 비교에는 γ=0을 사용하세요.'
              ]
            : [])
        ]),
    ...(config.step > 0.006 ? ['출력 시간 간격이 큽니다. 간격을 줄여 결과와 사건 순서의 수렴을 확인하세요.'] : [])
  ];
}
