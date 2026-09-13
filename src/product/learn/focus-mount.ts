import { element } from '../app/dom';
import { createButton } from '../design-system/primitives';
import type { LearnUnit } from './schema';

/** Engine-containing Focus chunks load only on a published unit. Cancel detaches stale imports. */
export function mountFocus(document: Document, unit: LearnUnit) {
  const root = element(document, 'section', 'learn-section focus-mount');
  root.setAttribute('aria-label', '전용 실험');
  let disposed = false;
  let generation = 0;
  let disposeView: (() => void) | undefined;
  function recovery(state: 'error' | 'cancelled') {
    root.dataset.focusLoad = state;
    root.removeAttribute('aria-busy');
    const title = element(
      document,
      'h2',
      '',
      state === 'error' ? '실험을 불러오지 못했습니다' : '실험 불러오기를 취소했습니다'
    );
    title.tabIndex = -1;
    const message = element(document, 'p', '', '단원과 저장된 설정은 유지했습니다. 다시 시도할 수 있습니다.');
    message.setAttribute('role', state === 'error' ? 'alert' : 'status');
    root.replaceChildren(
      title,
      message,
      createButton(document, {
        label: '실험 다시 시도',
        onClick: () => {
          if (state === 'error') document.defaultView?.location.reload();
          else void load();
        }
      })
    );
    title.focus();
  }
  async function load() {
    const current = ++generation;
    root.dataset.focusLoad = 'loading';
    root.setAttribute('aria-busy', 'true');
    const status = element(document, 'p', '', '전용 실험을 불러오는 중입니다.');
    status.setAttribute('role', 'status');
    root.replaceChildren(
      status,
      createButton(document, {
        label: '실험 불러오기 취소',
        variant: 'secondary',
        onClick() {
          generation++;
          recovery('cancelled');
        }
      })
    );
    try {
      const module = await import('../experiments/view');
      if (disposed || current !== generation) return;
      const view = module.createFocusView(document, unit);
      disposeView = view.dispose;
      root.dataset.focusLoad = 'ready';
      root.removeAttribute('aria-busy');
      root.replaceChildren(view.element);
    } catch {
      if (!disposed && current === generation) recovery('error');
    }
  }
  void load();
  return {
    element: root,
    dispose() {
      disposed = true;
      generation++;
      disposeView?.();
    }
  };
}
