import { element } from '../../app/dom';
import type { AdvancedDiagnosticResult } from '../../adapters/analysis/advanced/contracts';
import { createPlot } from './core-plots';

const colors = ['#075985', '#9a3412', '#166534', '#6b21a8'];

/** Plot explicit scientific projections; table and artifact preserve all native coordinates. */
export function advancedPlots(document: Document, result: AdvancedDiagnosticResult): Node[] {
  const rows = result.rows;
  const details =
    result.details && typeof result.details === 'object' && !Array.isArray(result.details) ? result.details : {};
  if (result.kind === 'transfer-operator') {
    const resolutions = [...new Set(rows.map((row) => row[0]!))];
    return [
      createPlot(
        document,
        'Ulam 고유값 · 복소 평면',
        'Re λ (1)',
        'Im λ (1)',
        resolutions.map((resolution, i) => ({
          label: `${resolution} 상자`,
          color: colors[i % colors.length]!,
          points: rows.filter((row) => row[0] === resolution).map((row) => [row[2]!, row[3]!] as const)
        })),
        true
      )
    ];
  }
  if (result.kind === 'clv') {
    const directions = [...new Set(rows.map((row) => row[1]!))].slice(0, 4);
    const plots: Node[] = [
      createPlot(
        document,
        'CLV 유한시간 지수 · 처음 최대 4방향',
        `상대 시간 (${result.units[0]})`,
        `지수 (${result.units[2]})`,
        directions.map((direction, i) => ({
          label: `방향 ${direction}`,
          color: colors[i]!,
          points: rows.filter((row) => row[1] === direction).map((row) => [row[0]!, row[2]!] as const)
        }))
      )
    ];
    const times = details.times,
      vectors = details.vectors,
      initial = details.initial;
    if (
      Array.isArray(times) &&
      times.every((time) => typeof time === 'number' && Number.isFinite(time)) &&
      Array.isArray(vectors) &&
      Array.isArray(initial) &&
      initial.length &&
      times.length === vectors.length &&
      vectors.every(
        (vector) =>
          Array.isArray(vector) &&
          vector.length >= initial.length &&
          vector.every((value) => typeof value === 'number' && Number.isFinite(value))
      )
    ) {
      plots.push(
        createPlot(
          document,
          '첫 CLV의 native 성분 · 처음 최대 4좌표',
          `상대 시간 (${result.units[0]})`,
          '정규화 벡터 성분 (1)',
          Array.from({ length: Math.min(4, initial.length) }, (_, coordinate) => ({
            label: `좌표 ${coordinate}`,
            color: colors[coordinate]!,
            points: times.map((time, i) => [Number(time), Number((vectors[i] as number[])[coordinate])] as const)
          }))
        ),
        element(
          document,
          'p',
          'lab-muted',
          'CLV의 부호는 임의입니다. 이 그림은 native 좌표에서 정규화한 첫 벡터의 성분이며 성분 자체에 물리 단위를 부여하지 않습니다. 모든 방향·좌표와 각도는 artifact에 보존합니다.'
        )
      );
    }
    return plots;
  }
  if (result.kind === 'multifractal')
    return [
      createPlot(document, '일반화 차원', 'q (1)', 'Dq (1)', [
        { label: 'Dq', color: colors[0]!, points: rows.map((row) => [row[0]!, row[1]!] as const) }
      ]),
      createPlot(
        document,
        'Legendre 특이성 스펙트럼',
        'α (1)',
        'f(α) (1)',
        [{ label: 'f(α)', color: colors[1]!, points: rows.map((row) => [row[3]!, row[4]!] as const) }],
        true
      )
    ];
  if (result.kind === 'rqa' || result.kind === 'recurrence-network') {
    const size = Number(details.size),
      matrix = details.matrix;
    if (
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > 512 ||
      !Array.isArray(matrix) ||
      matrix.length !== size * size ||
      !matrix.every((value) => value === 0 || value === 1)
    )
      return [];
    const visible = Math.min(size, 128);
    const indices = Array.from({ length: visible }, (_, i) => Math.round((i * (size - 1)) / Math.max(1, visible - 1)));
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.classList.add('core-plot');
    svg.setAttribute('viewBox', '0 0 400 400');
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      `재귀 행렬. 두 축은 임베딩 표본 index입니다. ${size}×${size} 중 최대 128×128 시각 표본, 검은 점은 재귀 또는 이웃 연결입니다. 전체 행렬은 artifact에 있습니다.`
    );
    const background = document.createElementNS(ns, 'rect');
    background.setAttribute('width', '400');
    background.setAttribute('height', '400');
    background.setAttribute('fill', '#fff');
    const path = document.createElementNS(ns, 'path');
    let commands = '';
    const cell = 330 / visible;
    for (const [i, row] of indices.entries())
      for (const [j, column] of indices.entries())
        if (Number(matrix[row * size + column]) > 0)
          commands += `M${45 + j * cell} ${20 + i * cell}h${cell}v${cell}h-${cell}z`;
    path.setAttribute('d', commands);
    path.setAttribute('fill', '#0f172a');
    path.setAttribute('shape-rendering', 'crispEdges');
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', '25');
    label.setAttribute('y', '380');
    label.setAttribute('font-size', '11');
    label.setAttribute('fill', '#0f172a');
    label.textContent = `재귀 행렬 · 표본 index 0…${size - 1} · 도형 최대128²점`;
    svg.append(background, path, label);
    return [
      svg,
      element(
        document,
        'p',
        'lab-muted',
        `그림의 두 축은 같은 임베딩 표본 번호입니다. ${size > 128 ? '시각 표본을 균등하게 줄여 표시하며 일부 재귀점은 생략됩니다. ' : ''}원래 ${size}×${size} 행렬과 실제 선택 시각은 artifact에 있습니다.`
      )
    ];
  }
  if (result.columns.length < 2 || rows.length < 2) return [];
  return [
    createPlot(
      document,
      '고급 진단 수치',
      `${result.columns[0]} (${result.units[0]})`,
      `${result.columns[1]} (${result.units[1]})`,
      [{ label: result.columns[1]!, color: colors[0]!, points: rows.map((row) => [row[0]!, row[1]!] as const) }]
    )
  ];
}
