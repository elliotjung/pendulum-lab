import { element } from '../../app/dom';
import type { PlanarConfig, PlanarSample } from '../../adapters/physics/planar';

const NS = 'http://www.w3.org/2000/svg';
function svgElement(document: Document, name: string, attributes: Record<string, string> = {}, text?: string) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
export interface PlotSeries {
  label: string;
  color: string;
  points: readonly (readonly [number, number])[];
}

/** Downsampling applies only to the figure; the CSV retains every computed solver step. */
export function createPlot(
  document: Document,
  title: string,
  xLabel: string,
  yLabel: string,
  series: readonly PlotSeries[],
  scatter = false,
  options?: {
    readonly bounds?: { readonly xMin: number; readonly xMax: number; readonly yMin: number; readonly yMax: number };
    readonly formatTick?: (value: number) => string;
  }
): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 720 360');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    `${title}. 가로축 ${xLabel}, 세로축 ${yLabel}. 수치 데이터는 분석 결과 또는 궤적 CSV에서 확인할 수 있습니다.`
  );
  svg.classList.add('core-plot');
  svg.append(
    svgElement(document, 'title', {}, title),
    svgElement(document, 'rect', { width: '720', height: '360', fill: '#ffffff' })
  );
  const points = series.flatMap((entry) => entry.points).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  let xMin = Infinity,
    xMax = -Infinity,
    yMin = Infinity,
    yMax = -Infinity;
  for (const [x, y] of points) {
    xMin = Math.min(xMin, x);
    xMax = Math.max(xMax, x);
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  }
  if (!points.length) {
    xMin = 0;
    xMax = 1;
    yMin = 0;
    yMax = 1;
  }
  if (xMin === xMax) xMax = xMin + 1;
  if (yMin === yMax) {
    yMin -= 0.5;
    yMax += 0.5;
  }
  const bounds = options?.bounds;
  if (bounds) {
    if (!Object.values(bounds).every(Number.isFinite) || bounds.xMin >= bounds.xMax || bounds.yMin >= bounds.yMax)
      throw new RangeError('Plot bounds must be finite increasing ranges.');
    ({ xMin, xMax, yMin, yMax } = bounds);
  }
  const xPixel = (value: number) => 70 + ((value - xMin) / (xMax - xMin)) * 620;
  const yPixel = (value: number) => 295 - ((value - yMin) / (yMax - yMin)) * 235;
  const tick = options?.formatTick ?? ((value: number) => value.toPrecision(4));
  svg.append(
    svgElement(document, 'path', { d: 'M70 55 V295 H690', fill: 'none', stroke: '#475569', 'stroke-width': '1.5' })
  );
  const texts: [number, number, string][] = [
    [70, 25, title],
    [350, 347, xLabel],
    [10, 48, yLabel],
    [70, 317, tick(xMin)],
    [620, 317, tick(xMax)],
    [8, 290, tick(yMin)],
    [8, 68, tick(yMax)]
  ];
  for (const [x, y, text] of texts)
    svg.append(
      svgElement(
        document,
        'text',
        { x: String(x), y: String(y), fill: '#0f172a', 'font-family': 'sans-serif', 'font-size': '13' },
        text
      )
    );
  for (const [index, entry] of series.entries()) {
    const stride = Math.max(1, Math.ceil(entry.points.length / 600));
    const visible = entry.points.filter((_, i) => i % stride === 0 || i === entry.points.length - 1);
    if (scatter) {
      for (const [x, y] of visible)
        svg.append(
          svgElement(document, 'circle', { cx: String(xPixel(x)), cy: String(yPixel(y)), r: '2.5', fill: entry.color })
        );
    } else {
      const d = visible.map(([x, y], i) => `${i ? 'L' : 'M'}${xPixel(x).toFixed(3)} ${yPixel(y).toFixed(3)}`).join(' ');
      svg.append(
        svgElement(document, 'path', {
          d,
          fill: 'none',
          stroke: entry.color,
          'stroke-width': '2',
          'stroke-dasharray': index ? '6 3' : 'none'
        })
      );
    }
    svg.append(
      svgElement(
        document,
        'text',
        { x: String(250 + index * 180), y: '45', fill: entry.color, 'font-family': 'sans-serif', 'font-size': '13' },
        entry.label
      )
    );
  }
  if (!points.length)
    svg.append(
      svgElement(
        document,
        'text',
        { x: '170', y: '180', fill: '#475569', 'font-family': 'sans-serif', 'font-size': '16' },
        '표시할 결과가 없습니다. 조건을 확인하고 실행하세요.'
      )
    );
  return svg;
}

export function trajectoryPlot(
  document: Document,
  samples: readonly PlanarSample[],
  kind: 'state-time' | 'energy' | 'phase'
) {
  if (samples.length > 600) {
    const reduced: PlanarSample[] = [];
    const stride = Math.ceil(samples.length / 599);
    for (let i = 0; i < samples.length; i += stride) reduced.push(samples[i]!);
    if (reduced.at(-1) !== samples.at(-1)) reduced.push(samples.at(-1)!);
    samples = reduced;
  }
  if (kind === 'phase')
    return createPlot(document, '위상공간', 'θ₁ (rad)', 'ω₁ (rad/s)', [
      { label: '첫 번째 링크', color: '#075985', points: samples.map((s) => [s.state[0]!, s.state[2]!]) }
    ]);
  if (kind === 'energy')
    return createPlot(document, '에너지', 't (s)', 'E (J)', [
      { label: '전체 에너지', color: '#075985', points: samples.map((s) => [s.time, s.energy.total]) },
      { label: '운동 에너지', color: '#9a3412', points: samples.map((s) => [s.time, s.energy.KE]) }
    ]);
  return createPlot(document, '상태 / 시간', 't (s)', 'θ (rad)', [
    { label: 'θ₁', color: '#075985', points: samples.map((s) => [s.time, s.state[0]!]) },
    { label: 'θ₂', color: '#9a3412', points: samples.map((s) => [s.time, s.state[1]!]) }
  ]);
}

export function createScene(document: Document) {
  const wrapper = element(document, 'div', 'core-scene');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-2.3 -2.3 4.6 4.6');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '진자 애니메이션');
  const rods = svgElement(document, 'path', { fill: 'none', stroke: 'currentColor', 'stroke-width': '0.035' });
  const first = svgElement(document, 'circle', { r: '0.075', fill: 'currentColor' });
  const second = svgElement(document, 'circle', { r: '0.075', fill: 'currentColor' });
  svg.append(
    svgElement(document, 'circle', { cx: '0', cy: '0', r: '0.04', fill: 'currentColor' }),
    rods,
    first,
    second
  );
  const description = element(document, 'p', 'lab-muted');
  wrapper.append(svg, description);
  return {
    element: wrapper,
    update(sample: PlanarSample, config: PlanarConfig) {
      const scale = 2 / (config.parameters.l1 + config.parameters.l2);
      const p = sample.positions;
      const x1 = p.first.x * scale,
        y1 = -p.first.y * scale,
        x2 = p.second.x * scale,
        y2 = -p.second.y * scale;
      rods.setAttribute('d', `M0 0 L${x1} ${y1} L${x2} ${y2}`);
      first.setAttribute('cx', String(x1));
      first.setAttribute('cy', String(y1));
      second.setAttribute('cx', String(x2));
      second.setAttribute('cy', String(y2));
      const compound = config.systemId === 'system:compound-double';
      rods.setAttribute('stroke-width', compound ? '0.09' : '0.025');
      first.setAttribute('r', compound ? '0.035' : '0.075');
      second.setAttribute('r', compound ? '0.035' : '0.075');
      description.textContent = `${compound ? '균일 막대' : '질점'} 모델 · θ₁ ${sample.state[0]!.toFixed(4)} rad · θ₂ ${sample.state[1]!.toFixed(4)} rad. 아래 방향이 각도 0입니다.`;
    }
  };
}

export function exportFigure(document: Document, config: PlanarConfig, samples: readonly PlanarSample[]): string {
  const svg = trajectoryPlot(document, samples, 'state-time');
  svg.removeAttribute('class');
  svg.setAttribute('xmlns', NS);
  svg.append(
    svgElement(
      document,
      'metadata',
      {},
      JSON.stringify({
        schema: 'pendulum-figure/v1',
        configuration: config,
        samples: samples.length,
        rendering: 'up to 600 points per series; CSV contains recorded samples'
      })
    )
  );
  return new XMLSerializer().serializeToString(svg);
}
