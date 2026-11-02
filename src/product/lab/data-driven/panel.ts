import { element } from '../../app/dom';
import { createButton, createProgress } from '../../design-system/primitives';
import type { DiagnosticsOptions } from '../views/diagnostics';
import type { LearningData } from '../../adapters/analysis/data-driven/learning-contracts';
import {
  DATA_DRIVEN_LIMITS,
  type DataDrivenRequest,
  type DataDrivenResult
} from '../../adapters/analysis/data-driven/contracts';
import { createDataDrivenJob } from '../../adapters/analysis/data-driven/client';
import { parseDataDrivenResult, serializeDataDrivenResult } from '../../adapters/analysis/data-driven/artifact';
import { datasetFromExperiment, parseLearningData } from '../../adapters/analysis/data-driven/source';
import { createModelSettings } from './settings';
import { numberField, readNumber, textField } from './controls';
import { renderDataset, renderModelResult } from './render';

export function createDataDrivenPanel(document: Document, options: DiagnosticsOptions, container: HTMLDetailsElement) {
  const body = element(document, 'div', 'data-model-body');
  const intro = element(
    document,
    'p',
    'lab-preview-note',
    '기록 데이터 → 시간 순서 훈련/검증 → 모델 진단 → 저장 모델 재평가. 고유해석은 데이터만 포함한 밀집/희소 연산자를 사용합니다.'
  );
  const sources = element(document, 'fieldset', 'data-model-settings');
  sources.append(element(document, 'legend', '', '학습 데이터 읽기 · 미리보기 후 확정'));
  const sourceInfo = element(document, 'p', 'lab-muted');
  const sourceGrid = element(document, 'div', 'data-model-grid');
  const start = numberField(document, sourceGrid, 'source-start', '기록 표본 복사 시작 인덱스', 0);
  const end = textField(
    document,
    sourceGrid,
    'source-end',
    '기록 표본 복사 끝 인덱스 · 제외',
    '',
    '비우면 현재 기록의 처음 최대 512표본. 연속 구간만 사용하고 보간하지 않습니다.'
  );
  const capture = createButton(document, {
    label: '현재 실험 기록 미리보기',
    variant: 'secondary',
    onClick: captureSource
  });
  sources.append(sourceInfo, sourceGrid, capture);
  const fileField = element(document, 'div', 'ds-field');
  const fileLabel = element(document, 'label', 'ds-field__label', '학습 데이터 · S22 관측 · 저장 모델 결과 JSON');
  const file = element(document, 'input', 'ds-field__control');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.id = 'data-import';
  fileLabel.htmlFor = file.id;
  fileField.append(
    fileLabel,
    file,
    element(
      document,
      'p',
      'lab-muted',
      '최대 16 MiB. 학습 데이터는 times, values, labels, units, axisUnit, provenance를 포함합니다. S22 관측 파일의 원본·변환 이력도 유지합니다. 미리보기 확인 전에는 채택하지 않습니다.'
    )
  );
  sources.append(fileField);
  const previewArea = element(document, 'div', 'data-model-output');
  previewArea.id = 'data-preview';
  const confirmedArea = element(document, 'div', 'data-model-output');
  confirmedArea.id = 'data-confirmed';
  const confirm = createButton(document, { label: '미리보기 확인 · 데이터 또는 결과 채택', onClick: confirmSource });
  const settings = createModelSettings(document, () => {
    if (!busy && !disposed)
      status.textContent =
        '설정을 바꿨습니다. 새 실행에 적용합니다. 저장 입력 재학습과 저장 모델 재평가는 기존 결과의 입력을 그대로 사용합니다.';
    update();
  });
  const actions = element(document, 'div', 'lab-inline-actions');
  const run = createButton(document, { label: '모델 학습 · 고유해석 실행', onClick: () => runCalculation('train') });
  const retrain = createButton(document, {
    label: '저장 입력으로 재학습',
    variant: 'secondary',
    onClick: () => runCalculation('retrain')
  });
  const reevaluate = createButton(document, {
    label: '저장 모델 재평가',
    variant: 'secondary',
    onClick: () => runCalculation('evaluate')
  });
  const cancel = createButton(document, { label: '데이터 모델 계산 취소', variant: 'secondary', onClick: cancelWork });
  actions.append(run, retrain, reevaluate, cancel);
  const progress = createProgress(document, { id: 'data-progress', label: '학습·고유해석 진행', value: 0 });
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const status = element(document, 'p', 'lab-muted', '학습 데이터를 미리 보거나 고유해석 방법을 선택하세요.');
  status.id = 'data-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-atomic', 'true');
  const error = element(document, 'p', 'ds-field__error');
  error.id = 'data-error';
  error.hidden = true;
  error.setAttribute('role', 'alert');
  const resultArea = element(document, 'div', 'data-model-output');
  resultArea.id = 'data-result';
  const download = createButton(document, {
    label: '데이터·모델·평가 JSON 다운로드',
    variant: 'secondary',
    onClick: () => void saveResult()
  });
  body.append(
    intro,
    sources,
    previewArea,
    confirm,
    confirmedArea,
    settings.element,
    actions,
    progress.element,
    status,
    error,
    resultArea,
    download,
    element(
      document,
      'p',
      'lab-muted',
      '결과 파일에는 원 데이터, 정확한 slice와 분리 위치, seed, 전처리, library, 모델 버전과 학습 모델을 포함합니다. 재평가는 모델을 다시 적합하지 않습니다. 외부 파일의 일관성 검사는 출처나 과학적 진실성을 인증하지 않습니다. 페이지를 떠나면 worker가 종료됩니다. 보존하려면 결과를 다운로드하세요.'
    )
  );
  container.append(body);
  let data: LearningData | undefined, result: DataDrivenResult | undefined;
  let pending: { kind: 'data'; data: LearningData } | { kind: 'result'; result: DataDrivenResult } | undefined;
  let job: ReturnType<typeof createDataDrivenJob> | undefined;
  let busy: 'import' | 'calculation' | undefined;
  let generation = 0,
    disposed = false,
    sequence = 0;
  const urls = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function fail(cause: unknown) {
    if (disposed) return;
    error.textContent = cause instanceof Error ? cause.message : String(cause);
    error.hidden = false;
    container.dataset.dataModelStatus = 'error';
  }
  function showDataPreview(next: LearningData) {
    pending = { kind: 'data', data: next };
    previewArea.replaceChildren(renderDataset(document, next, '채택 전 데이터 미리보기'));
    status.textContent = '데이터 축·단위·기록 범위와 원본 계보를 확인한 뒤 채택하세요.';
    container.dataset.dataModelStatus = 'preview';
  }
  function captureSource() {
    if (busy || disposed) return;
    pending = undefined;
    previewArea.replaceChildren();
    try {
      const experiment = options.experiment();
      if (!experiment.ok) throw new Error(experiment.issues.map((issue) => issue.message).join(' '));
      const parsedEnd = end.value.trim() ? Number(end.value) : undefined;
      if (parsedEnd !== undefined && (!/^\d+$/.test(end.value.trim()) || !Number.isSafeInteger(parsedEnd)))
        throw new Error('기록 끝 인덱스는 정수이거나 비어 있어야 합니다.');
      const next = datasetFromExperiment(experiment.value, options.samples(), readNumber(start), parsedEnd);
      showDataPreview(next);
      error.hidden = true;
    } catch (cause) {
      fail(cause);
    }
    update();
  }
  async function importFile() {
    const selected = file.files?.[0];
    if (!selected || busy || disposed) return;
    busy = 'import';
    pending = undefined;
    previewArea.replaceChildren();
    const token = ++generation;
    error.hidden = true;
    status.textContent = 'JSON 데이터와 모델 계보를 검사합니다.';
    update();
    try {
      if (selected.size > DATA_DRIVEN_LIMITS.bytes) throw new Error('파일은 최대 16 MiB입니다.');
      const text = await selected.text();
      let schema: unknown;
      try {
        schema = (JSON.parse(text) as { schema?: unknown } | null)?.schema;
      } catch {
        throw new Error('올바른 JSON 파일이 필요합니다.');
      }
      if (schema === 'pendulum-data-driven-result/v1') {
        const next = await parseDataDrivenResult(text);
        if (disposed || token !== generation) return;
        pending = { kind: 'result', result: next };
        previewArea.replaceChildren(
          element(document, 'h4', '', '채택 전 저장 결과 미리보기'),
          renderModelResult(document, next)
        );
        if (next.request.input.kind === 'learning')
          previewArea.prepend(renderDataset(document, next.request.input.data, '결과에 보존된 데이터'));
        status.textContent = '저장 결과와 원본 관계를 검사했습니다. 채택해야 재학습·재평가 입력으로 사용합니다.';
        container.dataset.dataModelStatus = 'preview';
      } else {
        const next = await parseLearningData(text);
        if (disposed || token !== generation) return;
        showDataPreview(next);
      }
    } catch (cause) {
      if (token === generation) fail(cause);
    } finally {
      file.value = '';
      if (token === generation) {
        busy = undefined;
        update();
      }
    }
  }
  file.addEventListener('change', () => void importFile());
  function confirmSource() {
    if (!pending || busy || disposed) return;
    if (pending.kind === 'data') {
      data = pending.data;
      settings.syncData(data);
      confirmedArea.replaceChildren(renderDataset(document, data, '채택한 학습 데이터'));
      container.dataset.dataModelStatus = 'confirmed';
      status.textContent = '데이터를 채택했습니다. slice·분리 위치와 library를 정하고 모델을 학습하세요.';
    } else {
      result = pending.result;
      settings.restore(result.request.input);
      if (result.request.input.kind === 'learning') {
        data = result.request.input.data;
        confirmedArea.replaceChildren(renderDataset(document, data, '저장 결과의 학습 데이터'));
      } else if (data) {
        confirmedArea.replaceChildren(
          renderDataset(document, data, '기존에 채택한 학습 데이터 · 학습 방법으로 전환하면 사용')
        );
      } else confirmedArea.replaceChildren();
      resultArea.replaceChildren(renderModelResult(document, result));
      container.dataset.dataModelStatus = 'restored';
      status.textContent =
        '저장 결과를 채택했습니다. 저장 입력으로 재학습하거나 적합 없이 저장 모델을 재평가할 수 있습니다.';
    }
    pending = undefined;
    previewArea.replaceChildren();
    error.hidden = true;
    update();
  }
  function runCalculation(mode: 'train' | 'retrain' | 'evaluate') {
    if (busy || disposed) return;
    try {
      if (mode !== 'train' && !result) throw new Error('저장하거나 계산한 결과를 먼저 채택하세요.');
      const input = mode === 'train' ? settings.read() : structuredClone(result!.request.input);
      const request: DataDrivenRequest = {
        schema: 'pendulum-data-driven-request/v1',
        id: `data-model-${++sequence}`,
        mode: mode === 'evaluate' ? 'evaluate' : 'train',
        input,
        ...(mode === 'evaluate' ? { model: structuredClone(result!.output.model), parentId: result!.id } : {})
      };
      busy = 'calculation';
      error.hidden = true;
      container.dataset.dataModelStatus = 'running';
      status.textContent =
        mode === 'evaluate'
          ? '저장한 모델을 고정하여 검증·잔차를 다시 평가합니다.'
          : '분리된 worker에서 기존 데이터 모델·고유해석 모듈을 실행합니다.';
      progress.setValue(0, 'worker 계산 준비');
      update();
      job = createDataDrivenJob(request, (event) => {
        if (disposed) return;
        if (event.type === 'progress') {
          progress.setValue(
            event.fraction === null ? null : event.fraction * 100,
            `${event.work} 실제 작업 · ${event.fraction === null ? '전체량 미정' : `${Math.round(event.fraction * 100)}%`}`
          );
          return;
        }
        busy = undefined;
        if (event.type === 'result') {
          result = event.result;
          resultArea.replaceChildren(renderModelResult(document, result));
          progress.setValue(100, '모델 계산 완료');
          container.dataset.dataModelStatus = 'completed';
          status.textContent = '계산을 마쳤습니다. 훈련·검증·rollout 오차 또는 실제 잔차와 경고를 확인하세요.';
        } else if (event.type === 'cancelled') {
          container.dataset.dataModelStatus = 'cancelled';
          status.textContent = 'worker 계산을 취소했습니다. 채택한 데이터와 이전 결과를 보존했습니다.';
        } else fail(event.message);
        job?.dispose();
        job = undefined;
        update();
      });
    } catch (cause) {
      busy = undefined;
      fail(cause);
      update();
    }
  }
  function cancelWork() {
    if (busy === 'calculation') job?.cancel();
    else if (busy === 'import') {
      generation++;
      busy = undefined;
      container.dataset.dataModelStatus = 'cancelled';
      status.textContent = '파일 검사를 취소했습니다. 기존 데이터와 결과를 보존했습니다.';
      update();
    }
  }
  async function saveResult() {
    if (!result || busy || disposed) return;
    try {
      const snapshot = result;
      const text = await serializeDataDrivenResult(snapshot);
      if (disposed) return;
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      urls.add(url);
      const anchor = element(document, 'a', '');
      anchor.href = url;
      anchor.download = `${snapshot.id}.json`;
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
      fail(cause);
    }
  }
  function update() {
    if (disposed) return;
    sourceInfo.textContent = `현재 실험에 남아 있는 기록: ${options.samples().length}표본. 최소 24개, 권장 64–512개의 균일한 시간 표본을 선택하세요. 현재 화면의 물성 값은 변경하지 않습니다.`;
    capture.disabled = !!busy || !options.canRun();
    file.disabled = !!busy;
    start.disabled = !!busy;
    end.disabled = !!busy;
    confirm.disabled = !!busy || !pending;
    settings.setDisabled(!!busy);
    run.disabled = !!busy || (settings.isLearning() && !data);
    retrain.disabled = !!busy || !result;
    reevaluate.disabled = !!busy || !result;
    cancel.disabled = !busy;
    download.disabled = !!busy || !result;
  }
  update();
  return {
    update,
    dispose() {
      disposed = true;
      generation++;
      job?.dispose();
      for (const timer of timers) clearTimeout(timer);
      for (const url of urls) URL.revokeObjectURL(url);
      timers.clear();
      urls.clear();
    }
  };
}
