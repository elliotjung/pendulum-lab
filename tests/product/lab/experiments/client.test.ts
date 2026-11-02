import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultPlanarConfig, toCanonicalPlanar } from '../../../../src/product/adapters/physics/planar';
import { buildBatch, defaultBatchSettings } from '../../../../src/product/lab/experiments/builders';
import {
  createBatchExecutor,
  BATCH_WORKER_TIMEOUT_MS,
  type BatchWorker
} from '../../../../src/product/lab/experiments/client';
import { createBatchQueue } from '../../../../src/product/lab/experiments/queue';
import { executeBatchRun } from '../../../../src/product/lab/experiments/execute';
import type { BatchExecutor, BatchWorkerEvent } from '../../../../src/product/lab/experiments/contracts';
function plan() {
  const checked = toCanonicalPlanar({ ...defaultPlanarConfig(), step: 0.01, duration: 0.02 });
  if (!checked.ok) throw new Error('fixture');
  return buildBatch(checked.value, defaultBatchSettings(checked.value));
}
function fake() {
  const terminate = vi.fn(),
    postMessage = vi.fn();
  const worker: BatchWorker = { onmessage: null, onerror: null, onmessageerror: null, postMessage, terminate };
  return { worker, terminate, postMessage };
}
const request = () => {
  const p = plan();
  return { batchId: p.id, run: p.runs[0]! };
};
afterEach(() => vi.useRealTimers());
describe('S21 worker isolation and bounded failure recovery', () => {
  it('binds the exact input identity and ignores foreign events', () => {
    const f = fake(),
      events: BatchWorkerEvent[] = [],
      req = request(),
      job = createBatchExecutor(() => f.worker)(req, (e) => events.push(e));
    f.worker.onmessage!({ data: { type: 'progress', id: 'foreign', fraction: 1 } } as MessageEvent<BatchWorkerEvent>);
    expect(events).toHaveLength(0);
    f.worker.onmessage!({
      data: { type: 'result', id: req.run.id, result: executeBatchRun(req) }
    } as MessageEvent<BatchWorkerEvent>);
    expect(events.map((e) => e.type)).toEqual(['result']);
    expect(f.terminate).toHaveBeenCalledOnce();
    job.dispose();
  });
  it('turns worker startup rejection into a single identified run failure', async () => {
    const events: BatchWorkerEvent[] = [],
      req = request();
    createBatchExecutor(() => {
      throw new Error('denied');
    })(req, (e) => events.push(e));
    await Promise.resolve();
    expect(events).toEqual([
      { type: 'error', id: req.run.id, message: expect.stringContaining('시작하지 못했습니다') }
    ]);
  });
  it('terminates a worker whose initialization post throws', async () => {
    const f = fake(),
      events: BatchWorkerEvent[] = [];
    f.postMessage.mockImplementation(() => {
      throw new Error('clone');
    });
    createBatchExecutor(() => f.worker)(request(), (e) => events.push(e));
    await Promise.resolve();
    expect(f.terminate).toHaveBeenCalledOnce();
    expect(events[0]?.type).toBe('error');
  });
  it.each(['onerror', 'onmessageerror'] as const)('contains %s and rejects late native messages', (name) => {
    const f = fake(),
      events: BatchWorkerEvent[] = [],
      req = request();
    createBatchExecutor(() => f.worker)(req, (e) => events.push(e));
    const late = f.worker.onmessage!;
    if (name === 'onerror') {
      const preventDefault = vi.fn();
      f.worker.onerror!({ preventDefault } as unknown as ErrorEvent);
      expect(preventDefault).toHaveBeenCalledOnce();
    } else f.worker.onmessageerror!({} as MessageEvent);
    late({ data: { type: 'result', id: req.run.id, result: executeBatchRun(req) } } as MessageEvent<BatchWorkerEvent>);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('error');
    expect(f.terminate).toHaveBeenCalledOnce();
  });
  it('uses a 30-second inactivity timeout and clears it on result', () => {
    vi.useFakeTimers();
    const f = fake(),
      events: BatchWorkerEvent[] = [],
      req = request();
    createBatchExecutor(() => f.worker)(req, (e) => events.push(e));
    vi.advanceTimersByTime(BATCH_WORKER_TIMEOUT_MS - 1);
    expect(events).toHaveLength(0);
    f.worker.onmessage!({
      data: { type: 'progress', id: req.run.id, fraction: 0.5 }
    } as MessageEvent<BatchWorkerEvent>);
    vi.advanceTimersByTime(BATCH_WORKER_TIMEOUT_MS - 1);
    expect(events).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(events[1]?.type).toBe('error');
    expect(f.terminate).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(BATCH_WORKER_TIMEOUT_MS);
    expect(events).toHaveLength(2);
  });
  it('does not time out a successful completed run', () => {
    vi.useFakeTimers();
    const f = fake(),
      events: BatchWorkerEvent[] = [],
      req = request();
    createBatchExecutor(() => f.worker)(req, (e) => events.push(e));
    f.worker.onmessage!({
      data: { type: 'result', id: req.run.id, result: executeBatchRun(req) }
    } as MessageEvent<BatchWorkerEvent>);
    vi.advanceTimersByTime(BATCH_WORKER_TIMEOUT_MS * 2);
    expect(events.map((e) => e.type)).toEqual(['result']);
  });
  it.each([NaN, -0.1, 1.1])('rejects invalid progress %s without accepting a result', (fraction) => {
    const f = fake(),
      events: BatchWorkerEvent[] = [],
      req = request();
    createBatchExecutor(() => f.worker)(req, (e) => events.push(e));
    f.worker.onmessage!({ data: { type: 'progress', id: req.run.id, fraction } } as MessageEvent<BatchWorkerEvent>);
    expect(events[0]?.type).toBe('error');
    expect(f.terminate).toHaveBeenCalledOnce();
  });
  it('rejects progress regression and unsupported worker messages', () => {
    for (const data of [{ type: 'progress', fraction: 0.2 }, { type: 'unknown' }]) {
      const f = fake(),
        events: BatchWorkerEvent[] = [],
        req = request();
      createBatchExecutor(() => f.worker)(req, (e) => events.push(e));
      f.worker.onmessage!({
        data: { type: 'progress', id: req.run.id, fraction: 0.5 }
      } as MessageEvent<BatchWorkerEvent>);
      f.worker.onmessage!({ data: { ...data, id: req.run.id } } as unknown as MessageEvent<BatchWorkerEvent>);
      expect(events.at(-1)?.type).toBe('error');
    }
  });
  it('rejects a malformed result whose ID, units or shape differs from the request', () => {
    const req = request(),
      valid = executeBatchRun(req);
    for (const result of [
      { ...valid, batchId: 'foreign' },
      { ...valid, summary: { ...valid.summary, metrics: [] } },
      { ...valid, summary: { ...valid.summary, metrics: valid.summary.metrics.map((m) => ({ ...m, unit: 'wrong' })) } }
    ]) {
      const f = fake(),
        events: BatchWorkerEvent[] = [];
      createBatchExecutor(() => f.worker)(req, (e) => events.push(e));
      f.worker.onmessage!({ data: { type: 'result', id: req.run.id, result } } as MessageEvent<BatchWorkerEvent>);
      expect(events[0]?.type).toBe('error');
      expect(f.terminate).toHaveBeenCalledOnce();
    }
  });
  it('dispose terminates computation and discards captured stale callbacks', () => {
    const f = fake(),
      events: BatchWorkerEvent[] = [],
      req = request(),
      job = createBatchExecutor(() => f.worker)(req, (e) => events.push(e));
    const late = f.worker.onmessage!;
    job.dispose();
    late({ data: { type: 'result', id: req.run.id, result: executeBatchRun(req) } } as MessageEvent<BatchWorkerEvent>);
    expect(events).toHaveLength(0);
    expect(f.terminate).toHaveBeenCalledOnce();
  });
  it('coalesces a thousand worker progress events into bounded UI snapshots', async () => {
    vi.useFakeTimers();
    let send: ((event: BatchWorkerEvent) => void) | undefined;
    const p = plan(),
      executor: BatchExecutor = (_request, callback) => {
        send = callback;
        return { dispose() {} };
      },
      queue = createBatchQueue(p, { executor });
    let notifications = 0;
    queue.subscribe(() => notifications++);
    queue.start();
    await Promise.resolve();
    const before = notifications;
    for (let i = 0; i < 1000; i++) send!({ type: 'progress', id: p.runs[1]!.id, fraction: i / 1000 });
    expect(notifications).toBe(before);
    vi.advanceTimersByTime(16);
    expect(notifications).toBe(before + 1);
    queue.cancel();
    expect(queue.state.status).toBe('cancelled');
    queue.dispose();
  });
});
