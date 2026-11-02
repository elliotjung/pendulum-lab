import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  createInverseJob,
  INVERSE_TIMEOUT_MS,
  type InverseWorker
} from '../../../../src/product/adapters/analysis/inverse/client';
import { defaultInverseSettings } from '../../../../src/product/adapters/analysis/inverse/settings';
import { defaultPlanarConfig, toCanonicalPlanar } from '../../../../src/product/adapters/physics/planar';
import type { InverseEvent, InverseRequest } from '../../../../src/product/adapters/analysis/inverse/contracts';
import { runInverse } from '../../../../src/product/adapters/analysis/inverse/execute';

function request(): InverseRequest {
  const canonical = toCanonicalPlanar({ ...defaultPlanarConfig(), duration: 0.02, step: 0.01 });
  if (!canonical.ok) throw new Error('fixture');
  return {
    schema: 'pendulum-inverse-request/v1',
    id: 'worker-test',
    experiment: canonical.value,
    settings: defaultInverseSettings(canonical.value, 'pce')
  };
}
function controlled() {
  const worker: InverseWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: vi.fn(),
    terminate: vi.fn()
  };
  const events: InverseEvent[] = [];
  return {
    worker,
    events,
    start: (input = request()) =>
      createInverseJob(
        input,
        (e) => events.push(e),
        () => worker
      ),
    send: (event: unknown) => worker.onmessage?.({ data: event } as MessageEvent<InverseEvent>)
  };
}
afterEach(() => vi.useRealTimers());
describe('S22 terminable inverse worker ownership', () => {
  it('owns an independent request snapshot and accepts matching native results exactly once', async () => {
    const c = controlled(),
      input = request(),
      job = c.start(input);
    const sent = vi.mocked(c.worker.postMessage).mock.calls[0]![0];
    expect(sent).toEqual(input);
    expect(sent).not.toBe(input);
    const result = await runInverse(sent);
    c.send({ type: 'result', id: input.id, result });
    await vi.waitFor(() => expect(c.events).toHaveLength(1));
    expect(c.events).toEqual([{ type: 'result', id: input.id, result }]);
    expect(c.worker.terminate).toHaveBeenCalledTimes(1);
    c.send({ type: 'result', id: input.id, result });
    job.cancel();
    expect(c.events).toHaveLength(1);
  });
  it('terminates immediately on cancellation and ignores late completion', () => {
    const c = controlled(),
      job = c.start(),
      handler = c.worker.onmessage;
    job.cancel();
    job.cancel();
    handler?.({ data: { type: 'progress', id: 'worker-test', fraction: 1, work: 1 } } as MessageEvent<InverseEvent>);
    expect(c.events).toEqual([{ type: 'cancelled', id: 'worker-test' }]);
    expect(c.worker.terminate).toHaveBeenCalledTimes(1);
  });
  it('disposes silently on navigation', () => {
    const c = controlled();
    c.start().dispose();
    expect(c.worker.terminate).toHaveBeenCalledOnce();
    expect(c.events).toEqual([]);
  });
  it('times out inactivity and resets the deadline only on valid matching progress', () => {
    vi.useFakeTimers();
    const c = controlled();
    c.start();
    vi.advanceTimersByTime(INVERSE_TIMEOUT_MS - 1);
    c.send({ type: 'progress', id: 'other', fraction: 1, work: 1 });
    vi.advanceTimersByTime(1);
    expect(c.events[0]?.type).toBe('error');
    expect(c.worker.terminate).toHaveBeenCalledOnce();
    const d = controlled();
    d.start();
    vi.advanceTimersByTime(INVERSE_TIMEOUT_MS - 1);
    d.send({ type: 'progress', id: 'worker-test', fraction: 0.1, work: 1 });
    vi.advanceTimersByTime(INVERSE_TIMEOUT_MS - 1);
    expect(d.events).toHaveLength(1);
    d.start().dispose();
  });
  it.each([
    { type: 'progress', fraction: 2, work: 1 },
    { type: 'progress', fraction: 0.1, work: -1 },
    { type: 'other' },
    { type: 'error', message: '' },
    { type: 'result', result: { schema: 'invalid' } }
  ])('rejects malformed worker response %j', async (event) => {
    const c = controlled();
    c.start();
    c.send({ id: 'worker-test', ...event });
    await vi.waitFor(() => expect(c.events[0]?.type).toBe('error'));
    expect(c.worker.terminate).toHaveBeenCalledOnce();
  });
  it('rejects decreasing progress', () => {
    const c = controlled();
    c.start();
    c.send({ type: 'progress', id: 'worker-test', fraction: 0.4, work: 3 });
    c.send({ type: 'progress', id: 'worker-test', fraction: 0.3, work: 4 });
    expect(c.events.at(-1)?.type).toBe('error');
  });
  it('handles startup failures, native worker errors and message decoding failure', async () => {
    const events: InverseEvent[] = [];
    createInverseJob(
      request(),
      (e) => events.push(e),
      () => {
        throw new Error('factory');
      }
    );
    await Promise.resolve();
    expect(events[0]?.type).toBe('error');
    const c = controlled();
    c.start();
    const prevented = vi.fn();
    c.worker.onerror?.({ preventDefault: prevented } as unknown as ErrorEvent);
    expect(prevented).toHaveBeenCalledOnce();
    expect(c.events.at(-1)?.type).toBe('error');
    const d = controlled();
    d.start();
    d.worker.onmessageerror?.({} as MessageEvent);
    expect(d.events.at(-1)?.type).toBe('error');
  });
  it('validates unsupported request before allocating worker', async () => {
    const factory = vi.fn(),
      events: InverseEvent[] = [];
    createInverseJob({ ...request(), schema: 'future' } as unknown as InverseRequest, (e) => events.push(e), factory);
    await Promise.resolve();
    expect(factory).not.toHaveBeenCalled();
    expect(events[0]?.type).toBe('error');
  });
});
