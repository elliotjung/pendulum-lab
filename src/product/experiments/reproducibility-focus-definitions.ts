import type { CanonicalUnit } from '../contracts/quantities';
import type { ResearchFocusDeclaration, ResearchFocusField } from './research-focus-contracts';

const field = (
  id: string,
  label: string,
  unit: CanonicalUnit,
  value: number,
  min: number,
  max: number,
  integer = false
): ResearchFocusField => ({ id, label, unit, value, min, max, ...(integer ? { integer } : {}) });

/** Data declarations only. S21–24 perform all numerical and provenance operations. */
export function reproducibilityFocusDeclaration(id: string): ResearchFocusDeclaration {
  if (!/^8\.(?:[1-9]|1[0-2])$/.test(id)) throw new RangeError('과정8 단원을 선택하세요.');
  const learning = ['8.7', '8.8', '8.9'].includes(id),
    harmonic = id === '8.9';
  const fields: ResearchFocusField[] = [
    field(
      'theta1',
      harmonic ? '정규화 시작 위치 q' : '첫 시작 각도',
      harmonic ? '1' : 'rad',
      harmonic ? 1 : 0.4,
      0.1,
      1.2
    ),
    field('theta2', '둘째 시작 각도', 'rad', 0.2, -1, 1),
    field('g', '중력 (baseline/초기 추정)', 'm/s^2', id === '8.3' ? 8 : 9.81, 5, 15),
    field(
      'duration',
      harmonic ? '관찰 기간 (정규화 시간)' : '관찰 기간',
      harmonic ? '1' : 's',
      learning ? 4 : 0.8,
      learning ? 4 : 0.4,
      learning ? 6 : 2
    ),
    field(
      'step',
      harmonic ? '시간 간격 (정규화)' : '시간 간격',
      harmonic ? '1' : 's',
      learning ? 0.02 : 0.01,
      learning ? 0.02 : 0.005,
      learning ? 0.02 : 0.02
    ),
    field('seed', '설계·학습 seed 번호', '1', 27, 1, 9999, true)
  ];
  const exposed: string[] = [];
  if (id === '8.1') {
    fields.push(field('delta', '비교군 시작 각도 차이', 'rad', 0.1, -0.2, 0.3));
    exposed.push('delta', 'duration');
  } else if (id === '8.2') {
    fields.push(field('count', '설계별 run 수', '1', 6, 4, 12, true));
    exposed.push('count', 'seed');
  } else if (id === '8.3') {
    fields.push(
      field('truthG', '합성 관측을 생성하는 중력', 'm/s^2', 9.81, 6, 14),
      field('noise', '결정론적 관측 교란 진폭', 'rad', 0, 0, 0.005),
      field('iterations', '최대 보정 횟수', '1', 30, 1, 40, true)
    );
    exposed.push('g', 'noise', 'iterations');
  } else if (id === '8.4') {
    fields.push(
      field('clockScale', '시간 calibration 배율', '1', 1, 0.5, 2),
      field('angleScale', '각도 calibration 배율', '1', 1, 0.5, 1.5)
    );
    exposed.push('clockScale', 'angleScale');
  } else if (id === '8.5' || id === '8.6') {
    fields.push(
      field('samples', '기본/훈련 표본 수', '1', 16, 8, 32, true),
      field('halfRange', '중력 입력 반폭', 'm/s^2', 1, 0.1, 2)
    );
    if (id === '8.6') fields.push(field('degree', 'Legendre 다항 차수', '1', 2, 1, 3, true));
    exposed.push('samples', 'halfRange', ...(id === '8.6' ? ['degree'] : []));
  } else if (learning) {
    fields.push(
      field('threshold', '희소화 threshold', '1', 0.02, 0, 0.2),
      field('rank', 'HAVOK retained rank', '1', 2, 2, 4, true),
      field('delays', 'HAVOK 지연 창', '1', 8, 6, 12, true),
      field('reservoirSize', 'Reservoir 노드 수', '1', 12, 8, 24, true)
    );
    exposed.push(
      ...(id === '8.7' ? ['threshold', 'duration'] : id === '8.8' ? ['rank', 'delays'] : ['reservoirSize', 'seed'])
    );
  } else if (id === '8.10') {
    fields.push(
      field('dimension', '대칭 희소 연산자 차원', '1', 12, 8, 24, true),
      field('krylov', 'Krylov 부분공간 차원', '1', 10, 6, 24, true),
      field('tolerance', '정규화 Ritz 벡터 residual 허용치', '1', 1e-6, 1e-10, 0.001)
    );
    exposed.push('dimension', 'krylov', 'tolerance');
  } else exposed.push('theta1', 'duration');
  return {
    systemId: harmonic ? 'system:duffing' : 'system:double',
    integratorId: 'integrator:rk4',
    fields,
    exposed,
    analysisIds: []
  };
}
