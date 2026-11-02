import '../../../../css/product/experiments.css';
import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import type { DiagnosticsOptions } from '../views/diagnostics';

/** Builders and numerical providers load only after the user opens the tray. */
export function createExperimentWorkflow(document: Document, options: DiagnosticsOptions) {
  const container = element(document, 'details', 'lab-details batch-experiments');
  container.id = 'batch-experiments';
  container.dataset.batchStatus = 'empty';
  container.append(element(document, 'summary', '', '비교 · sweep · ensemble · 적분기 비교'));
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  const retry = createButton(document, {
    label: '다중 실험 도구 다시 불러오기',
    variant: 'secondary',
    onClick: () => void load()
  });
  retry.hidden = true;
  container.append(notice, retry);
  let panel: ReturnType<typeof import('./panel').createExperimentPanel> | undefined;
  let pending = false,
    disposed = false;
  async function load() {
    if (pending || disposed || panel) return;
    pending = true;
    retry.hidden = true;
    notice.textContent = '다중 실험 도구를 불러옵니다.';
    try {
      const module = await import('./panel');
      if (disposed) return;
      panel = module.createExperimentPanel(document, options, container);
      notice.remove();
      retry.remove();
    } catch {
      if (disposed) return;
      panel?.dispose();
      panel = undefined;
      container.querySelector('.batch-body')?.remove();
      notice.textContent = '다중 실험 도구를 불러오지 못했습니다. 연결을 확인하고 다시 불러오세요.';
      retry.hidden = false;
      container.dataset.batchStatus = 'error';
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
