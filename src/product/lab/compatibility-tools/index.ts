import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import type { ContractResult } from '../../contracts/validation';
import type { AudioSample } from './audio';
export type { AudioSample } from './audio';

/** No native engine or AudioContext loads until the user opens the optional tools. */
export function createCompatibilityTools(
  document: Document,
  getCanonicalState: () => ContractResult<ExperimentStateV1>
) {
  const container = element(document, 'details', 'lab-details compatibility-tools');
  container.id = 'compatibility-tools';
  container.dataset.compatibilityOgyStatus = 'empty';
  container.append(element(document, 'summary', '', '소리화 · OGY 기준 제어'));
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  let panel: ReturnType<typeof import('./panel').createCompatibilityToolsPanel> | undefined;
  let pending = false;
  let disposed = false;
  let sample: AudioSample = { running: false, omega1: 0, omega2: 0 };
  const retry = createButton(document, {
    label: '소리화·OGY 도구 다시 불러오기',
    variant: 'secondary',
    onClick: () => void load()
  });
  retry.hidden = true;
  container.append(notice, retry);
  async function load() {
    if (disposed || pending || panel) return;
    pending = true;
    retry.hidden = true;
    notice.textContent = '소리화·OGY 도구를 불러옵니다. 소리와 계산은 자동으로 시작하지 않습니다.';
    try {
      const module = await import('./panel');
      if (disposed || !container.open) return;
      panel = module.createCompatibilityToolsPanel(document, getCanonicalState, container);
      panel.updateAudio(sample);
      notice.remove();
      retry.remove();
    } catch {
      if (disposed) return;
      panel?.dispose();
      panel = undefined;
      container.querySelector('.compatibility-tools-body')?.remove();
      notice.textContent = '도구를 불러오지 못했습니다. 원 실험을 유지하고 연결을 확인한 뒤 다시 시도하세요.';
      retry.hidden = false;
      container.append(notice, retry);
    } finally {
      pending = false;
    }
  }
  container.addEventListener('toggle', () => {
    if (container.open) void load();
    else panel?.suspend();
  });
  return {
    element: container,
    updateAudio(next: AudioSample) {
      sample = { ...next };
      panel?.updateAudio(sample);
    },
    invalidate() {
      panel?.invalidate();
    },
    dispose() {
      disposed = true;
      panel?.dispose();
      panel = undefined;
    }
  };
}
