import { huygensLockedPhaseDifference } from '../../physics/kuramoto';
import { pendulumNetworkEnergy, ringPhononDispersion } from '../../physics/pendulumNetwork';
import {
  createNetworkBasinJob,
  createNetworkSimulation,
  networkWarnings,
  type NetworkConfig,
  type NetworkSample
} from '../adapters/physics/network';
import type { ResearchFields } from './research-focus-contracts';
import { frontierLine as line, frontierMetric as metric, type FrontierParts } from './frontier-focus-science';

function run(config: NetworkConfig, progress?: (fraction: number) => void): NetworkSample[] {
  const simulation = createNetworkSimulation(config),
    samples = [simulation.snapshot()];
  while (!simulation.done) {
    const sample = simulation.step();
    if (sample.step % 4 === 0 || simulation.done) samples.push(sample);
    if (sample.step % 64 === 0) progress?.(sample.time / config.duration);
  }
  return samples;
}
export function executeFrontierNetwork(
  id: string,
  v: ResearchFields,
  c: NetworkConfig,
  progress?: (fraction: number) => void
): FrontierParts {
  const trace = run(c, (p) => progress?.(p * 0.45)),
    first = trace[0]!,
    last = trace.at(-1)!;
  const metrics = [
    metric('final-order', '종료 순간 원형 정렬', last.order),
    metric(
      'energy-change',
      '기준 run 에너지 변화',
      last.energy - first.energy,
      c.systemId === 'system:pendulum-network' ? 'J' : '정규화/해당없음'
    )
  ];
  const tables: FrontierParts['tables'][number][] = [];
  const charts: FrontierParts['charts'][number][] = [];
  const warnings = networkWarnings(c);
  if (id === '7.1') {
    const job = createNetworkBasinJob(c);
    let ticks = 0;
    while (!job.done) {
      job.step();
      if (++ticks % 2048 === 0) progress?.(0.45 + (0.5 * job.snapshot().completed) / job.snapshot().total);
    }
    const basin = job.snapshot();
    metrics.push(
      metric(
        'converged-fraction',
        '속도 정착 조건을 만족한 격자 비율',
        basin.cells.filter((x) => x.converged).length / basin.total
      )
    );
    tables.push({
      id: 'basin-cells',
      title: '유한 시간 basin 후보와 미수렴 mask',
      columns: ['x (정규화)', 'y (정규화)', '최근접 자석', '속도 정착 여부', '계산 단계'],
      rows: basin.cells.map((x) => [x.x, x.y, x.magnetId, x.converged ? '정착' : '미수렴', x.steps])
    });
    charts.push({
      ...line(
        'basin',
        '자석별 유한 시간 도착 후보',
        'x (정규화)',
        'y (정규화)',
        c.graph.nodes.map((n) => ({
          label: n.id,
          points: basin.cells.filter((x) => x.magnetId === n.id).map((x) => ({ x: x.x, y: x.y }))
        }))
      ),
      mode: 'scatter'
    });
    warnings.push(
      '정착 여부는 마지막 속도 기준입니다. 미수렴 cell을 지우지 않으며 이 격자로 fractal/Wada 성질을 판정하지 않습니다.'
    );
  } else if (id === '7.2') {
    const frequencies = ringPhononDispersion(9.81, v.coupling!, c.graph.nodes.length);
    tables.push({
      id: 'graph-spectrum',
      title: '균일 고리의 실제 native 선형 모드',
      columns: ['모드 k', 'ω² (s⁻²)'],
      rows: frequencies.map((x, i) => [i, x])
    });
    charts.push(
      line('mode', '선형 첫 모드와 비선형 실제 링크', 't (s)', 'θ₀ (rad)', [
        { label: '실제 비선형', points: trace.map((s) => ({ x: s.time, y: s.state[0]! })) },
        {
          label: '작은 진폭 선형 예측',
          points: trace.map((s) => ({ x: s.time, y: v.amplitude! * Math.cos(Math.sqrt(frequencies[1]!) * s.time) }))
        }
      ])
    );
    metrics.push(
      metric(
        'linear-error',
        '첫 링크의 최대 선형근사 오차',
        Math.max(
          ...trace.map((s) => Math.abs(s.state[0]! - v.amplitude! * Math.cos(Math.sqrt(frequencies[1]!) * s.time)))
        ),
        'rad'
      )
    );
  } else if (id === '7.3') {
    const prediction = huygensLockedPhaseDifference({
      frequencies: [1, 1 + v.detuning!],
      coupling: v.coupling!,
      phaseLag: 0
    });
    charts.push(
      line('phase-lock', '두 위상 차의 잠금 접근', 't (s)', 'Δθ (rad)', [
        { label: '실제 위상 차', points: trace.map((s) => ({ x: s.time, y: s.phaseDifference })) }
      ])
    );
    tables.push({
      id: 'locking',
      title: '축약 모형의 잠금 조건',
      columns: ['조건', '결과'],
      rows: [
        ['native 양의 K 안정 잠금 예측', prediction === null ? '해당 해 없음' : prediction],
        ['종료 위상 차 (rad)', last.phaseDifference],
        ['음의 K 해석', 'π 부근 역위상 후보; 실제 시계 진폭/지지대 동역학 미포함']
      ]
    });
  } else if (id === '7.4') {
    const values = [0, v.coupling! / 2, v.coupling!, 2 * v.coupling!];
    const rows = values.map((coupling, i) => {
      const samples = run({ ...c, parameters: { ...c.parameters, coupling } });
      const tail = samples.slice(Math.floor(samples.length / 2));
      progress?.(0.45 + (0.5 * (i + 1)) / values.length);
      return [coupling, tail.reduce((a, s) => a + s.order, 0) / tail.length];
    });
    tables.push({
      id: 'coupling-scan',
      title: '동일 seed의 유한 크기 결합 scan',
      columns: ['K (s⁻¹)', '후반 시간 평균 R'],
      rows
    });
    charts.push(
      line('order', '순간 질서매개변수', 't (s)', 'R', [
        { label: '선택한 K', points: trace.map((s) => ({ x: s.time, y: s.order })) }
      ])
    );
    warnings.push(
      'N=16과 유한 시간의 R scan은 열역학 극한의 임계 결합 추정이 아닙니다. 이웃 합 정규화와 선택한 주파수 표본을 함께 비교하세요.'
    );
  } else if (id === '7.5') {
    metrics.push(metric('local-coherence', '종료 평균 국소 coherence', last.meanLocalOrder));
    charts.push(
      line('local', '공간 순서를 보존한 국소 정렬', '고리 노드 index', '국소 R', [
        { label: '처음', points: first.localCoherence.map((y, x) => ({ x, y })) },
        { label: '종료', points: last.localCoherence.map((y, x) => ({ x, y })) }
      ])
    );
    tables.push({
      id: 'classification',
      title: '순간 분류와 전역/국소 차이',
      columns: ['t (s)', '전역 R', '평균 국소 R', '순간 분류'],
      rows: trace
        .filter((_, i) => i % 10 === 0 || i === trace.length - 1)
        .map((s) => [s.time, s.order, s.meanLocalOrder, s.classification])
    });
  } else {
    const n = c.graph.nodes.length,
      center = Math.floor(n / 2);
    const energies = (s: NetworkSample) =>
      s.state
        .slice(0, n)
        .map(
          (theta, i) =>
            pendulumNetworkEnergy([theta, s.state[n + i]!], { masses: [1], lengths: [1], g: 1, coupling: [0] }).total
        );
    const spread = trace.map((s) => {
      const e = energies(s),
        sum = e.reduce((a, b) => a + b, 0);
      return { x: s.time, y: sum ? e[center]! / sum : 0 };
    });
    const finalE = energies(last),
      sum = finalE.reduce((a, b) => a + b, 0),
      square = finalE.reduce((a, b) => a + b * b, 0);
    metrics.push(metric('participation', '종료 onsite 에너지 참여 수', square ? (sum * sum) / square : 0));
    charts.push(
      line('localized-fraction', '초기 여기 링크의 onsite 에너지 비율', 't (s)', 'E_center / Σ E_onsite', [
        { label: '국소화 진단', points: spread }
      ]),
      line('packet-profile', '최종 onsite 에너지 분포', '고리 링크 index', 'E_onsite (J)', [
        { label: '최종 분포', points: finalE.map((y, x) => ({ x, y })) }
      ])
    );
    tables.push({
      id: 'phonons',
      title: '같은 고리의 선형 band (비선형 packet과 구분)',
      columns: ['k', 'ω² (s⁻²)'],
      rows: ringPhononDispersion(1, v.coupling!, n).map((x, i) => [i, x])
    });
    warnings.push(
      '참여 수는 중력+운동 onsite 에너지만 사용하고 결합 에너지는 제외합니다. 총 에너지는 별도 native 값입니다. 유한 시간 국소화는 시간 주기 breather의 존재·안정성 증명이 아닙니다.'
    );
  }
  return { metrics, tables, charts, warnings };
}
