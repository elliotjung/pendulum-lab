type ResizeTarget = Element | null | undefined;

/**
 * Coalesces element-level resize notifications into one animation-frame
 * callback. This catches rail/panel/lazy-mount changes that never emit a
 * `window.resize` event and provides one disposable ownership point.
 */
export class CanvasResizeCoordinator {
  private observer: ResizeObserver | null = null;
  private rafId: number | null = null;
  private disposed = false;
  private readonly onWindowResize = (): void => this.schedule();

  constructor(private readonly onResize: () => void) {}

  observe(targets: readonly ResizeTarget[]): void {
    if (this.disposed) return;
    this.observer?.disconnect();
    this.observer = null;
    const unique = [...new Set(targets.filter((target): target is Element => target instanceof Element))];
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(() => this.schedule());
      for (const target of unique) this.observer.observe(target);
    }
    window.removeEventListener('resize', this.onWindowResize);
    window.addEventListener('resize', this.onWindowResize, { passive: true });
  }

  request(): void {
    this.schedule();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observer?.disconnect();
    this.observer = null;
    window.removeEventListener('resize', this.onWindowResize);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private schedule(): void {
    if (this.disposed || this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      if (!this.disposed) this.onResize();
    });
  }
}
