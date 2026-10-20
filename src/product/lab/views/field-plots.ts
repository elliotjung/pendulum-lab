import type { FieldConfig, FieldSample } from '../../adapters/physics/field';
import { createPlot } from './core-plots';
import { downsampleFieldSamples, fieldTimeLabel } from './field-storage';

export type FieldPlotKind = 'heatmap' | 'profile' | 'state' | 'ensemble' | 'modes';
const NS = 'http://www.w3.org/2000/svg';
const diagnostic = (config: FieldConfig) =>
  ['system:lattice-fk-limit', 'system:frenkel-kontorova'].includes(config.systemId);
export function fieldPlotDescription(config: FieldConfig, kind: FieldPlotKind): string {
  if (config.systemId === 'system:lattice-fk-limit')
    return '가로축은 모드 인덱스 (무차원), 세로축은 고유각진동수의 제곱 ω² (정규화)이며 점은 native 조화 고리의 모드별 결과입니다. 시간 진화나 비선형 breather·수송을 계산하지 않습니다.';
  if (config.systemId === 'system:frenkel-kontorova')
    return '가로축은 격자 위치 x (정규화), 세로축은 각도 u (정규화)이며 선은 고정 경계의 정적 FK kink 완화 프로필입니다. 수렴 여부와 잔차를 확인하세요. 정지점은 안정 최소점과 같지 않으며 동적 depinning·이동도를 계산하지 않습니다.';
  if (kind === 'heatmap')
    return '가로축은 공간 좌표 x (정규화), 세로축은 정규화 시간 τ, 색은 장/변위 (정규화)입니다. 청색은 음수, 백색은 0, 적색은 양수입니다. 최대 65개 시각과 64개 위치를 선택하며 양 끝을 포함합니다. 픽셀 간 보간을 하지 않습니다. 정확한 기록은 기록 원본 CSV에서 확인하세요.';
  if (kind === 'ensemble')
    return '가로축은 정규화 시간 τ, 세로축은 정규화 θ입니다. 청색 선은 member별 독립 seed로 얻은 θ의 평균, 갈색 선은 평균+표준편차, 녹색 선은 평균−표준편차입니다. 표준편차는 앙상블 산포이며 평균의 신뢰구간이 아닙니다. 유한 앙상블은 확률밀도 방정식의 해를 대신하지 않습니다.';
  if (kind === 'modes')
    return '가로축은 모드 인덱스 (무차원), 세로축은 에너지 (정규화)입니다. 점은 마지막 수신 상태의 FPUT 조화 모드 에너지입니다. 비선형 항이 있으면 모드 에너지 합은 전체 에너지와 다릅니다. 유한 관찰만으로 재귀를 확정하지 마세요.';
  if (kind === 'state')
    return '가로축은 정규화 시간 τ, 세로축은 정규화 좌표입니다. 선은 선택한 개별 앙상블 member 또는 격자점의 시간 기록입니다. SVG는 선당 약 600점을 선택합니다.';
  if (config.systemId === 'system:langevin')
    return '가로축은 상태 성분 인덱스 (무차원, θ 성분 0), 세로축은 θ 앙상블 평균 (정규화)입니다. 점은 마지막 수신 상태의 평균입니다.';
  return '가로축은 공간 x (정규화), 세로축은 장/변위 (정규화)이며 선은 마지막 수신 상태의 공간 프로필입니다. 모든 축과 에너지는 정규화 값입니다. 고정 경계는 양 끝, 주기 경계는 길이 L에서 이어집니다.';
}
function svgNode(document: Document, name: string, attrs: Record<string, string>, text?: string) {
  const node = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function heatmap(document: Document, config: FieldConfig, samples: readonly FieldSample[]) {
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('core-plot');
  svg.setAttribute('viewBox', '0 0 720 360');
  svg.setAttribute('role', 'img');
  const label = `공간·시간 heatmap. 가로축 공간 x (정규화), 세로축 시간 τ (정규화), 색은 장/변위. ${samples.length}개 기록 중 최대 65개 시각, 최대 64개 위치. 수치는 CSV에서 확인하세요.`;
  svg.setAttribute('aria-label', label);
  svg.append(
    svgNode(document, 'title', {}, label),
    svgNode(document, 'rect', { width: '720', height: '360', fill: '#fff' })
  );
  const retained = downsampleFieldSamples(samples, 65),
    indices = downsampleFieldSamples(
      Array.from({ length: config.grid.points }, (_, i) => i),
      64
    ),
    values = retained.flatMap((sample) => indices.map((i) => sample.profile[i]!)).filter(Number.isFinite),
    extent = Math.max(1e-10, ...values.map(Math.abs));
  retained.forEach((sample, row) =>
    indices.forEach((index, col) => {
      const value = sample.profile[index] ?? 0,
        fraction = Math.min(1, Math.abs(value) / extent),
        channel = Math.round(255 - 175 * fraction),
        fill = value < 0 ? `rgb(${channel},${channel},255)` : `rgb(255,${channel},${channel})`,
        rect = svgNode(document, 'rect', {
          x: String(70 + (620 * col) / indices.length),
          y: String(50 + (245 * row) / retained.length),
          width: String(620 / indices.length + 0.2),
          height: String(245 / retained.length + 0.2),
          fill
        });
      rect.append(svgNode(document, 'title', {}, `격자 ${index}, τ=${sample.time}, 값=${value}`));
      svg.append(rect);
    })
  );
  const labels = [
    [70, 25, '공간·시간 프로필'],
    [300, 345, '공간 x (정규화)'],
    [8, 44, '시간 τ'],
    [70, 318, '0'],
    [
      690,
      318,
      config.grid.boundary === 'periodic' ? `L=${config.grid.length} (끝 미포함)` : String(config.grid.length)
    ],
    [8, 65, String(retained[0]?.time ?? 0)],
    [8, 290, String(retained.at(-1)?.time ?? 0)],
    [70, 338, `청색 −${extent.toPrecision(3)} / 백색 0 / 적색 +${extent.toPrecision(3)}`]
  ] as const;
  labels.forEach(([x, y, text]) =>
    svg.append(
      svgNode(
        document,
        'text',
        {
          x: String(x),
          y: String(y),
          fill: '#0f172a',
          'font-family': 'sans-serif',
          'font-size': '12',
          ...(x === 690 ? { 'text-anchor': 'end' } : {})
        },
        text
      )
    )
  );
  return svg;
}
export function fieldTrajectoryPlot(
  document: Document,
  config: FieldConfig,
  samples: readonly FieldSample[],
  kind: FieldPlotKind,
  selected = 0
): SVGSVGElement {
  const last = samples.at(-1),
    stochastic = config.systemId === 'system:langevin';
  if (kind === 'heatmap' && !stochastic && !diagnostic(config)) return heatmap(document, config, samples);
  if (kind === 'ensemble' && stochastic) {
    const series = (label: string, sign: number, color: string) => ({
      label,
      color,
      points: samples.map(
        (sample) =>
          [sample.time, sample.profile[0]! + sign * Math.sqrt(Math.max(0, sample.variance[0]!))] as [number, number]
      )
    });
    return createPlot(document, '앙상블 평균과 산포', fieldTimeLabel, 'θ (정규화)', [
      series('평균', 0, '#075985'),
      series('평균+표준편차', 1, '#9a3412'),
      series('평균−표준편차', -1, '#166534')
    ]);
  }
  if (kind === 'state') {
    const index = Math.max(0, Math.min((stochastic ? config.ensemble.members : config.grid.points) - 1, selected));
    return createPlot(
      document,
      `개별 ${stochastic ? 'member' : '격자점'} ${index + 1}`,
      fieldTimeLabel,
      '좌표 (정규화)',
      [
        {
          label: `${index + 1}`,
          color: '#075985',
          points: samples.map(
            (sample) =>
              [sample.time, stochastic ? sample.memberStates[index]![0]! : sample.profile[index]!] as [number, number]
          )
        }
      ]
    );
  }
  if (kind === 'modes' && config.systemId === 'system:fput')
    return createPlot(
      document,
      'FPUT 조화 모드 에너지',
      '모드 인덱스',
      '에너지 (정규화)',
      [{ label: '조화 부분', color: '#075985', points: (last?.modeEnergies ?? []).map((value, i) => [i + 1, value]) }],
      true
    );
  if (stochastic)
    return createPlot(
      document,
      '현재 앙상블 평균',
      '상태 성분 인덱스 (1)',
      '평균 θ (정규화)',
      [{ label: 'θ 평균', color: '#075985', points: [[0, last?.profile[0] ?? 0]] }],
      true
    );
  const lattice = config.systemId === 'system:lattice-fk-limit';
  return createPlot(
    document,
    lattice ? '조화 고리 분산 관계' : '현재 공간 프로필',
    lattice ? '모드 인덱스' : '공간 x (정규화)',
    lattice ? 'ω² (정규화)' : '장/변위 (정규화)',
    [
      {
        label: lattice ? '모드 고유진동수 제곱' : '프로필',
        color: '#075985',
        points: (last?.profile ?? []).map((value, i, values) => [
          lattice
            ? i
            : (config.grid.length * i) /
              (config.grid.boundary === 'periodic' ? values.length : Math.max(1, values.length - 1)),
          value
        ])
      }
    ],
    lattice
  );
}
export function exportFieldFigure(
  document: Document,
  config: FieldConfig,
  samples: readonly FieldSample[],
  kind: FieldPlotKind,
  selected = 0
): string {
  const svg = fieldTrajectoryPlot(document, config, samples, kind, selected);
  svg.removeAttribute('class');
  svg.setAttribute('xmlns', NS);
  svg.append(
    svgNode(
      document,
      'metadata',
      {},
      JSON.stringify({
        schema: 'pendulum-field-figure/v1',
        configuration: config,
        samples: samples.length,
        kind,
        selected,
        ensemble: samples.at(-1)?.ensemble,
        description: fieldPlotDescription(config, kind),
        rendering:
          'heatmap <=65 times x64 sites; line plot <=about600 points/series. Retained-raw CSV has all recorded samples.'
      })
    )
  );
  return new XMLSerializer().serializeToString(svg);
}
