/**
 * Progressive rendering with a per-frame time budget. Long raster jobs
 * (heatmaps, basin grids) draw in chunks that yield to the event loop between
 * frames, so the UI stays responsive and a cancellation flag provides
 * backpressure when the user navigates away mid-draw.
 */

export interface ProgressiveRenderOptions {
  /** Time budget per chunk in milliseconds. Default 8 (half a 60 Hz frame). */
  budgetMs?: number;
  /** Minimum items per chunk regardless of budget. Default 64. */
  minChunk?: number;
  /** Polled between chunks; return true to stop. */
  shouldCancel?: () => boolean;
  onProgress?: (done: number, total: number) => void;
  now?: () => number;
}

export interface ProgressiveRenderResult {
  completed: boolean;
  itemsDrawn: number;
  chunks: number;
}

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });

/**
 * Draw `total` items via `drawRange(start, endExclusive)` in budgeted chunks.
 * The chunk size adapts: it grows while drawing is fast and shrinks when a
 * chunk overruns the budget.
 */
export async function renderProgressively(
  total: number,
  drawRange: (start: number, endExclusive: number) => void,
  options: ProgressiveRenderOptions = {}
): Promise<ProgressiveRenderResult> {
  const budgetMs = options.budgetMs ?? 8;
  const minChunk = Math.max(1, options.minChunk ?? 64);
  const now = options.now ?? (() => (typeof performance === 'undefined' ? Date.now() : performance.now()));
  let cursor = 0;
  let chunk = minChunk;
  let chunks = 0;
  while (cursor < total) {
    if (options.shouldCancel?.()) return { completed: false, itemsDrawn: cursor, chunks };
    const end = Math.min(total, cursor + chunk);
    const started = now();
    drawRange(cursor, end);
    const elapsed = now() - started;
    cursor = end;
    chunks += 1;
    options.onProgress?.(cursor, total);
    // Adapt the chunk size toward the budget.
    if (elapsed > budgetMs && chunk > minChunk) chunk = Math.max(minChunk, Math.floor(chunk / 2));
    else if (elapsed < budgetMs / 2) chunk = Math.min(total, chunk * 2);
    if (cursor < total) await nextFrame();
  }
  return { completed: true, itemsDrawn: cursor, chunks };
}

export interface PerformanceBudget {
  metric: string;
  value: string;
  /** Budget expressed as text for the panel. */
  budget: string;
  ok: boolean;
}

export interface PerfBudgetInput {
  fps: number | null;
  physicsMsPerFrame: number | null;
  usedHeapBytes: number | null;
  heapLimitBytes: number | null;
  workerPoolSize: number;
  jobsInFlight: number;
  localStorageBytes: number | null;
  idbUsageFraction: number | null;
}

/** Evaluate the Research Workbench performance budget table. */
export function evaluatePerformanceBudget(input: PerfBudgetInput): PerformanceBudget[] {
  const rows: PerformanceBudget[] = [];
  rows.push({
    metric: 'frame rate',
    value: input.fps === null ? 'n/a' : `${input.fps.toFixed(0)} fps`,
    budget: '>= 30 fps',
    ok: input.fps === null || input.fps >= 30
  });
  rows.push({
    metric: 'physics per frame',
    value: input.physicsMsPerFrame === null ? 'n/a' : `${input.physicsMsPerFrame.toFixed(2)} ms`,
    budget: '<= 8 ms',
    ok: input.physicsMsPerFrame === null || input.physicsMsPerFrame <= 8
  });
  const heapMb = input.usedHeapBytes === null ? null : input.usedHeapBytes / 1024 / 1024;
  const heapFraction =
    input.usedHeapBytes !== null && input.heapLimitBytes ? input.usedHeapBytes / input.heapLimitBytes : null;
  rows.push({
    metric: 'js heap',
    value:
      heapMb === null
        ? 'n/a (Chromium only)'
        : `${heapMb.toFixed(0)} MiB${heapFraction !== null ? ` (${(heapFraction * 100).toFixed(0)}% of limit)` : ''}`,
    budget: '<= 70% of limit',
    ok: heapFraction === null || heapFraction <= 0.7
  });
  rows.push({
    metric: 'worker jobs in flight',
    value: `${input.jobsInFlight} (pool ${input.workerPoolSize})`,
    budget: `<= ${input.workerPoolSize * 4} (backpressure)`,
    ok: input.jobsInFlight <= input.workerPoolSize * 4
  });
  rows.push({
    metric: 'localStorage payload',
    value: input.localStorageBytes === null ? 'n/a' : `${(input.localStorageBytes / 1024).toFixed(1)} KiB`,
    budget: '<= 2048 KiB',
    ok: input.localStorageBytes === null || input.localStorageBytes <= 2048 * 1024
  });
  rows.push({
    metric: 'IndexedDB quota',
    value: input.idbUsageFraction === null ? 'n/a' : `${(input.idbUsageFraction * 100).toFixed(1)}% used`,
    budget: '<= 80%',
    ok: input.idbUsageFraction === null || input.idbUsageFraction <= 0.8
  });
  return rows;
}
