import { element, link } from '../../app/dom';
import { createButton, createProgress } from '../../design-system/primitives';
import type { DiagnosticsOptions } from '../views/diagnostics';
import { createDiagnosticSeries } from '../../adapters/analysis/core/source';
import { CORE_DIAGNOSTIC_LIMITS } from '../../adapters/analysis/core/contracts';
import { PROJECT_LIMITS, type ResearchProjectBundle } from '../../provenance/contracts';
import { addResearchSession, createResearchProject } from '../../provenance/project';
import { validateResearchProject } from '../../provenance/validation';
import { researchNotebookJson, researchReportMarkdown } from '../../provenance/render';
import { createProjectPackageJob } from './client';
import type { ProjectPackageRequest } from './package-contracts';
import { loadLocalResearchArchive, saveLocalResearchArchive } from './storage';
import { readResearchProjectSession, saveResearchProjectSession } from './session';
import { projectArea, projectFile, projectGroup, projectText, requiredText } from './controls';
import { projectItemId, type ProjectEditorContext } from './context';
import { createProjectEditor } from './editor';
import { createProjectFigures } from './figures';
import { renderProjectArtifactList, renderProjectPreview, renderProjectRunList } from './output';

export function createResearchProjectPanel(
  document: Document,
  options: DiagnosticsOptions,
  container: HTMLDetailsElement
) {
  const body = element(document, 'div', 'project-body');
  body.append(
    element(
      document,
      'p',
      'lab-preview-note',
      '연구 질문 → 세션 → 실제 run과 원본 artifact → 노트북·그림 → 재현 ZIP. 패키지의 체크섬은 무결성을 확인합니다. 출처 진위·과학적 정확성·사람의 검토를 인증하지 않습니다.'
    )
  );
  const metadata = projectGroup(document, body, '연구 프로젝트');
  const title = projectText(document, metadata.fields, 'title', '프로젝트 제목', '나의 진자 연구');
  const description = projectArea(document, metadata.fields, 'description', '연구 질문 · 설명');
  const summary = element(document, 'section', 'project-summary');
  summary.id = 'project-summary';
  const summaryTitle = element(document, 'h3', '', '아직 연구 프로젝트가 없습니다');
  summaryTitle.id = 'project-summary-title';
  const summaryDetail = element(document, 'p', 'lab-muted');
  summary.append(summaryTitle, summaryDetail);
  body.append(summary);
  const restoredSession = readResearchProjectSession(document);
  let bundle = restoredSession.bundle;
  let previous = restoredSession.previous;
  let pending = restoredSession.pending;
  let persistedBundle = bundle;
  let persistedPrevious = previous;
  let persistedPending = pending;
  let renderedBundle: ResearchProjectBundle | undefined;
  let busy = false;
  let disposed = false;
  let generation = 0;
  let job: ReturnType<typeof createProjectPackageJob> | undefined;
  let packagePurpose: 'download' | 'save' = 'download';
  const urls = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function fail(cause: unknown) {
    if (disposed) return;
    error.hidden = false;
    error.textContent = cause instanceof Error ? cause.message : String(cause);
    container.dataset.projectStatus = 'error';
  }
  function ready(message: string) {
    error.hidden = true;
    error.textContent = '';
    status.textContent = message;
    container.dataset.projectStatus = pending ? 'preview' : bundle ? 'ready' : 'empty';
  }
  function download(data: string | Uint8Array, filename: string, mediaType: string) {
    if (disposed || busy) return;
    try {
      const blob = new Blob([typeof data === 'string' ? data : (data.slice().buffer as ArrayBuffer)], {
        type: mediaType
      });
      const url = URL.createObjectURL(blob);
      urls.add(url);
      const anchor = element(document, 'a', '');
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.delete(url);
        timers.delete(timer);
      }, 1000);
      timers.add(timer);
      ready('파일을 만들었습니다. 브라우저 다운로드 목록에서 확인하세요.');
    } catch (cause) {
      fail(cause);
    }
  }
  const context: ProjectEditorContext = {
    get: () => bundle,
    change(update, message) {
      if (busy || disposed) return;
      try {
        if (!bundle) throw new Error('먼저 연구 프로젝트를 만드세요.');
        const project = { ...update(bundle.project), updatedAt: new Date().toISOString() };
        validateResearchProject(project);
        bundle = { ...bundle, project };
        ready(message);
        refresh();
      } catch (cause) {
        fail(cause);
      }
    },
    download,
    fail
  };
  const create = createButton(document, {
    label: '연구 프로젝트 만들기',
    onClick() {
      try {
        const next = addResearchSession(
          createResearchProject({ title: requiredText(title, 160), description: description.value }),
          { title: '첫 실험 세션' }
        );
        previous = bundle;
        bundle = next;
        pending = undefined;
        editor.reset();
        ready('새 연구 프로젝트와 첫 세션을 만들었습니다. 현재 기록을 보존하세요.');
        refresh();
      } catch (cause) {
        fail(cause);
      }
    }
  });
  const saveMetadata = createButton(document, {
    label: '프로젝트 설명 갱신',
    variant: 'secondary',
    onClick() {
      try {
        const nextTitle = requiredText(title, 160);
        context.change(
          (project) => ({ ...project, title: nextTitle, description: description.value }),
          '프로젝트 제목과 연구 질문을 갱신했습니다.'
        );
      } catch (cause) {
        fail(cause);
      }
    }
  });
  const back = createButton(document, {
    label: '직전 프로젝트로 돌아가기',
    variant: 'secondary',
    onClick() {
      if (!previous) return;
      [bundle, previous] = [previous, bundle];
      pending = undefined;
      syncMetadata();
      editor.reset();
      ready('직전 프로젝트를 복원했습니다. 로컬 저장 파일은 변경하지 않았습니다.');
      refresh();
    }
  });
  metadata.fields.append(create, saveMetadata, back);
  const content = element(document, 'fieldset', 'project-content');
  content.append(element(document, 'legend', '', '프로젝트 내용'));
  const editor = createProjectEditor(document, context);
  content.append(editor.element);
  const capture = createButton(document, { label: '현재 기록을 연구 run으로 보존', onClick: captureRun });
  const captureNote = element(
    document,
    'p',
    'lab-muted',
    '실행을 멈추면 클릭 시점의 canonical 입력과 실제 기록을 복사합니다. 최대 8192표본·100만 scalar, 보간·재적분·자동 축약 없음. 설정만 있으면 partial run입니다.'
  );
  content.append(capture, captureNote);
  const artifactInput = projectFile(
    document,
    content,
    'artifact-import',
    '기존 분석 · 관측 · 모델 artifact JSON 첨부',
    '.json,application/json'
  );
  content.append(
    element(
      document,
      'p',
      'lab-muted',
      '최대 24 MiB. 위에서 선택한 run에 native parser로 검증한 원본 bytes를 연결합니다. 입력 설정이 다른 결과는 거부합니다. 파일의 native run ID는 별도로 보존합니다.'
    )
  );
  const runList = element(document, 'div', 'project-run-list');
  runList.id = 'project-run-list';
  const artifactList = element(document, 'div', 'project-artifact-list');
  artifactList.id = 'project-artifact-list';
  const lists = element(document, 'details', 'lab-details');
  lists.open = true;
  lists.append(element(document, 'summary', '', '보존된 run과 원본 artifact'), runList, artifactList);
  content.append(lists);
  const figures = createProjectFigures(document, context);
  content.append(figures.element);
  body.append(content);

  const exports = projectGroup(document, body, '내보내기 · 로컬 보존');
  const zip = createButton(document, { label: '재현 ZIP 다운로드', onClick: () => exportPackage('download') });
  const report = createButton(document, {
    label: '연구 보고서 다운로드',
    variant: 'secondary',
    onClick() {
      try {
        if (bundle) download(researchReportMarkdown(bundle), 'report.md', 'text/markdown;charset=utf-8');
      } catch (cause) {
        fail(cause);
      }
    }
  });
  const notebook = createButton(document, {
    label: '노트북 JSON 다운로드',
    variant: 'secondary',
    onClick() {
      try {
        if (!bundle) return;
        download(researchNotebookJson(bundle), 'notebook.json', 'application/json');
      } catch (cause) {
        fail(cause);
      }
    }
  });
  const localSave = createButton(document, {
    label: '로컬 프로젝트 저장',
    variant: 'secondary',
    onClick: () => exportPackage('save')
  });
  const localRestore = createButton(document, {
    label: '로컬 프로젝트 복원 미리보기',
    variant: 'secondary',
    onClick() {
      try {
        runPackage({
          id: projectItemId('restore'),
          operation: 'import',
          bytes: loadLocalResearchArchive(document.defaultView!.localStorage)
        });
      } catch (cause) {
        fail(cause);
      }
    }
  });
  exports.fields.append(
    zip,
    report,
    notebook,
    localSave,
    localRestore,
    link(document, '별도 reviewer 화면 열기', './reviewer.html#/project')
  );
  exports.element.append(
    element(
      document,
      'p',
      'lab-muted',
      'ZIP 최대 64 MiB · 원본 파일 24 MiB · 512파일. 로컬 저장은 별도 versioned key에 3 MiB 이하 ZIP만 보존하며 직접 저장할 때만 갱신합니다. 새로고침 전 ZIP 또는 로컬 저장을 권장합니다. 저장 실패 시 기존 저장 내용을 지우지 않습니다.'
    )
  );
  const imports = projectGroup(document, body, '재현 ZIP 가져오기 · 검증 미리보기');
  const input = projectFile(
    document,
    imports.fields,
    'zip-import',
    '재현 ZIP · 기존 research ZIP 가져오기',
    '.zip,application/zip'
  );
  const preview = element(document, 'div', 'project-preview');
  preview.id = 'project-preview';
  const adopt = createButton(document, {
    label: '검증 미리보기 채택',
    onClick() {
      if (!pending) return;
      previous = bundle;
      bundle = pending;
      pending = undefined;
      syncMetadata();
      editor.reset();
      ready('검증한 프로젝트를 채택했습니다. 원본 파일과 프로젝트 ID를 그대로 보존했습니다.');
      refresh();
    }
  });
  const dismiss = createButton(document, {
    label: '가져오기 미리보기 닫기',
    variant: 'secondary',
    onClick() {
      pending = undefined;
      ready('미리보기를 닫았습니다. 현재 프로젝트를 유지했습니다.');
      refresh();
    }
  });
  imports.element.append(preview, adopt, dismiss);
  const progress = createProgress(document, { id: 'project-progress', label: '연구 패키지 작업 진행', value: 0 });
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const cancel = createButton(document, { label: '패키지 작업 취소', variant: 'secondary', onClick: cancelWork });
  const status = element(document, 'p', 'lab-muted', '연구 프로젝트를 만들거나 저장된 재현 ZIP을 가져오세요.');
  status.id = 'project-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-atomic', 'true');
  const error = element(document, 'p', 'ds-field__error');
  error.id = 'project-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  body.append(progress.element, cancel, status, error);
  container.append(body);

  function syncMetadata() {
    title.value = bundle?.project.title ?? '';
    description.value = bundle?.project.description ?? '';
  }
  function refresh() {
    if (disposed) return;
    if (persistedBundle !== bundle || persistedPrevious !== previous || persistedPending !== pending) {
      saveResearchProjectSession(document, { bundle, previous, pending });
      persistedBundle = bundle;
      persistedPrevious = previous;
      persistedPending = pending;
    }
    if (renderedBundle !== bundle) {
      renderedBundle = bundle;
      summaryTitle.textContent = bundle?.project.title ?? '아직 연구 프로젝트가 없습니다';
      summaryDetail.textContent = bundle
        ? `${bundle.project.id} · 세션 ${bundle.project.sessions.length} · run ${bundle.project.runs.length} · artifact ${bundle.project.artifacts.length} · 노트북 ${bundle.project.notebook.length} · 그림 ${bundle.project.figures.length} · 누락 ${bundle.project.artifacts.filter((artifact) => artifact.status === 'missing').length}`
        : '현재 실험과 분석 도구는 프로젝트를 만들기 전에도 자유롭게 사용할 수 있습니다.';
      editor.update();
      figures.update();
      renderProjectRunList(document, runList, bundle);
      renderProjectArtifactList(document, artifactList, context);
    }
    renderProjectPreview(document, preview, pending);
    for (const control of body.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
    >('input,select,textarea,button'))
      control.disabled = busy;
    content.disabled = busy || !bundle;
    capture.disabled = busy || !bundle || !options.canRun();
    artifactInput.disabled = busy || !bundle?.project.runs.length;
    saveMetadata.disabled = busy || !bundle;
    back.hidden = !previous;
    back.disabled = busy || !previous;
    for (const button of [zip, report, notebook, localSave]) button.disabled = busy || !bundle;
    adopt.disabled = busy || !pending;
    dismiss.disabled = busy || !pending;
    cancel.disabled = !busy;
    progress.element.hidden = !busy;
    if (!bundle && !runList.childElementCount) {
      editor.update();
      figures.update();
      renderProjectRunList(document, runList, bundle);
      renderProjectArtifactList(document, artifactList, context);
    }
  }
  function runPackage(request: ProjectPackageRequest, token = ++generation) {
    if (disposed || token !== generation) return;
    busy = true;
    if (request.operation === 'import') pending = undefined;
    error.hidden = true;
    container.dataset.projectStatus = 'busy';
    status.textContent = '별도 worker에서 원본과 계보를 검증합니다. 현재 프로젝트는 완료 전까지 유지합니다.';
    progress.setValue(0);
    refresh();
    job = createProjectPackageJob(request, (event) => {
      if (disposed || token !== generation) return;
      if (event.type === 'progress') {
        progress.setValue(event.fraction * 100, event.message);
        status.textContent = event.message;
        return;
      }
      job = undefined;
      busy = false;
      if (event.type === 'error') fail(event.message);
      else if (event.type === 'cancelled') {
        status.textContent = '패키지 작업을 취소했습니다. 이전 프로젝트와 저장 파일을 유지했습니다.';
        container.dataset.projectStatus = 'cancelled';
      } else if (event.type === 'imported') {
        pending = event.bundle;
        ready('검증이 끝났습니다. 미리보기의 프로젝트와 누락 항목을 확인한 뒤 채택하세요.');
      } else if (event.type === 'updated') {
        bundle = event.bundle;
        ready('실제 run과 원본 artifact를 연구 프로젝트에 보존했습니다.');
      } else if (event.type === 'exported') {
        if (packagePurpose === 'save') {
          try {
            saveLocalResearchArchive(document.defaultView!.localStorage, event.bytes);
            ready('별도 로컬 프로젝트 저장을 완료했습니다. 기존 앱의 저장 키는 변경하지 않았습니다.');
          } catch (cause) {
            fail(cause);
          }
        } else download(event.bytes, `pendulum-${bundle!.project.id}.zip`, 'application/zip');
      }
      refresh();
    });
  }
  function exportPackage(purpose: 'download' | 'save') {
    if (!bundle || busy) return;
    packagePurpose = purpose;
    runPackage({ id: projectItemId('export'), operation: 'export', bundle });
  }
  function cancelWork() {
    if (!busy) return;
    generation += 1;
    job?.dispose();
    job = undefined;
    busy = false;
    status.textContent = '패키지 작업을 취소했습니다. 이전 프로젝트와 원본을 유지했습니다.';
    container.dataset.projectStatus = 'cancelled';
    refresh();
  }
  function captureRun() {
    if (!bundle || busy || !options.canRun()) return;
    try {
      const experiment = options.experiment();
      if (!experiment.ok) throw new Error('현재 실험 입력을 수정한 뒤 다시 보존하세요.');
      const label = requiredText(editor.runLabel, 160);
      const samples = options.samples();
      if (samples.length > CORE_DIAGNOSTIC_LIMITS.samples)
        throw new Error(
          '연구 run은 최대 8192기록 표본입니다. 관찰 기간이나 기록 간격을 줄여 다시 실행하세요. 원본을 자동 축약하지 않았습니다.'
        );
      const series = createDiagnosticSeries(experiment.value, samples);
      if (series.states.length * series.labels.length > CORE_DIAGNOSTIC_LIMITS.scalars)
        throw new Error('연구 기록은 최대 100만 scalar입니다. 자유도·관찰 기간·기록 간격을 줄여 다시 실행하세요.');
      runPackage({
        id: projectItemId('capture'),
        operation: 'capture',
        bundle,
        options: {
          experiment: experiment.value,
          label,
          sessionId: editor.sessionSelect.value,
          series
        }
      });
    } catch (cause) {
      fail(cause);
    }
  }
  async function readFile(file: File, max: number, consume: (bytes: Uint8Array, token: number) => void) {
    if (busy || disposed) return;
    const token = ++generation;
    try {
      if (!file.size || file.size > max)
        throw new Error(`파일은 1 byte~${max / (1024 * 1024)} MiB 범위여야 합니다. 원본은 변경하지 않았습니다.`);
      busy = true;
      error.hidden = true;
      container.dataset.projectStatus = 'busy';
      status.textContent = '선택한 원본 파일을 읽습니다.';
      progress.setValue(null);
      refresh();
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!disposed && token === generation) consume(bytes, token);
    } catch (cause) {
      if (!disposed && token === generation) {
        busy = false;
        fail(cause);
        refresh();
      }
    }
  }
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (file)
      void readFile(file, PROJECT_LIMITS.archiveBytes, (bytes, token) =>
        runPackage({ id: projectItemId('import'), operation: 'import', bytes }, token)
      );
  });
  artifactInput.addEventListener('change', () => {
    const file = artifactInput.files?.[0];
    artifactInput.value = '';
    const snapshot = bundle,
      runId = editor.runSelect.value;
    if (file && snapshot && runId)
      void readFile(file, PROJECT_LIMITS.fileBytes, (bytes, token) =>
        runPackage(
          {
            id: projectItemId('attach'),
            operation: 'attach',
            bundle: snapshot,
            options: { runId, filename: file.name, data: bytes }
          },
          token
        )
      );
  });
  if (bundle || pending) {
    syncMetadata();
    ready(
      '이 페이지의 연구 프로젝트를 복원했습니다. 시스템을 바꾸어 같은 프로젝트에 run을 추가할 수 있습니다. 새로고침 전에는 ZIP 또는 로컬 저장으로 보존하세요.'
    );
  }
  refresh();
  return {
    update: refresh,
    dispose() {
      saveResearchProjectSession(document, { bundle, previous, pending });
      disposed = true;
      generation += 1;
      job?.dispose();
      for (const timer of timers) clearTimeout(timer);
      for (const url of urls) URL.revokeObjectURL(url);
      timers.clear();
      urls.clear();
    }
  };
}
