import { element } from '../../app/dom';
import { createButton, createProgress } from '../../design-system/primitives';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import type { DiagnosticsOptions } from '../views/diagnostics';
import { createDiagnosticSeries } from '../../adapters/analysis/core/source';
import { buildBatch } from './builders';
import { BATCH_LIMITS, type BatchSnapshot } from './contracts';
import { createBatchQueue } from './queue';
import { parseBatch, serializeBatch } from './artifact';
import { createBatchSettings, batchKindNames } from './settings';
import { batchResultView } from './result-view';
import { bindProductResearch, type ProductStudyRunOptions } from '../../app/research-api-binding';

export function createExperimentPanel(document: Document, options: DiagnosticsOptions, container: HTMLDetailsElement) {
  const body = element(document, 'div', 'batch-body');
  const source = element(document, 'p', 'batch-source lab-preview-note');
  source.id = 'batch-source';
  const settings = createBatchSettings(document, inputsChanged);
  const limitations = element(
    document,
    'p',
    'lab-muted',
    `최대 ${BATCH_LIMITS.runs} run · 동시 worker ${BATCH_LIMITS.concurrency}개 · 변수 ${BATCH_LIMITS.axes}개. 비용 상한을 넘으면 run 수·기간·차원을 줄이세요. 각 run은 현재 초기조건에서 기존 공용 엔진으로 실행합니다. 재개는 완료 결과를 유지하고 중단된 run을 원래 입력에서 다시 시작합니다.`
  );
  const planNotice = element(document, 'p', 'batch-plan-summary');
  planNotice.id = 'batch-plan-summary';
  const status = element(document, 'p', 'lab-muted', '현재 실험을 바탕으로 비교할 조건을 정한 뒤 준비하세요.');
  status.id = 'batch-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-atomic', 'true');
  const error = element(document, 'p', 'ds-field__error');
  error.id = 'batch-error';
  error.hidden = true;
  error.setAttribute('role', 'alert');
  const progress = createProgress(document, { id: 'batch-progress', label: '다중 실험 진행', value: 0 });
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const prepare = createButton(document, { label: '다중 실험 준비', onClick: prepareBatch });
  const run = createButton(document, { label: '다중 실험 실행', onClick: () => queue?.start() });
  const cancel = createButton(document, { label: '대기열 취소', variant: 'secondary', onClick: () => queue?.cancel() });
  const resume = createButton(document, {
    label: '중단한 실행 재개',
    variant: 'secondary',
    onClick: () => queue?.resume()
  });
  const retry = createButton(document, {
    label: '실패 run 재실행',
    variant: 'secondary',
    onClick: () => queue?.retryFailed()
  });
  const retrySelected = createButton(document, {
    label: '선택한 실패 run 재실행',
    variant: 'secondary',
    onClick: () => {
      if (selectedId) queue?.retryFailed([selectedId]);
    }
  });
  const refresh = createButton(document, {
    label: '현재 실험 설정 새로 읽기',
    variant: 'secondary',
    onClick: refreshSource
  });
  const actions = element(document, 'div', 'lab-inline-actions');
  actions.append(prepare, run, cancel, resume, retry, retrySelected, refresh);
  const output = element(document, 'div', 'batch-output');
  output.id = 'batch-output';
  const files = element(document, 'div', 'batch-files');
  const download = createButton(document, {
    label: '전체 실험 JSON 다운로드',
    variant: 'secondary',
    onClick: downloadBatch
  });
  const label = element(document, 'label', 'ds-field__label', '전체 실험 JSON 가져오기');
  const input = element(document, 'input', 'ds-field__control');
  input.id = 'batch-import';
  label.htmlFor = input.id;
  input.type = 'file';
  input.accept = '.json,application/json';
  const persistence = element(
    document,
    'p',
    'lab-muted',
    '전체 입력·표본 설계·seed·개별 run·실패 원인·집계 계보를 파일로 보존합니다. 준비만 한 설정도 내보낼 수 있습니다. 페이지를 떠나면 worker를 중지합니다. 새로고침 후 재개하려면 JSON을 다시 가져오세요. 외부 결과는 구조·입력 일관성을 검사하며 수치값을 재계산하거나 인증하지 않습니다. 원시 궤적과 연구 프로젝트 저장소는 이 파일에 포함하지 않습니다.'
  );
  files.append(download, label, input, persistence);
  body.append(
    source,
    settings.element,
    limitations,
    actions,
    planNotice,
    progress.element,
    status,
    error,
    output,
    files
  );
  container.append(body);
  let snapshot: ExperimentStateV1 | undefined;
  let queue: ReturnType<typeof createBatchQueue> | undefined;
  let queueState: BatchSnapshot | undefined;
  let unsubscribe: (() => void) | undefined;
  let outputTimer: ReturnType<typeof setTimeout> | undefined;
  let dirty = true,
    disposed = false,
    generation = 0,
    rendering = false,
    selectedId: string | undefined,
    renderSignature = '';
  const urls = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const apiPending = new Set<(cause: Error) => void>();
  const busy = () => queueState?.status === 'running';
  function showError(message: string) {
    error.hidden = false;
    error.textContent = message;
  }
  function inputsChanged() {
    if (disposed) return;
    dirty = true;
    error.hidden = true;
    status.textContent = queue
      ? '입력을 바꿨습니다. 이전 결과와 설정은 보존합니다. 새 조건은 다중 실험 준비로 확인하세요.'
      : '조건을 바꿨습니다. 실행 전에 다중 실험 준비를 누르세요.';
    update();
  }
  function describeSource(experiment: ExperimentStateV1) {
    const runtime = experiment.runtime;
    const axisUnit = createDiagnosticSeries(experiment, []).axisUnit;
    const timeUnit = axisUnit === 'normalized-time' ? '정규화 시간' : 's';
    const range =
      runtime.domain === 'time'
        ? `기간 ${runtime.duration.value} ${timeUnit} · step ${runtime.step.value} ${timeUnit} · 기록 간격 ${runtime.sampleEvery} step`
        : runtime.domain === 'iteration'
          ? `${runtime.iterations} iteration · 기록 간격 ${runtime.sampleEvery}`
          : '전용 스펙트럼/최적화 평가';
    source.textContent = `기준 실험 ${experiment.systemId} · ${range} · 모델 ${experiment.modelVersion}. 실행 기간과 초기조건은 조건 패널에서 바꾸고 새로 읽으세요.`;
  }
  function refreshSource() {
    if (busy() || disposed) return;
    try {
      const parsed = options.experiment();
      if (!parsed.ok) throw new Error(parsed.issues.map((issue) => issue.message).join(' '));
      settings.sync(parsed.value);
      snapshot = structuredClone(parsed.value);
      describeSource(snapshot);
      inputsChanged();
    } catch (cause) {
      snapshot = undefined;
      showError(cause instanceof Error ? cause.message : '현재 실험 설정을 읽지 못했습니다.');
      container.dataset.batchStatus = 'error';
      source.textContent = '현재 실험 설정을 읽지 못했습니다. 조건 패널의 오류를 수정하고 새로 읽으세요.';
    }
    update();
  }
  function attachQueue(next: ReturnType<typeof createBatchQueue>) {
    clearTimeout(outputTimer);
    outputTimer = undefined;
    unsubscribe?.();
    for (const reject of [...apiPending]) reject(new Error('새 계획으로 교체되어 이전 API 실행 대기를 종료했습니다.'));
    queue?.dispose();
    queue = next;
    queueState = next.state;
    selectedId = undefined;
    renderSignature = '';
    dirty = false;
    unsubscribe = next.subscribe((state) => {
      queueState = state;
      renderQueue();
    });
    renderQueue();
  }
  function prepareBatch() {
    try {
      prepareStrict();
    } catch (cause) {
      showError(
        `다중 실험 준비 실패: ${cause instanceof Error ? cause.message : '설정을 확인하세요.'} 이전 결과와 현재 실험은 보존했습니다.`
      );
      container.dataset.batchStatus = 'error';
    }
    update();
  }
  function prepareStrict() {
    if (disposed || busy() || !snapshot || !options.canRun())
      throw new Error('현재 실험과 다중 실험 입력을 확인하고 진행 중인 작업을 먼저 끝내세요.');
    const plan = buildBatch(snapshot, settings.getSettings());
    attachQueue(createBatchQueue(plan));
    error.hidden = true;
    status.textContent = '입력을 확인했습니다. 개별 run의 조건과 전체 비용을 확인하고 실행하세요.';
    update();
  }
  function runFromApi(input: ProductStudyRunOptions): Promise<BatchSnapshot> {
    if (disposed || !queue || busy() || dirty || !options.canRun())
      return Promise.reject(new Error('실행 가능한 준비된 다중 실험이 필요합니다. 입력을 바꿨다면 다시 준비하세요.'));
    if (queue.state.status === 'cancelled' && !input.resume && !input.failedOnly)
      return Promise.reject(new Error('취소한 목록은 resume 옵션으로 명시적으로 재개하세요.'));
    const selected = queue;
    return new Promise((resolve, reject) => {
      let settled = false;
      let unsubscribe = () => {};
      const fail = (cause: Error) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        apiPending.delete(fail);
        reject(cause);
      };
      const finish = (state: BatchSnapshot) => {
        if (settled || state.status === 'running' || state.status === 'ready') return;
        settled = true;
        unsubscribe();
        apiPending.delete(fail);
        resolve(structuredClone(state));
      };
      apiPending.add(fail);
      unsubscribe = selected.subscribe(finish);
      try {
        const started = input.failedOnly ? selected.retryFailed() : input.resume ? selected.resume() : selected.start();
        if (!started) fail(new Error('실행할 미완료 또는 실패 run이 없습니다.'));
        else finish(selected.state);
      } catch (cause) {
        fail(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });
  }
  function renderQueue() {
    if (!queueState || disposed || rendering) return;
    rendering = true;
    try {
      const state = queueState;
      container.dataset.batchStatus = state.status;
      progress.setValue(
        Math.max(0, Math.min(100, state.progress * 100)),
        `${state.aggregate.completed}/${state.runs.length} run 완료 · 실패 ${state.aggregate.failed} · ${Math.round(state.progress * 100)}%`
      );
      planNotice.textContent = `${batchKindNames[state.plan.settings.kind]} · ${state.runs.length} run · 동시 실행 ${state.plan.settings.concurrency} · 예상 상태·단계 작업 ${state.plan.estimatedWork.toLocaleString('ko-KR')} · 계획 ${state.plan.id}`;
      const messages: Record<BatchSnapshot['status'], string> = {
        ready: '다중 실험을 준비했습니다. 개별 입력을 확인하고 실행하세요.',
        running: 'worker에서 개별 run을 계산합니다. 언제든 대기열을 취소할 수 있습니다.',
        cancelled:
          '대기열을 취소했습니다. 완료 run은 보존했습니다. 재개하면 미완료 run을 원래 입력과 seed로 다시 시작합니다.',
        completed: '모든 run을 마쳤습니다. 개별 결과와 집계의 단위·한계를 확인하고 전체 설정을 저장하세요.',
        partial:
          '일부 run이 실패했습니다. 실패 원인을 개별 표에서 확인하고 재실행할 수 있습니다. 성공한 run은 보존했습니다.'
      };
      if (!dirty || state.status === 'running') status.textContent = messages[state.status];
      // Batch quick worker completions so hundreds of runs do not repeatedly rebuild the table.
      const signature = JSON.stringify([state.status, state.runs.map((entry) => [entry.status, entry.attempts])]);
      if (signature !== renderSignature) {
        if (state.status !== 'running' || !output.childElementCount) {
          clearTimeout(outputTimer);
          outputTimer = undefined;
          renderOutput();
        } else if (!outputTimer) {
          outputTimer = setTimeout(() => {
            outputTimer = undefined;
            renderOutput();
          }, 250);
        }
      }
      update();
    } finally {
      rendering = false;
    }
  }
  function renderOutput() {
    if (!queueState || disposed) return;
    const state = queueState;
    const heldFocus = output.contains(document.activeElement);
    if (heldFocus && state.status === 'running') {
      outputTimer = setTimeout(() => {
        outputTimer = undefined;
        renderOutput();
      }, 250);
      return;
    }
    const focusId = heldFocus ? document.activeElement?.id : undefined;
    output.replaceChildren(
      batchResultView(document, state, selectedId, (id) => {
        selectedId = id;
        update();
      })
    );
    renderSignature = JSON.stringify([state.status, state.runs.map((entry) => [entry.status, entry.attempts])]);
    if (heldFocus)
      (document.getElementById(focusId ?? '') ?? document.getElementById('batch-selected-run'))?.focus({
        preventScroll: true
      });
  }
  function downloadBatch() {
    if (!queue) return;
    try {
      const content = serializeBatch(queue.snapshot());
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      urls.add(url);
      const anchor = element(document, 'a', '');
      anchor.href = url;
      anchor.download = `pendulum-${queue.state.plan.id}.json`;
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
      showError(`전체 실험 내보내기 실패: ${cause instanceof Error ? cause.message : '파일을 만들지 못했습니다.'}`);
    }
  }
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file || busy()) return;
    const current = ++generation;
    try {
      if (file.size > BATCH_LIMITS.artifactBytes) throw new RangeError('전체 실험 파일은 16 MiB 이하여야 합니다.');
      const content = await file.text();
      if (disposed || current !== generation) return;
      const imported = parseBatch(content);
      const next = createBatchQueue(imported);
      try {
        settings.sync(imported.plan.source, imported.plan.settings);
      } catch (cause) {
        next.dispose();
        throw cause;
      }
      attachQueue(next);
      snapshot = structuredClone(imported.plan.source);
      describeSource(snapshot);
      error.hidden = true;
      status.textContent =
        '저장된 다중 실험을 불러왔습니다. 현재 실험실 설정은 보존했습니다. 재개는 파일의 원래 입력과 seed를 사용합니다.';
      update();
    } catch (cause) {
      if (disposed || current !== generation) return;
      showError(
        `전체 실험 가져오기 실패: ${cause instanceof Error ? cause.message : '파일을 읽지 못했습니다.'} 이전 결과와 현재 실험은 보존했습니다.`
      );
    } finally {
      input.value = '';
    }
  });
  function update() {
    const running = busy();
    const state = queueState;
    prepare.disabled = running || !snapshot || !options.canRun();
    run.disabled = running || !state || state.status !== 'ready' || dirty;
    cancel.disabled = !running;
    resume.disabled = running || !state || state.status !== 'cancelled';
    retry.disabled = running || !state || !state.runs.some((entry) => entry.status === 'failed');
    retrySelected.disabled =
      running || !state?.runs.some((entry) => entry.id === selectedId && entry.status === 'failed');
    refresh.disabled = running || !options.canRun();
    download.disabled = running || !state;
    input.disabled = running;
    settings.setDisabled(running || !snapshot);
  }
  refreshSource();
  const unbindResearch = bindProductResearch(document, 'batch', {
    snapshot: () => (queue ? structuredClone(queue.state) : undefined),
    prepare: prepareStrict,
    run: runFromApi,
    cancel() {
      queue?.cancel();
    },
    comparison() {
      if (!queue) throw new Error('먼저 다중 실험을 준비하세요.');
      return structuredClone(queue.state.aggregate);
    }
  });
  return {
    update,
    dispose() {
      disposed = true;
      unbindResearch();
      for (const reject of [...apiPending])
        reject(new Error('화면을 떠나 다중 실험 worker를 종료했습니다. 보관한 계획과 완료 결과로 다시 준비하세요.'));
      apiPending.clear();
      generation++;
      unsubscribe?.();
      queue?.dispose();
      clearTimeout(outputTimer);
      for (const timer of timers) clearTimeout(timer);
      for (const url of urls) URL.revokeObjectURL(url);
      timers.clear();
      urls.clear();
    }
  };
}
