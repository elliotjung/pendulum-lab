import { uiTaskQueue, type UiTaskQueue } from './UiTaskQueue';

export class DiagnosticsScheduler {
  private phase = 0;

  constructor(
    private readonly plotCount: number,
    private readonly queue: UiTaskQueue = uiTaskQueue
  ) {}

  reset(): void {
    this.phase = 0;
    this.queue.clear('lab-side-plot');
  }

  shouldRun(frameCount: number, interval: number): boolean {
    return interval > 0 && frameCount % interval === 0;
  }

  schedule(options: { frameCount: number; interval: number; visible(): boolean; draw(plotIndex: number): void }): void {
    if (!this.shouldRun(options.frameCount, options.interval) || !options.visible()) return;
    this.queue.schedule({
      key: 'lab-side-plot',
      priority: -10,
      run: () => {
        if (!options.visible()) return;
        const plotIndex = this.phase;
        this.phase = (this.phase + 1) % this.plotCount;
        options.draw(plotIndex);
      }
    });
  }

  pendingCount(): number {
    return this.queue.pendingCount();
  }
}
