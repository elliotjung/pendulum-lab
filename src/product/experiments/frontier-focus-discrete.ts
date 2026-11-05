import {
  createDiscreteSimulation,
  defaultDiscreteConfig,
  discreteWarnings,
  type DiscreteConfig,
  type DiscreteSample
} from '../adapters/physics/discrete';
import type { ResearchFields } from './research-focus-contracts';
import { frontierLine as line, frontierMetric as metric, type FrontierParts } from './frontier-focus-science';
function run(config: DiscreteConfig, progress?: (fraction: number) => void): DiscreteSample[] {
  const simulation = createDiscreteSimulation(config),
    trace = [simulation.snapshot()];
  while (!simulation.done) {
    const s = simulation.step();
    trace.push(s);
    if (s.step % 16 === 0) progress?.(s.step / config.iterations);
  }
  return trace;
}
export function executeFrontierDiscrete(
  id: string,
  v: ResearchFields,
  c: DiscreteConfig,
  progress?: (fraction: number) => void
): FrontierParts {
  const trace = run(c, (p) => progress?.(0.7 * p)),
    last = trace.at(-1)!;
  const metrics = [metric('iterations', '실제 반복 수', last.step)];
  const tables: FrontierParts['tables'][number][] = [];
  const charts: FrontierParts['charts'][number][] = [];
  const warnings = discreteWarnings(c);
  if (id === '7.12') {
    metrics.push(metric('momentum-displacement', '종료 momentum 차', last.p - trace[0]!.p, '정규화'));
    charts.push(
      {
        ...line('phase-cylinder', '위상 원통의 실제 반복점', 'θ (rad)', 'p (정규화)', [
          { label: '단일 유한 궤적', points: trace.map((s) => ({ x: s.theta, y: s.p })) }
        ]),
        mode: 'scatter'
      },
      line('momentum', '감싸지 않은 momentum', '반복 n', 'p (정규화)', [
        { label: 'p', points: trace.map((s) => ({ x: s.iteration, y: s.p })) }
      ])
    );
    tables.push({
      id: 'map-record',
      title: '정규화 반복과 원통 좌표',
      columns: ['n', 'θ (rad)', 'p (정규화)'],
      rows: trace.map((s) => [s.iteration, s.theta, s.p])
    });
  } else {
    const classical = run({
        ...defaultDiscreteConfig('system:standard-map'),
        parameters: { kickStrength: v.kick! },
        iterations: v.iterations!
      }),
      operator = createDiscreteSimulation(defaultDiscreteConfig('system:unitary-floquet')).snapshot();
    metrics.push(
      metric('norm-drift', '최대 확률 norm 오차', Math.max(...trace.map((s) => s.normDrift))),
      metric('quantum-momentum-square', '종료 양자 ⟨p²⟩', last.meanSquareMomentum, '정규화'),
      metric('operator-unitarity', '동반 4×4 연산자 unitarity defect', operator.spectrum!.unitarityDefect)
    );
    charts.push(
      line('quantum-classical', '동일 K의 유한 양자·고전 확산 관찰', 'Floquet 반복 n', '정규화 p²', [
        { label: '양자 ⟨p²⟩ (N=8)', points: trace.map((s) => ({ x: s.iteration, y: s.meanSquareMomentum })) },
        { label: '고전 단일 궤적 p²', points: classical.map((s) => ({ x: s.iteration, y: s.p * s.p })) }
      ]),
      line('probability', '끝 파동함수의 FFT 순서 momentum 확률', '정규화 momentum', '확률', [
        {
          label: '|ψ|²',
          points: last.probability.map((y, i) => ({ x: last.momentum[i]!, y })).sort((a, b) => a.x - b.x)
        }
      ])
    );
    tables.push(
      {
        id: 'qkr-spectrum',
        title: '동일 N=8 Floquet 연산자의 스펙트럼',
        columns: ['고유값 index', '위상 (rad)', '준에너지 (정규화)'],
        rows: last.spectrum!.phases.map((p, i) => [i, p, last.spectrum!.quasiEnergies[i]!])
      },
      {
        id: 'operator-spectrum',
        title: '별도 4×4 unitary Floquet 연산자 평가 (QKR와 다른 예제)',
        columns: ['index', '위상 (rad)', '준에너지'],
        rows: operator.spectrum!.phases.map((p, i) => [i, p, operator.spectrum!.quasiEnergies[i]!])
      }
    );
    warnings.push(
      '고전 곡선은 단일 초기조건이므로 양자 기대값의 직접적인 통계적 대조군이 아닙니다. N=8 finite FFT 격자는 장시간 국소화의 증거로 충분하지 않습니다. 표의 4×4 예제는 별도 unitary 연산자이며 QKR 모델의 교체가 아닙니다.'
    );
  }
  return { metrics, tables, charts, warnings };
}
