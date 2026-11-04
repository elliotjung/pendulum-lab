import type { NonlinearFocusConfig } from './nonlinear-focus-config';
import type { ResearchFields } from './research-focus-contracts';
import {
  runNative,
  metric,
  lineChart,
  phaseChart,
  tail,
  rms,
  mean,
  halfRange,
  trap,
  type FocusParts,
  type FocusSample
} from './nonlinear-focus-helpers';

export function secondNonlinearExperiment(
  id: string,
  v: ResearchFields,
  source: NonlinearFocusConfig,
  s: FocusSample[],
  progress?: (p: number) => void
): FocusParts {
  const metrics: FocusParts['metrics'][number][] = [],
    tables: FocusParts['tables'][number][] = [],
    charts: FocusParts['charts'][number][] = [],
    warnings: string[] = [];
  if (id === '4.6' && source.family === 'driven') {
    const symmetric = runNative({
        family: 'driven',
        config: { ...source.config, initialState: [v.theta!, v.theta!, 0, 0] }
      }),
      antisymmetric = runNative({
        family: 'driven',
        config: { ...source.config, initialState: [v.theta!, -v.theta!, 0, 0] }
      });
    metrics.push(
      metric('in-phase-frequency', '동위상 선형 모드 각주파수', Math.sqrt(v.g! / v.length!), 'rad/s'),
      metric(
        'anti-phase-frequency',
        '역위상 선형 모드 각주파수',
        Math.sqrt(v.g! / v.length! + 2 * v.coupling!),
        'rad/s'
      ),
      metric(
        'symmetric-defect',
        '대칭 모드의 max |θ₁−θ₂|',
        Math.max(...symmetric.map((x) => Math.abs(x.state[0]! - x.state[1]!))),
        'rad'
      )
    );
    charts.push(
      lineChart(
        'beats',
        '한 진자에서 시작한 beat와 교환',
        s,
        [
          { label: 'θ₁', value: (x) => x.state[0]! },
          { label: 'θ₂', value: (x) => x.state[1]! }
        ],
        'rad'
      ),
      lineChart(
        'symmetric',
        '동위상 정상모드',
        symmetric,
        [{ label: '(θ₁+θ₂)/2', value: (x) => (x.state[0]! + x.state[1]!) / 2 }],
        'rad'
      ),
      lineChart(
        'antisymmetric',
        '역위상 정상모드',
        antisymmetric,
        [{ label: '(θ₁−θ₂)/2', value: (x) => (x.state[0]! - x.state[1]!) / 2 }],
        'rad'
      )
    );
    warnings.push(
      '정상모드 주파수는 동일한 두 진자의 작은 각도 선형화입니다. 보존 결합만 있는 동일 진자의 beat를 소산계의 attracting synchronization과 구분하세요. 이 실험은 길이 1 m를 고정하여 기존 결합 에너지의 길이 의존 모델 차이를 피합니다.'
    );
  } else if (id === '4.7' && source.family === 'nonlinear') {
    const frequencies = [0.65, 0.825, 1, 1.175, 1.35],
      up: number[][] = [],
      down: number[][] = [];
    let state = [...source.config.initialState],
      completed = 0;
    for (const [direction, list, rows] of [
      ['상향', frequencies, up],
      ['하향', [...frequencies].reverse(), down]
    ] as const) {
      for (const frequency of list) {
        const samples = runNative({
          family: 'nonlinear',
          config: {
            ...source.config,
            initialState: state,
            parameters: { ...source.config.parameters, driveFrequency: frequency }
          }
        });
        state = [...samples.at(-1)!.state];
        rows.push([frequency, halfRange(samples), mean(tail(samples).map((x) => x.state[0]!))]);
        progress?.(++completed / 12);
      }
      warnings.push(`${direction} sweep: 이전 주파수의 실제 끝점·구동 위상을 다음 구간의 초기조건으로 전달합니다.`);
    }
    const other = runNative({ family: 'nonlinear', config: { ...source.config, initialState: [-v.x!, 0, 0] } });
    const gap = Math.max(...up.map((a) => Math.abs(a[1]! - down.find((b) => b[0] === a[0])![1]!)));
    tables.push({
      id: 'duffing-sweep',
      title: '실제 끝점으로 이어진 유한시간 상향/하향 응답',
      columns: ['방향', 'Ω (정규화)', '후반부 반폭', '후반부 평균'],
      rows: [...up.map((r) => ['상향', ...r]), ...down.map((r) => ['하향', ...r])]
    });
    charts.push(
      {
        id: 'hysteresis',
        title: '주파수 이력에 따른 유한시간 응답',
        xLabel: 'Ω (정규화)',
        yLabel: '후반부 반폭 (정규화)',
        series: [
          { label: '상향', points: up.map((r) => ({ x: r[0]!, y: r[1]! })) },
          { label: '하향', points: down.map((r) => ({ x: r[0]!, y: r[1]! })) }
        ]
      },
      phaseChart('basin-pair', '반대 우물의 초기조건을 같은 구동에서 비교', [
        { label: '기준 초기조건', samples: s },
        { label: '반대 초기조건', samples: other }
      ])
    );
    metrics.push(
      metric('max-sweep-gap', '상향·하향 반폭의 최대 차이', gap),
      metric('positive-start-tail-mean', '기준 초기조건의 후반부 평균', mean(tail(s).map((x) => x.state[0]!))),
      metric('opposite-start-tail-mean', '반대 초기조건의 후반부 평균', mean(tail(other).map((x) => x.state[0]!)))
    );
    warnings.push(
      '상향·하향 차이는 finite dwell과 transient를 포함합니다. 이것만으로 안정 branch나 fold를 인증하지 않습니다. 정규화 이중 우물에서 초기조건에 따른 서로 다른 응답을 찾고, γ=0에서는 ±sqrt(-α/β)의 평형을 대조하세요. 강제 진동의 반폭을 물리적인 m 또는 J로 표시하지 않습니다.'
    );
  } else if (id === '4.8' && source.family === 'nonlinear') {
    const outer = runNative({ family: 'nonlinear', config: { ...source.config, initialState: [3, 0] } });
    metrics.push(
      metric(
        'inner-tail-amplitude',
        '안쪽 시작의 후반부 최대 |x|',
        Math.max(...tail(s).map((x) => Math.abs(x.state[0]!)))
      ),
      metric(
        'outer-tail-amplitude',
        '바깥쪽 시작의 후반부 최대 |x|',
        Math.max(...tail(outer).map((x) => Math.abs(x.state[0]!)))
      ),
      metric(
        'tail-energy-input',
        '후반부 평균 μ(1−x²)v²',
        mean(tail(s).map((x) => v.mu! * (1 - x.state[0]! ** 2) * x.state[1]! ** 2))
      )
    );
    charts.push(
      phaseChart('attracting-cycle', '안쪽·바깥쪽 초기조건의 실제 위상 궤적', [
        { label: '안쪽', samples: s },
        { label: '바깥쪽', samples: outer }
      ]),
      lineChart(
        'van-der-pol-time',
        '느림·빠름 구조와 진폭 변화',
        s,
        [
          { label: 'x', value: (x) => x.state[0]! },
          { label: 'v', value: (x) => x.state[1]! }
        ],
        '정규화'
      ),
      lineChart(
        'nonlinear-damping',
        '조화 핵 에너지의 주입·소산률',
        s,
        [{ label: 'μ(1−x²)v²', value: (x) => v.mu! * (1 - x.state[0]! ** 2) * x.state[1]! ** 2 }],
        '정규화'
      )
    );
    warnings.push(
      'μ=0에서는 서로 다른 초기 진폭이 보존되어 하나의 attracting limit cycle로 모이지 않습니다. μ>0의 유한시간 접근은 전역 수렴 증명이 아닙니다. 큰 μ는 강성과 이완 진동의 시간 척도를 만들므로 dt·μ≤0.1과 추가 간격 수렴을 확인하세요.'
    );
  } else if (id === '4.9' && source.family === 'nonlinear') {
    let previous = s[0]!.mode,
      transitions = 0;
    const rows: (number | string)[][] = [];
    for (const sample of s) {
      if (sample.mode !== previous) {
        transitions++;
        if (rows.length < 120)
          rows.push([sample.time, previous, sample.mode, sample.state[0]!, sample.state[1]!, sample.friction]);
        previous = sample.mode;
      }
    }
    metrics.push(
      metric('mode-transitions', '격자에서 관찰한 정지·미끄럼 전환 수', transitions),
      metric(
        'friction-work',
        'native 접촉 마찰이 한 일의 격자 적분',
        trap(s, (x) => x.friction * x.state[1]!),
        'J'
      )
    );
    tables.push({
      id: 'contact-events',
      title: '격자상의 정지·미끄럼 전환 · 최대 120개 표시',
      columns: ['관찰 시각 (s)', '이전 모드', '새 모드', 'x (m)', 'v (m/s)', '마찰력 (N)'],
      rows
    });
    charts.push(
      lineChart('contact-state', '블록 속도와 정지·미끄럼', s, [{ label: 'v', value: (x) => x.state[1]! }], 'm/s'),
      lineChart(
        'contact-force',
        '외력과 native complementarity 마찰력',
        s,
        [
          { label: '외력', value: (x) => x.forcing },
          { label: '마찰력', value: (x) => x.friction }
        ],
        'N'
      )
    );
    warnings.push(
      '질량·용수철 블록의 scalar 접촉 예제이며 완전한 마찰 진자 모형이 아닙니다. stick/slip 시각은 고정 격자 관찰로 정확한 연속 사건 시각이 아닙니다. 정지 구간은 |외력−kx|≤Fs와 v=0을 함께 확인하고, 큰 간격에서 가짜 전환을 의심하세요.'
    );
  } else if (id === '4.10' && source.family === 'nonlinear') {
    const gains = [v.gain! - 0.3, v.gain!, v.gain! + 0.3],
      delays = [0.7 * v.delay!, v.delay!, 1.2 * v.delay!],
      rows: number[][] = [];
    let completed = 0;
    for (const delay of delays)
      for (const gain of gains) {
        const values = runNative({
          family: 'nonlinear',
          config: { ...source.config, parameters: { ...source.config.parameters, delay, feedbackGain: gain } }
        });
        const differences = values
          .filter((x) => x.time >= Math.max(delay, v.duration! / 2))
          .map((x) => {
            const index = Math.max(0, Math.min(values.length - 2, Math.floor((x.time - delay) / v.step!))),
              a = values[index]!,
              b = values[index + 1]!,
              fraction = (x.time - delay - a.time) / (b.time - a.time);
            return x.state[0]! - (a.state[0]! + (b.state[0]! - a.state[0]!) * fraction);
          });
        rows.push([
          gain,
          delay,
          rms(differences),
          rms(tail(values).map((x) => x.feedback)),
          Math.max(...values.map((x) => Math.abs(x.state[0]!)))
        ]);
        progress?.(++completed / 9);
      }
    tables.push({
      id: 'delay-grid',
      title: '실제 지연 이력을 사용한 gain–delay 후보 격자',
      columns: ['K (s^-2)', 'τ (s)', 'θ(t)−θ(t−τ) RMS (rad)', '피드백 RMS (rad/s²)', 'max |θ| (rad)'],
      rows
    });
    charts.push(
      {
        id: 'delay-candidates',
        title: '지연 주기 일치의 유한시간 결함',
        xLabel: 'K (s^-2)',
        yLabel: '주기 일치 결함 RMS (rad)',
        series: delays.map((delay) => ({
          label: `τ=${delay.toFixed(3)} s`,
          points: rows.filter((r) => r[1] === delay).map((r) => ({ x: r[0]!, y: r[2]! }))
        }))
      },
      lineChart(
        'delay-response',
        '선택한 gain·delay의 실제 상태',
        s,
        [{ label: 'θ', value: (x) => x.state[0]! }],
        'rad'
      ),
      lineChart(
        'delay-feedback',
        '이력과 현재 차이의 피드백',
        s,
        [{ label: 'K[θ(t−τ)−θ(t)]', value: (x) => x.feedback }],
        'rad/s²'
      )
    );
    metrics.push(
      metric('forcing-period', '강제 주기 T=2π/Ω', (2 * Math.PI) / v.frequency!, 's'),
      metric('tail-feedback-rms', '선택한 run의 후반부 피드백 RMS', rms(tail(s).map((x) => x.feedback)), 'rad/s^2'),
      metric(
        'smallest-periodicity-defect',
        '격자 중 가장 작은 주기 일치 결함',
        Math.min(...rows.map((r) => r[2]!)),
        'rad'
      )
    );
    warnings.push(
      '정확한 τ-주기 궤도에서는 θ(t−τ)=θ(t)여서 피드백이 0입니다. 낮은 RMS만으로 목표 불안정 주기궤도의 안정화를 증명하지 않습니다. 이 bounded grid는 유한시간 후보 탐색이며 UPO 탐색·Floquet 검증을 수행하지 않습니다. 작은 gain이나 정지 평형도 낮은 피드백을 만들 수 있습니다. 초기 상수 이력, 구동 위상·시간 원점·dt를 함께 보존하며 τ≥dt가 필요합니다.'
    );
  } else throw new Error('과정 4 후반부의 native 모형과 단원이 일치하지 않습니다.');
  return { metrics, tables, charts, warnings };
}
