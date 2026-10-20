import type { DiscreteConfig, DiscreteSample } from '../../adapters/physics/discrete';
import { createPlot } from './core-plots';
export type DiscretePlotKind = 'phase' | 'probability' | 'wavephase' | 'momentum' | 'spectrum';
export function discretePlotDescription(config: DiscreteConfig, kind: DiscretePlotKind): string {
  if (kind === 'phase')
    return '위상 원통: 가로축 θ (rad, 한 바퀴 wrapping), 세로축 p (정규화, unwrapped)입니다. 점은 기록한 각 iteration의 상태이며 이음선 너머를 선으로 연결하지 않습니다. 표시용으로 최대 약 600점을 선택합니다.';
  if (kind === 'probability')
    return '가로축은 정수 운동량 인덱스 m, 세로축은 |ψₘ|²입니다. native FFT 순서의 배열을 m 순서로 정렬하여 표시합니다. 총합은 norm Σ|ψ|²이며 자동 재정규화하지 않습니다. 물리 운동량은 p=ℏm입니다.';
  if (kind === 'wavephase')
    return '가로축은 정수 운동량 인덱스 m, 세로축은 복소 파동함수의 주위상 arg ψₘ (rad, −π…π)입니다. 진폭이 0인 성분에는 위상이 정의되지 않아 점을 그리지 않습니다. 실수·허수 값은 복소 상태 JSON에 보존합니다.';
  if (kind === 'momentum')
    return '가로축은 iteration (무차원), 세로축은 ⟨m²⟩ (정수 운동량 인덱스의 제곱)입니다. 실제 정규화 운동량 제곱은 ⟨p²⟩=ℏ²⟨m²⟩이며 요약과 CSV에 별도로 표시합니다. 유한 주기 격자에서 얻은 값이므로 격자 크기로 수렴을 확인하세요.';
  return `가로축은 모드 인덱스, 세로축은 준에너지 ε=−ℏφ/T (정규화)입니다. φ는 주가지 고유위상 (rad), T=${config.parameters.period ?? 1}이며 ε는 2πℏ/T 모듈로 정의됩니다. raw 고유값을 단위원에 투영하지 않습니다. unitarity defect와 단위원 이탈을 함께 확인하세요.${config.systemId === 'system:quantum-kicked-rotor' && config.gridSize > 8 ? ' 현재 QKR N>8은 정확한 같은 격자 dense 스펙트럼의 UI 계산 한도를 넘어 준에너지를 제공하지 않습니다. 작은 다른 격자의 값을 대신 표시하지 않습니다.' : ''}`;
}
export function discreteTrajectoryPlot(
  document: Document,
  config: DiscreteConfig,
  samples: readonly DiscreteSample[],
  kind: DiscretePlotKind
): SVGSVGElement {
  const last = samples.at(-1);
  if (kind === 'phase') {
    const values = samples.map((sample) => sample.p),
      min = Math.min(0, ...values),
      max = Math.max(0, ...values),
      padding = Math.max(0.5, (max - min) * 0.05);
    return createPlot(
      document,
      '표준사상 위상 원통',
      'θ (rad, wrapped)',
      'p (정규화, unwrapped)',
      [{ label: '기록한 iteration', color: '#075985', points: samples.map((sample) => [sample.theta, sample.p]) }],
      true,
      { bounds: { xMin: 0, xMax: 2 * Math.PI, yMin: min - padding, yMax: max + padding } }
    );
  }
  if (kind === 'momentum')
    return createPlot(document, '운동량 인덱스 제곱 평균', 'iteration (1)', '⟨m²⟩ (1)', [
      {
        label: '⟨m²⟩',
        color: '#075985',
        points: samples.map((sample) => [sample.iteration, sample.meanSquareMomentum])
      }
    ]);
  if (kind === 'spectrum')
    return createPlot(
      document,
      'Floquet 준에너지 · raw',
      '모드 인덱스 (1)',
      'ε (정규화)',
      [
        {
          label: 'ε=−ℏφ/T',
          color: '#075985',
          points: (last?.spectrum?.quasiEnergies ?? []).map((value, i) => [i, value])
        }
      ],
      true
    );
  const points = (last?.momentum ?? [])
    .flatMap((m, i): [number, number][] => {
      if (kind === 'wavephase' && last!.probability[i] === 0) return [];
      return [[m, kind === 'wavephase' ? Math.atan2(last!.im[i]!, last!.re[i]!) : last!.probability[i]!]];
    })
    .sort((a, b) => a[0] - b[0]);
  return createPlot(
    document,
    kind === 'wavephase' ? '복소 파동함수 위상' : '운동량 확률 분포',
    '운동량 인덱스 m (1)',
    kind === 'wavephase' ? 'arg ψ (rad)' : '|ψₘ|² (1)',
    [{ label: kind === 'wavephase' ? 'arg ψ' : '|ψₘ|²', color: '#075985', points }],
    kind === 'wavephase'
  );
}
export function exportDiscreteFigure(
  document: Document,
  config: DiscreteConfig,
  samples: readonly DiscreteSample[],
  kind: DiscretePlotKind
): string {
  const svg = discreteTrajectoryPlot(document, config, samples, kind),
    metadata = document.createElementNS('http://www.w3.org/2000/svg', 'metadata');
  svg.removeAttribute('class');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  metadata.textContent = JSON.stringify({
    schema: 'pendulum-discrete-figure/v1',
    configuration: config,
    recordedSamples: samples.length,
    kind,
    lastIteration: samples.at(-1)?.iteration,
    description: discretePlotDescription(config, kind),
    rendering:
      'Maximum about 600 points per series. CSV contains all retained observations; skipped iterations are absent.',
    rawProjection: false,
    automaticRenormalization: false
  });
  svg.append(metadata);
  return new XMLSerializer().serializeToString(svg);
}
