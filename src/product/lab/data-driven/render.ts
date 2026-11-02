import { element } from '../../app/dom';
import type { LearningData } from '../../adapters/analysis/data-driven/learning-contracts';
import type { DataDrivenResult } from '../../adapters/analysis/data-driven/contracts';
import { dataTable } from './controls';
import { MODEL_METHOD_LABELS } from './settings';

export function renderDataset(document: Document, data: LearningData, title: string) {
  const block = element(document, 'div', 'data-model-output');
  block.append(
    element(document, 'h4', '', title),
    element(
      document,
      'p',
      'lab-preview-note',
      `${data.values.length}표본 · ${data.labels.length}성분 · 관측 축 ${data.axisUnit} · ${data.times[0]}–${data.times.at(-1)}`
    ),
    dataTable(
      document,
      `${title} · 처음 8표본`,
      [`축 (${data.axisUnit})`, ...data.labels.map((label, i) => `${i}: ${label} (${data.units[i]})`)],
      data.times.slice(0, 8).map((time, i) => [time, ...data.values[i]!])
    )
  );
  const lineage = element(document, 'details', 'lab-details');
  lineage.append(element(document, 'summary', '', '데이터 출처와 변환 계보'));
  lineage.append(element(document, 'pre', 'lab-muted', JSON.stringify(data.provenance, null, 2)));
  block.append(lineage);
  if (Array.isArray(data.provenance.warnings))
    for (const warning of data.provenance.warnings)
      if (typeof warning === 'string') block.append(element(document, 'p', 'lab-muted', warning));
  return block;
}

function trajectoryChart(document: Document, result: DataDrivenResult) {
  const { rows, columns, units } = result.output;
  if (rows.length < 2 || rows[0]!.length < 3) return undefined;
  const points = rows.slice(0, 256);
  const xs = points.map((row) => row[0]!);
  const ys = points.flatMap((row) => [row[1]!, row[2]!]);
  const x0 = Math.min(...xs),
    dx = Math.max(...xs) - x0 || 1;
  const y0 = Math.min(...ys),
    dy = Math.max(...ys) - y0 || 1;
  const figure = element(document, 'figure', 'data-model-chart');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 640 240');
  svg.setAttribute('role', 'img');
  const label = `${columns[1]}와 ${columns[2]} 비교 (${units[1]}). 정확한 값은 아래 표에서 확인할 수 있습니다.`;
  svg.setAttribute('aria-label', label);
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  title.textContent = label;
  svg.append(title);
  const axis = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  axis.setAttribute('d', 'M 24 12 V 216 H 628');
  axis.setAttribute('class', 'axis');
  svg.append(axis);
  for (const [index, className] of [
    [1, 'observed'],
    [2, 'predicted']
  ] as const) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('class', className);
    line.setAttribute(
      'points',
      points.map((row) => `${24 + (604 * (row[0]! - x0)) / dx},${216 - (204 * (row[index]! - y0)) / dy}`).join(' ')
    );
    svg.append(line);
  }
  figure.append(
    svg,
    element(
      document,
      'figcaption',
      'lab-muted',
      `${columns[1]}: 실선 · ${columns[2]}: 점선. 축 ${columns[0]} (${units[0]}), 값 (${units[1]}). 각 축은 현재 표시 범위로 조정합니다.`
    )
  );
  return figure;
}

export function renderModelResult(document: Document, result: DataDrivenResult) {
  const block = element(document, 'div', 'data-model-output');
  const method = result.request.input.settings.method;
  const metricLabels: Record<string, string> = {
    trainingRmse: '훈련 RMSE',
    validationRmse: '검증 RMSE',
    rolloutRmse: 'Rollout RMSE',
    persistenceRmse: '유지 예측 RMSE',
    validationTrainingRatio: '검증/훈련 오차비',
    trainingSamples: '훈련 표본 수',
    validationSamples: '검증 표본 수',
    accepted: '잔차·개수·독립성 통과',
    maximumResidual: '최대 실제 잔차',
    maximumNativeResidual: '최대 native 잔차',
    independentVectors: '독립 고유벡터 수',
    matVecs: '연산자 적용 수',
    nativeRestarts: 'Native cycle 수',
    dimension: '연산자 차원',
    eigenvalues: '고유값 수',
    traceError: 'Trace 오차',
    hamiltonianDrift: '학습 에너지 drift'
  };
  const metrics = dataTable(
    document,
    '모델 진단 · 수치 지표',
    ['지표', '값'],
    Object.entries(result.output.metrics).map(([key, value]) => [metricLabels[key] ?? key, value])
  );
  metrics.classList.add('data-model-metrics');
  block.append(
    element(document, 'h4', '', `${MODEL_METHOD_LABELS[method]} 결과`),
    element(
      document,
      'p',
      'lab-preview-note',
      `결과 ${result.id.slice(0, 22)}… · 입력 ${result.inputId.slice(0, 21)}… · 모델 버전 ${result.algorithmVersion} · ${result.request.mode === 'evaluate' ? '저장 모델 재평가' : '훈련/해석'}`
    ),
    metrics
  );
  if (result.request.input.kind === 'learning') {
    const chart = trajectoryChart(document, result);
    if (chart) block.append(chart);
  }
  block.append(
    dataTable(
      document,
      '검증·rollout 또는 고유값·실제 잔차',
      result.output.columns.map((name, i) => `${name} (${result.output.units[i]})`),
      result.output.rows
    )
  );
  for (const text of result.output.warnings) block.append(element(document, 'p', 'lab-preview-note', text));
  for (const text of result.output.details) block.append(element(document, 'p', 'lab-muted', text));
  const model = element(document, 'details', 'lab-details');
  model.append(element(document, 'summary', '', '모델 계수·library·전처리·수렴 기록'));
  model.append(element(document, 'p', 'lab-muted', `결과 ID: ${result.id} · 입력 ID: ${result.inputId}`));
  model.append(element(document, 'pre', 'lab-muted', JSON.stringify(result.output.model, null, 2)));
  block.append(model);
  return block;
}
