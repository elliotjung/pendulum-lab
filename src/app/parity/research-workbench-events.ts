const RESEARCH_WORKBENCH_CHANGED_EVENT = 'pendulum-lab:research-workbench-changed';

let installed = false;
let renderScheduled = false;
let renderWorkbench: (() => void) | null = null;

function scheduleRender(): void {
  if (renderScheduled || !renderWorkbench) return;
  renderScheduled = true;
  const render = () => {
    renderScheduled = false;
    renderWorkbench?.();
  };
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(render);
  } else {
    setTimeout(render, 0);
  }
}

export function dispatchResearchWorkbenchChanged(entryId: string): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(RESEARCH_WORKBENCH_CHANGED_EVENT, { detail: { entryId } }));
}

export function installResearchWorkbenchEventBridge(render: () => void): void {
  renderWorkbench = render;
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener(RESEARCH_WORKBENCH_CHANGED_EVENT, scheduleRender);
}

export function disposeResearchWorkbenchEventBridge(): void {
  if (installed && typeof window !== 'undefined') {
    window.removeEventListener(RESEARCH_WORKBENCH_CHANGED_EVENT, scheduleRender);
  }
  installed = false;
  renderScheduled = false;
  renderWorkbench = null;
}
