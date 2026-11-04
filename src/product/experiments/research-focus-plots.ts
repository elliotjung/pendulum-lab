import { element } from '../app/dom';
import type { ResearchFocusResult } from './research-focus-contracts';
type ResearchTable = ResearchFocusResult['tables'][number];
const NS = 'http://www.w3.org/2000/svg';
const number = (value: number) =>
  value === 0
    ? '0'
    : Math.abs(value) < 0.0001 || Math.abs(value) > 100000
      ? value.toExponential(5)
      : Number(value.toPrecision(7)).toString();
function svgNode(document: Document, name: string, attributes: Record<string, string>, text?: string) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
function chart(
  document: Document,
  id: string,
  title: string,
  xLabel: string,
  yLabel: string,
  series: readonly { label: string; points: readonly (readonly [number, number])[] }[],
  mode: 'line' | 'scatter' = 'line'
) {
  const root = element(document, 'figure', 'focus-plot extended-focus-plot'),
    svg = svgNode(document, 'svg', {
      viewBox: '0 0 640 270',
      role: 'img',
      'aria-labelledby': `research-${id}-title research-${id}-desc`
    });
  svg.append(
    svgNode(document, 'title', { id: `research-${id}-title` }, title),
    svgNode(
      document,
      'desc',
      { id: `research-${id}-desc` },
      `${xLabel}에 따른 ${yLabel}. ${series.map((s) => s.label).join(', ')}. 축 범위는 아래 설명, 원 수치는 결과 JSON에서 확인할 수 있습니다.`
    )
  );
  const points = series.flatMap((s) => s.points),
    xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  if (!points.length) {
    root.append(element(document, 'p', '', '현재 조건에서 표시할 교차·표본이 없습니다.'));
    return root;
  }
  let minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  if (maxX === minX) {
    minX -= 0.5;
    maxX += 0.5;
  }
  if (maxY === minY) {
    minY -= Math.max(0.5, Math.abs(minY) * 0.1);
    maxY += Math.max(0.5, Math.abs(maxY) * 0.1);
  }
  const x = (v: number) => 90 + (525 * (v - minX)) / (maxX - minX),
    y = (v: number) => 220 - (180 * (v - minY)) / (maxY - minY);
  svg.append(
    svgNode(document, 'path', { d: 'M90 40V220H615', fill: 'none', stroke: 'currentColor', 'stroke-width': '1' })
  );
  for (const [v, anchor] of [
    [minX, 'start'],
    [maxX, 'end']
  ] as const)
    svg.append(
      svgNode(
        document,
        'text',
        { x: String(x(v)), y: '239', 'text-anchor': anchor, 'font-size': '11', fill: 'currentColor' },
        number(v)
      )
    );
  for (const v of [minY, maxY])
    svg.append(
      svgNode(
        document,
        'text',
        { x: '85', y: String(y(v) + 4), 'text-anchor': 'end', 'font-size': '10', fill: 'currentColor' },
        number(v)
      )
    );
  svg.append(
    svgNode(
      document,
      'text',
      { x: '352.5', y: '262', 'text-anchor': 'middle', 'font-size': '12', fill: 'currentColor' },
      xLabel
    ),
    svgNode(document, 'text', { x: '90', y: '18', 'font-size': '12', fill: 'currentColor' }, yLabel)
  );
  const styles = [
    { color: 'var(--ds-accent, #137c8b)', label: '실선', dash: '' },
    { color: 'var(--ds-text, #334155)', label: '파선', dash: '5 3' },
    { color: 'var(--ds-warning, #b35414)', label: '점선', dash: '1 3' },
    { color: 'var(--ds-color-danger, #b42318)', label: '일점쇄선', dash: '8 3 1 3' }
  ];
  series.forEach((s, i) => {
    const style = styles[i % styles.length]!;
    if (mode === 'scatter') {
      for (const p of s.points)
        svg.append(
          svgNode(document, 'circle', {
            cx: String(x(p[0])),
            cy: String(y(p[1])),
            r: '1.8',
            fill: style.color
          })
        );
      return;
    }
    svg.append(
      svgNode(document, 'polyline', {
        points: s.points.map((p) => `${x(p[0]).toFixed(3)},${y(p[1]).toFixed(3)}`).join(' '),
        fill: 'none',
        stroke: style.color,
        'stroke-width': '2',
        ...(style.dash ? { 'stroke-dasharray': style.dash } : {})
      })
    );
  });
  const caption = element(document, 'figcaption', '', title);
  const legend = element(
    document,
    'p',
    '',
    series.map((s, i) => `${s.label} · ${mode === 'scatter' ? '점' : styles[i % styles.length]!.label}`).join(' / ')
  );
  caption.append(
    legend,
    element(
      document,
      'p',
      '',
      `가로축 ${xLabel}: ${number(minX)} ~ ${number(maxX)}. 세로축 ${yLabel}: ${number(minY)} ~ ${number(maxY)}.`
    )
  );
  root.append(svg, caption);
  return root;
}
function table(document: Document, value: ResearchTable) {
  const wrapper = element(document, 'div', 'extended-focus-table-wrap');
  wrapper.tabIndex = 0;
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-label', value.title);
  const grid = element(document, 'table', 'extended-focus-table');
  grid.dataset.focusTable = value.id;
  grid.append(element(document, 'caption', '', value.title));
  const head = element(document, 'thead', ''),
    line = element(document, 'tr', '');
  for (const column of value.columns) {
    const cell = element(document, 'th', '', column);
    cell.scope = 'col';
    line.append(cell);
  }
  head.append(line);
  const body = element(document, 'tbody', '');
  for (const row of value.rows) {
    const tr = element(document, 'tr', '');
    for (const cell of row) tr.append(element(document, 'td', '', typeof cell === 'number' ? number(cell) : cell));
    body.append(tr);
  }
  grid.append(head, body);
  wrapper.append(grid);
  if (!value.rows.length) wrapper.append(element(document, 'p', '', '현재 조건에서는 기록된 사건·교차가 없습니다.'));
  return wrapper;
}
export function renderResearchResults(document: Document, result: ResearchFocusResult): HTMLElement {
  const root = element(document, 'div', 'extended-focus-results'),
    metrics = element(document, 'dl', 'extended-focus-metrics');
  root.append(element(document, 'h3', '', '계산 결과와 진단'), metrics);
  for (const metric of result.metrics) {
    const pair = element(document, 'div', '');
    pair.dataset.focusMetric = metric.id;
    pair.append(
      element(document, 'dt', '', metric.label),
      element(document, 'dd', '', `${number(metric.value)} ${metric.unit}`)
    );
    metrics.append(pair);
  }
  const visual = element(document, 'section', 'extended-focus-visual');
  visual.dataset.focusVisual = '';
  visual.setAttribute('aria-label', '전용 실험 그래프와 수치 표');
  for (const c of result.charts)
    visual.append(
      chart(
        document,
        `${result.unitId.replace('.', '-')}-${c.id}`,
        c.title,
        c.xLabel,
        c.yLabel,
        c.series.map((s) => ({ label: s.label, points: s.points.map((p) => [p.x, p.y] as const) })),
        c.mode
      )
    );
  root.append(visual);
  for (const warning of result.warnings) root.append(element(document, 'p', 'focus-warning', warning));
  for (const t of result.tables) {
    const details = element(document, 'details', 'learn-prerequisite');
    details.append(element(document, 'summary', '', `${t.title} · ${t.rows.length}행`), table(document, t));
    root.append(details);
  }
  return root;
}
