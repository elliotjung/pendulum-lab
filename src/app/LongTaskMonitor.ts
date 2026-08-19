export interface LongTaskSnapshot {
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
}

interface LongTaskSample {
  at: number;
  duration: number;
}

const DEFAULT_WINDOW_MS = 5_000;
const MAX_SAMPLES = 64;

/**
 * Rolling PerformanceObserver view of main-thread long tasks. Browsers that do
 * not expose the Long Tasks API simply report an empty snapshot.
 */
export class LongTaskMonitor {
  private readonly samples: LongTaskSample[] = [];
  private observer: PerformanceObserver | null = null;

  constructor(
    private readonly windowMs = DEFAULT_WINDOW_MS,
    autoStart = true
  ) {
    if (!Number.isFinite(windowMs) || windowMs <= 0) throw new RangeError('long-task window must be positive');
    if (autoStart) this.start();
  }

  start(): void {
    if (this.observer || typeof PerformanceObserver === 'undefined') return;
    try {
      this.observer = new PerformanceObserver((list) => {
        const observedAt = now();
        for (const entry of list.getEntries()) this.record(entry.duration, observedAt);
      });
      this.observer.observe({ type: 'longtask', buffered: true } as PerformanceObserverInit);
    } catch {
      this.observer?.disconnect();
      this.observer = null;
    }
  }

  /** Public for deterministic tests and non-PerformanceObserver integrations. */
  record(durationMs: number, timestampMs = now()): void {
    if (!Number.isFinite(durationMs) || durationMs < 0 || !Number.isFinite(timestampMs)) return;
    this.samples.push({ at: timestampMs, duration: durationMs });
    if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, this.samples.length - MAX_SAMPLES);
    this.prune(timestampMs);
  }

  snapshot(timestampMs = now()): LongTaskSnapshot {
    this.prune(timestampMs);
    let totalDurationMs = 0;
    let maxDurationMs = 0;
    for (const sample of this.samples) {
      totalDurationMs += sample.duration;
      maxDurationMs = Math.max(maxDurationMs, sample.duration);
    }
    return { count: this.samples.length, totalDurationMs, maxDurationMs };
  }

  reset(): void {
    this.samples.length = 0;
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.reset();
  }

  private prune(timestampMs: number): void {
    const cutoff = timestampMs - this.windowMs;
    let stale = 0;
    while (stale < this.samples.length && this.samples[stale]!.at < cutoff) stale += 1;
    if (stale > 0) this.samples.splice(0, stale);
  }
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
