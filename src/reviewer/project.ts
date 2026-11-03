import './project.css';
import { element, link } from '../product/app/dom';
import { PROJECT_LIMITS, type ResearchProjectBundle } from '../product/provenance/contracts';
import { createProjectPackageJob } from '../product/lab/projects/client';
import { renderResearchFigure, researchReportMarkdown } from '../product/provenance/render';
import { svgToDataUrl } from '../research/figurePipeline';

/** This route imports local evidence only; the existing release console remains independent. */
export function mountResearchReviewer(document: Document): void {
  const root = document.querySelector<HTMLElement>('#reviewer-root');
  if (!root) throw new Error('Reviewer root is missing.');
  document.documentElement.lang = 'ko';
  const main = element(document, 'main', 'research-reviewer');
  const heading = element(document, 'h1', '', '연구 패키지 검토');
  const label = element(document, 'label', '', '재현 ZIP 선택 · 새 프로젝트 또는 기존 research export');
  label.htmlFor = 'research-reviewer-file';
  const file = element(document, 'input', '');
  file.id = label.htmlFor;
  file.type = 'file';
  file.accept = '.zip,application/zip';
  const actions = element(document, 'div', 'research-reviewer-actions');
  const cancel = element(document, 'button', '', '패키지 검증 취소');
  cancel.type = 'button';
  cancel.disabled = true;
  const download = element(document, 'button', '', '오프라인 검토 HTML 다운로드');
  download.type = 'button';
  download.disabled = true;
  actions.append(cancel, download);
  const progress = element(document, 'progress', '');
  progress.max = 1;
  progress.value = 0;
  progress.setAttribute('aria-label', '패키지 검증 진행');
  const status = element(document, 'p', '', 'ZIP을 선택하면 경로·manifest·checksum과 원본 artifact를 검증합니다.');
  status.id = 'research-reviewer-status';
  status.setAttribute('role', 'status');
  const error = element(document, 'p', 'reviewer-error');
  error.id = 'research-reviewer-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const preview = element(document, 'section', '');
  preview.id = 'research-reviewer-preview';
  preview.setAttribute('aria-label', '검증된 연구 프로젝트');
  main.append(
    link(document, '기존 배포 증거 콘솔', './reviewer.html'),
    heading,
    element(
      document,
      'p',
      '',
      '외부 첨부의 HTML·SVG·script를 실행하지 않습니다. 체크섬은 내부 무결성 검사이며 출처나 과학적 정확성을 인증하지 않습니다. 브라우저 저장 내용을 변경하지 않습니다.'
    ),
    label,
    file,
    actions,
    progress,
    status,
    error,
    preview
  );
  root.replaceChildren(main);
  let job: ReturnType<typeof createProjectPackageJob> | undefined;
  let bundle: ResearchProjectBundle | undefined;
  let generation = 0;
  const urls = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const fail = (cause: unknown) => {
    error.textContent = cause instanceof Error ? cause.message : String(cause);
    error.hidden = false;
    status.textContent = '패키지를 열지 못했습니다. 앞서 검증한 프로젝트는 보존했습니다.';
    file.disabled = false;
    cancel.disabled = true;
    download.disabled = !bundle;
  };
  file.addEventListener('change', () => {
    const selected = file.files?.[0];
    file.value = '';
    if (!selected) return;
    const token = ++generation;
    job?.dispose();
    error.hidden = true;
    if (!selected.size || selected.size > PROJECT_LIMITS.archiveBytes) {
      fail(new Error('비어 있지 않은 64 MiB 이하 ZIP을 선택하세요.'));
      return;
    }
    file.disabled = true;
    cancel.disabled = false;
    download.disabled = true;
    progress.value = 0;
    status.textContent = '로컬 ZIP을 읽고 검증 worker를 시작합니다.';
    void selected
      .arrayBuffer()
      .then((buffer) => {
        if (token !== generation) return;
        job = createProjectPackageJob(
          { id: `reviewer_${token}`, operation: 'import', bytes: new Uint8Array(buffer) },
          (event) => {
            if (token !== generation) return;
            if (event.type === 'progress') {
              progress.value = event.fraction;
              status.textContent = event.message;
            } else if (event.type === 'imported') {
              bundle = event.bundle;
              progress.value = 1;
              file.disabled = false;
              cancel.disabled = true;
              download.disabled = false;
              renderPreview(bundle);
              status.textContent = `패키지 검증 완료 · ${bundle.project.title} · run ${bundle.project.runs.length}개 · artifact ${bundle.project.artifacts.length}개. 사람 검토는 별도로 필요합니다.`;
            } else if (event.type === 'error') fail(new Error(event.message));
          }
        );
      })
      .catch((cause: unknown) => {
        if (token === generation) fail(cause);
      });
  });
  cancel.addEventListener('click', () => {
    generation++;
    job?.cancel();
    job = undefined;
    file.disabled = false;
    cancel.disabled = true;
    download.disabled = !bundle;
    status.textContent = '검증을 취소했습니다. 이전 검토 결과는 보존했습니다.';
  });
  function renderPreview(value: ResearchProjectBundle) {
    preview.replaceChildren();
    preview.append(element(document, 'h2', '', value.project.title));
    const report = element(document, 'pre', 'research-reviewer-report', researchReportMarkdown(value));
    const figures = element(document, 'div', '');
    const figureLabel = element(document, 'label', '', '검토할 그림');
    figureLabel.htmlFor = 'research-reviewer-figure';
    const select = element(document, 'select', '');
    select.id = figureLabel.htmlFor;
    for (const figure of value.project.figures) {
      const option = element(document, 'option', '', figure.title);
      option.value = figure.id;
      select.append(option);
    }
    function showFigure() {
      const figure = value.project.figures.find((item) => item.id === select.value);
      figures.replaceChildren();
      if (!figure) return;
      const node = element(document, 'figure', '');
      try {
        const rendered = renderResearchFigure(value, figure);
        const image = element(document, 'img', '');
        image.src = svgToDataUrl(rendered.svg);
        image.alt = rendered.description;
        node.append(image, element(document, 'figcaption', '', rendered.description));
      } catch (cause) {
        node.append(element(document, 'p', 'reviewer-error', cause instanceof Error ? cause.message : String(cause)));
      }
      figures.append(node);
    }
    select.addEventListener('change', showFigure);
    if (value.project.figures.length) preview.append(figureLabel, select, figures);
    showFigure();
    const details = element(document, 'details', '');
    details.append(
      element(document, 'summary', '', '원 project/session/run/artifact manifest'),
      element(document, 'pre', '', JSON.stringify(value.project, null, 2))
    );
    preview.append(report, details);
  }
  download.addEventListener('click', () => {
    if (!bundle) return;
    const value = bundle;
    const token = ++generation;
    job?.dispose();
    file.disabled = true;
    download.disabled = true;
    cancel.disabled = false;
    error.hidden = true;
    status.textContent = '검증 worker에서 오프라인 검토 파일을 만듭니다.';
    job = createProjectPackageJob({ id: `reviewer_export_${token}`, operation: 'reviewer', bundle: value }, (event) => {
      if (token !== generation) return;
      if (event.type === 'progress') {
        progress.value = event.fraction;
        status.textContent = event.message;
        return;
      }
      if (event.type === 'error') {
        fail(new Error(event.message));
        return;
      }
      if (event.type !== 'reviewed') return;
      try {
        const url = URL.createObjectURL(new Blob([new Uint8Array(event.bytes)], { type: 'text/html;charset=utf-8' }));
        urls.add(url);
        const anchor = element(document, 'a', '');
        anchor.href = url;
        anchor.download = `research-${value.project.id}-reviewer.html`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        const timer = setTimeout(() => {
          URL.revokeObjectURL(url);
          urls.delete(url);
          timers.delete(timer);
        }, 1000);
        timers.add(timer);
        file.disabled = false;
        download.disabled = false;
        cancel.disabled = true;
        status.textContent = '오프라인 검토 HTML을 만들었습니다. 내려받은 파일은 네트워크 없이 열 수 있습니다.';
      } catch (cause) {
        fail(cause);
      }
    });
  });
  document.defaultView?.addEventListener(
    'pagehide',
    () => {
      generation++;
      job?.dispose();
      for (const timer of timers) clearTimeout(timer);
      for (const url of urls) URL.revokeObjectURL(url);
    },
    { once: true }
  );
}
