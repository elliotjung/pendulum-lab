import { CanvasResizeCoordinator } from './CanvasResizeCoordinator';
import { pageDom as dom } from './DomBinder';

/** Owns Lab resize/visibility observers independently of simulation state. */
export class LabCanvasLifecycle {
  private readonly resizeCoordinator: CanvasResizeCoordinator;
  private readonly listeners = new AbortController();
  private installed = false;

  constructor(
    onResize: () => void,
    private readonly onVisibilityChange: () => void
  ) {
    this.resizeCoordinator = new CanvasResizeCoordinator(onResize);
  }

  install(): void {
    if (!this.installed) {
      this.installed = true;
      document.addEventListener('visibilitychange', this.onVisibilityChange, { signal: this.listeners.signal });
    }
    this.refresh();
  }

  refresh(): void {
    this.resizeCoordinator.observe([
      dom.el('tab-lab'),
      dom.el('main'),
      ...['energy', 'lyap', 'phase', 'poincare', 'fft'].map((id) => dom.el(id))
    ]);
  }

  dispose(): void {
    this.listeners.abort();
    this.resizeCoordinator.dispose();
  }
}
