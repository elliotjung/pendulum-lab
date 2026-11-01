import '../../../../css/product/stability.css';
import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import type { DiagnosticsOptions } from './diagnostics';

/** Numerical providers load only when the user opens this workflow. */
export function createStability(document: Document, options: DiagnosticsOptions) {
  const container = element(document, 'details', 'lab-details stability-workflow');
  container.id = 'stability-workflow';
  container.dataset.stabilityStatus = 'empty';
  container.append(element(document, 'summary', '', '고정점 · 주기궤도 · 분기와 안정성'));
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  const retry = createButton(document, {
    label: '안정성 도구 다시 불러오기',
    variant: 'secondary',
    onClick: () => void load()
  });
  retry.hidden = true;
  container.append(notice, retry);
  let panel: ReturnType<typeof import('./stability-panel').createStabilityPanel> | undefined;
  let pending = false,
    disposed = false;
  async function load() {
    if (pending || disposed || panel) return;
    pending = true;
    retry.hidden = true;
    notice.textContent = '안정성 도구를 불러옵니다.';
    try {
      const module = await import('./stability-panel');
      if (disposed) return;
      panel = module.createStabilityPanel(document, options, container);
      panel.refresh();
      notice.remove();
      retry.remove();
    } catch {
      if (disposed) return;
      panel?.dispose();
      panel = undefined;
      container.querySelector('.stability-body')?.remove();
      notice.textContent =
        '안정성 도구를 불러오지 못했습니다. 연결을 확인하고 다시 불러오세요. 현재 실험은 보존했습니다.';
      retry.hidden = false;
      container.append(notice, retry);
      container.dataset.stabilityStatus = 'error';
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
