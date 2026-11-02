import '../../../../css/product/research.css';
import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import type { DiagnosticsOptions } from '../views/diagnostics';

/** Import decoders and numerical research providers load on explicit discovery. */
export function createResearchWorkflow(document: Document, options: DiagnosticsOptions) {
  const container = element(document, 'details', 'lab-details research-workflow');
  container.id = 'observation-research';
  container.dataset.researchStatus = 'empty';
  container.append(element(document, 'summary', '', '관측 데이터 · 매개변수 추정 · 불확실성'));
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  const retry = createButton(document, {
    label: '관측·역문제 도구 다시 불러오기',
    variant: 'secondary',
    onClick: () => void load()
  });
  retry.hidden = true;
  container.append(notice, retry);
  let panel: ReturnType<typeof import('./panel').createResearchPanel> | undefined;
  let pending = false,
    disposed = false;
  async function load() {
    if (pending || disposed || panel) return;
    pending = true;
    retry.hidden = true;
    notice.textContent = '관측·역문제 도구를 불러옵니다.';
    try {
      const module = await import('./panel');
      if (disposed) return;
      panel = module.createResearchPanel(document, options, container);
      notice.remove();
      retry.remove();
    } catch {
      if (disposed) return;
      panel?.dispose();
      panel = undefined;
      container.querySelector('.research-body')?.remove();
      notice.textContent = '도구를 불러오지 못했습니다. 연결을 확인하고 다시 불러오세요.';
      retry.hidden = false;
      container.dataset.researchStatus = 'error';
      container.append(notice, retry);
    } finally {
      pending = false;
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
