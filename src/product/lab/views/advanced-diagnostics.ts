import '../../../../css/product/advanced-diagnostics.css';
import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import type { DiagnosticsOptions } from './diagnostics';

/** This facade carries no analysis provider or numerical code until first opened. */
export function createAdvancedDiagnostics(document: Document, options: DiagnosticsOptions) {
  const container = element(document, 'details', 'lab-details advanced-diagnostics');
  container.id = 'advanced-diagnostics';
  container.dataset.advancedDiagnosticStatus = 'empty';
  container.append(element(document, 'summary', '', '고급 카오스 · 수송 · 인력권 분석'));
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  const retry = createButton(document, {
    label: '고급 분석 도구 다시 불러오기',
    variant: 'secondary',
    onClick: () => void load()
  });
  retry.hidden = true;
  container.append(notice, retry);
  let panel: ReturnType<typeof import('./advanced-diagnostics-panel').createAdvancedDiagnosticsPanel> | undefined;
  let pending = false;
  let disposed = false;
  async function load() {
    if (pending || disposed || panel) return;
    pending = true;
    retry.hidden = true;
    notice.textContent = '고급 분석 도구를 불러옵니다.';
    try {
      const module = await import('./advanced-diagnostics-panel');
      if (disposed) return;
      panel = module.createAdvancedDiagnosticsPanel(document, options, container);
      panel.refresh();
      notice.remove();
      retry.remove();
    } catch {
      if (disposed) return;
      panel?.dispose();
      panel = undefined;
      container.querySelector('.advanced-diagnostics-body')?.remove();
      notice.textContent =
        '고급 분석 도구를 불러오지 못했습니다. 연결을 확인하고 다시 불러오세요. 현재 실험은 보존했습니다.';
      retry.hidden = false;
      container.append(notice, retry);
      container.dataset.advancedDiagnosticStatus = 'error';
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
