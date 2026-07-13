import { describe, expect, it } from 'vitest';
import { evaluatePerformanceBudget, renderProgressively } from '../src/render/progressive';

describe('progressive renderer', () => {
  it('draws every item exactly once across chunks', async () => {
    const drawn: boolean[] = new Array(1000).fill(false);
    const result = await renderProgressively(
      1000,
      (start, end) => {
        for (let i = start; i < end; i += 1) {
          expect(drawn[i]).toBe(false);
          drawn[i] = true;
        }
      },
      { budgetMs: 1, minChunk: 16 }
    );
    expect(result.completed).toBe(true);
    expect(result.itemsDrawn).toBe(1000);
    expect(result.chunks).toBeGreaterThan(1);
    expect(drawn.every(Boolean)).toBe(true);
  });

  it('stops between chunks when cancelled (backpressure)', async () => {
    let calls = 0;
    const result = await renderProgressively(
      10_000,
      () => {
        calls += 1;
      },
      { minChunk: 10, shouldCancel: () => calls >= 3 }
    );
    expect(result.completed).toBe(false);
    expect(result.itemsDrawn).toBeLessThan(10_000);
  });

  it('adapts the chunk size downward when a chunk overruns the budget', async () => {
    let clock = 0;
    const result = await renderProgressively(
      400,
      () => {
        clock += 50; // every chunk "takes" 50ms against a 8ms budget
      },
      { minChunk: 100, budgetMs: 8, now: () => clock }
    );
    expect(result.completed).toBe(true);
    // Chunk shrinks to minChunk: 400/100 = 4 chunks.
    expect(result.chunks).toBe(4);
  });

  it('reports progress monotonically', async () => {
    const seen: number[] = [];
    await renderProgressively(100, () => undefined, { minChunk: 25, onProgress: (done) => seen.push(done) });
    expect(seen[seen.length - 1]).toBe(100);
    for (let i = 1; i < seen.length; i += 1) expect(seen[i]!).toBeGreaterThan(seen[i - 1]!);
  });
});

describe('performance budget evaluation', () => {
  const healthy = {
    fps: 60,
    physicsMsPerFrame: 2,
    usedHeapBytes: 100 * 1024 * 1024,
    heapLimitBytes: 2048 * 1024 * 1024,
    workerPoolSize: 2,
    jobsInFlight: 3,
    localStorageBytes: 50 * 1024,
    idbUsageFraction: 0.05
  };

  it('passes a healthy system on every budget', () => {
    const rows = evaluatePerformanceBudget(healthy);
    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.ok)).toBe(true);
  });

  it('flags each violated budget independently', () => {
    expect(evaluatePerformanceBudget({ ...healthy, fps: 15 }).find((row) => row.metric === 'frame rate')!.ok).toBe(
      false
    );
    expect(
      evaluatePerformanceBudget({ ...healthy, physicsMsPerFrame: 20 }).find(
        (row) => row.metric === 'physics per frame'
      )!.ok
    ).toBe(false);
    expect(
      evaluatePerformanceBudget({ ...healthy, usedHeapBytes: 1800 * 1024 * 1024 }).find(
        (row) => row.metric === 'js heap'
      )!.ok
    ).toBe(false);
    expect(
      evaluatePerformanceBudget({ ...healthy, jobsInFlight: 99 }).find((row) => row.metric === 'worker jobs in flight')!
        .ok
    ).toBe(false);
    expect(
      evaluatePerformanceBudget({ ...healthy, localStorageBytes: 5 * 1024 * 1024 }).find(
        (row) => row.metric === 'localStorage payload'
      )!.ok
    ).toBe(false);
    expect(
      evaluatePerformanceBudget({ ...healthy, idbUsageFraction: 0.95 }).find((row) => row.metric === 'IndexedDB quota')!
        .ok
    ).toBe(false);
  });

  it('treats unavailable metrics as not-violated (n/a)', () => {
    const rows = evaluatePerformanceBudget({
      fps: null,
      physicsMsPerFrame: null,
      usedHeapBytes: null,
      heapLimitBytes: null,
      workerPoolSize: 1,
      jobsInFlight: 0,
      localStorageBytes: null,
      idbUsageFraction: null
    });
    expect(rows.every((row) => row.ok)).toBe(true);
    expect(rows.find((row) => row.metric === 'js heap')!.value).toContain('n/a');
  });
});
