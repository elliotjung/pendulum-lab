import { element } from '../../app/dom';
import { createButton, createInput, createProgress, type InputControl } from '../../design-system/primitives';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import type { DiagnosticsOptions } from './diagnostics';
import {
  STABILITY_KINDS,
  STABILITY_LIMITS,
  STABILITY_NAMES,
  type StabilityArtifact,
  type StabilityKind,
  type StabilityRequest
} from '../../adapters/analysis/stability/contracts';
import {
  STABILITY_PARAMETERS,
  STABILITY_SOURCES,
  defaultStabilitySettings,
  stabilityRejection,
  validateStabilitySettings
} from '../../adapters/analysis/stability/settings';
import { createStabilityJob } from '../../adapters/analysis/stability/client';
import {
  createStabilityArtifact,
  exportStabilityArtifact,
  importStabilityArtifact
} from '../../adapters/analysis/stability/artifact';
import { stabilityAttemptView, stabilityResultView } from './stability-result';
import {
  stabilityAssumptions,
  stabilityFieldLabels,
  stabilityParameterNames,
  stabilityRestartFromArtifact,
  stabilityHandoffFromArtifact,
  stabilitySettingDescription,
  stabilitySourceNames
} from './stability-settings';

export function createStabilityPanel(document: Document, options: DiagnosticsOptions, container: HTMLDetailsElement) {
  const body = element(document, 'div', 'stability-body');
  const label = element(document, 'label', 'ds-field__label', '안정성 도구');
  label.htmlFor = 'stability-kind';
  const select = element(document, 'select', 'ds-field__control');
  select.id = label.htmlFor;
  for (const kind of STABILITY_KINDS) {
    const option = element(document, 'option', '', STABILITY_NAMES[kind]);
    option.value = kind;
    select.append(option);
  }
  const source = element(document, 'p', 'lab-preview-note');
  source.id = 'stability-observation-source';
  const context = element(document, 'p', 'lab-muted');
  context.id = 'stability-assumptions';
  const fields = element(document, 'div', 'stability-fields');
  const matrix = element(document, 'details', 'lab-details');
  matrix.id = 'stability-compatibility';
  const matrixList = element(document, 'ul', 'stability-compatibility');
  matrix.append(element(document, 'summary', '', '모든 안정성 도구의 분석 대상과 호환성'), matrixList);
  const rejection = element(document, 'p', 'lab-preview-note');
  rejection.id = 'stability-rejection';
  rejection.setAttribute('role', 'status');
  const status = element(document, 'p', 'lab-muted', '분석 대상과 초기 추정을 확인하세요.');
  status.id = 'stability-status';
  status.setAttribute('role', 'status');
  const error = element(document, 'p', 'ds-field__error');
  error.id = 'stability-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const progress = createProgress(document, { id: 'stability-progress', label: '안정성 계산 진행', value: 0 });
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const run = createButton(document, { label: '안정성 계산', onClick: () => compute() });
  const cancel = createButton(document, {
    label: '안정성 계산 취소',
    variant: 'secondary',
    onClick: () => job?.cancel()
  });
  const refresh = createButton(document, {
    label: '안정성 기록 새로 읽기',
    variant: 'secondary',
    onClick: () => {
      pendingParent = undefined;
      pendingHandoff = false;
      refreshSource();
    }
  });
  const restart = createButton(document, { label: '수렴 끝점에서 이어 계산', variant: 'secondary', onClick: resume });
  const actions = element(document, 'div', 'lab-inline-actions');
  actions.append(run, cancel, refresh, restart);
  const nextLabel = element(document, 'label', 'ds-field__label', '이 해를 사용할 다음 도구');
  nextLabel.htmlFor = 'stability-next-tool';
  const nextTool = element(document, 'select', 'ds-field__control');
  nextTool.id = nextLabel.htmlFor;
  for (const target of ['floquet', 'continuation', 'periodic-shooting', 'fixed-point'] as const) {
    const option = element(document, 'option', '', STABILITY_NAMES[target]);
    option.value = target;
    nextTool.append(option);
  }
  const handoff = createButton(document, {
    label: '이 해로 다음 도구 준비',
    variant: 'secondary',
    onClick: prepareNext
  });
  const nextNote = element(
    document,
    'p',
    'lab-muted',
    '현재 구동 진자의 수렴한 주기 1 해를 Floquet·shooting·continuation의 초기 추정으로 전달합니다. 원래 물성과 구동 위상을 유지합니다.'
  );
  const attempt = element(document, 'div', 'stability-attempt');
  const output = element(document, 'div', 'stability-output');
  output.id = 'stability-output';
  const files = element(document, 'div', 'stability-files');
  const download = createButton(document, {
    label: '안정성 결과 JSON 다운로드',
    variant: 'secondary',
    onClick: downloadArtifact
  });
  const importLabel = element(document, 'label', 'ds-field__label', '안정성 결과 JSON 가져오기');
  importLabel.htmlFor = 'stability-import';
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
      '결과를 가져오면 저장된 해·가지·설정·입력 실험 ID를 다시 표시합니다. 현재 실험은 보존합니다. 이어 계산은 저장된 원래 실험과 분석 대상을 사용합니다.'
    )
  );
  body.append(
    label,
    select,
    source,
    context,
    fields,
    matrix,
    rejection,
    actions,
    nextLabel,
    nextTool,
    handoff,
    nextNote,
    progress.element,
    status,
    error,
    attempt,
    output,
    files
  );
  container.append(body);
  let kind: StabilityKind = 'fixed-point';
  let settings = defaultStabilitySettings(kind);
  let snapshot: ExperimentStateV1 | undefined;
  let sourceError = '';
  let state = 'empty',
    generation = 0,
    disposed = false,
    initialized = false;
  let job: ReturnType<typeof createStabilityJob> | undefined;
  let artifact: StabilityArtifact | undefined;
  let pendingParent: StabilityArtifact | undefined;
  let pendingHandoff = false;
  let cachedRejection: string | null = '실험 설정을 새로 읽으세요.';
  const numericControls = new Map<string, InputControl>();
  const urls = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const busy = () => state === 'running';
  function changeState(next: string) {
    state = next;
    container.dataset.stabilityStatus = next;
  }
  function refreshSource() {
    try {
      const parsed = pendingParent
        ? { ok: true as const, value: structuredClone(pendingParent.request.experiment) }
        : options.experiment();
      if (!parsed.ok) throw new Error(parsed.issues.map((issue) => issue.message).join(' '));
      snapshot = parsed.value;
      sourceError = '';
      if (!initialized) {
        settings = defaultStabilitySettings(kind, snapshot);
        initialized = true;
        renderFields();
      }
    } catch (cause) {
      snapshot = undefined;
      sourceError = cause instanceof Error ? cause.message : '실험 설정을 읽을 수 없습니다.';
    }
    matrixList.replaceChildren(
      ...STABILITY_KINDS.map((candidate) => {
        const sources = STABILITY_SOURCES[candidate].map((candidateSource) => {
          const defaults = defaultStabilitySettings(candidate, snapshot, candidateSource);
          const reason = snapshot ? stabilityRejection(candidate, snapshot, defaults) : sourceError;
          return { reason, text: `${stabilitySourceNames[candidateSource]}: ${reason || '사용 가능'}` };
        });
        const item = element(
          document,
          'li',
          '',
          `${STABILITY_NAMES[candidate]} · ${sources.map((entry) => entry.text).join(' / ')}`
        );
        item.dataset.stabilityKind = candidate;
        item.dataset.available = String(sources.some((entry) => !entry.reason));
        return item;
      })
    );
    updateHelp();
    update(true);
  }
  function reason() {
    try {
      validateStabilitySettings(kind, settings);
      return snapshot ? stabilityRejection(kind, snapshot, settings) : sourceError || '실험 설정을 새로 읽으세요.';
    } catch (cause) {
      return cause instanceof Error ? cause.message : '설정을 확인하세요.';
    }
  }
  function changed() {
    generation++;
    error.hidden = true;
    attempt.replaceChildren();
    progress.setValue(0);
    changeState(artifact ? 'retained' : 'empty');
    status.textContent = artifact
      ? '입력을 바꿨습니다. 아래에는 이전 결과를 보존합니다. 새 설정으로 다시 계산하세요.'
      : '분석 대상과 초기 추정을 확인하세요.';
  }
  function updateHelp() {
    source.textContent = snapshot
      ? `기준 실험: ${snapshot.systemId} · 분석 대상: ${stabilitySourceNames[String(settings.source)] ?? settings.source}.`
      : sourceError;
    context.textContent =
      settings.source === 'linear-oscillator'
        ? '독립 선형 감쇠 발진기의 한 관찰 주기(s) 전파자와 전체 Floquet 스펙트럼입니다. 현재 진자 물성을 사용하지 않습니다. 해석해와 분할 수 수렴을 확인하세요. 비용은 적분 분할 수×행렬 차원²입니다.'
        : kind === 'branch-switch' && settings.source === 'current-driven'
          ? '현재 구동 진자의 주기 1 궤도에서 −1에 가까운 승수를 확인한 뒤 주기 2 후보를 탐색합니다. 일반 대칭 분기 전환기가 아니며 최소 주기와 궤도 분리를 확인하세요. 비용은 여러 섭동의 두 주기 shooting 합입니다.'
          : stabilityAssumptions[kind];
    for (const help of fields.querySelectorAll<HTMLElement>('.ds-field__help'))
      help.textContent = stabilitySettingDescription(kind, settings, help.dataset.settingKey!, snapshot);
  }
  function renderFields() {
    fields.replaceChildren();
    numericControls.clear();
    for (const [key, value] of Object.entries(settings)) {
      if (typeof value === 'string') {
        const group = element(document, 'div', 'ds-field');
        const fieldLabel = element(document, 'label', 'ds-field__label', stabilityFieldLabels[key] ?? key);
        const control = element(document, 'select', 'ds-field__control');
        control.id = `stability-${key}`;
        fieldLabel.htmlFor = control.id;
        const choices = key === 'source' ? STABILITY_SOURCES[kind] : STABILITY_PARAMETERS;
        for (const choice of choices) {
          const option = element(
            document,
            'option',
            '',
            (key === 'source' ? stabilitySourceNames : stabilityParameterNames)[choice] ?? choice
          );
          option.value = choice;
          control.append(option);
        }
        control.value = value;
        control.addEventListener('change', () => {
          changed();
          if (key === 'source') {
            pendingParent = undefined;
            pendingHandoff = false;
            settings = defaultStabilitySettings(kind, snapshot, control.value);
            renderFields();
          } else settings[key] = control.value;
          updateHelp();
          update(true);
        });
        const help = element(document, 'p', 'ds-field__help');
        help.id = `${control.id}-help`;
        help.dataset.settingKey = key;
        control.setAttribute('aria-describedby', help.id);
        group.append(fieldLabel, control, help);
        fields.append(group);
      } else {
        const control = createInput(document, {
          id: `stability-${key}`,
          label: stabilityFieldLabels[key] ?? key,
          value: String(value),
          required: true,
          help: stabilitySettingDescription(kind, settings, key, snapshot),
          onInput(text) {
            changed();
            settings[key] = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) ? Number(text) : NaN;
            updateHelp();
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
    updateHelp();
  }
  function showArtifact(loaded = false) {
    if (!artifact) return;
    output.replaceChildren(stabilityResultView(document, artifact));
    attempt.replaceChildren();
    error.hidden = true;
    progress.setValue(100);
    changeState(['converged', 'diagnostic'].includes(artifact.result.status) ? 'completed' : artifact.result.status);
    status.textContent = loaded
      ? '저장된 결과를 다시 표시했습니다. 현재 실험은 보존했습니다.'
      : '계산을 마쳤습니다. 수렴·잔차·한계를 확인하고 결과를 저장하세요.';
  }
  function fail(message: string) {
    changeState('error');
    progress.setValue(0);
    error.hidden = false;
    error.textContent = message;
    status.textContent =
      '계산에 실패했습니다. 초기 추정·분할 수·매개변수 범위를 조절해 다시 시도하세요. 이전 결과와 현재 실험은 보존했습니다.';
  }
  function compute(parent = pendingParent) {
    if (busy() || !options.canRun()) return;
    if (!parent) refreshSource();
    const resumeFrom = parent
      ? pendingHandoff
        ? stabilityHandoffFromArtifact(parent)
        : stabilityRestartFromArtifact(parent)
      : null;
    const experiment = parent?.request.experiment ?? snapshot;
    const rejection = experiment ? stabilityRejection(kind, experiment, settings) : cachedRejection;
    if (rejection || !experiment || (parent && !resumeFrom)) {
      status.textContent = rejection || '수렴한 끝점이 없습니다.';
      return;
    }
    const current = ++generation;
    const request: StabilityRequest = {
      id: `stability-${current}`,
      kind,
      experiment: structuredClone(experiment),
      settings: { ...settings },
      ...(resumeFrom ? { restart: resumeFrom } : {})
    };
    error.hidden = true;
    attempt.replaceChildren();
    changeState('running');
    progress.setValue(null);
    status.textContent = '원 실험의 복사본으로 계산합니다. 현재 실험과 이전 결과는 보존하며 언제든 취소할 수 있습니다.';
    update();
    job = createStabilityJob(request, (event) => {
      if (disposed || current !== generation || event.id !== request.id) return;
      if (event.type === 'progress') {
        progress.setValue(
          event.fraction === null ? null : event.fraction * 100,
          event.phase === 'complete' ? '결과 준비 완료' : '안정성 계산 중'
        );
        return;
      }
      job = undefined;
      if (event.type === 'result') {
        try {
          const now = Date.now();
          const next = createStabilityArtifact(request, event.result, {
            artifactId: `stability-artifact-${now}-${current}`,
            inputRunId: parent?.inputRunId ?? `run-${request.experiment.systemId.slice(7)}-${now}-${current}`,
            createdAt: new Date(now).toISOString()
          });
          if (event.result.status === 'nonconverged' && artifact) {
            attempt.replaceChildren(stabilityAttemptView(document, event.result));
            changeState('nonconverged');
            progress.setValue(100);
            status.textContent =
              '새 시도는 수렴하지 않았습니다. 시도 기록을 표시하며 이전에 저장 가능한 결과는 아래에 보존했습니다. 초기 추정이나 간격을 조절하세요.';
          } else {
            artifact = next;
            pendingParent = undefined;
            pendingHandoff = false;
            showArtifact();
          }
        } catch (cause) {
          fail(cause instanceof Error ? cause.message : '결과 검증에 실패했습니다.');
        }
      } else if (event.type === 'cancelled') {
        changeState('cancelled');
        progress.setValue(0);
        status.textContent = '계산을 취소했습니다. 부분 결과를 확정하지 않았으며 이전 결과와 현재 실험은 보존했습니다.';
      } else fail(event.message);
      update();
    });
  }
  function resume() {
    if (!artifact || busy()) return;
    const endpoint = stabilityRestartFromArtifact(artifact);
    if (!endpoint) return;
    kind = artifact.request.kind;
    select.value = kind;
    settings = structuredClone(artifact.request.settings);
    if ('end' in settings && 'start' in settings) {
      const nextEnd = endpoint.parameter + Number(settings.end) - Number(settings.start);
      settings.end = settings.source === 'delayed-logistic' ? Math.max(1.5, Math.min(2.1, nextEnd)) : nextEnd;
    }
    if ('start' in settings) settings.start = endpoint.parameter;
    if ('guess0' in settings) settings.guess0 = endpoint.state[0]!;
    if ('guess1' in settings) settings.guess1 = endpoint.state[1]!;
    if ('direction' in settings) settings.direction = endpoint.direction;
    snapshot = structuredClone(artifact.request.experiment);
    pendingParent = artifact;
    pendingHandoff = false;
    renderFields();
    update(true);
    compute(artifact);
  }
  function prepareNext() {
    if (!artifact || busy()) return;
    const seed = stabilityHandoffFromArtifact(artifact);
    if (!seed) return;
    changed();
    kind = nextTool.value as StabilityKind;
    select.value = kind;
    snapshot = structuredClone(artifact.request.experiment);
    settings = defaultStabilitySettings(kind, snapshot, 'current-driven');
    settings.guess0 = seed.state[0]!;
    settings.guess1 = seed.state[1]!;
    settings.period = 1;
    if (kind === 'continuation') {
      settings.parameter = 'forcingAmplitude';
      settings.start = seed.parameter;
      settings.end = seed.parameter + 0.2;
    }
    pendingParent = artifact;
    pendingHandoff = true;
    renderFields();
    update(true);
    status.textContent =
      '선택한 도구에 수렴한 해와 원래 실험 설정을 전달했습니다. 초기 추정과 시작값은 부모 해로 고정됩니다. 나머지 조건을 확인한 뒤 안정성 계산을 누르세요. 새 초기 추정은 기록 새로 읽기로 시작할 수 있습니다.';
  }
  function downloadArtifact() {
    if (!artifact) return;
    try {
      const url = URL.createObjectURL(new Blob([exportStabilityArtifact(artifact)], { type: 'application/json' }));
      urls.add(url);
      const anchor = element(document, 'a', '');
      anchor.href = url;
      anchor.download = `pendulum-stability-${artifact.result.kind}.json`;
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
      error.textContent = cause instanceof Error ? cause.message : '파일을 만들지 못했습니다.';
    }
  }
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file || busy()) return;
    const current = ++generation;
    try {
      if (file.size > STABILITY_LIMITS.artifactBytes) throw new RangeError('안정성 결과 파일은 8 MiB 이하여야 합니다.');
      const text = await file.text();
      if (disposed || current !== generation) return;
      const imported = importStabilityArtifact(text);
      artifact = imported;
      pendingParent = undefined;
      pendingHandoff = false;
      showArtifact(true);
      update();
    } catch (cause) {
      if (disposed || current !== generation) return;
      error.hidden = false;
      error.textContent = `결과 가져오기 실패: ${cause instanceof Error ? cause.message : '파일을 읽지 못했습니다.'} 이전 결과와 현재 실험은 보존했습니다.`;
    } finally {
      input.value = '';
    }
  });
  select.addEventListener('change', () => {
    changed();
    pendingParent = undefined;
    pendingHandoff = false;
    kind = select.value as StabilityKind;
    settings = defaultStabilitySettings(kind, snapshot);
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
    restart.disabled = busy() || !options.canRun() || !artifact || !stabilityRestartFromArtifact(artifact);
    handoff.disabled = busy() || !options.canRun() || !artifact || !stabilityHandoffFromArtifact(artifact);
    nextTool.disabled = busy();
    select.disabled = busy();
    download.disabled = busy() || !artifact;
    input.disabled = busy();
    for (const control of fields.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select'))
      control.disabled =
        busy() ||
        Boolean(
          pendingParent &&
          ['source', 'parameter', 'guess0', 'guess1', 'start', 'direction'].includes(
            control.id.slice('stability-'.length)
          )
        );
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
