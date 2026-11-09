import { element } from '../../app/dom';
import type { ExpansionSuiteResult, ExpansionPoint } from '../../../physics/expandedModels-types';

/** Plots use native recorded points only; no propagation, fitting or scientific inference happens here. */
export function createLegacyExpansionResultView(document: Document, result: ExpansionSuiteResult) {
  const root = element(document, 'section', '');
  root.append(
    element(document, 'h3', '', `${result.modelLabel} · 전체 native 결과`),
    element(
      document,
      'p',
      '',
      `${result.rows.length}방법 · 기준 ${result.referenceMethod} · native 선택 ${result.summary.bestMethod} · 생성 ${result.generatedAt} · ${result.manifest.hash}`
    ),
    element(
      document,
      'p',
      'lab-muted',
      'native 점수는 실행 속도를 포함하므로 반복 실행의 최고 방법·ghost·replay가 달라질 수 있습니다. 비유한·불안정 원본 값은 JSON에 숫자 태그로 그대로 보존하며 그림에서는 유한 점만 표시합니다.'
    )
  );
  const table = element(document, 'table', 'product-table'),
    head = element(document, 'tr', '');
  for (const title of [
    '방법',
    '안정',
    '완료 단계',
    '에너지 drift',
    '에너지 span',
    '기준 차이',
    'ms',
    'steps/ms',
    '끝 상태'
  ])
    head.append(element(document, 'th', '', title));
  const thead = element(document, 'thead', '');
  thead.append(head);
  table.append(thead);
  const rows = element(document, 'tbody', '');
  for (const row of result.rows) {
    const tr = element(document, 'tr', '');
    for (const value of [
      row.method,
      row.stable,
      row.completedSteps,
      row.energyDrift,
      row.energySpan,
      row.referenceDivergence,
      row.elapsedMs,
      row.stepsPerMs,
      row.finalState.join(', ')
    ])
      tr.append(element(document, 'td', '', String(value)));
    rows.append(tr);
  }
  table.append(rows);
  root.append(table);
  const method = element(document, 'select', 'ds-field__control');
  method.setAttribute('aria-label', 'native 적분기 궤적');
  for (const row of result.rows) {
    const option = element(document, 'option', '', row.method);
    option.value = row.method;
    method.append(option);
  }
  const trajectory = element(document, 'div', '');
  root.append(method, trajectory);
  function showTrajectory() {
    const row = result.rows.find((item) => item.method === method.value)!;
    trajectory.replaceChildren(
      element(
        document,
        'p',
        '',
        `${row.method} · 실제 native 표본 ${row.samples.length}개 · embeddedError ${row.embeddedError ?? '없음'}`
      ),
      plot(
        document,
        row.samples.map((sample) => ({ x: sample.time, y: sample.energy })),
        'native 기록: 시간–에너지'
      ),
      plot(
        document,
        row.samples.map((sample) => sample.phase),
        'native 기록: 위상 평면'
      )
    );
  }
  method.addEventListener('change', showTrajectory);
  showTrajectory();
  const heatmap = result.phaseHeatmap,
    heat = svg(document, 'native 위상 heatmap');
  heat.setAttribute('viewBox', `0 0 ${heatmap.bins} ${heatmap.bins}`);
  for (let y = 0; y < heatmap.bins; y++)
    for (let x = 0; x < heatmap.bins; x++) {
      const count = heatmap.counts[y]![x]!,
        cell = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      cell.setAttribute('x', String(x));
      cell.setAttribute('y', String(heatmap.bins - y - 1));
      cell.setAttribute('width', '1');
      cell.setAttribute('height', '1');
      cell.setAttribute('fill', `rgba(54,136,230,${heatmap.maxCount ? count / heatmap.maxCount : 0})`);
      heat.append(cell);
    }
  root.append(
    element(
      document,
      'p',
      '',
      `native heatmap: x[${heatmap.xMin},${heatmap.xMax}] · y[${heatmap.yMin},${heatmap.yMax}] · ${heatmap.bins}×${heatmap.bins}`
    ),
    heat,
    plot(
      document,
      result.ghost.map((frame) => ({ x: frame.time, y: frame.divergence })),
      'native ghost 시간–상태 분리'
    ),
    plot(
      document,
      result.bifurcation.flatMap((column) => column.values.map((value) => ({ x: column.parameter, y: value }))),
      'native 분기 기록',
      true
    )
  );
  const replay = element(document, 'input', 'ds-field__control');
  replay.type = 'range';
  replay.min = '0';
  replay.max = String(Math.max(0, result.replay.length - 1));
  replay.step = '1';
  replay.value = '0';
  replay.setAttribute('aria-label', 'native replay 프레임');
  const frame = element(document, 'div', '');
  function showFrame() {
    const index = Number(replay.value),
      coordinates = result.replay[index] ?? [];
    frame.replaceChildren(
      element(
        document,
        'p',
        '',
        `native replay ${result.replay.length ? index + 1 : 0}/${result.replay.length} · 원본 좌표 ${JSON.stringify(coordinates)}`
      ),
      plot(document, [{ x: 0, y: 0 }, ...coordinates], 'native replay 좌표')
    );
  }
  replay.addEventListener('input', showFrame);
  root.append(replay, frame);
  showFrame();
  if (result.lyapunov) {
    const lyapunov = result.lyapunov;
    root.append(
      element(
        document,
        'p',
        '',
        `native Lyapunov spectrum [${lyapunov.spectrum.join(', ')}] · blockStdError [${lyapunov.blockStdError.join(', ')}] · sum ${lyapunov.sum} · Kaplan–Yorke ${lyapunov.kaplanYorkeDimension}`
      ),
      element(
        document,
        'pre',
        'lab-data-output',
        JSON.stringify({ settings: lyapunov.settings, consistency: lyapunov.consistency }, null, 2)
      ),
      plot(
        document,
        lyapunov.timeline.map((point) => ({ x: point.time, y: point.leading })),
        'native Lyapunov timeline'
      )
    );
  }
  return root;
}
function svg(document: Document, label: string) {
  const image = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  image.setAttribute('viewBox', '0 0 420 240');
  image.setAttribute('role', 'img');
  image.setAttribute('aria-label', label);
  image.style.width = '100%';
  image.style.maxHeight = '240px';
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  title.textContent = label;
  image.append(title);
  return image;
}
function plot(document: Document, raw: readonly ExpansionPoint[], label: string, scatter = false) {
  const root = element(document, 'figure', ''),
    image = svg(document, label);
  const points = raw.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (points.length) {
    const xs = points.map((point) => point.x),
      ys = points.map((point) => point.y);
    const xMin = Math.min(...xs),
      xMax = Math.max(...xs),
      yMin = Math.min(...ys),
      yMax = Math.max(...ys);
    const position = (point: ExpansionPoint) => ({
      x: 20 + ((point.x - xMin) / (xMax - xMin || 1)) * 380,
      y: 220 - ((point.y - yMin) / (yMax - yMin || 1)) * 200
    });
    if (scatter)
      for (const point of points) {
        const p = position(point),
          circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', String(p.x));
        circle.setAttribute('cy', String(p.y));
        circle.setAttribute('r', '1.5');
        circle.setAttribute('fill', 'currentColor');
        image.append(circle);
      }
    else {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      line.setAttribute(
        'points',
        points
          .map((point) => {
            const p = position(point);
            return `${p.x},${p.y}`;
          })
          .join(' ')
      );
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', 'currentColor');
      line.setAttribute('stroke-width', '1.5');
      image.append(line);
    }
    root.append(
      element(
        document,
        'figcaption',
        '',
        `${label} · x[${xMin},${xMax}] · y[${yMin},${yMax}] · 유한 점 ${points.length}/${raw.length}`
      )
    );
  } else root.append(element(document, 'figcaption', '', `${label} · 유한 기록 점 없음`));
  root.append(image);
  return root;
}
