/**
 * Small lifecycle owner for the lazily installed research/governance surface.
 * Installers may return a cleanup callback; timers and global listeners are
 * registered here as well so a BFCache restore, hot reload, or explicit app
 * teardown cannot leave duplicate background work behind.
 */
export type ParityDisposer = () => void;

export class ParityLifecycle {
  private readonly disposers: ParityDisposer[] = [];
  private disposed = false;

  install(installer: () => void | ParityDisposer): void {
    this.assertActive();
    const cleanup = installer();
    if (typeof cleanup === 'function') this.disposers.push(cleanup);
  }

  interval(callback: () => void, delayMs: number): number {
    this.assertActive();
    const id = window.setInterval(callback, delayMs);
    this.disposers.push(() => window.clearInterval(id));
    return id;
  }

  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean
  ): void {
    this.assertActive();
    target.addEventListener(type, listener as EventListener, options);
    this.disposers.push(() => target.removeEventListener(type, listener as EventListener, options));
  }

  add(cleanup: ParityDisposer): void {
    this.assertActive();
    this.disposers.push(cleanup);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (let index = this.disposers.length - 1; index >= 0; index -= 1) {
      try {
        this.disposers[index]?.();
      } catch (error) {
        console.warn('Pendulum Lab parity cleanup failed.', error);
      }
    }
    this.disposers.length = 0;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Cannot register work on a disposed parity lifecycle');
  }
}
