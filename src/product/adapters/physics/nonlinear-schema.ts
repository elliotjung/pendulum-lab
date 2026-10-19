import type { AnalysisState, ExperimentProvenance, SeedState } from '../../contracts/experiment';
import type { CanonicalUnit } from '../../contracts/quantities';

export const NONLINEAR_SYSTEM_IDS = [
  'system:duffing',
  'system:van-der-pol',
  'system:kapitza',
  'system:mathieu',
  'system:friction',
  'system:pyragas'
] as const;
export type NonlinearSystemId = (typeof NONLINEAR_SYSTEM_IDS)[number];
export const NONLINEAR_MODEL_VERSION = 'nonlinear-model-v1';
export const NONLINEAR_INTEGRATOR_VERSION = 'nonlinear-integrator-v1';
export const MAX_NONLINEAR_STEPS = 100_000;
export const MAX_NONLINEAR_DELAY_POINTS = 2048;
export interface NonlinearHistory {
  readonly kind: 'constant' | 'linear';
  readonly state: readonly number[];
}
/** Times relative to the continuation origin. Includes the point bracketing -delay and ends at zero. */
export interface NonlinearDelayState {
  readonly times: readonly number[];
  readonly states: readonly (readonly number[])[];
  /** Original t=0 relative to this continuation; before it the prescribed analytic history still applies. */
  readonly historyBoundary?: number;
}
export interface NonlinearConfig {
  readonly systemId: NonlinearSystemId;
  readonly parameters: Readonly<Record<string, number>>;
  readonly initialState: readonly number[];
  readonly integratorId: 'integrator:rk4' | 'internal';
  readonly step: number;
  readonly duration: number;
  readonly startTime?: number;
  readonly sampleEvery?: number;
  readonly history?: NonlinearHistory;
  readonly delayState?: NonlinearDelayState;
  readonly analyses?: readonly AnalysisState[];
  readonly seed?: SeedState;
  readonly provenance?: ExperimentProvenance;
}
export interface NonlinearPoint {
  readonly x: number;
  readonly y: number;
}
export interface NonlinearSample {
  readonly step: number;
  readonly time: number;
  readonly state: readonly number[];
  readonly positions: readonly NonlinearPoint[];
  readonly energy: number;
  readonly energyLabel: string;
  readonly energyUnit: string;
  readonly phase: NonlinearPoint;
  readonly forcing: number;
  readonly feedback: number;
  readonly frictionForce: number;
  readonly mode: 'stick' | 'slip' | 'smooth';
  readonly momentumResidual: number;
  readonly coneResidual: number;
  readonly potential: readonly NonlinearPoint[];
  readonly history: readonly { readonly time: number; readonly theta: number; readonly omega: number }[];
  readonly stability?: { readonly stable: boolean; readonly spectralRadius: number; readonly determinantDrift: number };
  readonly warnings: readonly string[];
}
export interface NonlinearField {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly canonicalUnit: CanonicalUnit;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}
const f = (
  key: string,
  label: string,
  unit: string,
  canonicalUnit: CanonicalUnit,
  min: number,
  max: number,
  step = 0.01
): NonlinearField => ({ key, label, unit, canonicalUnit, min, max, step });
const normalized = (key: string, label: string, min: number, max: number, step = 0.01) =>
  f(key, label, '정규화', '1', min, max, step);
const fields: Record<NonlinearSystemId, readonly NonlinearField[]> = {
  'system:duffing': [
    normalized('damping', '감쇠 δ', 0, 20),
    normalized('linearStiffness', '선형 강성 α', -20, 20),
    normalized('cubicStiffness', '삼차 강성 β', -20, 20),
    normalized('driveAmplitude', '구동 진폭 γ', 0, 20),
    normalized('driveFrequency', '구동 각주파수 Ω', 0, 100)
  ],
  'system:van-der-pol': [normalized('mu', '비선형 감쇠 μ', 0, 20)],
  'system:kapitza': [
    f('g', '중력 g', 'm/s²', 'm/s^2', 0.001, 100),
    f('length', '길이 l', 'm', 'm', 0.01, 100),
    f('driveAmplitude', '지지대 진폭 a', 'm', 'm', 0, 10),
    f('driveFrequency', '지지대 각주파수 Ω', 'rad/s', 'rad/s', 0, 300),
    f('damping', '감쇠 γ', 's⁻¹', 's^-1', 0, 20)
  ],
  'system:mathieu': [normalized('delta', '평균 복원 계수 δ', -10, 20), normalized('epsilon', '변조 계수 ε', 0, 20)],
  'system:friction': [
    f('mass', '질량 m', 'kg', 'kg', 0.01, 100),
    f('stiffness', '용수철 강성 k', 'N/m', 'N/m', 0, 100),
    f('staticFriction', '정지 마찰 한계 Fs', 'N', 'N', 0, 100),
    f('dynamicFriction', '운동 마찰 Fc', 'N', 'N', 0, 100),
    f('stribeckVelocity', 'Stribeck 속도 vs', 'm/s', 'm/s', 0.001, 10),
    f('regularizationVelocity', '정칙화 속도 vε', 'm/s', 'm/s', 0.0001, 1, 0.001),
    f('viscous', '점성 계수 b', 'N·s/m', 'N*s/m', 0, 20),
    f('driveAmplitude', '힘 진폭 A', 'N', 'N', 0, 100),
    f('driveFrequency', '힘 각주파수 Ω', 'rad/s', 'rad/s', 0, 100)
  ],
  'system:pyragas': [
    f('g', '중력 g', 'm/s²', 'm/s^2', 0, 100),
    f('length', '길이 l', 'm', 'm', 0.01, 100),
    f('damping', '감쇠 γ', 's⁻¹', 's^-1', 0, 20),
    f('feedbackGain', '피드백 K', 's⁻²', 's^-2', -100, 100),
    f('delay', '지연 τ', 's', 's', 0.0001, 10),
    f('driveAmplitude', '구동 각가속도 A', 'rad/s²', 'rad/s^2', 0, 100),
    f('driveFrequency', '구동 각주파수 Ω', 'rad/s', 'rad/s', 0, 100)
  ]
};
export function nonlinearParameterFields(id: NonlinearSystemId): readonly NonlinearField[] {
  return fields[id];
}
export function nonlinearStateFields(id: NonlinearSystemId): readonly NonlinearField[] {
  const normalizedModel = ['system:duffing', 'system:van-der-pol', 'system:mathieu'].includes(id);
  const oscillator = normalizedModel || id === 'system:friction';
  const result = normalizedModel
    ? [normalized('x', '변위 x', -1e6, 1e6), normalized('v', '속도 v', -1e6, 1e6)]
    : oscillator
      ? [f('x', '변위 x', 'm', 'm', -1e6, 1e6), f('v', '속도 v', 'm/s', 'm/s', -1e6, 1e6)]
      : [
          f('theta', '아래 수직선 기준 θ', 'rad', 'rad', -1e6, 1e6),
          f('omega', '각속도 ω', 'rad/s', 'rad/s', -1e6, 1e6)
        ];
  return ['system:duffing', 'system:kapitza', 'system:friction'].includes(id)
    ? [...result, f('drivePhase', '구동 위상 φ', 'rad', 'rad', -1e6, 1e6)]
    : result;
}
export const nonlinearIsInternal = (id: string) => ['system:mathieu', 'system:friction', 'system:pyragas'].includes(id);
const defaults: Record<
  NonlinearSystemId,
  { parameters: Record<string, number>; initialState: number[]; duration: number; step: number }
> = {
  'system:duffing': {
    parameters: { damping: 0.3, linearStiffness: -1, cubicStiffness: 1, driveAmplitude: 0.37, driveFrequency: 1.2 },
    initialState: [0.5, 0, 0],
    duration: 20,
    step: 0.002
  },
  'system:van-der-pol': { parameters: { mu: 1 }, initialState: [0.1, 0], duration: 40, step: 0.002 },
  'system:kapitza': {
    parameters: { g: 9.81, length: 1, driveAmplitude: 0.2, driveFrequency: 30, damping: 0 },
    initialState: [Math.PI + 0.1, 0, 0],
    duration: 5,
    step: 0.001
  },
  'system:mathieu': { parameters: { delta: 0.25, epsilon: 0.5 }, initialState: [0.1, 0], duration: 20, step: 0.005 },
  'system:friction': {
    parameters: {
      mass: 1,
      stiffness: 1,
      staticFriction: 1.2,
      dynamicFriction: 0.7,
      stribeckVelocity: 0.4,
      regularizationVelocity: 0.01,
      viscous: 0.08,
      driveAmplitude: 2,
      driveFrequency: 1
    },
    initialState: [0, 0, Math.PI / 2],
    duration: 15,
    step: 0.005
  },
  'system:pyragas': {
    parameters: { g: 1, length: 1, damping: 0.2, feedbackGain: 0.1, delay: 0.2, driveAmplitude: 0, driveFrequency: 1 },
    initialState: [0.3, 0],
    duration: 10,
    step: 0.002
  }
};
export function defaultNonlinearConfig(systemId: NonlinearSystemId = 'system:duffing'): NonlinearConfig {
  if (!(NONLINEAR_SYSTEM_IDS as readonly string[]).includes(systemId))
    throw new RangeError('지원하는 비선형 모델을 선택하세요.');
  const d = defaults[systemId];
  return {
    systemId,
    parameters: { ...d.parameters },
    initialState: [...d.initialState],
    integratorId: nonlinearIsInternal(systemId) ? 'internal' : 'integrator:rk4',
    step: d.step,
    duration: d.duration,
    startTime: 0,
    sampleEvery: 1,
    analyses: [],
    ...(systemId === 'system:pyragas'
      ? { history: { kind: 'constant', state: [...d.initialState] } as NonlinearHistory }
      : {})
  };
}
export interface NonlinearPreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}
export function nonlinearPresets(systemId: NonlinearSystemId): readonly NonlinearPreset[] {
  const alternate: Record<NonlinearSystemId, NonlinearPreset> = {
    'system:duffing': {
      id: 'harmonic',
      label: '조화 진동 극한',
      description: 'β=δ=γ=0, α=1의 선형 진동과 비교합니다.'
    },
    'system:van-der-pol': { id: 'relaxation', label: '이완 진동', description: 'μ=5의 느림·빠름 운동을 관찰합니다.' },
    'system:kapitza': {
      id: 'no-drive',
      label: '가진 없는 역평형',
      description: '수직 가진을 끄고 역평형에서 떨어지는 운동을 비교합니다.'
    },
    'system:mathieu': {
      id: 'stable',
      label: 'tongue 사이',
      description: 'δ=0.6, ε=0.1의 유한 시간 응답과 Floquet 결과를 비교합니다.'
    },
    'system:friction': {
      id: 'stuck',
      label: '정지 마찰 내부',
      description: '구동력 0.8N이 정지 마찰 1.2N을 넘지 않아 정지합니다.'
    },
    'system:pyragas': {
      id: 'linear-history',
      label: '선형 과거 이력',
      description: '과거 각속도가 있는 선형 이력과 상수 이력을 비교합니다.'
    }
  };
  return [
    { id: 'default', label: '대표 현상', description: '모델별 대표 현상을 관찰하는 기본 설정입니다.' },
    alternate[systemId]
  ];
}
export function nonlinearPresetConfig(systemId: NonlinearSystemId, presetId: string): NonlinearConfig {
  const c = defaultNonlinearConfig(systemId);
  if (!nonlinearPresets(systemId).some((p) => p.id === presetId)) throw new RangeError('지원하는 preset을 선택하세요.');
  if (presetId === 'default') return c;
  if (systemId === 'system:duffing')
    return {
      ...c,
      parameters: { ...c.parameters, damping: 0, linearStiffness: 1, cubicStiffness: 0, driveAmplitude: 0 },
      initialState: [1, 0, 0],
      duration: 8
    };
  if (systemId === 'system:van-der-pol') return { ...c, parameters: { mu: 5 }, initialState: [2, 0] };
  if (systemId === 'system:kapitza') return { ...c, parameters: { ...c.parameters, driveAmplitude: 0 } };
  if (systemId === 'system:mathieu') return { ...c, parameters: { delta: 0.6, epsilon: 0.1 } };
  if (systemId === 'system:friction')
    return { ...c, parameters: { ...c.parameters, driveAmplitude: 0.8 }, initialState: [0, 0, 0] };
  return { ...c, history: { kind: 'linear', state: [0.3, 0.2] } };
}
export function nonlinearWarnings(config: NonlinearConfig): readonly string[] {
  const id = config.systemId;
  return [
    ...(['system:duffing', 'system:van-der-pol', 'system:mathieu'].includes(id)
      ? [
          'x·v·t와 계수는 정규화 변수입니다. 시간 입력·파일의 s 표기는 공통 시간 스키마의 눈금이며 실제 초로 환산한 값이 아닙니다. 에너지는 정규화 진단값입니다.'
        ]
      : ['SI와 rad를 사용합니다. 각주파수는 rad/s이며 Hz가 아닙니다.']),
    '현재 궤적은 유한 시간·유한 시간 간격의 관찰입니다. 시간 간격을 줄여 수렴을 확인하고 안정성이나 카오스의 증명으로 해석하지 마세요.',
    ...(id === 'system:duffing'
      ? [
          'V(x)=αx²/2+βx⁴/4입니다. 외력·감쇠가 있으면 기계 에너지는 보존되지 않습니다.',
          ...(config.parameters.cubicStiffness! < 0
            ? ['β<0의 연화 퍼텐셜은 큰 변위에서 비구속적입니다. 발산하면 마지막 유효 상태에서 중지합니다.']
            : [])
        ]
      : []),
    ...(id === 'system:van-der-pol'
      ? [
          'μ>0에서 ½(x²+v²)는 보존량이 아닌 진단값입니다. 큰 μ는 강성을 만들며 고정 간격 RK4는 실패할 수 있습니다. 한계 주기는 과도 응답 뒤에 관찰하세요.'
        ]
      : []),
    ...(id === 'system:kapitza'
      ? [
          'θ=0은 아래쪽입니다. 정확한 가진 식을 적분하며 Φeff는 빠른 가진 평균화의 각가속도 퍼텐셜(s⁻²)입니다. a²Ω²>2gl은 이 근사 안의 역평형 조건이며 모든 주파수의 안정성을 보장하지 않습니다.'
        ]
      : []),
    ...(id === 'system:mathieu'
      ? [
          '기존 Mathieu 진단 도구의 x″+(δ+ε cos t)x=0을 보조 궤적으로 적분합니다. 구동 주기는 정규화 시간 2π입니다. Floquet 값은 내부 RK4 2000단계·허용오차의 결과이며 경계·중립점의 유계성을 보장하지 않습니다.'
        ]
      : []),
    ...(id === 'system:friction'
      ? [
          '새 Lab의 1차원 질량·용수철·주기 힘 예제입니다. 기존 암시적 Euler 정지 마찰 complementarity 도구를 재사용하며 전환 시각은 격자 해상도에 의존합니다.',
          'Stribeck·정칙화 속도 설정은 비교용 힘 곡선을 정합니다. 실제 운동은 정지/운동 Coulomb complementarity 경로이며 곡선의 tanh 마찰로 대체하지 않습니다. 점성 항은 이전 속도에서 평가합니다.'
        ]
      : []),
    ...(id === 'system:pyragas'
      ? [
          '고정 간격 method-of-steps RK4와 승인된 이력의 선형 보간을 사용하며 τ≥dt가 필요합니다. 지연 이력은 차원 없는 각도(rad)를 시간(s)에 따라 저장합니다.',
          '상수/선형 과거 이력과 전체 지연 꼬리를 저장합니다. 현재 상태 저장은 현재 시간에서 같은 관찰 길이를 새로 시작하는 continuation 설정입니다. 다른 이력·dt·관찰 길이로 안정성 경계를 검증하세요.'
        ]
      : [])
  ];
}
