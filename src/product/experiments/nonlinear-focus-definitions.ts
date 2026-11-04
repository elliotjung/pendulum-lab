import type { CanonicalUnit } from '../contracts/quantities';
import type { FocusExperimentDefinition } from '../learn/schema';
import type { ResearchFocusDeclaration, ResearchFocusField } from './research-focus-contracts';

const f = (
  id: string,
  label: string,
  unit: CanonicalUnit,
  value: number,
  min: number,
  max: number
): ResearchFocusField => ({ id, label, unit, value, min, max });
const time = (duration: number, step: number, normalized = false) => [
  f('duration', normalized ? '정규화 관찰 구간' : '관찰 시간', normalized ? '1' : 's', duration, 1, 20),
  f('step', normalized ? '정규화 계산 간격' : '시간 간격', normalized ? '1' : 's', step, 0.001, 0.02)
];
const pendulum = () => [
  f('g', '중력 가속도', 'm/s^2', 9.81, 0, 20),
  f('length', '길이', 'm', 1, 0.5, 2),
  f('damping', '감쇠율', 's^-1', 0.2, 0, 2)
];
const scalar = (id: string, label: string, value: number, min: number, max: number) =>
  f(id, label, '1', value, min, max);
const declare = (
  systemId: string,
  fields: readonly ResearchFocusField[],
  exposed: readonly string[],
  internal = false
): ResearchFocusDeclaration => ({
  systemId,
  integratorId: internal ? 'internal' : 'integrator:rk4',
  fields,
  exposed,
  analysisIds: []
});

/** Explicit bounded native-adapter inputs; content contains no executable dynamics. */
export function nonlinearFocusDeclaration(id: string): ResearchFocusDeclaration {
  switch (id) {
    case '4.1':
      return declare(
        'system:double',
        [
          f('m1', '첫 질량', 'kg', 1, 0.5, 2),
          f('m2', '둘째 질량', 'kg', 1, 0.5, 2),
          f('l1', '첫 길이', 'm', 1, 0.5, 2),
          f('l2', '둘째 길이', 'm', 1, 0.5, 2),
          f('g', '중력 가속도', 'm/s^2', 9.81, 1, 20),
          f('gamma', '힌지 감쇠 계수', 'kg*m^2/s', 0.2, 0, 1),
          f('theta1', '첫 시작 각도', 'rad', 0.6, -1, 1),
          f('theta2', '둘째 시작 각도', 'rad', 0.3, -1, 1),
          f('omega1', '첫 각속도', 'rad/s', 0, -1, 1),
          f('omega2', '둘째 각속도', 'rad/s', 0, -1, 1),
          ...time(6, 0.005)
        ],
        ['gamma', 'theta1', 'step']
      );
    case '4.2':
      return declare(
        'system:driven',
        [
          ...pendulum(),
          f('amplitude', '구동 각가속도', 'rad/s^2', 0.15, 0, 0.5),
          f('frequency', '기준 각주파수', 'rad/s', 3, 1, 5),
          f('theta', '시작 각도', 'rad', 0, -0.2, 0.2),
          ...time(20, 0.01)
        ],
        ['amplitude', 'damping', 'duration']
      );
    case '4.3':
      return declare(
        'system:mathieu',
        [
          scalar('delta', '평균 복원 계수 δ', 0.25, 0.05, 1.5),
          scalar('epsilon', '변조 계수 ε', 0.3, 0, 0.8),
          scalar('x', '초기 변위', 0.1, 0.01, 0.2),
          scalar('v', '초기 속도', 0, -0.1, 0.1),
          ...time(20, 0.01, true)
        ],
        ['delta', 'epsilon', 'duration'],
        true
      );
    case '4.4':
      return declare(
        'system:kapitza',
        [
          ...pendulum().map((x) => ({ ...x, value: x.id === 'damping' ? 0 : x.value })),
          f('amplitude', '지지대 진폭', 'm', 0.2, 0, 0.3),
          f('frequency', '빠른 가진 각주파수', 'rad/s', 30, 15, 60),
          f('theta', '아래 수직 기준 시작 각도', 'rad', Math.PI + 0.1, Math.PI - 0.2, Math.PI + 0.2),
          ...time(4, 0.002)
        ],
        ['amplitude', 'frequency', 'step']
      );
    case '4.5':
      return declare(
        'system:cartpole',
        [
          f('theta', '위쪽 기준 시작 각도', 'rad', 0.08, -0.2, 0.2),
          scalar('gainScale', '기본 피드백 gain 배율', 1, 0, 2),
          f('maxOutput', '카트 힘 포화 한계', 'N', 20, 0.1, 40),
          ...time(5, 0.005)
        ],
        ['theta', 'gainScale', 'maxOutput']
      );
    case '4.6':
      return declare(
        'system:coupled',
        [
          ...pendulum().map((x) => ({ ...x, value: x.id === 'damping' ? 0 : x.value })),
          f('coupling', '각도 차이 결합', 's^-2', 0.5, 0, 3),
          f('theta', '첫 시작 각도', 'rad', 0.2, 0.01, 0.5),
          ...time(20, 0.01)
        ],
        ['coupling', 'theta', 'duration']
      );
    case '4.7':
      return declare(
        'system:duffing',
        [
          scalar('damping', '정규화 감쇠 δ', 0.12, 0.05, 0.5),
          scalar('alpha', '선형 강성 α', -1, -1, 1),
          scalar('beta', '삼차 강성 β', 1, 0.5, 2),
          scalar('amplitude', '정규화 구동 γ', 0.3, 0, 0.5),
          scalar('frequency', '기준 정규화 주파수 Ω', 1, 0.6, 1.6),
          scalar('x', '시작 변위', 0.8, -1.5, 1.5),
          ...time(20, 0.01, true)
        ],
        ['amplitude', 'damping', 'alpha']
      );
    case '4.8':
      return declare(
        'system:van-der-pol',
        [scalar('mu', '비선형 감쇠 μ', 1, 0, 5), scalar('x', '안쪽 시작 변위', 0.2, 0.05, 1), ...time(20, 0.005, true)],
        ['mu', 'x', 'duration']
      );
    case '4.9':
      return declare(
        'system:friction',
        [
          f('mass', '블록 질량', 'kg', 1, 0.5, 2),
          f('stiffness', '용수철 상수', 'N/m', 1, 0, 2),
          f('staticFriction', '정지 마찰 한계', 'N', 1.2, 0.8, 2),
          f('dynamicFriction', '운동 마찰 크기', 'N', 0.7, 0.1, 0.8),
          f('amplitude', '외력 진폭', 'N', 2, 0, 3),
          f('frequency', '외력 각주파수', 'rad/s', 1, 0.5, 2),
          ...time(15, 0.01)
        ],
        ['amplitude', 'staticFriction', 'step'],
        true
      );
    case '4.10':
      return declare(
        'system:pyragas',
        [
          f('g', '중력 가속도', 'm/s^2', 1, 1, 1),
          f('length', '길이', 'm', 1, 1, 1),
          f('damping', '감쇠율', 's^-1', 0.2, 0.2, 0.2),
          f('gain', '지연 피드백 K', 's^-2', 0.1, -0.3, 0.5),
          f('delay', '지연 τ', 's', 2 * Math.PI, 1, 8),
          f('amplitude', '구동 각가속도', 'rad/s^2', 0.3, 0, 0.6),
          f('frequency', '구동 각주파수', 'rad/s', 1, 1, 1),
          f('theta', '초기 각도와 상수 과거 이력', 'rad', 0.3, -0.5, 0.5),
          ...time(20, 0.01)
        ],
        ['gain', 'delay', 'amplitude'],
        true
      );
    default:
      throw new RangeError('과정 4의 단원 4.1–4.10이 필요합니다.');
  }
}

export function nonlinearFocusDefinition(
  id: string,
  copy: Pick<FocusExperimentDefinition, 'guidance' | 'successCriteria' | 'tasks'>
): FocusExperimentDefinition {
  const d = nonlinearFocusDeclaration(id);
  return {
    status: 'ready',
    kind: 'nonlinear-control',
    plotIds: ['diagnostics'],
    systemId: d.systemId,
    exposedFields: d.exposed,
    fixedFields: d.fields.filter((f) => !d.exposed.includes(f.id)).map(({ id, value, unit }) => ({ id, value, unit })),
    defaultPreset: {
      integratorId: d.integratorId,
      fields: d.fields.map(({ id, value, unit }) => ({ id, value, unit }))
    },
    analysisIds: d.analysisIds,
    ...copy
  };
}
