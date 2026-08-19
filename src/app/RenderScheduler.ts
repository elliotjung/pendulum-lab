import { LongTaskMonitor, type LongTaskSnapshot } from './LongTaskMonitor';

const FRAME_WINDOW = 30;

export class RenderScheduler {
  private lastFrameTs = 0;
  private readonly frameTimes = new Float64Array(FRAME_WINDOW);
  private frameIndex = 0;
  private frameCount = 0;

  fps = 0;
  renderMs = 0;

  constructor(private readonly longTasks = new LongTaskMonitor()) {}

  reset(): void {
    this.lastFrameTs = 0;
    this.frameTimes.fill(0);
    this.frameIndex = 0;
    this.frameCount = 0;
    this.fps = 0;
    this.renderMs = 0;
    this.longTasks.reset();
  }

  markFrame(timestamp = now()): number {
    if (this.lastFrameTs) {
      this.frameTimes[this.frameIndex] = timestamp - this.lastFrameTs;
      this.frameIndex = (this.frameIndex + 1) % FRAME_WINDOW;
      this.frameCount = Math.min(FRAME_WINDOW, this.frameCount + 1);
    }
    this.lastFrameTs = timestamp;
    let total = 0;
    for (let i = 0; i < this.frameCount; i += 1) total += this.frameTimes[i]!;
    const avg = total / (this.frameCount || 1);
    this.fps = avg > 0 ? 1000 / avg : 0;
    return this.fps;
  }

  measureRender<T>(render: () => T): T {
    const started = now();
    try {
      return render();
    } finally {
      this.renderMs = now() - started;
    }
  }

  sampleCount(): number {
    return this.frameCount;
  }

  longTaskSnapshot(): LongTaskSnapshot {
    return this.longTasks.snapshot();
  }

  dispose(): void {
    this.longTasks.dispose();
  }
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
