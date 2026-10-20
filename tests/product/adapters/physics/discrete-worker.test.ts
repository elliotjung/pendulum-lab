import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DISCRETE_SYSTEM_IDS,
  createDiscreteSession,
  defaultDiscreteConfig,
  resizeDiscreteConfig
} from '../../../../src/product/adapters/physics/discrete';
import {
  createDiscreteWorkerClient,
  type DiscreteWorker
} from '../../../../src/product/adapters/physics/discrete-client';
import {
  createDiscreteWorkerSession,
  discreteRetention,
  type DiscreteWorkerEvent,
  type DiscreteWorkerRequest
} from '../../../../src/product/adapters/physics/discrete-worker-protocol';
type Mutable<T> = {
  -readonly [P in keyof T]: T[P] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[P] extends object
      ? Mutable<T[P]>
      : T[P];
};
function fakeWorker() {
  const requests: DiscreteWorkerRequest[] = [],
    session = createDiscreteWorkerSession(() => 0);
  const worker: DiscreteWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (r) => {
      requests.push(r);
    },
    terminate: vi.fn()
  };
  return {
    worker,
    requests,
    flush(mutate?: (event: Mutable<DiscreteWorkerEvent>) => void) {
      const event = session.handle(requests.shift()!);
      mutate?.(event as Mutable<DiscreteWorkerEvent>);
      worker.onmessage?.({ data: event } as MessageEvent<DiscreteWorkerEvent>);
      return event;
    }
  };
}
afterEach(() => vi.useRealTimers());
describe('S17 bounded iteration workers and transport safety', () => {
  it.each(DISCRETE_SYSTEM_IDS)('%s worker equals direct native evolution and releases on completion', (id) => {
    const c = { ...defaultDiscreteConfig(id), iterations: 9 },
      direct = createDiscreteSession(c),
      fake = fakeWorker(),
      events: DiscreteWorkerEvent[] = [],
      client = createDiscreteWorkerClient(
        c,
        (e) => events.push(e),
        () => fake.worker
      );
    expect(client.advance(64)).toBe(false);
    fake.flush();
    while (client.advance(64)) fake.flush();
    while (!direct.done) direct.step();
    const last = events.at(-1);
    expect(last?.type).toBe(id === 'system:unitary-floquet' ? 'ready' : 'progress');
    if (last?.type !== 'ready' && last?.type !== 'progress') throw new Error(JSON.stringify(last));
    expect(last.sample).toEqual(direct.snapshot());
    expect(last.done).toBe(true);
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
  });
  it('large quantum grids yield after an 8ms step budget and cancel without traversing the horizon', () => {
    let t = 0;
    const session = createDiscreteWorkerSession(() => (t += 9)),
      config = resizeDiscreteConfig(defaultDiscreteConfig('system:quantum-kicked-rotor'), 512);
    expect(session.handle({ type: 'initialize', id: 'r', sequence: 0, config }).type).toBe('ready');
    expect(session.handle({ type: 'advance', id: 'r', sequence: 1, count: 64 })).toMatchObject({
      type: 'progress',
      advanced: 1,
      done: false
    });
    expect(session.handle({ type: 'cancel', id: 'r', sequence: 2 }).type).toBe('cancelled');
    expect(session.handle({ type: 'advance', id: 'r', sequence: 3, count: 64 }).type).toBe('error');
  });
  it('retains bounded requested samples and the exact final iteration', () => {
    const c = { ...defaultDiscreteConfig(), iterations: 10001, sampleEvery: 3 },
      session = createDiscreteWorkerSession(() => 0);
    let event = session.handle({ type: 'initialize', id: 'r', sequence: 0, config: c }),
      sequence = 0;
    const samples: number[] = [0];
    while (event.type === 'ready' || event.type === 'progress') {
      if (event.done) break;
      event = session.handle({ type: 'advance', id: 'r', sequence: ++sequence, count: 64 });
      if (event.type === 'progress') samples.push(...event.samples.map((s) => s.step));
    }
    expect(samples.length).toBeLessThanOrEqual(1001);
    expect(samples.at(-1)).toBe(c.iterations);
    expect(samples.slice(1, -1).every((i) => i % discreteRetention(c).stride === 0)).toBe(true);
  });
  it('rejects duplicate initialization, wrong sequence and oversized batches', () => {
    for (const next of [
      { type: 'initialize', id: 'r', sequence: 1, config: defaultDiscreteConfig() },
      { type: 'advance', id: 'r', sequence: 2, count: 1 },
      { type: 'advance', id: 'r', sequence: 1, count: 65 }
    ] as DiscreteWorkerRequest[]) {
      const s = createDiscreteWorkerSession();
      s.handle({ type: 'initialize', id: 'r', sequence: 0, config: defaultDiscreteConfig() });
      expect(s.handle(next).type).toBe('error');
    }
  });
  it('protocol errors preserve the last accepted state with an explicit empty batch', () => {
    for (const advanceFirst of [false, true]) {
      const session = createDiscreteWorkerSession(() => 0),
        config = defaultDiscreteConfig();
      const ready = session.handle({ type: 'initialize', id: 'r', sequence: 0, config });
      const previous = advanceFirst ? session.handle({ type: 'advance', id: 'r', sequence: 1, count: 3 }) : ready;
      if (previous.type !== 'ready' && previous.type !== 'progress') throw new Error('valid snapshot');
      const error = session.handle({ type: 'advance', id: 'r', sequence: advanceFirst ? 2 : 1, count: 65 });
      expect(error.type).toBe('error');
      if (error.type !== 'error') return;
      expect(error.snapshot).toEqual({
        sample: previous.sample,
        samples: [],
        sampleStride: previous.sampleStride,
        retention: previous.retention,
        advanced: 0,
        done: false
      });
    }
  });
  it('an interrupted batch preserves accepted progress and its retained samples', () => {
    let calls = 0;
    const session = createDiscreteWorkerSession(() => {
      if (++calls === 2) throw new Error('injected clock failure');
      return 0;
    });
    const config = defaultDiscreteConfig(),
      direct = createDiscreteSession(config);
    session.handle({ type: 'initialize', id: 'r', sequence: 0, config });
    const error = session.handle({ type: 'advance', id: 'r', sequence: 1, count: 64 });
    expect(error.type).toBe('error');
    if (error.type !== 'error') return;
    expect(error.snapshot?.advanced).toBe(1);
    expect(error.snapshot?.sample).toEqual(direct.step());
    expect(error.snapshot?.samples).toEqual([direct.snapshot()]);
  });
  it('nonfinite native observables keep the last finite quantum state in the error reply', () => {
    const base = resizeDiscreteConfig(defaultDiscreteConfig('system:quantum-kicked-rotor'), 16),
      config = {
        ...base,
        wavefunction: { re: [1e154, ...(Array(15).fill(0) as number[])], im: Array(16).fill(0) as number[] }
      },
      fake = fakeWorker(),
      events: DiscreteWorkerEvent[] = [],
      client = createDiscreteWorkerClient(
        config,
        (e) => events.push(e),
        () => fake.worker
      );
    const ready = fake.flush();
    expect(ready.type).toBe('ready');
    client.advance(1);
    const error = fake.flush();
    expect(error.type).toBe('error');
    if (error.type !== 'error' || ready.type !== 'ready') return;
    expect(error.snapshot?.sample).toEqual(ready.sample);
    expect(error.snapshot?.advanced).toBe(0);
    expect(error.snapshot?.samples).toEqual([]);
    expect(events.at(-1)).toEqual(error);
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
  });
  it('native roots failure during initial spectral evaluation returns an error and releases the worker', () => {
    const config = {
        ...resizeDiscreteConfig(defaultDiscreteConfig('system:unitary-floquet'), 2),
        matrix: {
          re: [
            [0, 1],
            [-0.908, 0]
          ],
          im: [
            [0, 0],
            [-0.297, 0]
          ]
        }
      },
      fake = fakeWorker(),
      events: DiscreteWorkerEvent[] = [];
    const client = createDiscreteWorkerClient(
      config,
      (e) => events.push(e),
      () => fake.worker
    );
    const result = fake.flush();
    expect(result).toMatchObject({ type: 'error', message: 'complex division by zero' });
    expect(result).not.toHaveProperty('snapshot');
    expect(events).toEqual([result]);
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
    expect(client.advance(1)).toBe(false);
  });
  it.each(['initialize-post', 'advance-post', 'messageerror', 'runtimeerror', 'dispose'] as const)(
    'releases worker on %s failure or disposal',
    (mode) => {
      const fake = fakeWorker(),
        events: DiscreteWorkerEvent[] = [];
      if (mode === 'initialize-post')
        fake.worker.postMessage = () => {
          throw new Error('post failed');
        };
      const client = createDiscreteWorkerClient(
        defaultDiscreteConfig(),
        (e) => events.push(e),
        () => fake.worker
      );
      if (mode === 'initialize-post')
        return Promise.resolve().then(() => {
          expect(events.at(-1)?.type).toBe('error');
          expect(fake.worker.terminate).toHaveBeenCalledOnce();
        });
      fake.flush();
      if (mode === 'advance-post') {
        fake.worker.postMessage = () => {
          throw new Error('post failed');
        };
        client.advance(1);
      }
      if (mode === 'messageerror') fake.worker.onmessageerror?.({} as MessageEvent);
      if (mode === 'runtimeerror') {
        const preventDefault = vi.fn();
        fake.worker.onerror?.({ preventDefault } as unknown as ErrorEvent);
        expect(preventDefault).toHaveBeenCalledOnce();
      }
      if (mode === 'dispose') client.dispose();
      expect(events.at(-1)?.type).toBe(mode === 'dispose' ? 'ready' : 'error');
      expect(fake.worker.terminate).toHaveBeenCalledOnce();
      expect(fake.worker.onmessage).toBeNull();
      expect(client.advance(1)).toBe(false);
      client.dispose();
      expect(fake.worker.terminate).toHaveBeenCalledOnce();
    }
  );
  it('reports startup failure asynchronously without constructing a leaked worker', async () => {
    const events: DiscreteWorkerEvent[] = [];
    const client = createDiscreteWorkerClient(
      defaultDiscreteConfig(),
      (e) => events.push(e),
      () => {
        throw new Error('startup failed');
      }
    );
    expect(events).toEqual([]);
    await Promise.resolve();
    expect(events).toEqual([expect.objectContaining({ type: 'error', message: 'startup failed' })]);
    expect(client.advance(1)).toBe(false);
  });
  it.each(['iteration', 'norm', 'complex', 'probability', 'spectrum', 'retention', 'sparse'] as const)(
    'rejects a forged %s worker result and terminates',
    (kind) => {
      const fake = fakeWorker(),
        events: DiscreteWorkerEvent[] = [],
        client = createDiscreteWorkerClient(
          defaultDiscreteConfig('system:quantum-kicked-rotor'),
          (e) => events.push(e),
          () => fake.worker
        );
      fake.flush((event) => {
        if (event.type !== 'ready') throw new Error('ready');
        if (kind === 'iteration') event.sample.iteration++;
        if (kind === 'norm') event.sample.norm = 7;
        if (kind === 'complex') event.sample.re[0] = 2;
        if (kind === 'probability') event.sample.probability[0] = 0.2;
        if (kind === 'spectrum') event.sample.spectrum!.maxUnitCircleDrift = 1;
        if (kind === 'retention') event.retention.stride++;
        if (kind === 'sparse') delete event.sample.re[0];
      });
      expect(events.at(-1)?.type).toBe('error');
      expect(fake.worker.terminate).toHaveBeenCalledOnce();
      expect(client.advance(1)).toBe(false);
    }
  );
  it('ignores stale run replies, prevents overlapping requests and closes on timeout or disposal', () => {
    vi.useFakeTimers();
    const fake = fakeWorker(),
      events: DiscreteWorkerEvent[] = [],
      client = createDiscreteWorkerClient(
        defaultDiscreteConfig(),
        (e) => events.push(e),
        () => fake.worker
      );
    fake.worker.onmessage?.({ data: { type: 'ready', id: 'stale', sequence: 0 } } as MessageEvent<DiscreteWorkerEvent>);
    expect(events).toHaveLength(0);
    fake.flush();
    expect(client.advance(1)).toBe(true);
    expect(client.advance(1)).toBe(false);
    vi.advanceTimersByTime(15000);
    expect(events.at(-1)?.type).toBe('error');
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
    client.dispose();
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
  });
});
