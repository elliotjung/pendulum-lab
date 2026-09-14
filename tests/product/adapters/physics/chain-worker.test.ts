import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChainSimulation, defaultChainConfig } from '../../../../src/product/adapters/physics/chain';
import {
  createChainWorkerSession,
  chainSampleStride,
  type ChainWorkerEvent,
  type ChainWorkerRequest
} from '../../../../src/product/adapters/physics/chain-worker-protocol';
import { createChainWorkerClient, type ChainWorker } from '../../../../src/product/adapters/physics/chain-client';
import { createChainModel } from '../../../../src/product/lab/views/chain-model';

function fakeWorker() {
  const requests: ChainWorkerRequest[] = [];
  const worker: ChainWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (request) => {
      requests.push(request);
    },
    terminate: vi.fn()
  };
  const session = createChainWorkerSession(() => 0);
  return {
    worker,
    requests,
    flush() {
      const req = requests.shift();
      if (!req) throw new Error('request');
      const event = session.handle(req);
      worker.onmessage?.({ data: event } as MessageEvent<ChainWorkerEvent>);
      return event;
    }
  };
}
afterEach(() => vi.useRealTimers());
describe('S10 bounded worker contract', () => {
  it.each([1, 3, 16, 128])('worker N=%i matches direct stepping and retains the final sample', (n) => {
    const config = { ...defaultChainConfig('system:chain', n), duration: 0.01, step: 0.003 };
    const direct = createChainSimulation(config),
      session = createChainWorkerSession(() => 0);
    expect(session.handle({ type: 'initialize', id: 'run', sequence: 0, config }).type).toBe('ready');
    const result = session.handle({ type: 'advance', id: 'run', sequence: 1, count: 64 });
    while (!direct.done) direct.step();
    expect(result.type).toBe('progress');
    if (result.type !== 'progress') throw new Error('progress');
    expect(result.sample).toEqual(direct.snapshot());
    expect(result.done).toBe(true);
    expect(result.samples.at(-1)).toEqual(result.sample);
  });
  it('time budget yields between indivisible legacy steps', () => {
    let clock = 0;
    const session = createChainWorkerSession(() => (clock += 9));
    session.handle({ type: 'initialize', id: 'run', sequence: 0, config: defaultChainConfig() });
    const event = session.handle({ type: 'advance', id: 'run', sequence: 1, count: 64 });
    expect(event).toMatchObject({ type: 'progress', advanced: 1, done: false });
  });
  it('bounds dense run sampling and rejects malformed or repeated requests', () => {
    const config = { ...defaultChainConfig(), duration: 100, step: 0.001, sampleEvery: 3 };
    expect(chainSampleStride(config)).toBe(51);
    const session = createChainWorkerSession();
    session.handle({ type: 'initialize', id: 'run', sequence: 0, config });
    expect(session.handle({ type: 'advance', id: 'run', sequence: 1, count: 65 })).toMatchObject({ type: 'error' });
    expect(session.handle({ type: 'advance', id: 'run', sequence: 2, count: 1 })).toMatchObject({ type: 'error' });
  });
  it('cancelled worker session refuses new work', () => {
    const session = createChainWorkerSession();
    session.handle({ type: 'initialize', id: 'run', sequence: 0, config: defaultChainConfig() });
    expect(session.handle({ type: 'cancel', id: 'run', sequence: 1 }).type).toBe('cancelled');
    expect(session.handle({ type: 'advance', id: 'run', sequence: 2, count: 1 }).type).toBe('error');
  });
  it('client terminates on dispose and ignores already queued or unrelated responses', () => {
    const f = fakeWorker(),
      events: ChainWorkerEvent[] = [];
    const client = createChainWorkerClient(
      defaultChainConfig(),
      (e) => events.push(e),
      () => f.worker
    );
    const callback = f.worker.onmessage!;
    callback({ data: { type: 'error', id: 'wrong', sequence: 0, message: 'late' } } as MessageEvent<ChainWorkerEvent>);
    expect(events).toEqual([]);
    const request = f.requests[0]!;
    client.dispose();
    callback({
      data: { type: 'error', id: request.id, sequence: 0, message: 'late' }
    } as unknown as MessageEvent<ChainWorkerEvent>);
    expect(events).toEqual([]);
    expect(f.worker.terminate).toHaveBeenCalledOnce();
  });
  it('client catches startup/runtime/message failures and timeout, once each', async () => {
    vi.useFakeTimers();
    const events: ChainWorkerEvent[] = [];
    createChainWorkerClient(
      defaultChainConfig(),
      (e) => events.push(e),
      () => {
        throw new Error('blocked');
      }
    );
    await Promise.resolve();
    expect(events[0]?.type).toBe('error');
    const f = fakeWorker();
    createChainWorkerClient(
      defaultChainConfig(),
      (e) => events.push(e),
      () => f.worker
    );
    f.worker.onerror!({ preventDefault: vi.fn() } as unknown as ErrorEvent);
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    const g = fakeWorker();
    createChainWorkerClient(
      defaultChainConfig(),
      (e) => events.push(e),
      () => g.worker
    );
    g.worker.onmessageerror!({} as MessageEvent);
    expect(g.worker.terminate).toHaveBeenCalledOnce();
    const h = fakeWorker();
    createChainWorkerClient(
      defaultChainConfig(),
      (e) => events.push(e),
      () => h.worker
    );
    vi.advanceTimersByTime(15000);
    expect(h.worker.terminate).toHaveBeenCalledOnce();
    expect(events).toHaveLength(4);
  });
  it('client rejects invalid finite/dimension payloads without exposing them', () => {
    const f = fakeWorker(),
      events: ChainWorkerEvent[] = [];
    createChainWorkerClient(
      defaultChainConfig(),
      (e) => events.push(e),
      () => f.worker
    );
    const request = f.requests[0]!;
    const good = createChainWorkerSession().handle(request);
    if (good.type !== 'ready') throw new Error('ready');
    f.worker.onmessage!({
      data: { ...good, sample: { ...good.sample, state: [NaN] } }
    } as unknown as MessageEvent<ChainWorkerEvent>);
    expect(events[0]?.type).toBe('error');
    expect(f.worker.terminate).toHaveBeenCalledOnce();
  });
});
describe('S10 worker-backed run model', () => {
  it('steps only through worker and preserves exact pause/resume state', () => {
    vi.useFakeTimers();
    const f = fakeWorker(),
      config = { ...defaultChainConfig(), duration: 0.1 };
    const model = createChainModel(config, () => f.worker);
    model.step();
    expect(model.state.busy).toBe(true);
    expect(model.state.sample.step).toBe(0);
    f.flush();
    expect(f.requests[0]).toMatchObject({ type: 'advance', count: 1 });
    f.flush();
    expect(model.state.sample.step).toBe(1);
    expect(model.state.status).toBe('paused');
    model.run();
    vi.advanceTimersByTime(16);
    model.pause();
    f.flush();
    expect(model.state.status).toBe('paused');
    const step = model.state.sample.step;
    model.run();
    vi.advanceTimersByTime(16);
    f.flush();
    expect(model.state.sample.step).toBeGreaterThan(step);
    model.cancel();
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    expect(model.state.status).toBe('cancelled');
    model.dispose();
  });
  it('cancellation/reset/configure refuse stale replies and preserve invalid edit state', () => {
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const model = createChainModel(defaultChainConfig(), () => {
      const f = fakeWorker();
      workers.push(f);
      return f.worker;
    });
    model.step();
    const f = workers[0]!;
    f.flush();
    f.flush();
    const before = model.state.sample;
    model.setValid(false);
    expect(model.state.sample).toEqual(before);
    expect(model.state.valid).toBe(false);
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    expect(() => model.configure({ ...defaultChainConfig(), gamma: -1 })).toThrow();
    expect(model.state.sample).toEqual(before);
    model.configure(defaultChainConfig('system:chain', 1));
    expect(model.state.sample.state).toHaveLength(2);
    expect(model.state.sample.step).toBe(0);
    model.dispose();
  });
  it('completes on a fractional last step and releases the worker', () => {
    vi.useFakeTimers();
    const f = fakeWorker(),
      model = createChainModel({ ...defaultChainConfig(), step: 0.003, duration: 0.01 }, () => f.worker);
    model.run();
    f.flush();
    vi.advanceTimersByTime(16);
    f.flush();
    expect(model.state.status).toBe('completed');
    expect(model.state.sample.time).toBe(0.01);
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    expect(model.state.samples.at(-1)).toEqual(model.state.sample);
    model.dispose();
  });
  it('reports unavailable workers without uncaught failure and permits retry', async () => {
    const model = createChainModel(defaultChainConfig(), () => {
      throw new Error('blocked');
    });
    model.run();
    await Promise.resolve();
    expect(model.state.status).toBe('error');
    expect(model.state.error).toContain('worker');
    model.reset();
    expect(model.state.status).toBe('ready');
    model.dispose();
  });
});
