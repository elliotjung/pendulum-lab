import { element } from '../../app/dom';
import { createButton, createProgress } from '../../design-system/primitives';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import type { DiagnosticsOptions } from '../views/diagnostics';
import {
  confirmObservationImport,
  parseObservationArtifact,
  previewObservationImport,
  serializeObservationArtifact
} from '../../observations';
import { OBSERVATION_LIMITS, type ObservationArtifact, type ObservationPreview } from '../../observations/types';
import { createInverseJob } from '../../adapters/analysis/inverse/client';
import { exportInverseResult, importInverseResult } from '../../adapters/analysis/inverse/artifact';
import { INVERSE_LIMITS, type InverseResult } from '../../adapters/analysis/inverse/contracts';
import { createObservationSettings } from './observation-settings';
import { createWorkflowSettings } from './workflow-settings';
import { dataTable } from './controls';
import { batchMetricMetadata } from '../experiments/metadata';
import { createLiveObservationCapture } from './capture';
import { bindProductResearch } from '../../app/research-api-binding';

export function createResearchPanel(document: Document, options: DiagnosticsOptions, container: HTMLDetailsElement) {
  const body = element(document, 'div', 'research-body');
  const source = element(document, 'p', 'lab-preview-note');
  source.id = 'research-source';
  const status = element(document, 'p', 'lab-muted', '관측 원본과 단위를 정하고 미리보기를 확인하세요.');
  status.id = 'research-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-atomic', 'true');
  const error = element(document, 'p', 'ds-field__error');
  error.id = 'research-error';
  error.hidden = true;
  error.setAttribute('role', 'alert');
  const importSettings = createObservationSettings(document, observationsChanged);
  const liveCapture = createLiveObservationCapture(document, {
    onPreview(next) {
      if (disposed || busy) throw new Error('기존 관측 작업이 끝난 뒤 다시 미리보기를 보내세요.');
      generation++;
      preview = next;
      previewArea.replaceChildren(observationView(next.artifact, '2. 실시간 채집 확정 전 미리보기'));
      container.dataset.researchStatus = 'preview';
      status.textContent = '채집 원본·native 보정·시간축을 확인하고 관측 가져오기 확정을 누르세요.';
      error.hidden = true;
      update();
    }
  });
  const workflow = createWorkflowSettings(document, workflowChanged);
  const previewArea = element(document, 'div', 'research-output');
  previewArea.id = 'research-preview';
  const confirmedArea = element(document, 'div', 'research-output');
  confirmedArea.id = 'research-observation';
  const resultArea = element(document, 'div', 'research-output');
  resultArea.id = 'research-result';
  const progress = createProgress(document, { id: 'research-progress', label: '관측·역문제 계산 진행', value: 0 });
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const previewButton = createButton(document, { label: '관측 미리보기', onClick: () => void previewSource() });
  const confirm = createButton(document, { label: '미리보기 확인 · 관측 가져오기 확정', onClick: confirmSource });
  const run = createButton(document, { label: '역문제 · UQ 실행', onClick: runCalculation });
  const cancel = createButton(document, { label: '관측·계산 취소', variant: 'secondary', onClick: cancelWork });
  const refresh = createButton(document, {
    label: '연구 계산에 현재 실험 읽기',
    variant: 'secondary',
    onClick: refreshSource
  });
  const downloadObservation = createButton(document, {
    label: '원본·변환 관측 JSON 다운로드',
    variant: 'secondary',
    onClick: () => {
      if (observation) save(serializeObservationArtifact(observation), `${observation.id}.json`);
    }
  });
  const downloadResult = createButton(document, {
    label: '원본·추정·UQ 결과 JSON 다운로드',
    variant: 'secondary',
    onClick: () => {
      if (result) save(exportInverseResult(result), `${result.id}.json`);
    }
  });
  const input = element(document, 'input', 'ds-field__control');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.id = 'research-import-artifact';
  const label = element(document, 'label', 'ds-field__label', '저장한 관측 또는 결과 JSON 가져오기');
  label.htmlFor = input.id;
  const actions = element(document, 'div', 'lab-inline-actions');
  actions.append(previewButton, confirm, cancel);
  const calculate = element(document, 'div', 'lab-inline-actions');
  calculate.append(run, refresh);
  const files = element(document, 'div', 'research-output');
  files.append(
    downloadObservation,
    downloadResult,
    label,
    input,
    element(
      document,
      'p',
      'lab-muted',
      '원본·변환 옵션·이력·입력 실험과 결과 관계를 JSON에 포함합니다. 파일을 불러와도 현재 실험 조건은 바꾸지 않습니다. 원본 해시는 바이트 무결성 검사용이며 외부 수치 결과의 진실성·저작권·신뢰성을 인증하지 않습니다. 페이지를 떠나면 계산이 중지됩니다. 보존하려면 파일을 저장하세요.'
    )
  );
  body.append(
    source,
    importSettings.element,
    liveCapture.element,
    actions,
    progress.element,
    status,
    error,
    previewArea,
    confirmedArea,
    workflow.element,
    calculate,
    resultArea,
    files
  );
  container.append(body);
  let snapshot: ExperimentStateV1 | undefined;
  let preview: ObservationPreview | undefined;
  let observation: ObservationArtifact | undefined;
  let result: InverseResult | undefined;
  let controller: AbortController | undefined;
  let job: ReturnType<typeof createInverseJob> | undefined;
  let busy: 'preview' | 'calculation' | undefined;
  let generation = 0,
    disposed = false,
    jobNumber = 0;
  const urls = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function fail(cause: unknown) {
    error.hidden = false;
    error.textContent = cause instanceof Error ? cause.message : String(cause);
    container.dataset.researchStatus = 'error';
  }
  function observationsChanged() {
    preview = undefined;
    previewArea.replaceChildren();
    if (!disposed && !busy)
      status.textContent = '변환 조건을 바꿨습니다. 확정 관측은 보존합니다. 새 조건은 관측 미리보기에서 확인하세요.';
    error.hidden = true;
    update();
  }
  function workflowChanged() {
    if (!disposed && !busy)
      status.textContent = '계산 조건을 바꿨습니다. 이전 결과는 보존하며 다음 실행부터 새 조건을 사용합니다.';
    error.hidden = true;
  }
  function describeSource(experiment: ExperimentStateV1) {
    const runtime = experiment.runtime;
    const timeUnit = batchMetricMetadata(experiment).axisUnit === 'normalized-time' ? '정규화 시간' : 's';
    source.textContent = `계산 입력 snapshot: ${experiment.systemId} · 모델 ${experiment.modelVersion} · ${runtime.domain === 'time' ? `시작 ${runtime.start.value} ${timeUnit} · 기간 ${runtime.duration.value} ${timeUnit} · step ${runtime.step.value} ${timeUnit}` : runtime.domain === 'iteration' ? `${runtime.iterations} iteration` : '전용 평가'}. 현재 실험의 값이 바뀌면 ‘연구 계산에 현재 실험 읽기’를 눌러 반영하세요.`;
  }
  function refreshSource() {
    if (busy || disposed) return;
    try {
      const parsed = options.experiment();
      if (!parsed.ok) throw new Error(parsed.issues.map((issue) => issue.message).join(' '));
      snapshot = structuredClone(parsed.value);
      workflow.sync(snapshot);
      describeSource(snapshot);
      error.hidden = true;
    } catch (cause) {
      fail(cause);
    }
    update();
  }
  function observationView(artifact: ObservationArtifact, title: string) {
    const block = element(document, 'div', 'research-output');
    block.append(
      element(document, 'h4', '', title),
      element(
        document,
        'p',
        'lab-preview-note',
        `${artifact.original.name} · ${artifact.original.kind} · ${artifact.data.times.length}표본 · 시간 ${artifact.data.times[0]!.toPrecision(6)}–${artifact.data.times.at(-1)!.toPrecision(6)} s · 각도 rad`
      )
    );
    block.append(
      dataTable(
        document,
        `${title} · 처음 12표본`,
        ['t (s)', ...artifact.data.angles[0]!.map((_, i) => `θ${i + 1} (rad)`)],
        artifact.data.times.slice(0, 12).map((time, i) => [time, ...artifact.data.angles[i]!])
      )
    );
    const transform = artifact.transform,
      calibration = transform.options;
    block.append(
      element(
        document,
        'p',
        'lab-muted',
        `시간 보정: 원본 ${calibration.timeUnit} → s, 배율 ${calibration.timeScale}, 이동 ${calibration.timeOffset} s. 각도 보정 배율 ${calibration.angleScale.join(' · ')}, 영점 이동 ${calibration.angleOffset.join(' · ')} rad. 결측 처리 ${calibration.missing}: 원본 ${transform.sourceRows}행 중 ${transform.droppedRows}행 제외 · ${transform.interpolatedValues}값 보간.`
      )
    );
    const history = element(document, 'details', 'lab-details');
    history.append(element(document, 'summary', '', '원본·변환 이력'));
    for (const [label, value] of [
      ['관측 ID', artifact.id],
      ['원본 ID', artifact.original.id],
      ['변환 ID', artifact.transform.id],
      ['원본 SHA256', artifact.original.sha256]
    ] as const)
      history.append(element(document, 'p', 'lab-muted', `${label}: ${value}`));
    if (artifact.original.media)
      history.append(element(document, 'p', 'lab-muted', `원본 영상 SHA256: ${artifact.original.media.sha256}`));
    for (const text of transform.history) history.append(element(document, 'p', 'lab-muted', text));
    block.append(history);
    for (const text of artifact.warnings) block.append(element(document, 'p', 'lab-muted', text));
    return block;
  }
  async function previewSource() {
    if (busy || disposed) return;
    const current = ++generation;
    controller = new AbortController();
    busy = 'preview';
    preview = undefined;
    error.hidden = true;
    previewArea.replaceChildren();
    update();
    status.textContent = '원본을 로컬에서 읽고 변환·단위·시간축을 검사합니다.';
    try {
      const next = await importSettings.preview(controller.signal, (fraction) => {
        if (current === generation && !disposed)
          progress.setValue(fraction * 100, `영상 표식 추출 ${Math.round(fraction * 100)}%`);
      });
      if (disposed || current !== generation || controller.signal.aborted) return;
      preview = next;
      previewArea.replaceChildren(observationView(next.artifact, '2. 확정 전 미리보기'));
      container.dataset.researchStatus = 'preview';
      status.textContent = '원본·변환 이력·표본을 확인했습니다. 관측 가져오기 확정을 눌러야 계산 입력으로 채택합니다.';
    } catch (cause) {
      if (!disposed && current === generation) fail(cause);
    } finally {
      if (current === generation) {
        busy = undefined;
        controller = undefined;
        update();
      }
    }
  }
  function confirmSource() {
    if (!preview || busy || disposed) return;
    try {
      observation = confirmObservationImport(preview);
      confirmedArea.replaceChildren(observationView(observation, '확정한 관측'));
      preview = undefined;
      previewArea.replaceChildren();
      container.dataset.researchStatus = 'confirmed';
      error.hidden = true;
      status.textContent = '관측 가져오기를 확정했습니다. 원본을 보존하며 변환된 시간·각도만 추정 입력으로 사용합니다.';
    } catch (cause) {
      fail(cause);
    }
    update();
  }
  function renderResult() {
    if (!result) return;
    const artifact = result;
    resultArea.replaceChildren(
      element(
        document,
        'h4',
        '',
        `${artifact.kind === 'estimate' ? '매개변수 추정' : artifact.kind === 'sobol' ? 'Sobol 민감도' : 'PCE 대리모델'} 결과`
      ),
      element(
        document,
        'p',
        'lab-preview-note',
        `결과 ${artifact.id} · 입력 ${artifact.inputId} · 원 실험 ${artifact.request.experiment.systemId} · ${artifact.evaluations}${artifact.kind === 'estimate' ? '최적화 반복' : '모델 평가'}${artifact.observationId ? ` · 관측 ${artifact.observationId}` : ''}`
      ),
      dataTable(
        document,
        '계산 결과와 단위',
        artifact.columns.map((column, index) => `${column} (${artifact.units[index]})`),
        artifact.rows
      )
    );
    for (const text of [...artifact.details, ...artifact.warnings])
      resultArea.append(element(document, 'p', 'lab-muted', text));
  }
  function runCalculation() {
    if (busy || disposed || !snapshot) return;
    try {
      const settings = workflow.getSettings(observation);
      const id = `research-${++jobNumber}`;
      busy = 'calculation';
      error.hidden = true;
      container.dataset.researchStatus = 'running';
      status.textContent = '분리된 worker에서 기존 공용 계산 엔진을 실행합니다.';
      progress.setValue(0, '계산 준비');
      update();
      job = createInverseJob(
        { schema: 'pendulum-inverse-request/v1', id, experiment: structuredClone(snapshot), settings },
        (event) => {
          if (disposed) return;
          if (event.type === 'progress') {
            progress.setValue(
              (event.fraction ?? 0) * 100,
              `${event.work} 작업 · ${event.fraction === null ? '전체량을 계산 중' : `${Math.round(event.fraction * 100)}%`}`
            );
            return;
          }
          busy = undefined;
          if (event.type === 'result') {
            result = event.result;
            renderResult();
            container.dataset.researchStatus = 'completed';
            progress.setValue(100, '계산 완료');
            status.textContent = '계산을 마쳤습니다. 결과·오차·한계와 원본 관계를 확인하고 파일로 저장하세요.';
          } else if (event.type === 'cancelled') {
            container.dataset.researchStatus = 'cancelled';
            status.textContent = '계산을 취소했습니다. 확정 관측·기존 결과·현재 실험을 보존했습니다.';
          } else fail(event.message);
          job?.dispose();
          job = undefined;
          update();
        }
      );
    } catch (cause) {
      busy = undefined;
      fail(cause);
      update();
    }
  }
  function cancelWork() {
    if (busy === 'calculation') {
      job?.cancel();
      return;
    }
    if (busy === 'preview') {
      generation++;
      controller?.abort();
      controller = undefined;
      busy = undefined;
      container.dataset.researchStatus = 'cancelled';
      status.textContent = '미리보기를 취소했습니다. 기존 관측·결과는 보존했습니다.';
      update();
    }
  }
  function save(text: string, name: string) {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      urls.add(url);
      const anchor = element(document, 'a', '');
      anchor.href = url;
      anchor.download = `pendulum-${name}`;
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
  input.addEventListener('change', () => void restoreFile());
  async function restoreFile() {
    const file = input.files?.[0];
    if (!file || busy || disposed) return;
    const current = ++generation;
    busy = 'preview';
    update();
    try {
      if (file.size > Math.max(OBSERVATION_LIMITS.fileBytes, INVERSE_LIMITS.artifactBytes))
        throw new Error('결과 JSON은 24 MiB, 관측 JSON은 16 MiB 이하여야 합니다.');
      const text = await file.text();
      if (disposed || current !== generation) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('JSON이 손상되었습니다. 원본 파일을 보존하고 다시 내보내세요.');
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('관측 또는 역문제 결과 객체가 필요합니다.');
      const schema = (parsed as { schema?: unknown }).schema;
      if (typeof schema !== 'string' || !['pendulum-observation/v1', 'pendulum-inverse-result/v1'].includes(schema))
        throw new Error('지원하지 않는 관측·역문제 결과 형식입니다. 원본을 보존하세요.');
      if (schema === 'pendulum-observation/v1') {
        const next = await parseObservationArtifact(text);
        if (disposed || current !== generation) return;
        const nextPreview = await repreview(next);
        if (disposed || current !== generation) return;
        preview = nextPreview;
        previewArea.replaceChildren(observationView(next, '2. 저장 관측 미리보기'));
        status.textContent = '원본 해시와 변환 결과를 다시 검사했습니다. 확인 후 관측 가져오기를 확정하세요.';
        container.dataset.researchStatus = 'preview';
      } else {
        const next = await importInverseResult(text);
        if (disposed || current !== generation) return;
        const nextSnapshot = structuredClone(next.request.experiment);
        const embedded =
          next.request.settings.kind === 'estimate' ? await repreview(next.request.settings.observation) : undefined;
        if (disposed || current !== generation) return;
        result = next;
        snapshot = nextSnapshot;
        workflow.sync(snapshot, next.request.settings);
        describeSource(snapshot);
        renderResult();
        if (embedded) {
          observation = undefined;
          confirmedArea.replaceChildren();
          preview = embedded;
          previewArea.replaceChildren(
            observationView(embedded.artifact, '2. 결과에 보존된 관측 미리보기 · 새 추정 전 확정 필요')
          );
        }
        status.textContent =
          '저장 결과와 원 입력의 관계를 복원했습니다. 현재 실험 조건은 보존했습니다. 외부 수치값은 재계산·인증하지 않습니다.';
        container.dataset.researchStatus = 'restored';
      }
      error.hidden = true;
    } catch (cause) {
      if (!disposed && current === generation) fail(cause);
    } finally {
      input.value = '';
      if (current === generation) {
        busy = undefined;
        update();
      }
    }
  }
  function repreview(artifact: ObservationArtifact) {
    return previewObservationImport({
      text: artifact.original.text,
      name: artifact.original.name,
      kind: artifact.original.kind,
      ...(artifact.original.media
        ? {
            media: {
              name: artifact.original.media.name,
              mime: artifact.original.media.mime,
              base64: artifact.original.media.base64
            }
          }
        : {}),
      ...(artifact.original.capture ? { capture: artifact.original.capture } : {}),
      mapping: artifact.transform.mapping,
      options: artifact.transform.options
    });
  }
  function update() {
    if (disposed) return;
    previewButton.disabled = !!busy;
    confirm.disabled = !!busy || !preview;
    cancel.disabled = !busy;
    run.disabled = !!busy || !snapshot;
    refresh.disabled = !!busy || !options.canRun();
    downloadObservation.disabled = !!busy || !observation;
    downloadResult.disabled = !!busy || !result;
    input.disabled = !!busy;
    importSettings.setDisabled(!!busy);
    liveCapture.setDisabled(!!busy);
    workflow.setDisabled(!!busy || !snapshot);
  }
  refreshSource();
  update();
  const unbindResearch = bindProductResearch(document, 'observation', {
    snapshot: () =>
      structuredClone({
        ...(preview ? { preview } : {}),
        ...(observation ? { confirmed: observation } : {}),
        ...(result ? { result } : {})
      })
  });
  return {
    update,
    dispose() {
      disposed = true;
      unbindResearch();
      generation++;
      controller?.abort();
      job?.dispose();
      importSettings.dispose();
      liveCapture.dispose();
      for (const timer of timers) clearTimeout(timer);
      for (const url of urls) URL.revokeObjectURL(url);
      timers.clear();
      urls.clear();
    }
  };
}
