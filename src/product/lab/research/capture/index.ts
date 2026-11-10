import { element } from '../../../app/dom';
import type { ObservationPreview } from '../../../observations/types';

/** Hardware controllers load on discovery; permission remains an explicit button action. */
export function createLiveObservationCapture(
  document: Document,
  options: { onPreview(preview: ObservationPreview): void }
) {
  const root = element(document, 'details', 'lab-details');
  root.id = 'research-live-capture';
  root.append(element(document, 'summary', '', '실시간 센서 · 카메라 관측 채집'));
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  root.append(notice);
  let panel: ReturnType<typeof import('./panel').createCapturePanel> | undefined;
  let loading = false,
    disabled = false,
    disposed = false;
  const cleanupVisibility: Array<() => void> = [];
  root.addEventListener('toggle', () => {
    if (root.open) void load();
    else panel?.stop();
  });
  async function load() {
    if (disposed || loading || panel) return;
    loading = true;
    notice.textContent = '실시간 관측 도구를 준비합니다. 아직 장치 권한을 요청하지 않았습니다.';
    try {
      const module = await import('./panel');
      if (disposed) return;
      panel = module.createCapturePanel(document, options);
      panel.setDisabled(disabled);
      root.append(panel.element);
      for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor.tagName === 'DETAILS') {
          const details = ancestor as HTMLDetailsElement;
          const closed = () => {
            if (!details.open) panel?.stop();
          };
          details.addEventListener('toggle', closed);
          cleanupVisibility.push(() => details.removeEventListener('toggle', closed));
        }
        if (ancestor.getAttribute('role') === 'tabpanel') {
          const tab = ancestor;
          const observer = new MutationObserver(() => {
            if (tab.hidden) panel?.stop();
          });
          observer.observe(tab, { attributes: true, attributeFilter: ['hidden'] });
          cleanupVisibility.push(() => observer.disconnect());
        }
      }
      notice.remove();
    } catch {
      if (!disposed) notice.textContent = '도구를 불러오지 못했습니다. 닫았다가 다시 열어 재시도하세요.';
    } finally {
      loading = false;
    }
  }
  return {
    element: root,
    setDisabled(value: boolean) {
      disabled = value;
      panel?.setDisabled(value);
    },
    dispose() {
      disposed = true;
      cleanupVisibility.forEach((cleanup) => cleanup());
      cleanupVisibility.length = 0;
      panel?.dispose();
    }
  };
}
