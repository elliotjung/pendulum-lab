import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDrivenSimulation,
  defaultDrivenConfig,
  DRIVEN_SYSTEM_IDS
} from '../../../../src/product/adapters/physics/driven';
import {
  createDrivenWorkerSession,
  drivenSampleStride,
  type DrivenWorkerEvent,
  type DrivenWorkerRequest
} from '../../../../src/product/adapters/physics/driven-worker-protocol';
import { createDrivenWorkerClient, type DrivenWorker } from '../../../../src/product/adapters/physics/driven-client';

function fakeWorker() {
  const requests: DrivenWorkerRequest[] = [];
  const worker: DrivenWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (request) => {
      requests.push(request);
    },
    terminate: vi.fn()
  };
  const session = createDrivenWorkerSession(() => 0);
  return {
    worker,
    requests,
    flush() {
      const request = requests.shift();
      if (!request) throw new Error('request');
      const event = session.handle(request);
      worker.onmessage?.({ data: event } as MessageEvent<DrivenWorkerEvent>);
      return event;
    }
  };
}
afterEach(() => vi.useRealTimers());
describe('S13 bounded driven worker', () => {
  it.each(DRIVEN_SYSTEM_IDS)(
    '%s matches direct native stepping with fractional endpoint and bounded sampled output',
    (systemId) => {
      const config = { ...defaultDrivenConfig(systemId), step: 0.003, duration: 0.01, sampleEvery: 3, startTime: 2 },
        direct = createDrivenSimulation(config),
        session = createDrivenWorkerSession(() => 0);
      expect(session.handle({ type: 'initialize', id: 'run', sequence: 0, config }).type).toBe('ready');
      const event = session.handle({ type: 'advance', id: 'run', sequence: 1, count: 64 });
      while (!direct.done) direct.step();
      if (event.type !== 'progress') throw new Error('progress');
      expect(event.sample).toEqual(direct.snapshot());
      expect(event).toMatchObject({ advanced: 4, done: true });
      expect(event.samples.map((sample) => sample.step)).toEqual([3, 4]);
    }
  );
  it('maximum permitted run retains at most 2001 samples, never the entire history', () => {
    const base = defaultDrivenConfig(),
      config = {
        ...base,
        forcing: { ...base.forcing!, amplitude: 0 },
        initialState: [0, 0, 0],
        step: 0.001,
        duration: 100
      },
      session = createDrivenWorkerSession(() => 0);
    expect(session.handle({ type: 'initialize', id: 'bounded', sequence: 0, config }).type).toBe('ready');
    let retained = 1,
      sequence = 1,
      done = false;
    while (!done) {
      const event = session.handle({ type: 'advance', id: 'bounded', sequence: sequence++, count: 64 });
      if (event.type !== 'progress') throw new Error('progress');
      expect(event.samples.length).toBeLessThanOrEqual(64);
      retained += event.samples.length;
      done = event.done;
    }
    expect(retained).toBe(2001);
    expect(drivenSampleStride({ ...config, sampleEvery: 3 })).toBe(51);
  });
  it('time budget yields between indivisible steps', () => {
    let now = 0;
    const session = createDrivenWorkerSession(() => (now += 9));
    session.handle({ type: 'initialize', id: 'run', sequence: 0, config: defaultDrivenConfig() });
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
    { type: 'advance', id: 'other', sequence: 1, count: 1 },
    { type: 'initialize', id: 'run', sequence: 1, config: defaultDrivenConfig() }
  ] as const)('malformed or duplicate request closes the session %#', (request) => {
    const session = createDrivenWorkerSession();
    session.handle({ type: 'initialize', id: 'run', sequence: 0, config: defaultDrivenConfig() });
    expect(session.handle(request).type).toBe('error');
    expect(session.handle({ type: 'advance', id: 'run', sequence: 3, count: 1 }).type).toBe('error');
  });
  it('cancel releases session and prevents further computation', () => {
    const session = createDrivenWorkerSession();
    session.handle({ type: 'initialize', id: 'run', sequence: 0, config: defaultDrivenConfig() });
    expect(session.handle({ type: 'cancel', id: 'run', sequence: 1 })).toMatchObject({ type: 'cancelled' });
    expect(session.handle({ type: 'advance', id: 'run', sequence: 2, count: 1 }).type).toBe('error');
  });
  it('failed control returns finite last-accepted progress and then closes', () => {
    const base = defaultDrivenConfig('system:inverted'),
      config = {
        ...base,
        controller: { ...base.controller!, enabled: true, maxOutput: 0.1 },
        initialState: [1.5, 10],
        duration: 0.5
      },
      session = createDrivenWorkerSession(() => 0);
    expect(session.handle({ type: 'initialize', id: 'run', sequence: 0, config }).type).toBe('ready');
    const result = session.handle({ type: 'advance', id: 'run', sequence: 1, count: 64 });
    if (result.type !== 'error' || !result.snapshot) throw new Error('failure');
    expect(result.message).toContain('안전 범위');
    expect(result.snapshot.advanced).toBeGreaterThan(0);
    expect(result.snapshot.sample.step).toBe(result.snapshot.advanced);
    expect(result.snapshot.sample.state.every(Number.isFinite)).toBe(true);
    expect(session.handle({ type: 'advance', id: 'run', sequence: 2, count: 1 }).type).toBe('error');
  });
});

describe('S13 worker client lifecycle and hostile packets', () => {
  it('allows one in-flight request and terminates exactly once at completion', () => {
    const fake = fakeWorker(),
      events: DrivenWorkerEvent[] = [],
      client = createDrivenWorkerClient(
        { ...defaultDrivenConfig(), duration: 0.01 },
        (event) => events.push(event),
        () => fake.worker
      );
    expect(client.advance(64)).toBe(false);
    fake.flush();
    expect(() => client.advance(65)).toThrow();
    expect(client.advance(64)).toBe(true);
    expect(client.advance(1)).toBe(false);
    fake.flush();
    expect(events.map((event) => event.type)).toEqual(['ready', 'progress']);
    expect(events[1]).toMatchObject({ done: true, advanced: 5 });
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
    client.dispose();
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
  });
  it('disposal ignores late, wrong-identity and wrong-sequence packets', () => {
    const fake = fakeWorker(),
      events: DrivenWorkerEvent[] = [],
      client = createDrivenWorkerClient(
        defaultDrivenConfig(),
        (event) => events.push(event),
        () => fake.worker
      ),
      receive = fake.worker.onmessage!;
    receive({ data: { type: 'error', id: 'other', sequence: 0, message: 'late' } } as MessageEvent<DrivenWorkerEvent>);
    receive({
      data: { type: 'error', id: fake.requests[0]!.id, sequence: 3, message: 'late' }
    } as MessageEvent<DrivenWorkerEvent>);
    expect(events).toEqual([]);
    client.dispose();
    receive({
      data: { type: 'error', id: fake.requests[0]!.id, sequence: 0, message: 'late' }
    } as MessageEvent<DrivenWorkerEvent>);
    expect(events).toEqual([]);
  });
  it.each(['nan', 'positions', 'state', 'time', 'control', 'phase', 'stride', 'done', 'missing-sample'] as const)(
    'rejects malformed %s progress atomically',
    (field) => {
      const config = { ...defaultDrivenConfig(), duration: 0.01 },
        fake = fakeWorker(),
        events: DrivenWorkerEvent[] = [],
        client = createDrivenWorkerClient(
          config,
          (event) => events.push(event),
          () => fake.worker
        );
      fake.flush();
      client.advance(1);
      const request = fake.requests[0]!,
        session = createDrivenWorkerSession(() => 0);
      session.handle({ type: 'initialize', id: request.id, sequence: 0, config });
      const good = session.handle(request);
      if (good.type !== 'progress') throw new Error('progress');
      const patch =
        field === 'nan'
          ? { sample: { ...good.sample, energy: NaN } }
          : field === 'positions'
            ? { sample: { ...good.sample, positions: [] } }
            : field === 'state'
              ? { sample: { ...good.sample, state: [] } }
              : field === 'time'
                ? { sample: { ...good.sample, time: 123 } }
                : field === 'control'
                  ? { sample: { ...good.sample, control: Infinity } }
                  : field === 'phase'
                    ? { sample: { ...good.sample, phase: {} } }
                    : field === 'stride'
                      ? { sampleStride: 0 }
                      : field === 'done'
                        ? { done: true }
                        : { samples: [] };
      fake.worker.onmessage!({ data: { ...good, ...patch } } as MessageEvent<DrivenWorkerEvent>);
      expect(events.map((event) => event.type)).toEqual(['ready', 'error']);
      expect(fake.worker.terminate).toHaveBeenCalledOnce();
    }
  );
  it('valid finite failure snapshots reach the UI and terminate', () => {
    const base = defaultDrivenConfig('system:inverted'),
      config = {
        ...base,
        controller: { ...base.controller!, enabled: true, maxOutput: 0.1 },
        initialState: [1.5, 10],
        duration: 0.5
      },
      fake = fakeWorker(),
      events: DrivenWorkerEvent[] = [],
      client = createDrivenWorkerClient(
        config,
        (event) => events.push(event),
        () => fake.worker
      );
    fake.flush();
    client.advance(64);
    fake.flush();
    expect(events[1]).toMatchObject({ type: 'error', snapshot: { done: false } });
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
  });
  it('reports startup, runtime, message, send and timeout failures once', async () => {
    vi.useFakeTimers();
    const events: DrivenWorkerEvent[] = [];
    createDrivenWorkerClient(
      defaultDrivenConfig(),
      (event) => events.push(event),
      () => {
        throw new Error('startup');
      }
    );
    await Promise.resolve();
    expect(events[0]?.type).toBe('error');
    for (const failure of ['runtime', 'message', 'send', 'timeout'] as const) {
      const fake = fakeWorker(),
        output: DrivenWorkerEvent[] = [],
        client = createDrivenWorkerClient(
          defaultDrivenConfig(),
          (event) => output.push(event),
          () => fake.worker
        );
      if (failure === 'runtime') fake.worker.onerror!({ preventDefault: vi.fn() } as unknown as ErrorEvent);
      else if (failure === 'message') fake.worker.onmessageerror!({} as MessageEvent);
      else if (failure === 'send') {
        fake.flush();
        fake.worker.postMessage = () => {
          throw new Error('send');
        };
        client.advance(1);
      } else await vi.advanceTimersByTimeAsync(15_001);
      expect(output.at(-1)?.type).toBe('error');
      expect(fake.worker.terminate).toHaveBeenCalledOnce();
      client.dispose();
      expect(fake.worker.terminate).toHaveBeenCalledOnce();
    }
  });
});
