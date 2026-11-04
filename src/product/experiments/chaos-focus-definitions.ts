import type { FocusExperimentDefinition } from '../learn/schema';
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

/** Bounded declarations only; numerical kernels are imported by the worker module. */
export function chaosFocusDeclaration(id: string): ResearchFocusDeclaration {
  if (!/^5\.(?:[1-9]|1[0-3])$/.test(id)) throw new RangeError('과정 5의 단원을 선택하세요.');
  const fields: ResearchFocusField[] = [
    field('theta1', '첫 시작 각도', 'rad', 0.4, -2.8, 2.8),
    field('theta2', '둘째 시작 각도', 'rad', 0.2, -2.8, 2.8),
    field('omega1', '첫 시작 각속도', 'rad/s', 0, -3, 3),
    field('omega2', '둘째 시작 각속도', 'rad/s', 0, -3, 3),
    field('gamma', '힌지 감쇠', 'kg*m^2/s', 0, 0, 0.4),
    field('duration', '관찰 기간', 's', 8, 4, 16),
    field('step', '적분 시간 간격', 's', 0.01, 0.002, 0.02),
    field('sampleEvery', '관측 기록 간격 (step)', '1', 4, 1, 8, true)
  ];
  let exposed: string[];
  const analysisIds: Record<string, string[]> = {
    '5.1': [],
    '5.2': ['analysis:fft'],
    '5.3': ['analysis:naff', 'analysis:fft'],
    '5.4': ['analysis:poincare'],
    '5.5': ['analysis:lyapunov'],
    '5.6': ['analysis:lyapunov'],
    '5.7': ['analysis:sali-fli'],
    '5.8': ['analysis:zero-one'],
    '5.9': ['analysis:shadowing'],
    '5.10': ['analysis:rqa'],
    '5.11': ['analysis:recurrence-network'],
    '5.12': ['analysis:correlation-dimension'],
    '5.13': ['analysis:multifractal']
  };
  switch (id) {
    case '5.1':
      fields.push(field('delay', '지연 (관측 표본)', '1', 6, 1, 20, true));
      exposed = ['theta1', 'delay'];
      break;
    case '5.2':
      fields.push(field('window', '창 함수 (0=직사각, 1=Hann)', '1', 1, 0, 1, true));
      exposed = ['duration', 'sampleEvery', 'window'];
      break;
    case '5.3':
      exposed = ['duration', 'sampleEvery'];
      break;
    case '5.4':
      fields.push(field('sectionValue', '단면 첫 각도', 'rad', 0, -2.8, 2.8));
      exposed = ['sectionValue', 'duration'];
      break;
    case '5.5':
    case '5.6':
      fields.push(field('renormEvery', '재규격화 간격 (step)', '1', 20, 2, 80, true));
      exposed = id === '5.5' ? ['duration', 'renormEvery', 'theta1'] : ['duration', 'gamma', 'renormEvery'];
      break;
    case '5.7':
      exposed = ['duration', 'theta1'];
      break;
    case '5.8':
      fields.push(
        field('coordinate', '관측 좌표 (0=각도1, 2=각속도1)', '1', 0, 0, 3, true),
        field('stride', '분석 표본 stride', '1', 1, 1, 4, true)
      );
      exposed = ['coordinate', 'stride', 'sampleEvery'];
      break;
    case '5.9':
      fields.push(field('threshold', '혼합 좌표 거리 허용치', '1', 0.001, 1e-7, 0.1));
      exposed = ['step', 'threshold'];
      break;
    default:
      fields.push(
        field('dimension', '지연 embedding 차원', '1', 2, 2, 4, true),
        field('delay', '지연 (관측 표본)', '1', 6, 1, 10, true),
        field('maxSamples', '최대 사용 표본', '1', 192, 96, id === '5.11' ? 256 : 384, true)
      );
      if (id === '5.10' || id === '5.11')
        fields.push(field('targetRecurrenceRate', '목표 재귀율 (epsilon 결정)', '1', 0.1, 0.02, 0.3));
      if (id === '5.12')
        fields.push(
          field('fitLowFraction', '적합 상관합 하한', '1', 0.02, 0.005, 0.05),
          field('fitHighFraction', '적합 상관합 상한', '1', 0.2, 0.1, 0.4)
        );
      if (id === '5.13') fields.push(field('qMin', 'q 하한', '1', 0, -2, 1), field('qMax', 'q 상한', '1', 4, 2, 6));
      exposed =
        id === '5.12'
          ? ['dimension', 'maxSamples', 'fitLowFraction', 'fitHighFraction']
          : id === '5.13'
            ? ['qMin', 'qMax', 'maxSamples']
            : ['targetRecurrenceRate', 'delay', 'maxSamples'];
  }
  return { systemId: 'system:double', integratorId: 'integrator:rk4', fields, exposed, analysisIds: analysisIds[id]! };
}

export function chaosFocusDefinition(
  id: string,
  copy: Pick<FocusExperimentDefinition, 'guidance' | 'successCriteria' | 'tasks'>
): FocusExperimentDefinition {
  const d = chaosFocusDeclaration(id);
  return {
    status: 'ready',
    kind: 'chaos-measurement',
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
