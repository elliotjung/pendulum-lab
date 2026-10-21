import { element } from '../../app/dom';
import { createButton, createInput, createProgress, type InputControl } from '../../design-system/primitives';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import type { DiagnosticsOptions } from './diagnostics';
import {
  ADVANCED_DIAGNOSTIC_KINDS,
  ADVANCED_DIAGNOSTIC_LIMITS,
  ADVANCED_DIAGNOSTIC_NAMES,
  type AdvancedDiagnosticKind,
  type AdvancedDiagnosticRequest,
  type DiagnosticSeries
} from '../../adapters/analysis/advanced/contracts';
import {
  defaultAdvancedSettings,
  validateAdvancedSettings,
  advancedDiagnosticRejection
} from '../../adapters/analysis/advanced/settings';
import { createDiagnosticSeries } from '../../adapters/analysis/core/source';
import { createAdvancedDiagnosticJob } from '../../adapters/analysis/advanced/client';
import {
  createAdvancedDiagnosticArtifact,
  importAdvancedDiagnosticArtifact,
  exportAdvancedDiagnosticArtifact
} from '../../adapters/analysis/advanced/artifact';
import { advancedFieldLabels, advancedSettingDescription, advancedAssumptions } from './advanced-settings';
import { advancedResultView } from './advanced-result';

export function createAdvancedDiagnosticsPanel(
  document: Document,
  options: DiagnosticsOptions,
  container: HTMLDetailsElement
) {
  const body = element(document, 'div', 'advanced-diagnostics-body');
  const label = element(document, 'label', 'ds-field__label', '고급 분석 도구');
  label.htmlFor = 'advanced-diagnostic-kind';
  const select = element(document, 'select', 'ds-field__control');
  select.id = label.htmlFor;
  for (const kind of ADVANCED_DIAGNOSTIC_KINDS) {
    const option = element(document, 'option', '', ADVANCED_DIAGNOSTIC_NAMES[kind]);
    option.value = kind;
    select.append(option);
  }
  const source = element(document, 'p', 'lab-muted');
  source.id = 'advanced-diagnostic-observation-source';
  const context = element(document, 'p', 'lab-preview-note');
  context.id = 'advanced-diagnostic-assumptions';
  const fields = element(document, 'div', 'advanced-diagnostic-fields');
  const matrix = element(document, 'details', 'lab-details');
  matrix.id = 'advanced-diagnostic-compatibility';
  const matrixList = element(document, 'ul', 'advanced-diagnostic-compatibility-list');
  matrix.append(element(document, 'summary', '', '모든 고급 도구의 호환성과 거부 이유'), matrixList);
  const rejection = element(document, 'p', 'lab-preview-note');
  rejection.id = 'advanced-diagnostic-rejection';
  rejection.setAttribute('role', 'status');
  const status = element(document, 'p', 'lab-muted', '분석의 전제와 입력 source를 확인하세요.');
  status.id = 'advanced-diagnostic-status';
  status.setAttribute('role', 'status');
  const error = element(document, 'p', 'ds-field__error');
  error.id = 'advanced-diagnostic-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const progress = createProgress(document, { id: 'advanced-diagnostic-progress', label: '고급 분석 진행', value: 0 });
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const actions = element(document, 'div', 'lab-inline-actions');
  const run = createButton(document, { label: '고급 분석 계산', onClick: compute });
  const cancel = createButton(document, {
    label: '고급 분석 취소',
    variant: 'secondary',
    onClick: () => job?.cancel()
  });
  const refresh = createButton(document, {
    label: '고급 분석 기록 새로 읽기',
    variant: 'secondary',
    onClick: refreshSource
  });
  actions.append(run, cancel, refresh);
  const output = element(document, 'div', 'advanced-diagnostic-output');
  output.id = 'advanced-diagnostic-output';
  const files = element(document, 'div', 'advanced-diagnostic-files');
  const download = createButton(document, {
    label: '고급 분석 artifact JSON 다운로드',
    variant: 'secondary',
    onClick: downloadArtifact
  });
  const importLabel = element(document, 'label', 'ds-field__label', '고급 분석 artifact JSON 가져오기');
  importLabel.htmlFor = 'advanced-diagnostic-import';
  const input = element(document, 'input', 'ds-field__control');
  input.id = importLabel.htmlFor;
  input.type = 'file';
  input.accept = '.json,application/json';
  files.append(
    download,
    importLabel,
    input,
    element(
      document,
      'p',
      'lab-muted',
      '저장된 분석을 가져오면 결과만 다시 표시합니다. 현재 실험 조건과 기록은 보존합니다. 전체 입력·source·run 계보·알고리즘·설정·단위를 파일에 담습니다.'
    )
  );
  body.append(
    element(
      document,
      'p',
      'lab-muted',
      '기록 기반 기하, 현재 초기조건의 접선 진단, 별도 각도 격자 스캔, 독립 1차원 benchmark를 구분하세요. 계산은 별도 worker에서 실행하며 언제든 취소할 수 있습니다.'
    ),
    label,
    select,
    source,
    context,
    fields,
    matrix,
    rejection,
    actions,
    progress.element,
    status,
    error,
    output,
    files
  );
  container.append(body);
  let kind: AdvancedDiagnosticKind = 'rqa';
  let settings = defaultAdvancedSettings(kind);
  let snapshot: { experiment: ExperimentStateV1; series: DiagnosticSeries } | undefined;
  let sourceError = '';
  let cachedRejection: string | null = '기록을 새로 읽으세요.';
  let state = 'empty',
    generation = 0,
    disposed = false;
  let job: ReturnType<typeof createAdvancedDiagnosticJob> | undefined;
  let artifact: ReturnType<typeof createAdvancedDiagnosticArtifact> | undefined;
  const numericControls = new Map<string, InputControl>();
  const urls = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const busy = () => state === 'running';
  function changeState(next: string) {
    state = next;
    container.dataset.advancedDiagnosticStatus = next;
  }
  function refreshSource() {
    try {
      const experiment = options.experiment();
      if (!experiment.ok) throw new Error(experiment.issues.map((issue) => issue.message).join(' '));
      snapshot = { experiment: experiment.value, series: createDiagnosticSeries(experiment.value, options.samples()) };
      sourceError = '';
      source.textContent = `${snapshot.experiment.systemId} · 기록 ${snapshot.series.times.length}개 · 관측 축 ${snapshot.series.axisUnit}. ${snapshot.series.labels.map((name, i) => `${i}: ${name} (${snapshot!.series.units[i]})`).join(' · ')}`;
    } catch (cause) {
      snapshot = undefined;
      sourceError = cause instanceof Error ? cause.message : '입력을 읽을 수 없습니다.';
      source.textContent = sourceError;
    }
    matrixList.replaceChildren(
      ...ADVANCED_DIAGNOSTIC_KINDS.map((candidate) => {
        const reason = snapshot
          ? advancedDiagnosticRejection(
              candidate,
              snapshot.experiment,
              snapshot.series,
              defaultAdvancedSettings(candidate, snapshot.experiment)
            )
          : sourceError;
        const item = element(
          document,
          'li',
          '',
          `${ADVANCED_DIAGNOSTIC_NAMES[candidate]}: ${reason || (['topological-entropy', 'transfer-operator'].includes(candidate) ? '독립 1차원 benchmark source에서 사용 가능' : '현재 입력에서 사용 가능')}`
        );
        item.dataset.diagnosticKind = candidate;
        item.dataset.available = String(!reason);
        return item;
      })
    );
    updateFieldHelp();
    update(true);
  }
  function reason() {
    try {
      validateAdvancedSettings(kind, settings);
      return snapshot
        ? advancedDiagnosticRejection(kind, snapshot.experiment, snapshot.series, settings)
        : sourceError || '기록을 새로 읽으세요.';
    } catch (cause) {
      return cause instanceof Error ? cause.message : '설정을 확인하세요.';
    }
  }
  function invalidate() {
    generation++;
    artifact = undefined;
    output.replaceChildren();
    error.hidden = true;
    progress.setValue(0);
    changeState('empty');
  }
  function fieldHelp(key: string) {
    const unit = snapshot?.series.axisUnit ?? 's';
    const coordinateUnit = snapshot?.series.units[Number(settings.coordinate ?? 0)] ?? '관측 좌표 단위';
    return advancedSettingDescription(kind, settings, key, unit, coordinateUnit, snapshot?.experiment);
  }
  function updateFieldHelp() {
    context.textContent = advancedAssumptions[kind];
    for (const help of fields.querySelectorAll<HTMLElement>('.ds-field__help'))
      help.textContent = fieldHelp(help.dataset.settingKey!);
  }
  function renderFields() {
    fields.replaceChildren();
    numericControls.clear();
    for (const [key, value] of Object.entries(settings)) {
      if (typeof value === 'string') {
        const group = element(document, 'div', 'ds-field');
        const fieldLabel = element(document, 'label', 'ds-field__label', advancedFieldLabels[key] ?? key);
        const control = element(document, 'select', 'ds-field__control');
        control.id = `advanced-diagnostic-${key}`;
        fieldLabel.htmlFor = control.id;
        for (const [id, text] of [
          ['tent', 'Tent 맵 · [0,1]'],
          ['logistic', 'Logistic 맵 · [0,1]']
        ]) {
          const option = element(document, 'option', '', text);
          option.value = id!;
          control.append(option);
        }
        control.value = value;
        control.addEventListener('change', () => {
          invalidate();
          settings[key] = control.value;
          updateFieldHelp();
          update(true);
        });
        const help = element(document, 'p', 'ds-field__help', fieldHelp(key));
        help.id = `${control.id}-help`;
        help.dataset.settingKey = key;
        control.setAttribute('aria-describedby', help.id);
        group.append(fieldLabel, control, help);
        fields.append(group);
      } else {
        const control = createInput(document, {
          id: `advanced-diagnostic-${key}`,
          label: advancedFieldLabels[key] ?? key,
          value: String(value),
          help: fieldHelp(key),
          required: true,
          onInput(text) {
            invalidate();
            settings[key] = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) ? Number(text) : NaN;
            updateFieldHelp();
            update(true);
          }
        });
        control.input.inputMode = 'decimal';
        const help = control.element.querySelector<HTMLElement>('.ds-field__help');
        if (help) help.dataset.settingKey = key;
        numericControls.set(key, control);
        fields.append(control.element);
      }
    }
    updateFieldHelp();
  }
  function showArtifact(loaded = false) {
    if (!artifact) return;
    output.replaceChildren(advancedResultView(document, artifact.result, artifact));
    status.textContent = loaded
      ? '저장된 고급 분석 결과를 다시 표시했습니다. 현재 실험은 보존했습니다.'
      : '고급 분석을 완료했습니다. 입력과 결과를 artifact 파일로 보존할 수 있습니다.';
    progress.setValue(100);
    error.hidden = true;
    changeState('completed');
  }
  function compute() {
    if (busy() || !options.canRun()) return;
    refreshSource();
    if (cachedRejection || !snapshot) {
      status.textContent = cachedRejection || '입력을 확인하세요.';
      return;
    }
    invalidate();
    const current = generation;
    const request: AdvancedDiagnosticRequest = {
      id: `advanced-${current}`,
      kind,
      experiment: structuredClone(snapshot.experiment),
      series: structuredClone(snapshot.series),
      settings: { ...settings }
    };
    changeState('running');
    progress.setValue(null);
    status.textContent = '입력 snapshot을 별도 worker에서 계산합니다. 언제든 취소할 수 있습니다.';
    update();
    job = createAdvancedDiagnosticJob(request, (event) => {
      if (disposed || current !== generation || event.id !== request.id) return;
      if (event.type === 'progress') {
        progress.setValue(
          event.fraction === null ? null : event.fraction * 100,
          event.phase === 'complete' ? '분석 결과 준비 완료' : 'worker 계산 중 · 세부 진행률은 제공하지 않습니다.'
        );
        return;
      }
      job = undefined;
      if (event.type === 'result') {
        try {
          const now = Date.now();
          artifact = createAdvancedDiagnosticArtifact(request, event.result, {
            artifactId: `advanced-artifact-${now}-${current}`,
            inputRunId: `run-${request.experiment.systemId.slice(7)}-${now}-${current}`,
            createdAt: new Date(now).toISOString()
          });
          showArtifact();
        } catch (cause) {
          artifact = undefined;
          output.replaceChildren();
          fail(cause instanceof Error ? cause.message : '결과를 검증하지 못했습니다.');
        }
      } else if (event.type === 'cancelled') {
        changeState('cancelled');
        progress.setValue(0);
        status.textContent = '고급 분석을 취소했습니다. 부분 결과를 확정하지 않았습니다.';
      } else fail(event.message);
      update();
    });
  }
  function fail(message: string) {
    changeState('error');
    progress.setValue(0);
    error.hidden = false;
    error.textContent = message;
    status.textContent = '고급 분석에 실패했습니다. 조건을 확인하고 다시 계산하세요.';
  }
  function downloadArtifact() {
    if (!artifact) return;
    try {
      const url = URL.createObjectURL(
        new Blob([exportAdvancedDiagnosticArtifact(artifact)], { type: 'application/json' })
      );
      urls.add(url);
      const anchor = element(document, 'a', '');
      anchor.href = url;
      anchor.download = `pendulum-advanced-${artifact.result.kind}.json`;
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
      error.hidden = false;
      error.textContent = cause instanceof Error ? cause.message : '파일을 만들 수 없습니다.';
    }
  }
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file || busy()) return;
    const current = ++generation;
    try {
      if (file.size > ADVANCED_DIAGNOSTIC_LIMITS.artifactBytes)
        throw new RangeError('고급 분석 artifact는 16 MiB 이하여야 합니다.');
      const text = await file.text();
      if (disposed || current !== generation) return;
      const imported = importAdvancedDiagnosticArtifact(text);
      artifact = imported;
      showArtifact(true);
      update();
    } catch (cause) {
      if (disposed || current !== generation) return;
      error.hidden = false;
      error.textContent = `artifact 가져오기 실패: ${cause instanceof Error ? cause.message : '파일을 읽을 수 없습니다.'} 현재 결과와 실험은 보존했습니다.`;
    } finally {
      input.value = '';
    }
  });
  select.addEventListener('change', () => {
    invalidate();
    kind = select.value as AdvancedDiagnosticKind;
    settings = defaultAdvancedSettings(kind, snapshot?.experiment);
    renderFields();
    refreshSource();
  });
  container.addEventListener('toggle', () => {
    if (container.open && !busy()) refreshSource();
  });
  function update(revalidate = false) {
    if (revalidate) {
      cachedRejection = reason();
      for (const [key, control] of numericControls)
        control.setError(
          typeof settings[key] !== 'number' || !Number.isFinite(settings[key])
            ? '유한한 수를 입력하세요.'
            : cachedRejection?.startsWith(`${key}:`)
              ? cachedRejection
              : ''
        );
    }
    rejection.hidden = !cachedRejection;
    rejection.textContent = cachedRejection ?? '';
    run.disabled = busy() || !options.canRun() || Boolean(cachedRejection);
    cancel.disabled = !busy();
    refresh.disabled = busy() || !options.canRun();
    select.disabled = busy();
    download.disabled = busy() || !artifact;
    input.disabled = busy();
    for (const control of fields.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select'))
      control.disabled = busy();
  }
  renderFields();
  update();
  return {
    element: container,
    refresh: refreshSource,
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
