import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import { createExperimentRoute } from '../../persistence/share-route';
import { BATCH_LIMITS, type BatchExecutor } from './contracts';
import {
  partitionLegacyRunList,
  parseLegacyRunQueue,
  serializeLegacyRunQueue,
  type LegacyRunEntry,
  type LegacyRunSnapshot
} from './legacy-run-list';
import { createLegacyRunQueue, type LegacyRunQueue } from './legacy-run-list-queue';

export interface LegacyRunListPanelOptions {
  readonly executor?: BatchExecutor;
}
/** Exact saved conditions, explicitly started. Part switching keeps every completed result in memory. */
export function createLegacyRunListPanel(
  document: Document,
  entries: readonly LegacyRunEntry[],
  options: LegacyRunListPanelOptions = {}
) {
  const plans = partitionLegacyRunList(entries);
  const root = element(document, 'details', 'ds-section');
  root.classList.add('legacy-run-list');
  root.append(element(document, 'summary', 'ds-section__heading', '기존 조건 목록 실행'));
  const body = element(document, 'div', 'ds-section__body');
  root.append(body);
  body.append(
    element(
      document,
      'p',
      'lab-muted',
      `${entries.length}개 원본 조건을 순서·입력·seed 그대로 ${plans.length}개 part로 나누었습니다. part당 최대512 run·4000000 상태·단계 작업·입력과 결과16MiB입니다. 선택한 part만 명시적으로 실행합니다. 모델과 단위가 다른 결과를 평균내지 않습니다. 요약 통계는 기록 표본의 산술 통계입니다.`
    )
  );
  const part = element(document, 'select', 'ds-field__control');
  part.setAttribute('aria-label', '기존 조건 실행 part');
  plans.forEach((plan, index) => {
    const option = element(document, 'option', '', `part ${index + 1} · ${plan.entries.length} run`);
    option.value = String(index);
    part.append(option);
  });
  const run = element(document, 'select', 'ds-field__control');
  run.setAttribute('aria-label', '기존 조건 원본 run 선택');
  const status = element(document, 'p', 'lab-muted');
  status.setAttribute('role', 'status');
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const progress = element(document, 'progress', '');
  progress.max = 1;
  progress.value = 0;
  progress.setAttribute('aria-label', '기존 조건 목록 진행률');
  const output = element(document, 'div', '');
  const queues = new Map<number, LegacyRunQueue>();
  const urls = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let currentPart = 0,
    selectedIndex = 0,
    disposed = false,
    generation = 0;
  let unsubscribe: (() => void) | undefined, queue: LegacyRunQueue, state: LegacyRunSnapshot;
  function showError(cause: unknown) {
    error.hidden = false;
    error.textContent = cause instanceof Error ? cause.message : '원본 조건 목록을 읽지 못했습니다.';
  }
  const start = createButton(document, { label: '선택 part 실행·재개', onClick: () => queue.start() });
  const cancel = createButton(document, {
    label: '기존 조건 실행 취소',
    variant: 'secondary',
    onClick: () => queue.cancel()
  });
  const retry = createButton(document, {
    label: '실패한 원본 조건 재실행',
    variant: 'secondary',
    onClick: () => queue.retryFailed()
  });
  const retrySelected = createButton(document, {
    label: '선택한 원본 조건 재시도',
    variant: 'secondary',
    onClick: () => queue.retryFailed([state.runs[selectedIndex]!.id])
  });
  const reopen = createButton(document, {
    label: '선택 원본 조건을 실험실에서 열기',
    variant: 'secondary',
    onClick: () => {
      const result = createExperimentRoute(state.plan.entries[selectedIndex]!.experiment);
      if (result.ok) document.defaultView!.location.hash = result.value;
      else showError(new Error(result.issues.map((issue) => issue.message).join(' ')));
    }
  });
  const download = createButton(document, {
    label: '선택 part 입력·결과·재개 JSON 저장',
    variant: 'secondary',
    onClick: () => {
      try {
        const url = URL.createObjectURL(
          new Blob([serializeLegacyRunQueue(queue.snapshot())], { type: 'application/json' })
        );
        urls.add(url);
        const anchor = element(document, 'a', '');
        anchor.href = url;
        anchor.download = `${state.plan.id}.json`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        const timer = setTimeout(() => {
          URL.revokeObjectURL(url);
          urls.delete(url);
          timers.delete(timer);
        }, 1000);
        timers.add(timer);
      } catch (cause) {
        showError(cause);
      }
    }
  });
  const file = element(document, 'input', 'ds-field__control');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.setAttribute('aria-label', '원본 조건 part 재개 JSON 가져오기');
  file.addEventListener('change', () => {
    const chosen = file.files?.[0],
      revision = ++generation;
    if (!chosen || state.status === 'running') return;
    void (async () => {
      try {
        if (chosen.size > BATCH_LIMITS.artifactBytes) throw new Error('재개 JSON은 최대16MiB입니다.');
        const text = await chosen.text();
        if (disposed || revision !== generation) return;
        const imported = parseLegacyRunQueue(text);
        const matchingPart = plans.findIndex((plan) => plan.id === imported.plan.id);
        if (matchingPart < 0)
          throw new Error('현재 전체 원본 목록에 속하지 않는 part입니다. 원래 조건 목록에서 여세요.');
        const next = createLegacyRunQueue(imported, options);
        queues.get(matchingPart)?.dispose();
        queues.set(matchingPart, next);
        attach(matchingPart);
        error.hidden = true;
      } catch (cause) {
        if (!disposed && revision === generation) showError(cause);
      } finally {
        if (!disposed && revision === generation) file.value = '';
      }
    })();
  });
  const actions = element(document, 'div', 'lab-inline-actions');
  actions.append(start, cancel, retry, retrySelected, reopen, download);
  body.append(
    part,
    actions,
    progress,
    status,
    error,
    run,
    output,
    file,
    element(
      document,
      'p',
      'lab-muted',
      '각 part 파일은 정확한 원본 ID·입력·seed·순서·개별 결과를 보존합니다. 전체 목록은 모든 part 파일을 저장하세요. 재개는 완료 run을 유지하고 중단된 run을 원래 입력에서 다시 시작합니다. 외부 수치 결과는 입력 계보·구조만 검사하며 재계산하거나 인증하지 않습니다. 페이지를 떠나면 실행을 중지합니다.'
    )
  );
  function render() {
    if (disposed) return;
    const running = state.status === 'running';
    root.dataset.queueStatus = state.status;
    progress.value = state.progress;
    const completed = state.runs.filter((entry) => entry.status === 'completed').length;
    const failed = state.runs.filter((entry) => entry.status === 'failed').length;
    status.textContent = `part ${currentPart + 1}/${plans.length} · ${state.status} · 완료 ${completed}/${state.runs.length} · 실패 ${failed} · ${Math.round(state.progress * 100)}% · ${state.plan.id}`;
    part.disabled = running;
    file.disabled = running;
    start.disabled = running || !state.runs.some((entry) => entry.status === 'pending');
    cancel.disabled = !running;
    retry.disabled = running || !failed;
    retrySelected.disabled = running || state.runs[selectedIndex]?.status !== 'failed';
    download.disabled = running;
    for (let index = 0; index < run.options.length; index++)
      run.options[index]!.textContent =
        `${index + 1}. ${state.plan.entries[index]!.sourceId} · ${state.runs[index]!.status}`;
    const selected = state.runs[selectedIndex]!,
      source = state.plan.entries[selectedIndex]!;
    output.replaceChildren(
      element(
        document,
        'p',
        '',
        `원본 ID: ${source.sourceId} · seed: ${source.experiment.seed?.value ?? '없음'} · run ID: ${selected.id} · 시도 ${selected.attempts}회`
      )
    );
    if (selected.error) output.append(element(document, 'p', 'ds-field__error', selected.error));
    if (selected.result) {
      const summary = selected.result.summary;
      output.append(
        element(
          document,
          'p',
          '',
          `축 ${summary.axisStart} → ${summary.axisEnd} ${summary.axisUnit} · ${summary.steps}단계 · 표본 ${summary.sampleCount}개`
        )
      );
      const table = element(document, 'table', 'ds-table');
      const header = element(document, 'tr', '');
      for (const title of ['관측량', '단위', '초기', '끝', '최소', '최대', '평균', 'RMS'])
        header.append(element(document, 'th', '', title));
      const head = element(document, 'thead', '');
      head.append(header);
      table.append(head);
      const rows = element(document, 'tbody', '');
      for (const metric of summary.metrics) {
        const row = element(document, 'tr', '');
        for (const value of [
          metric.label,
          metric.unit,
          metric.initial,
          metric.final,
          metric.min,
          metric.max,
          metric.mean,
          metric.rms
        ])
          row.append(element(document, 'td', '', String(value)));
        rows.append(row);
      }
      table.append(rows);
      output.append(table);
      if (summary.energy)
        output.append(element(document, 'p', '', `에너지 변화 ${summary.energy.change} ${summary.energy.unit}`));
      for (const warning of summary.warnings) output.append(element(document, 'p', 'lab-muted', warning));
    }
  }
  function attach(index: number) {
    unsubscribe?.();
    currentPart = index;
    selectedIndex = 0;
    part.value = String(index);
    let selected = queues.get(index);
    if (!selected) {
      selected = createLegacyRunQueue(plans[index]!.entries, options);
      queues.set(index, selected);
    }
    queue = selected;
    state = queue.snapshot();
    run.replaceChildren(
      ...state.plan.entries.map((entry, position) => {
        const option = element(document, 'option', '', entry.sourceId);
        option.value = String(position);
        return option;
      })
    );
    unsubscribe = queue.subscribe((snapshot) => {
      state = snapshot;
      render();
    });
    render();
  }
  part.addEventListener('change', () => {
    if (state.status !== 'running') {
      generation++;
      attach(Number(part.value));
    }
  });
  run.addEventListener('change', () => {
    selectedIndex = Number(run.value);
    render();
  });
  attach(0);
  return {
    element: root,
    snapshot: () => [...queues.values()].map((entry) => entry.snapshot()),
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      unsubscribe?.();
      for (const entry of queues.values()) entry.dispose();
      for (const timer of timers) clearTimeout(timer);
      for (const url of urls) URL.revokeObjectURL(url);
      queues.clear();
      timers.clear();
      urls.clear();
    }
  };
}
