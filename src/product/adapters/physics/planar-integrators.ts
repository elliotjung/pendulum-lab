import { integratorRegistry } from '../../../physics/integratorRegistry';
import type { IntegratorId } from '../../../types/domain';
import type { QuantityMap } from '../../contracts/quantities';
import { issue, type ContractIssue } from '../../contracts/validation';

/** Exact public legacy IDs, including the persisted verlet alias. */
export const LEGACY_ODE_INTEGRATOR_IDS = [
  'integrator:rk4',
  'integrator:rk2',
  'integrator:euler',
  'integrator:verlet',
  'integrator:leapfrog',
  'integrator:symplectic',
  'integrator:yoshida4',
  'integrator:yoshida6',
  'integrator:yoshida8',
  'integrator:hmidpoint',
  'integrator:gauss2',
  'integrator:rkf45',
  'integrator:dopri5',
  'integrator:dop853',
  'integrator:gbs',
  'integrator:bdf2'
] as const;
export type LegacyOdeIntegratorId = (typeof LEGACY_ODE_INTEGRATOR_IDS)[number];
export const ODE_TOLERANCE_MIN = 1e-15;
export const ODE_TOLERANCE_MAX = 1;
export const ODE_MONITORED_METHODS = new Set<IntegratorId>(['rkf45', 'dopri5', 'dop853', 'gbs']);

export function nativeOdeMethod(id: LegacyOdeIntegratorId): IntegratorId {
  return id.slice('integrator:'.length) as IntegratorId;
}
export function odeIntegratorLabel(id: LegacyOdeIntegratorId): string {
  if (id === 'integrator:rk4') return 'RK4 (4차)';
  if (id === 'integrator:rk2') return 'RK2 (2차)';
  if (id === 'integrator:euler') return '명시적 Euler (1차)';
  return integratorRegistry[nativeOdeMethod(id)].name;
}
export function validateOdeTolerance(value: unknown, issues: ContractIssue[], path = '$.tolerance'): void {
  if (
    value !== undefined &&
    (typeof value !== 'number' || !Number.isFinite(value) || value < ODE_TOLERANCE_MIN || value > ODE_TOLERANCE_MAX)
  )
    issues.push(
      issue(
        'invalid-tolerance',
        path,
        `허용오차는 ${ODE_TOLERANCE_MIN}–${ODE_TOLERANCE_MAX} 범위의 유한한 양수여야 합니다.`,
        'keep-original'
      )
    );
}
export function odeIntegratorSettings(tolerance: number | undefined): QuantityMap {
  return tolerance === undefined ? {} : { tolerance: { kind: 'scalar', value: tolerance, unit: '1' } };
}
export function readOdeTolerance(settings: QuantityMap, issues: ContractIssue[]): number | undefined {
  for (const key of Object.keys(settings))
    if (key !== 'tolerance')
      issues.push(
        issue(
          'unsupported-options',
          `$.integrator.settings.${key}`,
          '이 적분기 설정을 표현할 수 없습니다. 원본을 보존하세요.',
          'keep-original'
        )
      );
  const q = settings.tolerance;
  if (q === undefined) return;
  if (q.kind !== 'scalar' || q.unit !== '1') {
    issues.push(
      issue(
        'invalid-tolerance-unit',
        '$.integrator.settings.tolerance',
        '허용오차는 단위 1인 스칼라여야 합니다.',
        'keep-original'
      )
    );
    return;
  }
  validateOdeTolerance(q.value, issues, '$.integrator.settings.tolerance');
  return q.value;
}
export function odeIntegratorWarnings(id: LegacyOdeIntegratorId, tolerance?: number): string[] {
  const method = nativeOdeMethod(id),
    meta = integratorRegistry[method];
  return [
    ...(meta.symplectic !== 'no'
      ? [
          '이 θ/ω 좌표의 분할 적분은 근사입니다. 심플렉틱 보장은 분리 가능한 정준계에만 적용되며 속도 결합·감쇠에서는 일반 보존을 보장하지 않습니다.'
        ]
      : []),
    ...(method === 'verlet'
      ? ['verlet ID는 기존 leapfrog KDK 경로의 호환 별칭입니다. 저장된 ID를 바꾸지 않습니다.']
      : []),
    ...(ODE_MONITORED_METHODS.has(method)
      ? [
          '이 경로는 설정한 시간 간격마다 전진하고 embedded 오차를 감시하는 고정 macro-step입니다. 허용오차에 따른 적응형 간격 제어·거부를 주장하지 않습니다.'
        ]
      : []),
    ...(['hmidpoint', 'gauss2', 'bdf2'].includes(method)
      ? [
          `암시적 해법의 잔차 허용오차는 ${tolerance ?? (method === 'gauss2' ? 1e-12 : 1e-10)}입니다. 기존 정책대로 한 번의 실패 뒤 두 half-step만 재시도하며 실패 시 상태·시간을 전진시키지 않습니다.`
        ]
      : []),
    ...(tolerance !== undefined && !['hmidpoint', 'gauss2', 'bdf2'].includes(method)
      ? ['저장한 허용오차는 보존되지만 이 명시적/오차 감시 고정 간격 경로의 step 수락 기준으로 사용되지 않습니다.']
      : [])
  ];
}
