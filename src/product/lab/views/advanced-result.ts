import { element } from '../../app/dom';
import type { AdvancedDiagnosticArtifact, AdvancedDiagnosticResult } from '../../adapters/analysis/advanced/contracts';
import { exportAdvancedDiagnosticArtifact } from '../../adapters/analysis/advanced/artifact';
import { ADVANCED_DIAGNOSTIC_NAMES } from '../../adapters/analysis/advanced/contracts';
import { advancedPlots } from './advanced-plots';

const NS = 'http://www.w3.org/2000/svg';
function gridFigure(document: Document, result: AdvancedDiagnosticResult) {
  const details =
    result.details && typeof result.details === 'object' && !Array.isArray(result.details) ? result.details : {};
  const width = Number(details.width),
    height = Number(details.height);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height !== result.rows.length
  )
    return undefined;
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('core-plot');
  svg.setAttribute('viewBox', '0 0 500 430');
  svg.setAttribute('role', 'img');
  const valueIndex = 2;
  const values = result.rows.map((row) => row[valueIndex]!);
  const lo = Math.min(...values),
    hi = Math.max(...values);
  const title = result.kind === 'basin' ? '반전 분류 격자' : 'FTLE 격자와 능선 후보';
  svg.setAttribute(
    'aria-label',
    `${title}. 가로축 theta1 (rad), 세로축 theta2 (rad). ${width}×${height} 정지 초기속도 격자. 수치와 분류는 아래 표 및 artifact에 있습니다.`
  );
  const text = (x: number, y: number, content: string) => {
    const node = document.createElementNS(NS, 'text');
    node.setAttribute('x', String(x));
    node.setAttribute('y', String(y));
    node.setAttribute('fill', '#0f172a');
    node.setAttribute('font-size', '12');
    node.textContent = content;
    return node;
  };
  const background = document.createElementNS(NS, 'rect');
  background.setAttribute('width', '500');
  background.setAttribute('height', '430');
  background.setAttribute('fill', '#fff');
  svg.append(background, text(45, 24, title));
  const palette = ['#cbd5e1', '#075985', '#b45309', '#166534', '#6b21a8'];
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      const values = result.rows[row * width + col]!;
      const cell = document.createElementNS(NS, 'rect');
      cell.setAttribute('x', String(55 + (col * 380) / width));
      cell.setAttribute('y', String(45 + ((height - 1 - row) * 310) / height));
      cell.setAttribute('width', String(380 / width + 0.2));
      cell.setAttribute('height', String(310 / height + 0.2));
      const fraction = hi === lo ? 0.5 : (values[valueIndex]! - lo) / (hi - lo);
      cell.setAttribute(
        'fill',
        result.kind === 'basin'
          ? palette[Math.abs(Math.round(values[2]!)) % palette.length]!
          : `hsl(${Math.round(240 - 240 * fraction)} 70% 38%)`
      );
      if (result.kind === 'lcs-ridge' && values[3] === 1) {
        cell.setAttribute('stroke', '#000');
        cell.setAttribute('stroke-width', '1');
      }
      svg.append(cell);
    }
  svg.append(
    text(45, 375, `θ₁ (rad): ${result.rows[0]![0]!.toPrecision(4)} … ${result.rows[width - 1]![0]!.toPrecision(4)}`),
    text(45, 395, `θ₂ (rad): ${result.rows[0]![1]!.toPrecision(4)} … ${result.rows.at(-1)![1]!.toPrecision(4)}`),
    text(
      45,
      415,
      result.kind === 'basin'
        ? `색 = 분류 label ${[...new Set(values)].sort((a, b) => a - b).join(', ')}`
        : `FTLE ${lo.toPrecision(4)} … ${hi.toPrecision(4)} s⁻¹ · 검은 테두리 = 능선 후보`
    )
  );
  return svg;
}

export function advancedResultView(
  document: Document,
  result: AdvancedDiagnosticResult,
  artifact: AdvancedDiagnosticArtifact
) {
  const output = element(document, 'div', 'advanced-diagnostic-result');
  output.append(
    element(document, 'h3', '', `${ADVANCED_DIAGNOSTIC_NAMES[result.kind]} 결과`),
    element(document, 'p', '', result.summary),
    element(document, 'p', 'lab-muted', `계산법: ${result.method}`),
    element(
      document,
      'p',
      'lab-muted',
      `입력 snapshot · ${artifact.request.experiment.systemId} · ${artifact.algorithmVersion}. 원래 실험·관측·설정·source·생성 시각·계보를 artifact에 보존합니다.`
    )
  );
  const heatmap = ['basin', 'lcs-ridge'].includes(result.kind) ? gridFigure(document, result) : undefined;
  if (heatmap) output.append(heatmap);
  else output.append(...advancedPlots(document, result));
  for (const warning of result.warnings) output.append(element(document, 'p', 'lab-preview-note', warning));
  const tableWrap = element(document, 'div', 'advanced-diagnostic-table');
  tableWrap.tabIndex = 0;
  tableWrap.setAttribute('role', 'region');
  tableWrap.setAttribute('aria-label', '고급 분석 결과 수치 표');
  const table = element(document, 'table', '');
  table.append(
    element(
      document,
      'caption',
      '',
      `결과 ${result.rows.length}행 중 처음 ${Math.min(200, result.rows.length)}행. 전체 결과와 원자료는 artifact에 있습니다.`
    )
  );
  const head = element(document, 'thead', ''),
    header = element(document, 'tr', '');
  for (const [i, column] of result.columns.entries()) {
    const th = element(document, 'th', '', `${column} (${result.units[i]})`);
    th.scope = 'col';
    header.append(th);
  }
  head.append(header);
  const rows = element(document, 'tbody', '');
  for (const row of result.rows.slice(0, 200)) {
    const tr = element(document, 'tr', '');
    tr.append(...row.map((value) => element(document, 'td', '', value.toPrecision(8))));
    rows.append(tr);
  }
  table.append(head, rows);
  tableWrap.append(table);
  output.append(tableWrap);
  const details = element(document, 'details', 'lab-details');
  details.append(
    element(document, 'summary', '', '전체 결과·단위·설정·불확실성·계보 보기'),
    element(document, 'pre', 'advanced-diagnostic-json', exportAdvancedDiagnosticArtifact(artifact))
  );
  output.append(details);
  return output;
}
