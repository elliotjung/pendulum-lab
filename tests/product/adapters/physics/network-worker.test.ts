import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createNetworkSimulation,
  defaultNetworkConfig,
  NETWORK_SYSTEM_IDS,
  resizeNetworkConfig
} from '../../../../src/product/adapters/physics/network';
import {
  createNetworkBasinClient,
  createNetworkWorkerClient,
  type NetworkWorker
} from '../../../../src/product/adapters/physics/network-client';
import {
  createNetworkBasinWorkerSession,
  createNetworkWorkerSession,
  networkSampleStride,
  type NetworkBasinWorkerEvent,
  type NetworkBasinWorkerRequest,
  type NetworkWorkerEvent,
  type NetworkWorkerRequest
} from '../../../../src/product/adapters/physics/network-worker-protocol';
function fakeWorker(basinMode = false) {
  const requests: (NetworkWorkerRequest | NetworkBasinWorkerRequest)[] = [];
  const worker: NetworkWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (r) => {
      requests.push(r);
    },
    terminate: vi.fn()
  };
  const simulation = createNetworkWorkerSession(() => 0),
    basin = createNetworkBasinWorkerSession(() => 0);
  return {
    worker,
    requests,
    flush() {
      const request = requests.shift()!;
      const event = basinMode
        ? basin.handle(request as NetworkBasinWorkerRequest)
        : simulation.handle(request as NetworkWorkerRequest);
      worker.onmessage?.({ data: event } as MessageEvent<typeof event>);
      return event;
    }
  };
}
afterEach(() => vi.useRealTimers());
describe('S15 bounded network worker sessions and client lifecycle', () => {
  it('numerical overflow retains the last accepted state and closes further requests', () => {
    const base = resizeNetworkConfig(defaultNetworkConfig('system:pendulum-network'), 2, 1);
    const config = {
      ...base,
      graph: { ...base.graph, nodes: base.graph.nodes.map((n) => ({ ...n, mass: 0.01, length: 0.01 })) },
      initialState: [0.01, -0.01, 0, 0],
      duration: 0.1
    };
    const session = createNetworkWorkerSession(() => 0);
    expect(session.handle({ type: 'initialize', id: 'overflow', sequence: 0, config }).type).toBe('ready');
    const result = session.handle({ type: 'advance', id: 'overflow', sequence: 1, count: 64 });
    if (result.type !== 'error' || !result.snapshot) throw new Error('expected numerical failure');
    expect(result.snapshot.advanced).toBeGreaterThan(0);
    expect(result.snapshot.sample.step).toBe(result.snapshot.advanced);
    expect(result.snapshot.sample.state.every(Number.isFinite)).toBe(true);
    expect(result.message).toContain('마지막 유효 상태');
    expect(session.handle({ type: 'advance', id: 'overflow', sequence: 2, count: 1 }).type).toBe('error');
  });
  it.each(NETWORK_SYSTEM_IDS)('%s preserves direct states and fractional endpoint through worker client', (id) => {
    const config = { ...defaultNetworkConfig(id), step: 0.003, duration: 0.01, startTime: 2, sampleEvery: 3 },
      direct = createNetworkSimulation(config),
      fake = fakeWorker(),
      events: NetworkWorkerEvent[] = [];
    const client = createNetworkWorkerClient(
      config,
      (e) => events.push(e),
      () => fake.worker
    );
    expect(client.advance(64)).toBe(false);
    fake.flush();
    expect(client.advance(64)).toBe(true);
    fake.flush();
    while (!direct.done) direct.step();
    const last = events.at(-1);
    expect(last).toMatchObject({ type: 'progress', advanced: 4, done: true });
    if (last?.type !== 'progress') throw new Error('progress');
    expect(last.sample).toEqual(direct.snapshot());
    expect(last.samples.map((s) => s.step)).toEqual([3, 4]);
    expect(fake.worker.terminate).toHaveBeenCalledTimes(1);
    expect(client.advance(1)).toBe(false);
  });
  it('128-node session yields one bounded step and cancels before full horizon', () => {
    let time = 0;
    const session = createNetworkWorkerSession(() => (time += 9)),
      config = resizeNetworkConfig(defaultNetworkConfig('system:kuramoto'), 128, 2);
    expect(session.handle({ type: 'initialize', id: 'large', sequence: 0, config }).type).toBe('ready');
    expect(session.handle({ type: 'advance', id: 'large', sequence: 1, count: 64 })).toMatchObject({
      type: 'progress',
      advanced: 1,
      done: false
    });
    expect(session.handle({ type: 'cancel', id: 'large', sequence: 2 }).type).toBe('cancelled');
    expect(session.handle({ type: 'advance', id: 'large', sequence: 3, count: 1 }).type).toBe('error');
  });
  it('basin cancels inside first 10000-step cell with empty completed grid', () => {
    const base = defaultNetworkConfig(),
      config = { ...base, basin: { ...base.basin!, size: 16, maxSteps: 10000 } },
      session = createNetworkBasinWorkerSession(() => 0);
    expect(session.handle({ type: 'initialize-basin', id: 'basin', sequence: 0, config })).toMatchObject({
      type: 'ready',
      basin: { completed: 0, total: 256 }
    });
    expect(session.handle({ type: 'advance', id: 'basin', sequence: 1, count: 64 })).toMatchObject({
      type: 'progress',
      advanced: 64,
      basin: { completed: 0 },
      done: false
    });
    expect(session.handle({ type: 'cancel', id: 'basin', sequence: 2 }).type).toBe('cancelled');
    expect(session.handle({ type: 'advance', id: 'basin', sequence: 3, count: 64 }).type).toBe('error');
  });
  it('basin client accepts partial grids, immutable cells and completion', () => {
    const base = defaultNetworkConfig(),
      config = { ...base, basin: { ...base.basin!, size: 3, maxSteps: 7 } },
      fake = fakeWorker(true),
      events: NetworkBasinWorkerEvent[] = [],
      client = createNetworkBasinClient(
        config,
        (e) => events.push(e),
        () => fake.worker
      );
    fake.flush();
    while (client.advance(7)) fake.flush();
    expect(events.at(-1)).toMatchObject({
      type: 'progress',
      done: true,
      basin: { completed: 9, cells: expect.arrayContaining([expect.objectContaining({ converged: false })]) }
    });
    expect(fake.worker.terminate).toHaveBeenCalledTimes(1);
  });
  it('retained trajectory is bounded to 2001 samples', () => {
    const config = { ...defaultNetworkConfig('system:huygens-phase-pair'), duration: 11 },
      session = createNetworkWorkerSession(() => 0);
    expect(networkSampleStride(config)).toBe(2);
    session.handle({ type: 'initialize', id: 'r', sequence: 0, config });
    let sequence = 1,
      retained = 1,
      done = false;
    while (!done) {
      const e = session.handle({ type: 'advance', id: 'r', sequence: sequence++, count: 64 });
      if (e.type !== 'progress') throw new Error('progress');
      retained += e.samples.length;
      done = e.done;
    }
    expect(retained).toBeLessThanOrEqual(2001);
  });
  it.each(['count', 'sequence', 'id', 'duplicate'])('rejects malformed %s then closes session', (kind) => {
    const config = defaultNetworkConfig(),
      session = createNetworkWorkerSession();
    session.handle({ type: 'initialize', id: 'r', sequence: 0, config });
    const request: NetworkWorkerRequest =
      kind === 'duplicate'
        ? { type: 'initialize', id: 'r', sequence: 1, config }
        : {
            type: 'advance',
            id: kind === 'id' ? 'other' : 'r',
            sequence: kind === 'sequence' ? 2 : 1,
            count: kind === 'count' ? 65 : 1
          };
    expect(session.handle(request).type).toBe('error');
    expect(session.handle({ type: 'advance', id: 'r', sequence: 3, count: 1 }).type).toBe('error');
  });
  it.each([null, 42, {}, { sample: {} }])(
    'client rejects malformed error snapshot %j and releases worker',
    (snapshot) => {
      const fake = fakeWorker(),
        events: NetworkWorkerEvent[] = [];
      createNetworkWorkerClient(
        defaultNetworkConfig(),
        (e) => events.push(e),
        () => fake.worker
      );
      const request = fake.requests[0]!;
      expect(() =>
        fake.worker.onmessage?.({
          data: { type: 'error', id: request.id, sequence: 0, message: 'failed', snapshot }
        } as unknown as MessageEvent<NetworkWorkerEvent>)
      ).not.toThrow();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'error', message: expect.stringContaining('유효하지 않은 오류') });
      expect(fake.worker.terminate).toHaveBeenCalledOnce();
    }
  );
  it.each(['phase', 'initial', 'terminal'])('client rejects contradictory %s state representations', (kind) => {
    const fake = fakeWorker(),
      events: NetworkWorkerEvent[] = [],
      config = { ...defaultNetworkConfig('system:kuramoto'), duration: 0.005 },
      client = createNetworkWorkerClient(
        config,
        (e) => events.push(e),
        () => fake.worker
      );
    if (kind === 'terminal') {
      fake.flush();
      client.advance(1);
    }
    const request = fake.requests.shift() as NetworkWorkerRequest,
      session = createNetworkWorkerSession(() => 0);
    let data: NetworkWorkerEvent;
    if (kind === 'terminal') {
      session.handle({ type: 'initialize', id: request.id, sequence: 0, config });
      data = session.handle(request);
    } else data = session.handle(request);
    if (data.type !== 'ready' && data.type !== 'progress') throw new Error('state');
    const forged = structuredClone(data);
    if (kind === 'terminal') (forged.samples[0]!.state as number[])[0] = forged.samples[0]!.state[0]! + 0.1;
    else if (kind === 'phase') (forged.sample.phases as number[])[0] = forged.sample.phases[0]! + 0.1;
    else {
      (forged.sample.state as number[])[0] = forged.sample.state[0]! + 0.1;
      (forged.sample.phases as number[])[0] = forged.sample.phases[0]! + 0.1;
    }
    fake.worker.onmessage?.({ data: forged } as MessageEvent<NetworkWorkerEvent>);
    expect(events.at(-1)).toMatchObject({ type: 'error' });
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
  });
  it('timeout, dispose, delivery error and missing worker all fail without leaks', async () => {
    vi.useFakeTimers();
    const fake = fakeWorker(),
      events: NetworkWorkerEvent[] = [],
      client = createNetworkWorkerClient(
        defaultNetworkConfig(),
        (e) => events.push(e),
        () => fake.worker
      );
    await vi.advanceTimersByTimeAsync(15000);
    expect(events.at(-1)).toMatchObject({ type: 'error' });
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
    client.dispose();
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
    const disposed = fakeWorker(),
      cb = vi.fn();
    const c = createNetworkWorkerClient(defaultNetworkConfig(), cb, () => disposed.worker);
    c.dispose();
    await vi.advanceTimersByTimeAsync(15000);
    expect(cb).not.toHaveBeenCalled();
    const broken = fakeWorker();
    createNetworkWorkerClient(defaultNetworkConfig(), cb, () => broken.worker);
    broken.worker.onmessageerror?.({} as MessageEvent);
    expect(broken.worker.terminate).toHaveBeenCalledOnce();
    createNetworkWorkerClient(defaultNetworkConfig(), cb, () => {
      throw new Error('unavailable');
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(cb).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'error', message: 'unavailable' }));
  });
});
