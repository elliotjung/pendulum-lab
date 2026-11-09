import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import type { ExpansionSuiteConfig, ExpansionSuiteResult } from '../../../physics/expandedModels-types';
import { expansionModelDefinition } from '../../../physics/expandedModels-factory';
import {
  buildLegacyExpansionRequest,
  parseLegacyExpansion,
  decodeLegacyExpansionResult,
  LEGACY_EXPANSION_LIMITS,
  type LegacyExpansionArchive
} from './legacy-expansion';
import { createLegacyExpansionExecutor, type LegacyExpansionExecutor } from './legacy-expansion-client';
import { createLegacyExpansionResultView } from './legacy-expansion-view';
import { stableBatchJson } from './safe';

export interface LegacyExpansionPanelOptions {
  readonly includeLyapunov?: boolean;
  readonly sourceText?: string;
  readonly executor?: LegacyExpansionExecutor;
}
/** Complete preserved native expansion suite, including methods unavailable in the canonical physical projection. */
export function createLegacyExpansionPanel(
  document: Document,
  config: ExpansionSuiteConfig,
  options: LegacyExpansionPanelOptions = {}
) {
  let request = buildLegacyExpansionRequest(config, options);
  const executor = options.executor ?? createLegacyExpansionExecutor();
  const root = element(document, 'details', 'ds-section');
  root.classList.add('legacy-expansion-native');
  root.style.minWidth = '0';
  root.style.maxWidth = '100%';
  root.style.overflowWrap = 'anywhere';
  root.append(element(document, 'summary', 'ds-section__heading', '기존 확장 모델 전체 suite 실행'));
  const body = element(document, 'div', 'ds-section__body');
  body.style.minWidth = '0';
  body.style.gridTemplateColumns = 'minmax(0, 1fr)';
  root.append(body);
  const settings = element(document, 'pre', 'lab-data-output');
  settings.style.minWidth = '0';
  settings.style.maxWidth = '100%';
  settings.style.whiteSpace = 'pre-wrap';
  settings.style.overflowWrap = 'anywhere';
  const status = element(document, 'p', 'lab-muted', '원본 설정과 native 기본값·실효 범위를 확인한 뒤 실행하세요.');
  status.setAttribute('role', 'status');
  const error = element(document, 'p', 'ds-field__error');
  error.hidden = true;
  error.setAttribute('role', 'alert');
  const output = element(document, 'div', 'legacy-expansion-output');
  output.style.minWidth = '0';
  output.style.maxWidth = '100%';
  output.style.overflowX = 'auto';
  const includeLabel = element(document, 'label', 'ds-field__label', 'native Lyapunov 전체 스펙트럼 추가');
  const include = element(document, 'input', '');
  include.type = 'checkbox';
  include.checked = request.includeLyapunov;
  includeLabel.prepend(include);
  const file = element(document, 'input', 'ds-field__control');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.setAttribute('aria-label', 'native 확장 suite JSON 미리보기');
  const pendingNotice = element(document, 'p', 'lab-muted');
  let disposed = false,
    running = false,
    generation = 0;
  let job: { dispose(): void } | undefined,
    archive: LegacyExpansionArchive | undefined,
    pending: LegacyExpansionArchive | undefined;
  const urls = new Set<string>(),
    timers = new Set<ReturnType<typeof setTimeout>>();
  function fail(cause: unknown) {
    error.hidden = false;
    error.textContent = cause instanceof Error ? cause.message : 'native suite 작업에 실패했습니다.';
  }
  const start = createButton(document, {
    label: '전체 native 확장 suite 실행',
    onClick() {
      const token = ++generation;
      error.hidden = true;
      running = true;
      pending = undefined;
      pendingNotice.textContent = '';
      status.textContent =
        'native worker를 시작합니다. suite는 하나의 원자 작업이며 방법별 백분율을 추측하지 않습니다.';
      root.dataset.suiteStatus = 'running';
      update();
      const current = request;
      try {
        const next = executor(current, (event) => {
          if (disposed || token !== generation || event.id !== current.id || !running) return;
          if (event.type === 'started')
            status.textContent =
              'native suite 계산 중: 적분기 비교·heatmap·ghost·분기·replay 및 선택한 Lyapunov를 원래 runner에서 계산합니다.';
          else if (event.type === 'calculated')
            status.textContent = 'native 계산을 마쳤습니다. 전체 출력·입력 계보·SHA-256을 검증합니다.';
          else if (event.type === 'error') {
            running = false;
            job?.dispose();
            job = undefined;
            root.dataset.suiteStatus = 'failed';
            fail(new Error(event.message));
            update();
          } else {
            void parseLegacyExpansion(JSON.stringify(event.archive))
              .then((checked) => {
                if (disposed || token !== generation) return;
                if (stableBatchJson(checked.request) !== stableBatchJson(current))
                  throw new Error('native 결과가 현재 요청에 속하지 않습니다.');
                archive = checked;
                running = false;
                job?.dispose();
                job = undefined;
                root.dataset.suiteStatus = 'completed';
                showResult(decodeLegacyExpansionResult(checked.result));
                status.textContent =
                  '전체 native suite를 마쳤습니다. 모든 방법·궤적·진단을 보존했습니다. 실행 시간 기반 순위는 반복 실행에서 달라질 수 있습니다.';
                update();
              })
              .catch((cause: unknown) => {
                if (!disposed && token === generation) {
                  running = false;
                  job?.dispose();
                  job = undefined;
                  root.dataset.suiteStatus = 'failed';
                  fail(cause);
                  update();
                }
              });
          }
        });
        if (disposed || token !== generation || !running) next.dispose();
        else job = next;
      } catch (cause) {
        running = false;
        root.dataset.suiteStatus = 'failed';
        fail(cause);
        update();
      }
    }
  });
  const cancel = createButton(document, {
    label: 'native 확장 suite 취소',
    variant: 'secondary',
    onClick() {
      if (!running) return;
      generation++;
      job?.dispose();
      job = undefined;
      running = false;
      root.dataset.suiteStatus = 'cancelled';
      status.textContent =
        'worker를 종료했습니다. 기존 완료 결과와 원본 설정은 보존했습니다. 재실행은 suite 전체를 원래 설정에서 다시 계산합니다.';
      update();
    }
  });
  const download = createButton(document, {
    label: '전체 native 설정·결과 JSON 저장',
    variant: 'secondary',
    onClick() {
      if (!archive) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(archive)], { type: 'application/json' }));
      urls.add(url);
      const anchor = element(document, 'a', '');
      anchor.href = url;
      anchor.download = `${archive.request.id}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.delete(url);
        timers.delete(timer);
      }, 1000);
      timers.add(timer);
    }
  });
  const adopt = createButton(document, {
    label: '미리 본 native suite 설정·결과 채택',
    variant: 'secondary',
    onClick() {
      if (!pending || running) return;
      generation++;
      archive = pending;
      pending = undefined;
      request = archive.request;
      include.checked = request.includeLyapunov;
      pendingNotice.textContent = '';
      error.hidden = true;
      root.dataset.suiteStatus = 'imported';
      describe();
      showResult(decodeLegacyExpansionResult(archive.result));
      status.textContent =
        '파일의 전체 설정·결과를 채택했습니다. SHA-256과 구조·입력 계보를 확인했으며 수치값을 재계산하거나 인증하지 않았습니다. 재실행은 명시적 실행 버튼을 사용하세요.';
      update();
    }
  });
  function update() {
    start.disabled = running;
    cancel.disabled = !running;
    include.disabled = running;
    file.disabled = running;
    download.disabled = !archive || running;
    adopt.disabled = !pending || running;
  }
  function describe() {
    const definition = expansionModelDefinition(request.config.model);
    settings.textContent = `요청 ID ${request.id}\n모델 ${request.config.model}\n원본 요청 ${JSON.stringify(request.config)}\n명시적으로 적용한 native 기본값·실효 범위 ${JSON.stringify(request.resolved)}\n${definition.equation}\n${definition.energyNote}\n${definition.caveat}`;
  }
  function showResult(result: ExpansionSuiteResult) {
    output.replaceChildren(createLegacyExpansionResultView(document, result));
  }
  include.addEventListener('change', () => {
    try {
      request = buildLegacyExpansionRequest(request.config, {
        includeLyapunov: include.checked,
        ...(request.sourceText === null ? {} : { sourceText: request.sourceText })
      });
      describe();
      status.textContent =
        '새 Lyapunov 선택을 요청에 반영했습니다. 기존 완료 결과는 저장할 수 있습니다. 새 계산은 실행 버튼으로 시작하세요.';
    } catch (cause) {
      include.checked = request.includeLyapunov;
      fail(cause);
    }
  });
  file.addEventListener('change', () => {
    if (running) return;
    const chosen = file.files?.[0],
      token = ++generation;
    pending = undefined;
    pendingNotice.textContent = '';
    update();
    if (!chosen || running) return;
    void (async () => {
      try {
        if (chosen.size > LEGACY_EXPANSION_LIMITS.bytes) throw new Error('native suite 파일은 최대16MiB입니다.');
        const text = await chosen.text();
        if (disposed || token !== generation) return;
        const checked = await parseLegacyExpansion(text);
        if (disposed || token !== generation) return;
        pending = checked;
        pendingNotice.textContent = `미리보기: ${checked.request.config.model} · ${checked.request.resolved.methods.length}방법 · ${checked.request.id} · SHA-256 ${checked.resultSha256}. 아직 채택하지 않았습니다.`;
        error.hidden = true;
        update();
      } catch (cause) {
        if (!disposed && token === generation) fail(cause);
      } finally {
        if (!disposed && token === generation) file.value = '';
      }
    })();
  });
  const actions = element(document, 'div', 'lab-inline-actions');
  actions.append(start, cancel, download);
  body.append(
    element(
      document,
      'p',
      'lab-muted',
      '기존 runExpansionSuite를 그대로 실행합니다. canonical 물리 adapter의 적분기 지원 범위와 독립적으로 원본의 모든 방법을 실행합니다. native runner의 단계·표본·분기 범위와 기본값을 아래에 명시합니다. 일괄 작업 한도32000000 상태·단계, archive16MiB입니다. ghost 분리는 Lyapunov 스펙트럼 인증값이 아닙니다.'
    ),
    settings,
    includeLabel,
    actions,
    status,
    error,
    output,
    file,
    pendingNotice,
    adopt
  );
  describe();
  update();
  root.dataset.suiteStatus = 'ready';
  return {
    element: root,
    snapshot: () => (archive ? structuredClone(archive) : undefined),
    dispose() {
      if (disposed) return;
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
