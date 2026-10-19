import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createNonlinearSimulation,
  defaultNonlinearConfig,
  NONLINEAR_SYSTEM_IDS
} from '../../../../src/product/adapters/physics/nonlinear';
import {
  createNonlinearWorkerClient,
  type NonlinearWorker
} from '../../../../src/product/adapters/physics/nonlinear-client';
import {
  createNonlinearWorkerSession,
  NONLINEAR_WORKER_MAX_STEPS,
  nonlinearSampleStride,
  type NonlinearWorkerEvent,
  type NonlinearWorkerRequest
} from '../../../../src/product/adapters/physics/nonlinear-worker-protocol';

function fakeWorker() {
  const requests: NonlinearWorkerRequest[] = [];
  const worker: NonlinearWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (request) => {
      requests.push(request);
    },
    terminate: vi.fn()
  };
  const session = createNonlinearWorkerSession(() => 0);
  return {
    worker,
    requests,
    flush() {
      const request = requests.shift();
      if (!request) throw new Error('request');
      const event = session.handle(request);
      worker.onmessage?.({ data: event } as MessageEvent<NonlinearWorkerEvent>);
      return event;
    }
  };
}
afterEach(() => vi.useRealTimers());
describe('S14 bounded nonlinear worker', () => {
  it.each(NONLINEAR_SYSTEM_IDS)('%s matches direct physics at a fractional endpoint', (systemId) => {
    const config = { ...defaultNonlinearConfig(systemId), step: 0.003, duration: 0.01, sampleEvery: 3, startTime: 2 },
      direct = createNonlinearSimulation(config, { stability: true }),
      session = createNonlinearWorkerSession(() => 0);
    expect(session.handle({ type: 'initialize', id: 'run', sequence: 0, config }).type).toBe('ready');
    const result = session.handle({ type: 'advance', id: 'run', sequence: 1, count: 64 });
    while (!direct.done) direct.step();
    if (result.type !== 'progress') throw new Error('progress');
    expect(result.sample).toEqual(direct.snapshot());
    expect(result).toMatchObject({ advanced: 4, done: true });
    expect(result.samples.map((s) => s.step)).toEqual([3, 4]);
    expect(result.restartConfig).toEqual(systemId === 'system:pyragas' ? direct.serialize() : undefined);
  });
  it('caps retained display trajectory while preserving full delay tape', () => {
    const c = { ...defaultNonlinearConfig('system:pyragas'), duration: 5, step: 0.002 },
      session = createNonlinearWorkerSession(() => 0);
    session.handle({ type: 'initialize', id: 'bounded', sequence: 0, config: c });
    let retained = 1,
      sequence = 1,
      done = false;
    while (!done) {
      const event = session.handle({ type: 'advance', id: 'bounded', sequence: sequence++, count: 64 });
      if (event.type !== 'progress') throw new Error('progress');
      expect(event.samples.length).toBeLessThanOrEqual(64);
      expect(event.sample.history.length).toBeLessThanOrEqual(65);
      expect(event.restartConfig!.delayState!.times.length).toBeLessThanOrEqual(103);
      expect(event.sample).not.toHaveProperty('delayState');
      retained += event.samples.length;
      done = event.done;
    }
    expect(retained).toBeLessThanOrEqual(2001);
    expect(nonlinearSampleStride(c)).toBe(2);
  });
  it('time budget yields between steps, cancellation closes, and malformed requests fail closed', () => {
    let time = 0;
    const bounded = createNonlinearWorkerSession(() => (time += 9));
    bounded.handle({ type: 'initialize', id: 'r', sequence: 0, config: defaultNonlinearConfig() });
    expect(bounded.handle({ type: 'advance', id: 'r', sequence: 1, count: 64 })).toMatchObject({
      type: 'progress',
      advanced: 1,
      done: false
    });
    expect(bounded.handle({ type: 'cancel', id: 'r', sequence: 2 }).type).toBe('cancelled');
    expect(bounded.handle({ type: 'advance', id: 'r', sequence: 3, count: 1 }).type).toBe('error');
    for (const request of [
      { type: 'advance', id: 'r', sequence: 1, count: 65 },
      { type: 'advance', id: 'r', sequence: 2, count: 1 },
      { type: 'advance', id: 'other', sequence: 1, count: 1 },
      { type: 'initialize', id: 'r', sequence: 1, config: defaultNonlinearConfig() }
    ] as const) {
      const session = createNonlinearWorkerSession();
      session.handle({ type: 'initialize', id: 'r', sequence: 0, config: defaultNonlinearConfig() });
      expect(session.handle(request).type).toBe('error');
      expect(session.handle({ type: 'advance', id: 'r', sequence: 3, count: 1 }).type).toBe('error');
    }
  });
  it('numerical failure returns last accepted finite snapshot then releases the session', () => {
    const base = defaultNonlinearConfig(),
      config = {
        ...base,
        parameters: { ...base.parameters, damping: 0, cubicStiffness: -1, driveAmplitude: 0 },
        initialState: [20, 0, 0],
        duration: 0.5
      },
      session = createNonlinearWorkerSession(() => 0);
    expect(session.handle({ type: 'initialize', id: 'run', sequence: 0, config }).type).toBe('ready');
    const result = session.handle({ type: 'advance', id: 'run', sequence: 1, count: 64 });
    if (result.type !== 'error' || !result.snapshot) throw new Error('failure');
    expect(result.snapshot.advanced).toBeGreaterThan(0);
    expect(result.snapshot.sample.step).toBe(result.snapshot.advanced);
    expect(result.snapshot.sample.state.every(Number.isFinite)).toBe(true);
    expect(result.message).toContain('마지막 유효 상태');
    expect(session.handle({ type: 'advance', id: 'run', sequence: 2, count: 1 }).type).toBe('error');
  });
});
describe('S14 worker client lifecycle and hostile packets', () => {
  it.each([1, 7, 64])('accepts a full default Pyragas horizon with %i-step client packets', (chunk) => {
    const config = defaultNonlinearConfig('system:pyragas'),
      fake = fakeWorker(),
      events: NonlinearWorkerEvent[] = [],
      client = createNonlinearWorkerClient(
        config,
        (e) => events.push(e),
        () => fake.worker
      );
    fake.flush();
    let completed = false;
    while (!completed) {
      expect(client.advance(chunk)).toBe(true);
      const produced = fake.flush();
      expect(events.at(-1)?.type).toBe(produced.type);
      if (produced.type !== 'progress') throw new Error('progress');
      expect(events.at(-1)).toEqual(produced);
      completed = produced.done;
    }
    expect(events.at(-1)).toMatchObject({ type: 'progress', done: true });
  });
  it.each([9, 109])('accepts every resumed Pyragas packet after saving at step%i', (saveStep) => {
    const base = {
        ...defaultNonlinearConfig('system:pyragas'),
        duration: 0.6,
        history: { kind: 'linear' as const, state: [0.7, -0.3] }
      },
      direct = createNonlinearSimulation(base);
    for (let i = 0; i < saveStep; i++) direct.step();
    const config = direct.serialize(),
      fake = fakeWorker(),
      events: NonlinearWorkerEvent[] = [],
      client = createNonlinearWorkerClient(
        config,
        (e) => events.push(e),
        () => fake.worker
      );
    fake.flush();
    let completed = false;
    while (!completed) {
      expect(client.advance(7)).toBe(true);
      const produced = fake.flush();
      expect(events.at(-1)).toEqual(produced);
      if (produced.type !== 'progress') throw new Error('progress');
      completed = produced.done;
    }
    expect(events.at(-1)).toMatchObject({ type: 'progress', done: true });
  });
  it.each(NONLINEAR_SYSTEM_IDS)('%s permits one request and terminates once on completion', (id) => {
    const fake = fakeWorker(),
      events: NonlinearWorkerEvent[] = [],
      client = createNonlinearWorkerClient(
        { ...defaultNonlinearConfig(id), duration: 0.01 },
        (e) => events.push(e),
        () => fake.worker
      );
    expect(client.advance(64)).toBe(false);
    fake.flush();
    expect(() => client.advance(NONLINEAR_WORKER_MAX_STEPS + 1)).toThrow();
    expect(client.advance(64)).toBe(true);
    expect(client.advance(1)).toBe(false);
    fake.flush();
    expect(events.map((e) => e.type)).toEqual(['ready', 'progress']);
    expect(events[1]).toMatchObject({ done: true });
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
    client.dispose();
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
  });
  it.each(['nan', 'state', 'time', 'curve', 'history', 'restart', 'done', 'stride', 'missing-sample', 'mode'] as const)(
    'rejects malformed %s atomically',
    (field) => {
      const config = { ...defaultNonlinearConfig('system:pyragas'), duration: 0.01 },
        fake = fakeWorker(),
        events: NonlinearWorkerEvent[] = [],
        client = createNonlinearWorkerClient(
          config,
          (e) => events.push(e),
          () => fake.worker
        );
      fake.flush();
      client.advance(1);
      const request = fake.requests[0]!,
        session = createNonlinearWorkerSession(() => 0);
      session.handle({ type: 'initialize', id: request.id, sequence: 0, config });
      const good = session.handle(request);
      if (good.type !== 'progress') throw new Error('progress');
      const patch =
        field === 'nan'
          ? { sample: { ...good.sample, feedback: NaN } }
          : field === 'state'
            ? { sample: { ...good.sample, state: [] } }
            : field === 'time'
              ? { sample: { ...good.sample, time: 8 } }
              : field === 'curve'
                ? { sample: { ...good.sample, potential: Array(66).fill({ x: 0, y: 0 }) } }
                : field === 'history'
                  ? { sample: { ...good.sample, history: Array(66).fill({ time: 0, theta: 0, omega: 0 }) } }
                  : field === 'restart'
                    ? {
                        restartConfig: {
                          ...good.restartConfig!,
                          delayState: { times: [-0.1, 0], states: [[0.3, 0], good.sample.state] }
                        }
                      }
                    : field === 'done'
                      ? { done: true }
                      : field === 'stride'
                        ? { sampleStride: 0 }
                        : field === 'mode'
                          ? { sample: { ...good.sample, mode: 'arbitrary' } }
                          : { samples: [] };
      fake.worker.onmessage!({ data: { ...good, ...patch } } as MessageEvent<NonlinearWorkerEvent>);
      expect(events.map((e) => e.type)).toEqual(['ready', 'error']);
      expect(fake.worker.terminate).toHaveBeenCalledOnce();
    }
  );
  it('ignores stale, wrong identity, out-of-order and disposed packets', () => {
    const fake = fakeWorker(),
      events: NonlinearWorkerEvent[] = [],
      client = createNonlinearWorkerClient(
        defaultNonlinearConfig(),
        (e) => events.push(e),
        () => fake.worker
      ),
      receive = fake.worker.onmessage!;
    receive({
      data: { type: 'error', id: 'other', sequence: 0, message: 'stale' }
    } as MessageEvent<NonlinearWorkerEvent>);
    receive({
      data: { type: 'error', id: fake.requests[0]!.id, sequence: 3, message: 'stale' }
    } as MessageEvent<NonlinearWorkerEvent>);
    expect(events).toEqual([]);
    client.dispose();
    receive({
      data: { type: 'error', id: fake.requests[0]!.id, sequence: 0, message: 'stale' }
    } as MessageEvent<NonlinearWorkerEvent>);
    expect(events).toEqual([]);
  });
  it('startup, runtime, message, send and timeout failures terminate exactly once', async () => {
    vi.useFakeTimers();
    const startup: NonlinearWorkerEvent[] = [];
    createNonlinearWorkerClient(
      defaultNonlinearConfig(),
      (e) => startup.push(e),
      () => {
        throw new Error('startup');
      }
    );
    await Promise.resolve();
    expect(startup[0]?.type).toBe('error');
    for (const kind of ['runtime', 'message', 'send', 'timeout']) {
      const fake = fakeWorker(),
        events: NonlinearWorkerEvent[] = [],
        client = createNonlinearWorkerClient(
          defaultNonlinearConfig(),
          (e) => events.push(e),
          () => fake.worker
        );
      if (kind === 'runtime') fake.worker.onerror!({ preventDefault: vi.fn() } as unknown as ErrorEvent);
      else if (kind === 'message') fake.worker.onmessageerror!({} as MessageEvent);
      else if (kind === 'send') {
        fake.flush();
        fake.worker.postMessage = () => {
          throw new Error('send');
        };
        client.advance(1);
      } else await vi.advanceTimersByTimeAsync(15_001);
      expect(events.at(-1)?.type).toBe('error');
      expect(fake.worker.terminate).toHaveBeenCalledOnce();
      client.dispose();
      expect(fake.worker.terminate).toHaveBeenCalledOnce();
    }
  });
});
