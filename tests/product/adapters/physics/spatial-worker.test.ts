import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSpatialSimulation,
  defaultSpatialConfig,
  SPATIAL_SYSTEM_IDS
} from '../../../../src/product/adapters/physics/spatial';
import {
  createSpatialWorkerSession,
  spatialSampleStride,
  type SpatialWorkerEvent,
  type SpatialWorkerRequest
} from '../../../../src/product/adapters/physics/spatial-worker-protocol';
import { createSpatialWorkerClient, type SpatialWorker } from '../../../../src/product/adapters/physics/spatial-client';

function fakeWorker() {
  const requests: SpatialWorkerRequest[] = [];
  const worker: SpatialWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (request) => {
      requests.push(request);
    },
    terminate: vi.fn()
  };
  const session = createSpatialWorkerSession(() => 0);
  return {
    worker,
    requests,
    flush() {
      const request = requests.shift();
      if (!request) throw new Error('request');
      const event = session.handle(request);
      worker.onmessage?.({ data: event } as MessageEvent<SpatialWorkerEvent>);
      return event;
    }
  };
}
afterEach(() => vi.useRealTimers());

describe('S12 bounded spatial worker session', () => {
  it.each(SPATIAL_SYSTEM_IDS)('%s matches direct stepping including a fractional final sample', (systemId) => {
    const config = { ...defaultSpatialConfig(systemId), step: 0.003, duration: 0.01, sampleEvery: 3, startTime: 2 };
    const direct = createSpatialSimulation(config),
      session = createSpatialWorkerSession(() => 0);
    expect(session.handle({ type: 'initialize', id: 'run', sequence: 0, config }).type).toBe('ready');
    const event = session.handle({ type: 'advance', id: 'run', sequence: 1, count: 64 });
    while (!direct.done) direct.step();
    if (event.type !== 'progress') throw new Error('progress');
    expect(event.sample).toEqual(direct.snapshot());
    expect(event).toMatchObject({ advanced: 4, done: true });
    expect(event.samples.map((sample) => sample.step)).toEqual([3, 4]);
    expect(event.samples.at(-1)).toEqual(event.sample);
  });
  it('maximum-budget runs retain at most 2001 samples including both endpoints', () => {
    const config = { ...defaultSpatialConfig(), initialState: [0.5, 0, 0, 0], step: 0.001, duration: 100 };
    const session = createSpatialWorkerSession(() => 0);
    expect(session.handle({ type: 'initialize', id: 'bounded', sequence: 0, config }).type).toBe('ready');
    let count = 1,
      sequence = 1,
      done = false;
    while (!done) {
      const event = session.handle({ type: 'advance', id: 'bounded', sequence: sequence++, count: 64 });
      if (event.type !== 'progress') throw new Error('progress');
      count += event.samples.length;
      done = event.done;
    }
    expect(count).toBe(2001);
    expect(spatialSampleStride({ ...config, sampleEvery: 3 })).toBe(51);
  });
  it('time budget yields between legacy steps', () => {
    let clock = 0;
    const session = createSpatialWorkerSession(() => (clock += 9));
    session.handle({ type: 'initialize', id: 'run', sequence: 0, config: defaultSpatialConfig() });
    expect(session.handle({ type: 'advance', id: 'run', sequence: 1, count: 64 })).toMatchObject({
      type: 'progress',
      advanced: 1,
      done: false
    });
  });
  it.each([
    { type: 'advance', id: 'run', sequence: 1, count: 65 },
    { type: 'advance', id: 'run', sequence: 1, count: 0 },
    { type: 'advance', id: 'run', sequence: 2, count: 1 },
    { type: 'advance', id: 'different', sequence: 1, count: 1 },
    { type: 'initialize', id: 'run', sequence: 1, config: defaultSpatialConfig() }
  ] as const)('malformed or duplicate requests close the session: %j', (request) => {
    const session = createSpatialWorkerSession();
    session.handle({ type: 'initialize', id: 'run', sequence: 0, config: defaultSpatialConfig() });
    expect(session.handle(request).type).toBe('error');
    expect(session.handle({ type: 'advance', id: 'run', sequence: 2, count: 1 }).type).toBe('error');
  });
  it('cancellation releases the session and prevents later work', () => {
    const session = createSpatialWorkerSession();
    session.handle({ type: 'initialize', id: 'run', sequence: 0, config: defaultSpatialConfig() });
    expect(session.handle({ type: 'cancel', id: 'run', sequence: 1 }).type).toBe('cancelled');
    expect(session.handle({ type: 'advance', id: 'run', sequence: 2, count: 1 }).type).toBe('error');
  });
  it('numerical failure returns only finite last-valid progress and closes the session', () => {
    const config = { ...defaultSpatialConfig(), initialState: [0.01, 0, 10000, 10000], step: 0.05, duration: 1 };
    const session = createSpatialWorkerSession(() => 0);
    expect(session.handle({ type: 'initialize', id: 'run', sequence: 0, config }).type).toBe('ready');
    const event = session.handle({ type: 'advance', id: 'run', sequence: 1, count: 64 });
    if (event.type !== 'error' || !event.snapshot) throw new Error('last-valid failure');
    expect(event.snapshot.sample.state.every(Number.isFinite)).toBe(true);
    expect(event.snapshot.sample.step).toBe(event.snapshot.advanced);
    expect(session.handle({ type: 'advance', id: 'run', sequence: 2, count: 1 }).type).toBe('error');
  });
});

describe('S12 spatial worker client', () => {
  it('allows only one in-flight request and terminates on completion', () => {
    const f = fakeWorker(),
      events: SpatialWorkerEvent[] = [];
    const client = createSpatialWorkerClient(
      { ...defaultSpatialConfig(), duration: 0.01 },
      (event) => events.push(event),
      () => f.worker
    );
    expect(client.advance(64)).toBe(false);
    f.flush();
    expect(() => client.advance(65)).toThrow();
    expect(client.advance(64)).toBe(true);
    expect(client.advance(1)).toBe(false);
    f.flush();
    expect(events.map((event) => event.type)).toEqual(['ready', 'progress']);
    expect(events[1]).toMatchObject({ done: true, advanced: 5 });
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    expect(client.advance(1)).toBe(false);
    client.dispose();
    expect(f.worker.terminate).toHaveBeenCalledOnce();
  });
  it('disposal ignores late packets and mismatched identity/sequence never reaches the view', () => {
    const f = fakeWorker(),
      events: SpatialWorkerEvent[] = [];
    const client = createSpatialWorkerClient(
      defaultSpatialConfig(),
      (event) => events.push(event),
      () => f.worker
    );
    const receive = f.worker.onmessage!,
      request = f.requests[0]!;
    receive({
      data: { type: 'error', id: 'different', sequence: 0, message: 'late' }
    } as MessageEvent<SpatialWorkerEvent>);
    receive({
      data: { type: 'error', id: request.id, sequence: 4, message: 'late' }
    } as MessageEvent<SpatialWorkerEvent>);
    expect(events).toEqual([]);
    client.dispose();
    receive({
      data: { type: 'error', id: request.id, sequence: 0, message: 'late' }
    } as MessageEvent<SpatialWorkerEvent>);
    expect(events).toEqual([]);
    expect(f.worker.terminate).toHaveBeenCalledOnce();
  });
  it.each(['nan', 'dimension', 'time', 'momentum', 'residual', 'stride', 'done', 'missing-sample'] as const)(
    'rejects malformed %s packets atomically',
    (field) => {
      // A short run retains every step, so deleting its first sample is genuinely malformed.
      const config = { ...defaultSpatialConfig(), duration: 0.01 };
      const f = fakeWorker(),
        events: SpatialWorkerEvent[] = [];
      const client = createSpatialWorkerClient(
        config,
        (event) => events.push(event),
        () => f.worker
      );
      f.flush();
      client.advance(1);
      const ready = createSpatialWorkerSession(() => 0);
      const request = f.requests[0]!;
      ready.handle({ type: 'initialize', id: request.id, sequence: 0, config });
      const good = ready.handle(request);
      if (good.type !== 'progress') throw new Error('progress');
      const broken =
        field === 'nan'
          ? { sample: { ...good.sample, state: [NaN, 0, 0, 0] } }
          : field === 'dimension'
            ? { sample: { ...good.sample, positions: [] } }
            : field === 'time'
              ? { sample: { ...good.sample, time: 123 } }
              : field === 'momentum'
                ? { sample: { ...good.sample, verticalMomentum: good.sample.verticalMomentum + 1 } }
                : field === 'residual'
                  ? { sample: { ...good.sample, constraintErrors: [-1] } }
                  : field === 'stride'
                    ? { sampleStride: 0 }
                    : field === 'done'
                      ? { done: true }
                      : { samples: [] };
      f.worker.onmessage!({ data: { ...good, ...broken } } as MessageEvent<SpatialWorkerEvent>);
      expect(events.map((event) => event.type)).toEqual(['ready', 'error']);
      expect(f.worker.terminate).toHaveBeenCalledOnce();
    }
  );
  it('accepts finite last-valid numerical failure snapshots then terminates', () => {
    const f = fakeWorker(),
      events: SpatialWorkerEvent[] = [];
    const client = createSpatialWorkerClient(
      { ...defaultSpatialConfig(), initialState: [0.01, 0, 10000, 10000], step: 0.05, duration: 1 },
      (event) => events.push(event),
      () => f.worker
    );
    f.flush();
    client.advance(64);
    f.flush();
    expect(events[1]).toMatchObject({ type: 'error', snapshot: { done: false } });
    expect(f.worker.terminate).toHaveBeenCalledOnce();
  });
  it('reports startup, runtime, message, send and timeout failures once each', async () => {
    vi.useFakeTimers();
    const events: SpatialWorkerEvent[] = [];
    createSpatialWorkerClient(
      defaultSpatialConfig(),
      (event) => events.push(event),
      () => {
        throw new Error('blocked');
      }
    );
    await Promise.resolve();
    for (const mode of ['runtime', 'message', 'send', 'timeout']) {
      const f = fakeWorker();
      const client = createSpatialWorkerClient(
        defaultSpatialConfig(),
        (event) => events.push(event),
        () => f.worker
      );
      if (mode === 'runtime') f.worker.onerror!({ preventDefault: vi.fn() } as unknown as ErrorEvent);
      if (mode === 'message') f.worker.onmessageerror!({} as MessageEvent);
      if (mode === 'send') {
        f.flush();
        f.worker.postMessage = () => {
          throw new Error('send');
        };
        client.advance(1);
      }
      if (mode === 'timeout') vi.advanceTimersByTime(15000);
      expect(f.worker.terminate).toHaveBeenCalledOnce();
    }
    expect(events.filter((event) => event.type === 'error')).toHaveLength(5);
  });
});
