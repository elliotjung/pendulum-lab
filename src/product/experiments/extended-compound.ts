import { poincareSection } from '../../chaos/poincare';
import { createPlanarSimulation, type PlanarConfig } from '../adapters/physics/planar';
import { extendedMetric as metric, type ExtendedTrace } from './extended-results';

/** Two preserved models at matched conditions; no equation of motion is reproduced here. */
export function compoundComparison(config: PlanarConfig, rodTrace: readonly ExtendedTrace[]) {
  const pointConfig = { ...config, systemId: 'system:double' as const };
  const point = createPlanarSimulation(pointConfig);
  const initial = point.snapshot();
  const pointAngles = new Map<number, number>([[initial.time, initial.state[0]]]);
  const retainedTimes = new Set(rodTrace.map((sample) => sample.time));
  while (!point.done) {
    const sample = point.step();
    if (retainedTimes.has(sample.time) || point.done) pointAngles.set(sample.time, sample.state[0]);
  }
  const end = point.snapshot();
  const rows = rodTrace
    .filter((_, index) => index % Math.max(1, Math.ceil(rodTrace.length / 100)) === 0 || index === rodTrace.length - 1)
    .map((sample) => [sample.time, sample.state[0]!, pointAngles.get(sample.time)!]);
  const crossings = [config, pointConfig].map((current) =>
    poincareSection(current.initialState, createPlanarSimulation(current).derivative, {
      section: (state) => state[0]!,
      direction: 'rising',
      dt: config.step,
      maxTime: config.duration,
      maxPoints: 64,
      rootTol: 1e-10
    })
  );
  const intervals = crossings.map((result) => result.times.slice(1).map((time, index) => time - result.times[index]!));
  const intervalRows: (number | string)[][] = [];
  crossings.forEach((result, model) => {
    result.times.forEach((time, index) =>
      intervalRows.push([
        model === 0 ? '균일 막대' : '끝점 질점',
        index + 1,
        time + (config.startTime ?? 0),
        index > 0 ? intervals[model]![index - 1]! : '앞선 동방향 교차 없음',
        result.rootResiduals[index]!
      ])
    );
  });
  const metrics = [
    metric(
      'compound-point-endpoint-distance',
      '막대/질점 끝점 정규화 상태 거리',
      Math.hypot(...rodTrace.at(-1)!.state.map((value, i) => value - end.state[i]!)),
      '1'
    )
  ];
  intervals.forEach((values, model) => {
    metrics.push(
      metric(
        model === 0 ? 'rod-rising-crossings' : 'point-rising-crossings',
        model === 0 ? '막대의 상승 단면 교차 수' : '질점의 상승 단면 교차 수',
        crossings[model]!.times.length,
        '1'
      )
    );
    if (values.length)
      metrics.push(
        metric(
          model === 0 ? 'rod-mean-crossing-interval' : 'point-mean-crossing-interval',
          model === 0 ? '막대의 평균 동방향 교차 간격' : '질점의 평균 동방향 교차 간격',
          values.reduce((a, b) => a + b, 0) / values.length,
          's'
        )
      );
  });
  return {
    metrics,
    tables: [
      {
        id: 'compound-time-comparison',
        title: '같은 초기조건의 막대·질점 각도 비교',
        columns: ['시간 (s)', '균일 막대 theta1 (rad)', '끝점 질점 theta1 (rad)'],
        rows
      },
      {
        id: 'compound-crossing-intervals',
        title: '공용 root 검출의 동방향 교차 간격',
        columns: ['모형', '상승 교차 번호', '시각 (s)', '직전 상승 교차와의 간격 (s)', '단면 잔차 (rad)'],
        rows: intervalRows
      }
    ],
    warnings: [
      '막대·질점 비교는 같은 질량·길이·초기 각도/각속도·간격·기간의 기존 RK4 모형입니다. 중력 퍼텐셜과 관성이 함께 달라집니다.',
      '동방향 theta1=0 교차 간격은 관측량의 유한 시간 재귀 간격입니다. 두 정상모드가 섞인 이중진자의 고유한 주기를 인증하지 않습니다. 교차 두 개 미만이면 평균 간격을 표시하지 않습니다.'
    ]
  };
}
