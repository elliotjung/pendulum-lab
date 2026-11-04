import type { CanonicalUnit } from '../contracts/quantities';
import type { FocusExperimentDefinition } from '../learn/schema';

/** Display/input declarations only. No physics, integrator or runtime imports. */
export interface ExtendedFocusField {
  readonly id: string;
  readonly label: string;
  readonly unit: CanonicalUnit;
  readonly min: number;
  readonly max: number;
  readonly value: number;
}
export type ExtendedUnitId = `${2 | 3}.${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
const field = (
  id: string,
  label: string,
  unit: CanonicalUnit,
  value: number,
  min: number,
  max: number
): ExtendedFocusField => ({ id, label, unit, value, min, max });
const time = (duration = 2, step = 0.01) => [
  field('duration', '관찰 시간', 's', duration, 0.1, 8),
  field('step', '시간 간격', 's', step, 0.0005, 0.05)
];
const planar = () => [
  field('m1', '첫 질량', 'kg', 1, 0.1, 10),
  field('m2', '둘째 질량', 'kg', 1, 0.1, 10),
  field('l1', '첫 길이', 'm', 1, 0.2, 3),
  field('l2', '둘째 길이', 'm', 1, 0.2, 3),
  field('g', '중력 가속도', 'm/s^2', 9.81, 0, 20),
  field('gamma', '힌지 감쇠', 'kg*m^2/s', 0, 0, 1),
  field('theta1', '첫 시작 각도', 'rad', 0.4, -2.8, 2.8),
  field('theta2', '둘째 시작 각도', 'rad', 0.2, -2.8, 2.8),
  field('omega1', '첫 시작 각속도', 'rad/s', 0, -3, 3),
  field('omega2', '둘째 시작 각속도', 'rad/s', 0, -3, 3),
  ...time()
];
const spring = () => [
  field('mass', '질량', 'kg', 1, 0.5, 3),
  field('stiffness', '용수철 상수', 'N/m', 40, 20, 4000),
  field('restLength', '자연 길이', 'm', 1, 0.5, 2),
  field('g', '중력 가속도', 'm/s^2', 9.81, 0, 20),
  field('r', '초기 반지름', 'm', 1.3, 0.9, 1.5),
  field('theta', '시작 각도', 'rad', 0.4, -0.8, 0.8),
  field('rDot', '초기 방사 속도', 'm/s', 0, -0.2, 0.2),
  field('omega', '초기 각속도', 'rad/s', 0, -0.2, 0.2),
  ...time(2, 0.002)
];
const chain = (links: number) => [
  field('links', '링크 수', '1', links, 2, 8),
  field('mass', '각 링크 질량', 'kg', 1, 0.5, 3),
  field('length', '각 링크 길이', 'm', 1, 0.5, 2),
  field('g', '중력 가속도', 'm/s^2', 9.81, 0, 20),
  field('gamma', '힌지 감쇠', 'kg*m^2/s', 0, 0, 1),
  field('theta', '첫 시작 각도', 'rad', 0.4, -1.2, 1.2),
  field('omega', '첫 시작 각속도', 'rad/s', 0, -1, 1),
  ...time(2, 0.004)
];
const spatial = (links: number) => [
  field('links', '링크 수', '1', links, 1, 4),
  field('mass', '각 링크 질량', 'kg', 1, 0.5, 3),
  field('length', '각 링크 길이', 'm', 1, 0.5, 2),
  field('g', '중력 가속도', 'm/s^2', 9.81, 0, 20),
  field('damping', '감쇠율', 's^-1', 0, 0, 1),
  field('theta1', '첫 극각', 'rad', 0.6, 0.01, 1.2),
  field('phi1', '첫 방위각', 'rad', 0, -3, 3),
  field('thetaDot1', '첫 극각 속도', 'rad/s', 0, -1, 1),
  field('phiDot1', '첫 방위 속도', 'rad/s', 1.2, -2, 2),
  ...time(2, 0.002)
];
interface Declaration {
  systemId: string;
  integratorId: string;
  fields: readonly ExtendedFocusField[];
  exposed: readonly string[];
}
const replace = (fields: readonly ExtendedFocusField[], values: Readonly<Record<string, number>>) =>
  fields.map((f) => ({ ...f, value: values[f.id] ?? f.value }));
export function extendedFocusDeclaration(id: string): Declaration {
  if (!/^[23]\.[1-9]$/.test(id)) throw new RangeError('S25의 18개 단원 중 하나가 필요합니다.');
  if (id.startsWith('2.') && id !== '2.5')
    return {
      systemId: 'system:double',
      integratorId: id === '2.2' ? 'integrator:euler' : 'integrator:rk4',
      fields: [
        ...replace(
          planar(),
          id === '2.6' ? { duration: 4, step: 0.04 } : id === '2.4' ? { duration: 6, step: 0.02 } : {}
        ),
        ...(['2.3', '2.7'].includes(id) ? [field('tolerance', '무차원 오차 허용치', '1', 1e-6, 1e-9, 1e-3)] : [])
      ],
      exposed:
        id === '2.1'
          ? ['theta1', 'omega1']
          : id === '2.8'
            ? ['step', 'theta1']
            : ['2.3', '2.7'].includes(id)
              ? ['step', 'tolerance', 'duration']
              : ['step', 'duration']
    };
  switch (id) {
    case '2.5':
      return {
        systemId: 'system:spring',
        integratorId: 'integrator:rk4',
        fields: replace(spring(), { stiffness: 1000, r: 1.02, theta: 0, duration: 0.5, step: 0.01, g: 0 }),
        exposed: ['stiffness', 'step']
      };
    case '3.1':
      return {
        systemId: 'system:triple',
        integratorId: 'integrator:rk4',
        fields: chain(3),
        exposed: ['theta', 'mass', 'length']
      };
    case '3.2':
      return {
        systemId: 'system:chain',
        integratorId: 'integrator:rk4',
        fields: chain(4),
        exposed: ['links', 'theta', 'step']
      };
    case '3.3':
      return {
        systemId: 'system:compound-double',
        integratorId: 'integrator:rk4',
        fields: replace(planar(), { duration: 6 }),
        exposed: ['m1', 'm2', 'l1', 'l2']
      };
    case '3.4':
      return {
        systemId: 'system:spring',
        integratorId: 'integrator:rk4',
        fields: spring(),
        exposed: ['stiffness', 'r', 'theta']
      };
    case '3.5':
      return {
        systemId: 'system:rope',
        integratorId: 'internal',
        fields: [
          field('mass', '질량', 'kg', 1, 0.5, 3),
          field('length', '줄 길이', 'm', 1, 0.5, 2),
          field('g', '중력 가속도', 'm/s^2', 9.81, 0, 20),
          field('damping', '감쇠율', 's^-1', 0, 0, 1),
          field('theta', '시작 각도', 'rad', 2.2, -2.8, 2.8),
          field('omega', '시작 각속도', 'rad/s', 0, -3, 3),
          ...time(2, 0.002)
        ],
        exposed: ['theta', 'omega', 'step']
      };
    case '3.6':
      return {
        systemId: 'system:double-string',
        integratorId: 'internal',
        fields: [...planar().filter((f) => f.id !== 'gamma'), field('damping', '감쇠율', 's^-1', 0, 0, 1)].map((f) => ({
          ...f,
          value: f.id === 'theta2' ? 2.6 : f.id === 'step' ? 0.002 : f.value
        })),
        exposed: ['theta1', 'theta2', 'step']
      };
    case '3.7':
      return {
        systemId: 'system:spherical',
        integratorId: 'internal',
        fields: spatial(1),
        exposed: ['theta1', 'phiDot1', 'step']
      };
    case '3.8':
      return {
        systemId: 'system:spherical-chain',
        integratorId: 'integrator:rk4',
        fields: spatial(2),
        exposed: ['links', 'theta1', 'phi1', 'phiDot1']
      };
    case '3.9':
      return {
        systemId: 'system:spherical-embedded',
        integratorId: 'internal',
        fields: replace(spatial(1), { theta1: 0.01, phiDot1: 1, thetaDot1: -0.4, duration: 1 }),
        exposed: ['theta1', 'phiDot1', 'step']
      };
    default:
      throw new RangeError('알 수 없는 전용 실험입니다.');
  }
}
export function isExtendedFocus(definition: FocusExperimentDefinition): boolean {
  return definition.kind === 'numerical-methods' || definition.kind === 'extended-pendulum';
}
export function extendedFocusDefinition(
  id: ExtendedUnitId,
  copy: Pick<FocusExperimentDefinition, 'guidance' | 'successCriteria' | 'tasks'>
): FocusExperimentDefinition {
  const d = extendedFocusDeclaration(id);
  return {
    status: 'ready',
    kind: id.startsWith('2.') ? 'numerical-methods' : 'extended-pendulum',
    plotIds: ['diagnostics'],
    systemId: d.systemId,
    exposedFields: d.exposed,
    fixedFields: d.fields.filter((f) => !d.exposed.includes(f.id)).map(({ id, value, unit }) => ({ id, value, unit })),
    defaultPreset: {
      integratorId: d.integratorId,
      fields: d.fields.map(({ id, value, unit }) => ({ id, value, unit }))
    },
    analysisIds: ['analysis:energy'],
    ...copy
  };
}
