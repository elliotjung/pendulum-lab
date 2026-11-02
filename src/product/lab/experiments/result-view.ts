import { element } from '../../app/dom';
import { createPlot } from '../views/core-plots';
import { batchKindNames } from './settings';
import type { BatchRunStatus, BatchSnapshot } from './contracts';

export const batchRunLabels: Record<BatchRunStatus, string> = {
  pending: '대기',
  running: '실행 중',
  completed: '완료',
  failed: '실패'
};

export function batchNumber(value: number): string {
  return value === 0
    ? '0'
    : Math.abs(value) >= 1e5 || Math.abs(value) < 1e-4
      ? value.toExponential(4)
      : Number(value.toPrecision(6)).toString();
}

function table(document: Document, caption: string, headings: readonly string[], rows: readonly (readonly string[])[]) {
  const wrapper = element(document, 'div', 'batch-table');
  wrapper.tabIndex = 0;
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-label', caption);
  const grid = element(document, 'table', '');
  grid.append(element(document, 'caption', '', caption));
  const head = element(document, 'thead', '');
  const header = element(document, 'tr', '');
  for (const text of headings) {
    const cell = element(document, 'th', '', text);
    cell.scope = 'col';
    header.append(cell);
  }
  head.append(header);
  const body = element(document, 'tbody', '');
  for (const values of rows) {
    const row = element(document, 'tr', '');
    for (const value of values) row.append(element(document, 'td', '', value));
    body.append(row);
  }
  grid.append(head, body);
  wrapper.append(grid);
  return { element: wrapper, rows: body.children };
}

/** Compact output is bounded by the declared run budget; full inputs remain in the JSON. */
export function batchResultView(
  document: Document,
  snapshot: BatchSnapshot,
  selectedId?: string,
  onSelect?: (id: string) => void
) {
  const root = element(document, 'div', 'batch-result');
  const aggregate = snapshot.aggregate;
  root.append(
    element(document, 'h3', '', `${batchKindNames[snapshot.plan.settings.kind]} 실행 요약`),
    element(
      document,
      'p',
      'batch-plan-summary',
      `전체 ${snapshot.runs.length} run · 완료 ${aggregate.completed} · 실패 ${aggregate.failed} · 대기/진행 ${aggregate.pending}`
    ),
    element(
      document,
      'p',
      'lab-muted',
      `입력 snapshot ${snapshot.plan.sourceInputId} → batch ${snapshot.plan.id} → 집계 ${aggregate.artifactId}. 집계의 자식 ID ${aggregate.childRunIds.length}개는 개별 run 결과와 연결됩니다.`
    ),
    element(
      document,
      'p',
      'lab-muted',
      '완료된 run의 동일 이름·단위 지표만 집계합니다. 평균과 표준편차는 유한 표본 요약이며 신뢰구간이나 진짜 해에 대한 오차가 아닙니다. 실패·미완료 run은 성공 통계에 넣지 않습니다.'
    )
  );
  if (aggregate.warnings.length) root.append(element(document, 'p', 'lab-preview-note', aggregate.warnings.join(' ')));
  if (aggregate.metrics.length)
    root.append(
      table(
        document,
        'Run 종점 집계',
        ['지표', '단위', '표본 수', '최솟값', '평균', '최댓값', '표준편차'],
        aggregate.metrics.map((metric) => [
          metric.label,
          metric.unit,
          String(metric.count),
          batchNumber(metric.min),
          batchNumber(metric.mean),
          batchNumber(metric.max),
          batchNumber(metric.standardDeviation)
        ])
      ).element
    );
  if (aggregate.pairedDifference?.length) {
    root.append(
      table(
        document,
        '첫 run을 기준으로 한 종점 차이',
        ['지표', '단위', '차이'],
        aggregate.pairedDifference.map((metric) => [metric.label, metric.unit, batchNumber(metric.value)])
      ).element
    );
    if (snapshot.plan.settings.kind === 'integrators')
      root.append(
        element(
          document,
          'p',
          'lab-preview-note',
          '차이는 첫 번째로 선택한 적분기와의 비교입니다. 첫 방법을 참해로 가정하지 않습니다.'
        )
      );
  }
  if (aggregate.comparisons?.length) {
    root.append(
      table(
        document,
        '첫 적분기를 기준으로 한 종점 차이',
        ['기준 run', '비교 run', '지표', '단위', '차이'],
        aggregate.comparisons.flatMap((comparison) =>
          comparison.metrics.map((metric) => [
            comparison.referenceRunId,
            comparison.runId,
            metric.label,
            metric.unit,
            batchNumber(metric.value)
          ])
        )
      ).element
    );
    root.append(
      element(
        document,
        'p',
        'lab-preview-note',
        '기준 run은 첫 번째로 선택한 적분기의 결과입니다. 차이는 방법 간 비교이며 참해 오차가 아닙니다.'
      )
    );
  }
  const firstMetric = snapshot.runs.find((run) => run.result?.summary.metrics.length)?.result?.summary.metrics[0];
  if (firstMetric) {
    const points = snapshot.runs.flatMap((run) => {
      const metric = run.result?.summary.metrics.find(
        (candidate) => candidate.key === firstMetric.key && candidate.unit === firstMetric.unit
      );
      return metric ? [[run.index + 1, metric.final] as const] : [];
    });
    root.append(
      createPlot(
        document,
        'Run별 종점 비교',
        '입력 순서 (run)',
        `${firstMetric.label} (${firstMetric.unit})`,
        [{ label: firstMetric.label, color: '#075985', points }],
        true
      )
    );
    root.append(
      element(
        document,
        'p',
        'lab-muted',
        '그림의 가로축은 run 입력 순서이며 물리 시간이 아닙니다. 누락된 점은 아직 완료되지 않았거나 실패한 run입니다.'
      )
    );
  }
  const pageLabel = element(document, 'label', 'ds-field__label', '개별 run 표 페이지');
  const page = element(document, 'select', 'ds-field__control');
  page.id = 'batch-page';
  pageLabel.htmlFor = page.id;
  const pageSize = 64;
  for (let index = 0; index < Math.ceil(snapshot.runs.length / pageSize); index++) {
    const option = element(
      document,
      'option',
      '',
      `Run ${index * pageSize + 1}–${Math.min(snapshot.runs.length, (index + 1) * pageSize)}`
    );
    option.value = String(index);
    page.append(option);
  }
  const runTable = element(document, 'div', 'batch-run-table');
  function renderRunPage() {
    const index = Number(page.value);
    const visible = snapshot.runs.slice(index * pageSize, (index + 1) * pageSize);
    const list = table(
      document,
      '개별 run 상태와 종점',
      ['Run', '상태', '시도', '바꾼 값', '종점 지표', '에너지 변화', '실패 원인'],
      visible.map((run) => {
        const input = snapshot.plan.runs[run.index]!;
        const metric = run.result?.summary.metrics[0];
        const energy = run.result?.summary.energy;
        return [
          String(run.index + 1),
          batchRunLabels[run.status],
          String(run.attempts),
          input.assignments
            .map(
              (assignment) =>
                `${assignment.field}=${typeof assignment.value === 'number' ? batchNumber(assignment.value) : assignment.value} ${assignment.unit}`
            )
            .join(' · ') || '원래 설정',
          metric ? `${metric.label} ${batchNumber(metric.final)} ${metric.unit}` : '—',
          energy ? `${batchNumber(energy.change)} ${energy.unit}` : '해당 없음',
          run.error ?? '—'
        ];
      })
    );
    visible.forEach((run, index) => {
      const row = list.rows[index] as HTMLElement;
      row.dataset.runId = run.id;
      row.dataset.runStatus = run.status;
    });
    runTable.replaceChildren(list.element);
  }
  root.append(pageLabel, page, runTable);
  const label = element(document, 'label', 'ds-field__label', '개별 run 자세히 보기');
  const select = element(document, 'select', 'ds-field__control');
  select.id = 'batch-selected-run';
  label.htmlFor = select.id;
  for (const run of snapshot.runs) {
    const option = element(document, 'option', '', `Run ${run.index + 1} · ${batchRunLabels[run.status]} · ${run.id}`);
    option.value = run.id;
    select.append(option);
  }
  select.value = selectedId && snapshot.runs.some((run) => run.id === selectedId) ? selectedId : snapshot.runs[0]!.id;
  const detail = element(document, 'div', 'batch-selected-detail');
  function renderSelected() {
    const run = snapshot.runs.find((candidate) => candidate.id === select.value)!;
    const input = snapshot.plan.runs[run.index]!;
    page.value = String(Math.floor(run.index / pageSize));
    renderRunPage();
    detail.replaceChildren(
      element(document, 'h4', '', `Run ${run.index + 1} · ${batchRunLabels[run.status]}`),
      element(
        document,
        'p',
        'lab-muted',
        `run ID ${run.id} · batch ID ${snapshot.plan.id} · 시도 ${run.attempts}회 · 기록된 계산 진행 ${Math.round(run.progress * 100)}%`
      )
    );
    if (run.error) detail.append(element(document, 'p', 'lab-preview-note', run.error));
    if (run.result) {
      const summary = run.result.summary;
      detail.append(
        element(
          document,
          'p',
          'lab-muted',
          `${summary.evaluation ? '스펙트럼/최적화 평가' : '원래 runtime'} · 축 ${batchNumber(summary.axisStart)}–${batchNumber(summary.axisEnd)} ${summary.axisUnit} · ${summary.steps} step · ${summary.sampleCount} 표본. 표본 통계는 저장 간격의 영향을 받습니다.`
        )
      );
      detail.append(
        table(
          document,
          '선택한 run의 관측 지표',
          ['지표', '단위', '시작', '끝', '최솟값', '최댓값', '표본 평균', 'RMS'],
          summary.metrics.map((metric) => [
            metric.label,
            metric.unit,
            batchNumber(metric.initial),
            batchNumber(metric.final),
            batchNumber(metric.min),
            batchNumber(metric.max),
            batchNumber(metric.mean),
            batchNumber(metric.rms)
          ])
        ).element
      );
      if (summary.warnings.length)
        detail.append(element(document, 'p', 'lab-preview-note', summary.warnings.join(' ')));
    }
    const raw = element(document, 'details', 'lab-details');
    raw.append(
      element(document, 'summary', '', '이 run의 전체 입력·결과·계보 보기'),
      element(document, 'pre', 'batch-json', JSON.stringify({ input, execution: run }, null, 2))
    );
    detail.append(raw);
    onSelect?.(run.id);
  }
  page.addEventListener('change', () => {
    select.value = snapshot.runs[Number(page.value) * pageSize]!.id;
    renderSelected();
  });
  select.addEventListener('change', renderSelected);
  root.append(label, select, detail);
  renderSelected();
  return root;
}
