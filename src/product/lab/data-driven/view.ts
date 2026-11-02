import '../../../../css/product/data-driven.css';
import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import type { DiagnosticsOptions } from '../views/diagnostics';

/** Numerical fitting and eigensolver providers load when the user opens this section. */
export function createDataDrivenWorkflow(document: Document, options: DiagnosticsOptions) {
  const container = element(document, 'details', 'lab-details data-model-workflow');
  container.id = 'data-driven-research';
  container.dataset.dataModelStatus = 'empty';
  container.append(element(document, 'summary', '', '데이터 기반 모델 · 대규모 고유해석'));
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  const retry = createButton(document, {
    label: '데이터 모델 도구 다시 불러오기',
    variant: 'secondary',
    onClick: () => void load()
  });
  retry.hidden = true;
  container.append(notice, retry);
  let panel: ReturnType<typeof import('./panel').createDataDrivenPanel> | undefined;
  let loading = false,
    disposed = false;
  async function load() {
    if (loading || disposed || panel) return;
    loading = true;
    notice.textContent = '데이터 기반 모델과 고유해석 도구를 불러옵니다.';
    retry.hidden = true;
    try {
      const module = await import('./panel');
      if (disposed) return;
      panel = module.createDataDrivenPanel(document, options, container);
      notice.remove();
      retry.remove();
    } catch {
      if (disposed) return;
      panel?.dispose();
      panel = undefined;
      container.querySelector('.data-model-body')?.remove();
      notice.textContent = '도구를 불러오지 못했습니다. 연결을 확인하고 다시 불러오세요.';
      container.dataset.dataModelStatus = 'error';
      retry.hidden = false;
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
