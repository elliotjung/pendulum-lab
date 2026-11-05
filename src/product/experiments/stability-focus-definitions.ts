import type { CanonicalUnit } from '../contracts/quantities';
import type { ResearchFocusDeclaration, ResearchFocusField } from './research-focus-contracts';
const f = (
  id: string,
  label: string,
  unit: CanonicalUnit,
  value: number,
  min: number,
  max: number,
  integer = false
): ResearchFocusField => ({ id, label, unit, value, min, max, ...(integer ? { integer } : {}) });
/** Course6 declarations are data only; every calculation lives in the preserved native modules. */
export function stabilityFocusDeclaration(id: string): ResearchFocusDeclaration {
  if (!/^6\.(?:[1-9]|1[0-2])$/.test(id)) throw new RangeError('과정6의 단원6.1–6.12가 필요합니다.');
  if (id === '6.12')
    return {
      systemId: 'system:double',
      integratorId: 'integrator:rk4',
      analysisIds: ['analysis:basin', 'analysis:wada'],
      exposed: ['resolution', 'duration'],
      fields: [
        f('resolution', '기준 격자 한 변', '1', 16, 16, 20, true),
        f('duration', '반전 관찰 기간', 's', 1, 0.5, 1.5),
        f('step', '격자 시간 간격', 's', 0.01, 0.01, 0.01)
      ]
    };
  const fields: ResearchFocusField[] = [
    f('g', '중력 가속도', 'm/s^2', 1, 1, 1),
    f('length', '진자 길이', 'm', 1, 1, 1),
    f('damping', '감쇠율', 's^-1', 0.5, 0, 1),
    f('amplitude', '구동 각가속도', 'rad/s^2', 0.3, 0, 1.1),
    f('frequency', '구동 각주파수', 'rad/s', 2 / 3, 2 / 3, 2 / 3),
    f('theta', '시작 각도', 'rad', 0.1, -3.2, 3.2),
    f('omega', '시작 각속도', 'rad/s', 0, -1, 1),
    f('duration', '기준 run 관찰 기간', 's', 10, 10, 10),
    f('step', '기준 run 시간 간격', 's', 0.01, 0.01, 0.01),
    f('stepsPerPeriod', '반환 맵 한 주기 적분 수', '1', 128, 128, 256, true)
  ];
  let exposed = ['amplitude', 'damping'],
    analysisIds: string[] = [];
  const set = (key: string, value: number, min?: number, max?: number) => {
    const i = fields.findIndex((x) => x.id === key);
    fields[i] = { ...fields[i]!, value, ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) };
  };
  switch (id) {
    case '6.1':
      set('amplitude', 0, 0, 0);
      fields.push(
        f('equilibrium', '평형 (0=아래,1=위)', '1', 0, 0, 1, true),
        f('perturbation', '평형 각도 교란', 'rad', 0.001, 0.0001, 0.01)
      );
      exposed = ['equilibrium', 'damping', 'perturbation'];
      break;
    case '6.2':
      fields.push(
        f('period', 'shooting 반환 횟수', '1', 2, 1, 3, true),
        f('iterations', 'Newton 최대 보정 수', '1', 12, 1, 15, true)
      );
      exposed = ['theta', 'period', 'iterations'];
      analysisIds = ['analysis:periodic-orbits'];
      break;
    case '6.3':
      exposed = ['damping', 'amplitude', 'stepsPerPeriod'];
      analysisIds = ['analysis:floquet'];
      break;
    case '6.4':
      set('damping', 0.03, 0.01, 0.06);
      set('amplitude', 0.12, 0.03, 0.2);
      fields.push(f('manifoldTurns', '다양체 반환 반복 수', '1', 10, 8, 14, true));
      exposed = ['damping', 'amplitude', 'manifoldTurns'];
      analysisIds = ['analysis:melnikov'];
      break;
    case '6.5':
      fields.push(
        f('endAmplitude', '추적 종료 구동 진폭', 'rad/s^2', 0.6, 0.35, 0.8),
        f('points', '추적 표본 수', '1', 5, 3, 7, true)
      );
      exposed = ['endAmplitude', 'points'];
      analysisIds = ['analysis:continuation'];
      break;
    case '6.6':
      fields.push(
        f('ds', 'arclength 간격', '1', 0.08, 0.05, 0.1),
        f('arcSteps', 'arclength 단계', '1', 36, 30, 44, true)
      );
      exposed = ['ds', 'arcSteps'];
      analysisIds = ['analysis:arclength'];
      break;
    case '6.7':
      fields.push(
        f('epsilon', '비대칭 seed 크기', '1', 0.12, 0.04, 0.2),
        f('endLambda', 'pitchfork 종료 매개변수', '1', 0.3, 0.2, 0.5)
      );
      exposed = ['epsilon', 'endLambda'];
      analysisIds = ['analysis:branch-switch'];
      break;
    case '6.8':
      set('amplitude', 1.07, 1.067, 1.075);
      set('theta', -0.2926, -3.2, 3.2);
      set('omega', 1.9745, -3, 3);
      fields.push(
        f('endAmplitude', 'cascade 스캔 끝', 'rad/s^2', 1.08, 1.077, 1.082),
        f('scanPoints', 'cascade 구동 표본 수', '1', 7, 5, 9, true)
      );
      exposed = ['amplitude', 'endAmplitude', 'scanPoints'];
      analysisIds = ['analysis:continuation'];
      break;
    case '6.9':
      fields.push(
        f('endParameter', 'NS 추적 끝 a', '1', 2.05, 2.01, 2.08),
        f('circleParameter', '불변 원 기준 a', '1', 2.03, 2.015, 2.04)
      );
      exposed = ['endParameter', 'circleParameter'];
      analysisIds = ['analysis:neimark-sacker', 'analysis:torus'];
      break;
    case '6.10':
      fields.push(
        f('coupling', '원형 맵 K', '1', 0.8, 0, 1),
        f('iterations', '회전수 측정 반복 수', '1', 1000, 500, 2000, true)
      );
      exposed = ['coupling', 'iterations'];
      analysisIds = ['analysis:arnold-tongue'];
      break;
    case '6.11':
      fields.push(
        f('resolution', '물리 지도 한 변', '1', 4, 4, 6, true),
        f('normalFormB', 'cusp 두번째 매개변수 b', '1', 0.6, 0.3, 0.9)
      );
      exposed = ['resolution', 'normalFormB'];
      analysisIds = ['analysis:codimension-two'];
      break;
  }
  return { systemId: 'system:driven', integratorId: 'integrator:rk4', fields, exposed, analysisIds };
}
