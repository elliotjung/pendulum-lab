import '../../../../css/product/projects.css';
import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import type { DiagnosticsOptions } from '../views/diagnostics';

/** Research package code is loaded only when the user opens the project section. */
export function createResearchProjectWorkflow(document: Document, options: DiagnosticsOptions) {
  const container = element(document, 'details', 'lab-details project-workflow');
  container.id = 'research-project-workflow';
  container.dataset.projectStatus = 'empty';
  container.append(element(document, 'summary', '', '연구 프로젝트 · 재현 패키지'));
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  const retry = createButton(document, {
    label: '연구 프로젝트 도구 다시 불러오기',
    variant: 'secondary',
    onClick: () => void load()
  });
  retry.hidden = true;
  container.append(notice, retry);
  let panel: ReturnType<typeof import('./panel').createResearchProjectPanel> | undefined;
  let loading = false;
  let disposed = false;
  async function load() {
    if (loading || disposed || panel) return;
    loading = true;
    notice.textContent = '연구 프로젝트 도구를 불러옵니다.';
    retry.hidden = true;
    try {
      const module = await import('./panel');
      if (disposed) return;
      panel = module.createResearchProjectPanel(document, options, container);
      notice.remove();
      retry.remove();
    } catch {
      if (disposed) return;
      panel?.dispose();
      panel = undefined;
      container.querySelector('.project-body')?.remove();
      notice.textContent = '연구 도구를 불러오지 못했습니다. 연결을 확인하고 다시 불러오세요.';
      retry.hidden = false;
      container.dataset.projectStatus = 'error';
      container.append(notice, retry);
    } finally {
      loading = false;
    }
  }
  container.addEventListener('toggle', () => {
    if (container.open) void load();
  });
  return {
    element: container,
    update() {
      panel?.update();
    },
    dispose() {
      disposed = true;
      panel?.dispose();
    }
  };
}
