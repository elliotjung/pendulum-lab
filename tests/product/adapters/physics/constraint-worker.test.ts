import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createConstraintSimulation,
  defaultConstraintConfig
} from '../../../../src/product/adapters/physics/constraint';
import {
  createConstraintWorkerSession,
  constraintSampleStride,
  type ConstraintWorkerEvent,
  type ConstraintWorkerRequest
} from '../../../../src/product/adapters/physics/constraint-worker-protocol';
import {
  createConstraintWorkerClient,
  type ConstraintWorker
} from '../../../../src/product/adapters/physics/constraint-client';
import { createConstraintModel } from '../../../../src/product/lab/views/constraint-model';

function fakeWorker() {
  const requests: ConstraintWorkerRequest[] = [];
  const worker: ConstraintWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (request) => {
      requests.push(request);
    },
    terminate: vi.fn()
  };
  const session = createConstraintWorkerSession(() => 0);
  return {
    worker,
    requests,
    flush() {
      const req = requests.shift();
      if (!req) throw new Error('request');
      const event = session.handle(req);
      worker.onmessage?.({ data: event } as MessageEvent<ConstraintWorkerEvent>);
      return event;
    }
  };
}
afterEach(() => vi.useRealTimers());
describe('S11 bounded worker contract', () => {
  it('retains every release/capture event across downsampling without duplicating t0 events', () => {
    const config = { ...defaultConstraintConfig('system:rope'), initialState: [2.5, 0], duration: 2, sampleEvery: 500 };
    const direct = createConstraintSimulation(config),
      session = createConstraintWorkerSession(() => 0);
    const expected = [...direct.snapshot().events];
    while (!direct.done) expected.push(...direct.step().events);
    const initial = session.handle({ type: 'initialize', id: 'events', sequence: 0, config });
    if (initial.type !== 'ready') throw new Error('ready');
    const actual = [...initial.events];
    let sequence = 0;
    let done = false;
    let retained = 1;
    while (!done) {
      const result = session.handle({ type: 'advance', id: 'events', sequence: ++sequence, count: 64 });
      if (result.type !== 'progress') throw new Error('progress');
      actual.push(...result.events);
      retained += result.samples.length;
      done = result.done;
    }
    expect(actual).toEqual(expected);
    expect(actual.map((event) => event.type)).toEqual(['slack', 'capture']);
    expect(actual.map((event) => event.sequence)).toEqual([0, 1]);
    expect(retained).toBe(3);
  });
  it.each(['sequence', 'time', 'unit', 'source'] as const)('rejects malformed %s event packets atomically', (field) => {
    const config = { ...defaultConstraintConfig('system:rope'), initialState: [2.5, 0] };
    const f = fakeWorker(),
      events: ConstraintWorkerEvent[] = [];
    createConstraintWorkerClient(
      config,
      (event) => events.push(event),
      () => f.worker
    );
    const good = createConstraintWorkerSession().handle(f.requests[0]!);
    if (good.type !== 'ready') throw new Error('ready');
    const broken = {
      ...good.events[0]!,
      ...(field === 'sequence'
        ? { sequence: 4 }
        : field === 'time'
          ? { time: NaN }
          : field === 'unit'
            ? { residualUnit: 'kg' }
            : { source: '=cmd()' })
    };
    f.worker.onmessage!({ data: { ...good, events: [broken] } } as unknown as MessageEvent<ConstraintWorkerEvent>);
    expect(events).toMatchObject([{ type: 'error' }]);
    expect(f.worker.terminate).toHaveBeenCalledOnce();
  });
  it('a maximum-budget run records at most 2001 samples including its final state', () => {
    const config = { ...defaultConstraintConfig('system:spring'), duration: 100, step: 0.001 };
    const session = createConstraintWorkerSession(() => 0);
    session.handle({ type: 'initialize', id: 'bounded', sequence: 0, config });
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
  });
  it('physical failure returns the last valid sample and closes the worker session', () => {
    const config = {
      ...defaultConstraintConfig('system:spring'),
      step: 0.05,
      duration: 1,
      integratorId: 'integrator:euler' as const,
      initialState: [0.001, 0, -1, 0]
    };
    const session = createConstraintWorkerSession(() => 0);
    session.handle({ type: 'initialize', id: 'failure', sequence: 0, config });
    const event = session.handle({ type: 'advance', id: 'failure', sequence: 1, count: 64 });
    expect(event.type).toBe('error');
    if (event.type !== 'error') throw new Error('error');
    expect(event.snapshot?.sample.step).toBe(0);
    expect(event.snapshot?.sample.time).toBe(0);
  });
  it.each(['system:spring', 'system:rope', 'system:double-string'] as const)(
    'worker %s matches direct stepping and retains the final sample',
    (systemId) => {
      const config = { ...defaultConstraintConfig(systemId), duration: 0.01, step: 0.003 };
      const direct = createConstraintSimulation(config),
        session = createConstraintWorkerSession(() => 0);
      expect(session.handle({ type: 'initialize', id: 'run', sequence: 0, config }).type).toBe('ready');
      const result = session.handle({ type: 'advance', id: 'run', sequence: 1, count: 64 });
      while (!direct.done) direct.step();
      expect(result.type).toBe('progress');
      if (result.type !== 'progress') throw new Error('progress');
      expect(result.sample).toEqual(direct.snapshot());
      expect(result.done).toBe(true);
      expect(result.samples.at(-1)).toEqual(result.sample);
    }
  );
  it('time budget yields between indivisible legacy steps', () => {
    let clock = 0;
    const session = createConstraintWorkerSession(() => (clock += 9));
    session.handle({ type: 'initialize', id: 'run', sequence: 0, config: defaultConstraintConfig() });
    const event = session.handle({ type: 'advance', id: 'run', sequence: 1, count: 64 });
    expect(event).toMatchObject({ type: 'progress', advanced: 1, done: false });
  });
  it('bounds dense run sampling and rejects malformed or repeated requests', () => {
    const config = { ...defaultConstraintConfig(), duration: 100, step: 0.001, sampleEvery: 3 };
    expect(constraintSampleStride(config)).toBe(51);
    const session = createConstraintWorkerSession();
    session.handle({ type: 'initialize', id: 'run', sequence: 0, config });
    expect(session.handle({ type: 'advance', id: 'run', sequence: 1, count: 65 })).toMatchObject({ type: 'error' });
    expect(session.handle({ type: 'advance', id: 'run', sequence: 2, count: 1 })).toMatchObject({ type: 'error' });
  });
  it('cancelled worker session refuses new work', () => {
    const session = createConstraintWorkerSession();
    session.handle({ type: 'initialize', id: 'run', sequence: 0, config: defaultConstraintConfig() });
    expect(session.handle({ type: 'cancel', id: 'run', sequence: 1 }).type).toBe('cancelled');
    expect(session.handle({ type: 'advance', id: 'run', sequence: 2, count: 1 }).type).toBe('error');
  });
  it('client terminates on dispose and ignores already queued or unrelated responses', () => {
    const f = fakeWorker(),
      events: ConstraintWorkerEvent[] = [];
    const client = createConstraintWorkerClient(
      defaultConstraintConfig(),
      (e) => events.push(e),
      () => f.worker
    );
    const callback = f.worker.onmessage!;
    callback({
      data: { type: 'error', id: 'wrong', sequence: 0, message: 'late' }
    } as MessageEvent<ConstraintWorkerEvent>);
    expect(events).toEqual([]);
    const request = f.requests[0]!;
    client.dispose();
    callback({
      data: { type: 'error', id: request.id, sequence: 0, message: 'late' }
    } as unknown as MessageEvent<ConstraintWorkerEvent>);
    expect(events).toEqual([]);
    expect(f.worker.terminate).toHaveBeenCalledOnce();
  });
  it('client catches startup/runtime/message failures and timeout, once each', async () => {
    vi.useFakeTimers();
    const events: ConstraintWorkerEvent[] = [];
    createConstraintWorkerClient(
      defaultConstraintConfig(),
      (e) => events.push(e),
      () => {
        throw new Error('blocked');
      }
    );
    await Promise.resolve();
    expect(events[0]?.type).toBe('error');
    const f = fakeWorker();
    createConstraintWorkerClient(
      defaultConstraintConfig(),
      (e) => events.push(e),
      () => f.worker
    );
    f.worker.onerror!({ preventDefault: vi.fn() } as unknown as ErrorEvent);
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    const g = fakeWorker();
    createConstraintWorkerClient(
      defaultConstraintConfig(),
      (e) => events.push(e),
      () => g.worker
    );
    g.worker.onmessageerror!({} as MessageEvent);
    expect(g.worker.terminate).toHaveBeenCalledOnce();
    const h = fakeWorker();
    createConstraintWorkerClient(
      defaultConstraintConfig(),
      (e) => events.push(e),
      () => h.worker
    );
    vi.advanceTimersByTime(15000);
    expect(h.worker.terminate).toHaveBeenCalledOnce();
    expect(events).toHaveLength(4);
  });
  it('client rejects invalid finite/dimension payloads without exposing them', () => {
    const f = fakeWorker(),
      events: ConstraintWorkerEvent[] = [];
    createConstraintWorkerClient(
      defaultConstraintConfig(),
      (e) => events.push(e),
      () => f.worker
    );
    const request = f.requests[0]!;
    const good = createConstraintWorkerSession().handle(request);
    if (good.type !== 'ready') throw new Error('ready');
    f.worker.onmessage!({
      data: { ...good, sample: { ...good.sample, state: [NaN] } }
    } as unknown as MessageEvent<ConstraintWorkerEvent>);
    expect(events[0]?.type).toBe('error');
    expect(f.worker.terminate).toHaveBeenCalledOnce();
  });
});
describe('S11 worker-backed run model', () => {
  it('keeps independent event history, rejects stale events and freezes observable samples', () => {
    vi.useFakeTimers();
    const f = fakeWorker(),
      model = createConstraintModel(
        {
          ...defaultConstraintConfig('system:rope'),
          initialState: [2.5, 0],
          duration: 1,
          sampleEvery: 500
        },
        () => f.worker
      );
    expect(model.state.events).toHaveLength(1);
    model.run();
    f.flush();
    expect(model.state.events).toHaveLength(1);
    while (model.state.status === 'running') {
      vi.advanceTimersByTime(16);
      if (f.requests.length) f.flush();
    }
    expect(model.state.status).toBe('completed');
    expect(model.state.events).toHaveLength(2);
    expect(model.state.events[1]?.type).toBe('capture');
    expect(model.state.samples).toHaveLength(2);
    expect(Object.isFrozen(model.state.sample.lengths)).toBe(true);
    expect(Object.isFrozen(model.state.events[1])).toBe(true);
    model.reset();
    expect(model.state.events).toHaveLength(1);
    model.dispose();
  });
  it('steps only through worker and preserves exact pause/resume state', () => {
    vi.useFakeTimers();
    const f = fakeWorker(),
      config = { ...defaultConstraintConfig(), duration: 0.1 };
    const model = createConstraintModel(config, () => f.worker);
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
    const model = createConstraintModel(defaultConstraintConfig(), () => {
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
    expect(() =>
      model.configure({ ...defaultConstraintConfig(), parameters: { mass: -1, stiffness: 40, restLength: 1, g: 9.81 } })
    ).toThrow();
    expect(model.state.sample).toEqual(before);
    model.configure(defaultConstraintConfig('system:rope'));
    expect(model.state.sample.state).toHaveLength(4);
    expect(model.state.sample.step).toBe(0);
    model.dispose();
  });
  it('completes on a fractional last step and releases the worker', () => {
    vi.useFakeTimers();
    const f = fakeWorker(),
      model = createConstraintModel({ ...defaultConstraintConfig(), step: 0.003, duration: 0.01 }, () => f.worker);
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
    const model = createConstraintModel(defaultConstraintConfig(), () => {
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
