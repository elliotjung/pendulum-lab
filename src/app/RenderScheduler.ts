export class RenderScheduler {
  private lastFrameTs = 0;
  private readonly frameTimes: number[] = [];

  fps = 0;
  renderMs = 0;

  reset(): void {
    this.lastFrameTs = 0;
    this.frameTimes.length = 0;
    this.fps = 0;
    this.renderMs = 0;
  }

  markFrame(timestamp = now()): number {
    if (this.lastFrameTs) {
      this.frameTimes.push(timestamp - this.lastFrameTs);
      if (this.frameTimes.length > 30) this.frameTimes.shift();
    }
    this.lastFrameTs = timestamp;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / (this.frameTimes.length || 1);
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
    return this.frameTimes.length;
  }
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
