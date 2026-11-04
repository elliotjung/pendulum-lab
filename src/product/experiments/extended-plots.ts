import { element } from '../app/dom';
import type { ExtendedResult, ExtendedTable } from './extended-results';
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
  series: readonly { label: string; points: readonly (readonly [number, number])[] }[]
) {
  const root = element(document, 'figure', 'focus-plot extended-focus-plot'),
    svg = svgNode(document, 'svg', {
      viewBox: '0 0 640 270',
      role: 'img',
      'aria-labelledby': `extended-${id}-title extended-${id}-desc`
    });
  svg.append(
    svgNode(document, 'title', { id: `extended-${id}-title` }, title),
    svgNode(
      document,
      'desc',
      { id: `extended-${id}-desc` },
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
    series.map((s, i) => `${s.label} · ${styles[i % styles.length]!.label}`).join(' / ')
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
function table(document: Document, value: ExtendedTable) {
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
export function renderExtendedResults(document: Document, result: ExtendedResult): HTMLElement {
  const root = element(document, 'div', 'extended-focus-results'),
    metrics = element(document, 'dl', 'extended-focus-metrics');
  for (const metric of result.metrics) {
    const pair = element(document, 'div', '');
    pair.dataset.focusMetric = metric.id;
    pair.append(
      element(document, 'dt', '', metric.label),
      element(document, 'dd', '', `${number(metric.value)} ${metric.unit}`)
    );
    metrics.append(pair);
  }
  root.append(element(document, 'h3', '', '계산 결과와 진단'), metrics);
  const visual = element(document, 'section', 'extended-focus-visual');
  visual.dataset.focusVisual = '';
  visual.setAttribute('aria-label', '전용 실험 그래프와 수치 표');
  const lookup = (id: string) => result.tables.find((t) => t.id === id);
  if (lookup('adaptive-steps')) {
    const t = lookup('adaptive-steps')!;
    visual.append(
      chart(document, `${result.unitId}-steps`, '실제 수락된 적응형 시간 간격', '수락 단계의 끝 (s)', 'h (s)', [
        { label: 'Dormand–Prince5(4)', points: t.rows.map((r) => [Number(r[2]), Number(r[3])]) }
      ])
    );
  } else if (lookup('canonical-energy')) {
    const t = lookup('canonical-energy')!,
      base = Number(t.rows[0]?.[1] ?? 0);
    visual.append(
      chart(document, `${result.unitId}-energy`, '정준 Hamiltonian 에너지 편차', '시간 (s)', 'H(t)-H(0) (J)', [
        { label: 'implicit midpoint', points: t.rows.map((r) => [Number(r[0]), Number(r[1]) - base]) },
        { label: 'RK4', points: t.rows.map((r) => [Number(r[0]), Number(r[2]) - base]) }
      ])
    );
  } else if (lookup('compound-time-comparison')) {
    const t = lookup('compound-time-comparison')!;
    visual.append(
      chart(
        document,
        `${result.unitId}-compound`,
        '균일 막대와 질점 모형의 같은 초기 각도 응답',
        '시간 (s)',
        'theta1 (rad)',
        [
          { label: '균일 막대', points: t.rows.map((r) => [Number(r[0]), Number(r[1])]) },
          { label: '끝점 질량', points: t.rows.map((r) => [Number(r[0]), Number(r[2])]) }
        ]
      )
    );
  } else if (lookup('stiff-radius')) {
    const t = lookup('stiff-radius')!;
    visual.append(
      chart(document, `${result.unitId}-stiff`, '강성 방사 모드의 수치 응답', '시간 (s)', 'r (m)', [
        { label: 'TR-BDF2', points: t.rows.map((r) => [Number(r[0]), Number(r[1])]) },
        { label: 'Euler', points: t.rows.map((r) => [Number(r[0]), Number(r[2])]) },
        { label: '방사 정확해', points: t.rows.map((r) => [Number(r[0]), Number(r[3])]) }
      ])
    );
  } else if (result.trace.some((s) => s.tensions)) {
    const count = Math.max(...result.trace.map((s) => s.tensions?.length ?? 0));
    visual.append(
      chart(
        document,
        `${result.unitId}-tension`,
        '원 엔진 장력의 시간 변화',
        '시간 (s)',
        '장력 (N)',
        Array.from({ length: count }, (_, i) => ({
          label: `줄 ${i + 1}`,
          points: result.trace.map((s) => [s.time, s.tensions?.[i] ?? 0] as const)
        }))
      )
    );
  } else if (result.unitId.startsWith('3.') && result.trace.some((s) => s.positions[0]?.z !== undefined)) {
    const links = result.unitId === '3.8' ? result.trace[0]!.positions.length : 1;
    visual.append(
      chart(
        document,
        `${result.unitId}-spatial`,
        result.unitId === '3.8' ? '모든 질점 공간 운동의 수평 투영' : '첫 링크 공간 운동의 수평 투영',
        'x (m)',
        'z (m)',
        Array.from({ length: links }, (_, index) => ({
          label:
            result.unitId === '3.8' ? `질점 ${index + 1}의 실제 x-z 궤적 · 시간 순서` : '실제 x-z 궤적 · 시간 순서',
          points: result.trace.map((sample) => [sample.positions[index]!.x, sample.positions[index]!.z ?? 0] as const)
        }))
      )
    );
  } else if (!lookup('mass-matrix') && !lookup('compound-matrix')) {
    const spring = result.canonical.systemId === 'system:spring';
    visual.append(
      chart(
        document,
        `${result.unitId}-state`,
        spring ? '길이 자유도의 시간 변화' : '첫 각도의 시간 변화',
        '시간 (s)',
        spring ? 'r (m)' : 'theta1 (rad)',
        [{ label: '공용 adapter baseline', points: result.trace.map((s) => [s.time, s.state[0]!]) }]
      )
    );
  }
  for (const value of result.tables) {
    const details = element(document, 'details', 'learn-prerequisite extended-focus-table-details');
    details.open = ['mass-matrix', 'compound-matrix', 'state-derivative', 'constraint-events'].includes(value.id);
    details.append(element(document, 'summary', '', `${value.title} · ${value.rows.length}행`), table(document, value));
    visual.append(details);
  }
  root.append(visual);
  if (result.companions.length) {
    const box = element(document, 'details', 'learn-prerequisite');
    box.append(element(document, 'summary', '', '비교 계산의 별도 설정과 실험실 전달 범위'));
    for (const companion of result.companions)
      box.append(
        element(document, 'p', '', `${companion.id}: ${companion.description}`),
        element(document, 'code', '', JSON.stringify(companion.settings))
      );
    root.append(box);
  }
  const warnings = element(document, 'ul', 'focus-warnings');
  for (const warning of result.warnings) warnings.append(element(document, 'li', '', warning));
  root.append(warnings);
  return root;
}
