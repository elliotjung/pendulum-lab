import type { NetworkConfig, NetworkSample, NetworkBasinSnapshot } from '../../adapters/physics/network';
import { createPlot } from './core-plots';
import { networkIsNormalized, networkTimeLabel } from './network-storage';

export type NetworkPlotKind = 'state' | 'order' | 'local' | 'phase' | 'basin';
export function networkPlotDescription(config: NetworkConfig, kind: NetworkPlotKind): string {
  if (kind === 'basin')
    return '가로축 초기 x, 세로축 초기 y (정규화). 기존 semi-implicit Euler 정착 판정입니다. 색은 정착한 자석 ID이며 회색은 미계산 또는 유한 단계 안의 미해결입니다. 유한 격자 결과로 프랙털 경계나 Wada 성질을 확정하지 마세요.';
  if (kind === 'local')
    return '가로축 노드 인덱스, 세로축 국소 coherence (0–1). 가중 이웃의 위상 평균 크기이며 이웃이 없으면 0입니다. chimera는 저장한 ringOrder를 기준으로 표시합니다. 단일 시각의 국소 분리는 chimera의 증명이 아닙니다.';
  if (kind === 'order')
    return '가로축 시간, 세로축 전역 order parameter r와 평균 local coherence (0–1). 진자 네트워크에서는 각도 분포의 정합 진단이며 진동 위상 동기화의 증명이 아닙니다. 자석에는 위상 동기화 의미가 없습니다.';
  if (kind === 'phase')
    return config.systemId === 'system:magnetic'
      ? '기록한 정규화 x–y 궤적입니다.'
      : '선택한 노드의 위상을 cos θ–sin θ 원 위에 표시합니다. 위상은 rad이며 이 좌표는 무차원입니다.';
  return config.systemId === 'system:magnetic'
    ? '선택한 초기조건의 정규화 x 시간 기록입니다.'
    : '선택한 노드의 θ(rad) 시간 기록입니다. 감긴 위상에서 ±π 경계의 점프는 좌표 표현에 따른 것입니다.';
}
const NS = 'http://www.w3.org/2000/svg';
function svgNode(document: Document, name: string, attributes: Record<string, string>, text?: string) {
  const node = document.createElementNS(NS, name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  if (text !== undefined) node.textContent = text;
  return node;
}
export function networkBasinPlot(
  document: Document,
  config: NetworkConfig,
  snapshot?: NetworkBasinSnapshot
): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('core-plot');
  svg.setAttribute('viewBox', '0 0 720 360');
  svg.setAttribute('role', 'img');
  const label =
    '자기 인력권 seed 격자. 가로축 초기 x (정규화), 세로축 초기 y (정규화). 회색은 미계산 또는 미해결이며 색과 셀 제목으로 자석 ID를 표시합니다.';
  svg.setAttribute('aria-label', label);
  svg.append(
    svgNode(document, 'title', {}, label),
    svgNode(document, 'rect', { width: '720', height: '360', fill: '#fff' })
  );
  const palette = ['#075985', '#9a3412', '#166534', '#6b21a8', '#9d174d', '#854d0e'],
    settings = config.basin;
  if (!settings) return svg;
  const width = 620 / settings.size,
    height = 230 / settings.size;
  for (let row = 0; row < settings.size; row++)
    for (let col = 0; col < settings.size; col++) {
      const index = row * settings.size + col,
        cell = snapshot?.cells[index],
        magnet = config.graph.nodes.findIndex((node) => node.id === cell?.magnetId),
        rect = svgNode(document, 'rect', {
          x: String(70 + col * width),
          y: String(60 + (settings.size - 1 - row) * height),
          width: String(width),
          height: String(height),
          fill: cell?.converged && magnet >= 0 ? palette[magnet % palette.length]! : '#cbd5e1',
          stroke: '#fff',
          'stroke-width': '0.5'
        });
      rect.append(
        svgNode(
          document,
          'title',
          {},
          cell
            ? `초기 (${cell.x}, ${cell.y}), ${cell.converged ? `자석 ${cell.magnetId}` : '미해결'}, ${cell.steps}단계`
            : '아직 계산하지 않은 셀'
        )
      );
      svg.append(rect);
    }
  const tick = (value: number) => value.toPrecision(4);
  for (const [x, y, text, anchor] of [
    [70, 24, '자기 인력권 · 유한 격자', 'start'],
    [300, 347, '초기 x (정규화)', 'start'],
    [12, 48, '초기 y (정규화)', 'start'],
    [70, 315, tick(settings.xMin), 'start'],
    [690, 315, tick(settings.xMax), 'end'],
    [8, 285, tick(settings.yMin), 'start'],
    [8, 74, tick(settings.yMax), 'start']
  ] as const)
    svg.append(
      svgNode(
        document,
        'text',
        {
          x: String(x),
          y: String(y),
          fill: '#0f172a',
          'font-family': 'sans-serif',
          'font-size': '13',
          'text-anchor': anchor
        },
        text
      )
    );
  return svg;
}
export function networkTrajectoryPlot(
  document: Document,
  config: NetworkConfig,
  samples: readonly NetworkSample[],
  kind: NetworkPlotKind,
  selected = 0,
  basin?: NetworkBasinSnapshot
): SVGSVGElement {
  const last = samples.at(-1),
    index = Math.max(0, Math.min(config.graph.nodes.length - 1, selected)),
    node = config.graph.nodes[index]!;
  const series = (label: string, value: (sample: NetworkSample) => number, color = '#075985') => ({
    label,
    color,
    points: samples.map((sample) => [sample.time, value(sample)] as [number, number])
  });
  if (kind === 'basin') return networkBasinPlot(document, config, basin);
  if (kind === 'local') {
    const order = config.graph.ringOrder ?? config.graph.nodes.map((entry) => entry.id);
    return createPlot(
      document,
      '노드별 local coherence',
      '노드 인덱스 (ringOrder 우선)',
      '국소 coherence (1)',
      [
        {
          label: '국소 정합',
          color: '#075985',
          points: order.map((id, i) => [
            i,
            last?.localCoherence[config.graph.nodes.findIndex((entry) => entry.id === id)] ?? 0
          ])
        }
      ],
      true,
      { bounds: { xMin: 0, xMax: Math.max(1, order.length - 1), yMin: 0, yMax: 1 } }
    );
  }
  if (kind === 'order')
    return createPlot(document, '전역·국소 위상 정합', networkTimeLabel(config.systemId), '정합 크기 (1)', [
      series('전역 r', (sample) => sample.order),
      series('평균 국소 r', (sample) => sample.meanLocalOrder, '#9a3412')
    ]);
  if (kind === 'phase')
    return config.systemId === 'system:magnetic'
      ? createPlot(document, '자기 진자 궤적', 'x (정규화)', 'y (정규화)', [
          {
            label: '기록 궤적',
            color: '#075985',
            points: samples.map((sample) => [sample.state[0]!, sample.state[1]!])
          }
        ])
      : createPlot(
          document,
          `${node.id} 위상 원`,
          'cos θ (1)',
          'sin θ (1)',
          [
            {
              label: node.id,
              color: '#075985',
              points: samples.map((sample) => [Math.cos(sample.phases[index]!), Math.sin(sample.phases[index]!)])
            }
          ],
          true,
          { bounds: { xMin: -1.1, xMax: 1.1, yMin: -1.1, yMax: 1.1 } }
        );
  return createPlot(
    document,
    `${config.systemId === 'system:magnetic' ? '자기 진자 x' : node.id + ' θ'} 시간 기록`,
    networkTimeLabel(config.systemId),
    networkIsNormalized(config.systemId) ? 'x (정규화)' : 'θ (rad)',
    [series(node.id, (sample) => sample.state[config.systemId === 'system:magnetic' ? 0 : index]!)]
  );
}
export function exportNetworkFigure(
  document: Document,
  config: NetworkConfig,
  samples: readonly NetworkSample[],
  kind: NetworkPlotKind,
  selected = 0,
  basin?: NetworkBasinSnapshot
): string {
  const svg = networkTrajectoryPlot(document, config, samples, kind, selected, basin);
  svg.removeAttribute('class');
  svg.setAttribute('xmlns', NS);
  svg.append(
    svgNode(
      document,
      'metadata',
      {},
      JSON.stringify({
        schema: 'pendulum-network-figure/v1',
        configuration: config,
        samples: samples.length,
        kind,
        selected,
        basin,
        description: networkPlotDescription(config, kind),
        rendering: 'At most about 600 points per series; CSV retains recorded samples.'
      })
    )
  );
  return new XMLSerializer().serializeToString(svg);
}
