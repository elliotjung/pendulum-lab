import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFieldSimulation,
  defaultFieldConfig,
  FIELD_SYSTEM_IDS,
  resizeFieldConfig
} from '../../../../src/product/adapters/physics/field';
import { createFieldWorkerClient, type FieldWorker } from '../../../../src/product/adapters/physics/field-client';
import {
  createFieldWorkerSession,
  FIELD_MAX_SAMPLES,
  fieldRetention,
  fieldSampleStride,
  type FieldWorkerEvent,
  type FieldWorkerRequest
} from '../../../../src/product/adapters/physics/field-worker-protocol';
type Mutable<T> = {
  -readonly [P in keyof T]: T[P] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[P] extends object
      ? Mutable<T[P]>
      : T[P];
};
function fakeWorker() {
  const requests: FieldWorkerRequest[] = [],
    session = createFieldWorkerSession(() => 0);
  const worker: FieldWorker = {
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
    flush() {
      const event = session.handle(requests.shift()!);
      worker.onmessage?.({ data: event } as MessageEvent<FieldWorkerEvent>);
      return event;
    }
  };
}
afterEach(() => vi.useRealTimers());
describe('S16 bounded worker retention and lifecycle', () => {
  it('reports the exact configured endpoint despite a floating point step product', () => {
    const config = { ...defaultFieldConfig('system:fput'), step: 0.003, duration: 0.009, sampleEvery: 2 },
      fake = fakeWorker(),
      events: FieldWorkerEvent[] = [],
      client = createFieldWorkerClient(
        config,
        (e) => events.push(e),
        () => fake.worker
      );
    fake.flush();
    client.advance(64);
    fake.flush();
    const last = events.at(-1);
    if (last?.type !== 'progress') throw new Error('progress');
    expect(last.sample.step).toBe(3);
    expect(last.sample.time).toBe(0.009);
    expect(last.samples.map((s) => s.step)).toEqual([2, 3]);
  });
  it.each(FIELD_SYSTEM_IDS)('%s worker equals direct native result and releases on completion', (systemId) => {
    const c = { ...defaultFieldConfig(systemId), duration: 0.1 },
      direct = createFieldSimulation(c),
      fake = fakeWorker(),
      events: FieldWorkerEvent[] = [],
      client = createFieldWorkerClient(
        c,
        (e) => events.push(e),
        () => fake.worker
      );
    expect(client.advance(64)).toBe(false);
    fake.flush();
    while (client.advance(64)) fake.flush();
    while (!direct.done) direct.step();
    const last = events.at(-1);
    expect(last?.type).toBe(direct.snapshot().step === 0 ? 'ready' : 'progress');
    if (last?.type !== 'ready' && last?.type !== 'progress') throw new Error('snapshot');
    expect(last.sample).toEqual(direct.snapshot());
    expect(last.done).toBe(true);
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
  });
  it('64-member and 128-grid jobs yield between steps and cancel before full horizon', () => {
    for (const c of [
      { ...defaultFieldConfig(), ensemble: { members: 64 } },
      resizeFieldConfig(defaultFieldConfig('system:sine-gordon'), 128)
    ]) {
      let t = 0;
      const s = createFieldWorkerSession(() => (t += 9));
      expect(s.handle({ type: 'initialize', id: 'r', sequence: 0, config: c }).type).toBe('ready');
      expect(s.handle({ type: 'advance', id: 'r', sequence: 1, count: 64 })).toMatchObject({
        type: 'progress',
        advanced: 1,
        done: false
      });
      expect(s.handle({ type: 'cancel', id: 'r', sequence: 2 }).type).toBe('cancelled');
      expect(s.handle({ type: 'advance', id: 'r', sequence: 3, count: 1 }).type).toBe('error');
    }
  });
  it('raw and downsampled semantics retain initial, aligned and final rows within fixed memory budget', () => {
    const c = { ...defaultFieldConfig('system:fput'), duration: 12, sampleEvery: 1 },
      s = createFieldWorkerSession(() => 0);
    expect(fieldSampleStride(c)).toBe(2);
    expect(fieldRetention(c)).toMatchObject({ kind: 'downsampled', scope: 'retained-integration-samples' });
    const initial = s.handle({ type: 'initialize', id: 'r', sequence: 0, config: c });
    if (initial.type !== 'ready') throw new Error('ready');
    const rows = [initial.sample];
    let sequence = 1;
    while (true) {
      const e = s.handle({ type: 'advance', id: 'r', sequence: sequence++, count: 64 });
      if (e.type !== 'progress') throw new Error('progress');
      rows.push(...e.samples);
      if (e.done) break;
    }
    expect(rows.length).toBeLessThanOrEqual(FIELD_MAX_SAMPLES);
    expect(rows.at(-1)?.step).toBe(1200);
    expect(rows.filter((row) => row.step !== 1200).every((row) => row.step % 2 === 0)).toBe(true);
    expect(fieldRetention({ ...c, duration: 0.1 }).kind).toBe('raw');
    expect(fieldRetention({ ...c, duration: 0.1, sampleEvery: 3 }).kind).toBe('downsampled');
  });
  it.each(['count', 'sequence', 'id', 'duplicate'])('invalid %s closes session', (kind) => {
    const config = defaultFieldConfig(),
      s = createFieldWorkerSession(() => 0);
    s.handle({ type: 'initialize', id: 'r', sequence: 0, config });
    const r: FieldWorkerRequest =
      kind === 'duplicate'
        ? { type: 'initialize', id: 'r', sequence: 1, config }
        : {
            type: 'advance',
            id: kind === 'id' ? 'other' : 'r',
            sequence: kind === 'sequence' ? 2 : 1,
            count: kind === 'count' ? 65 : 1
          };
    expect(s.handle(r).type).toBe('error');
    expect(s.handle({ type: 'advance', id: 'r', sequence: 3, count: 1 }).type).toBe('error');
  });
  it('native overflow exposes only last accepted sample and closes session', () => {
    const config = {
        ...defaultFieldConfig('system:fput'),
        initialState: Array.from({ length: 32 }, (_, i) => (i < 16 ? (i % 2 === 0 ? 999 : -999) : 0)),
        parameters: { alpha: 2, beta: 5 }
      },
      s = createFieldWorkerSession(() => 0);
    expect(s.handle({ type: 'initialize', id: 'r', sequence: 0, config }).type).toBe('ready');
    const e = s.handle({ type: 'advance', id: 'r', sequence: 1, count: 64 });
    expect(e.type).toBe('error');
    if (e.type !== 'error' || !e.snapshot) throw new Error('expected overflow');
    expect(e.snapshot.sample.step).toBe(e.snapshot.advanced);
    expect(e.snapshot.sample.state.every(Number.isFinite)).toBe(true);
    expect(e.snapshot.done).toBe(false);
  });
  it.each([null, 42, {}, { sample: {} }])('malformed error snapshot %j is rejected without throwing', (snapshot) => {
    const fake = fakeWorker(),
      events: FieldWorkerEvent[] = [];
    createFieldWorkerClient(
      defaultFieldConfig(),
      (e) => events.push(e),
      () => fake.worker
    );
    const r = fake.requests[0]!;
    expect(() =>
      fake.worker.onmessage?.({
        data: { type: 'error', id: r.id, sequence: 0, message: 'failed', snapshot }
      } as unknown as MessageEvent<FieldWorkerEvent>)
    ).not.toThrow();
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('유효하지 않은 오류') });
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
  });
  it.each(['state', 'time', 'mean', 'variance', 'seed', 'retention', 'terminal'])(
    'rejects contradictory %s worker payload',
    (kind) => {
      const fake = fakeWorker(),
        events: FieldWorkerEvent[] = [],
        config = { ...defaultFieldConfig(), duration: 0.01 },
        client = createFieldWorkerClient(
          config,
          (e) => events.push(e),
          () => fake.worker
        ),
        r = fake.requests.shift()!,
        s = createFieldWorkerSession(() => 0);
      const ready = s.handle(r);
      if (ready.type !== 'ready') throw new Error('ready');
      fake.worker.onmessage?.({ data: ready } as MessageEvent<FieldWorkerEvent>);
      client.advance(1);
      const next = fake.requests.shift()!,
        progress = s.handle(next);
      if (progress.type !== 'progress') throw new Error('progress');
      const bad = structuredClone(progress) as Mutable<typeof progress>;
      if (kind === 'state') bad.sample.state[0]! += 1;
      if (kind === 'time') bad.sample.time += 1;
      if (kind === 'mean') bad.sample.mean[0]! += 1;
      if (kind === 'variance') bad.sample.variance[0]! += 1;
      if (kind === 'seed') bad.sample.ensemble.seeds[0]! += 1;
      if (kind === 'retention') bad.retention.kind = 'downsampled';
      if (kind === 'terminal') bad.samples[0]!.energy += 1;
      fake.worker.onmessage?.({ data: bad } as unknown as MessageEvent<FieldWorkerEvent>);
      expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('유효하지 않은 결과') });
      expect(fake.worker.terminate).toHaveBeenCalledOnce();
    }
  );
  it.each(['dispose', 'timeout', 'error', 'decode', 'post'])('%s releases resources exactly once', (kind) => {
    vi.useFakeTimers();
    const fake = fakeWorker(),
      events: FieldWorkerEvent[] = [],
      client = createFieldWorkerClient(
        defaultFieldConfig(),
        (e) => events.push(e),
        () => fake.worker
      );
    if (kind === 'dispose') {
      client.dispose();
      client.dispose();
    }
    if (kind === 'timeout') vi.advanceTimersByTime(15000);
    if (kind === 'error') fake.worker.onerror?.({ preventDefault: vi.fn() } as unknown as ErrorEvent);
    if (kind === 'decode') fake.worker.onmessageerror?.({} as MessageEvent);
    if (kind === 'post') {
      fake.flush();
      fake.worker.postMessage = () => {
        throw new Error('post');
      };
      client.advance(1);
    }
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
    expect(client.advance(1)).toBe(false);
  });
  it.each([
    ['system:fput', 'state'],
    ['system:fput', 'profile'],
    ['system:fput', 'modeEnergies'],
    ['system:fput', 'warnings'],
    ['system:langevin', 'state'],
    ['system:langevin', 'profile'],
    ['system:langevin', 'mean'],
    ['system:langevin', 'variance'],
    ['system:langevin', 'memberStates'],
    ['system:langevin', 'memberRow'],
    ['system:langevin', 'seeds'],
    ['system:langevin', 'memberIds'],
    ['system:sine-gordon', 'previousField']
  ] as const)('rejects sparse own indexes in %s %s ready snapshots', (systemId, field) => {
    const config = defaultFieldConfig(systemId),
      fake = fakeWorker(),
      events: FieldWorkerEvent[] = [];
    createFieldWorkerClient(
      config,
      (e) => events.push(e),
      () => fake.worker
    );
    const request = fake.requests.shift()!,
      ready = createFieldWorkerSession(() => 0).handle(request);
    if (ready.type !== 'ready') throw new Error('ready');
    const bad = structuredClone(ready) as Mutable<typeof ready>;
    if (field === 'memberRow') bad.sample.memberStates[0] = new Array<number>(2);
    else if (field === 'seeds') bad.sample.ensemble.seeds = new Array<number>(config.ensemble.members);
    else if (field === 'memberIds') bad.sample.ensemble.memberIds = new Array<string>(config.ensemble.members);
    else if (field === 'memberStates') bad.sample.memberStates = new Array<number[]>(config.ensemble.members);
    else if (field === 'warnings') bad.sample.warnings = new Array<string>(1);
    else bad.sample[field] = new Array<number>(bad.sample[field].length);
    expect(() => fake.worker.onmessage?.({ data: bad } as unknown as MessageEvent<FieldWorkerEvent>)).not.toThrow();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error', message: expect.stringContaining('유효하지 않은 결과') });
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
  });
  it.each(['hole', 'inherited-slot'])('rejects a retained-samples %s despite matching length', (kind) => {
    const config = { ...defaultFieldConfig('system:fput'), duration: 0.01 },
      fake = fakeWorker(),
      events: FieldWorkerEvent[] = [],
      client = createFieldWorkerClient(
        config,
        (e) => events.push(e),
        () => fake.worker
      ),
      session = createFieldWorkerSession(() => 0);
    const ready = session.handle(fake.requests.shift()!);
    if (ready.type !== 'ready') throw new Error('ready');
    fake.worker.onmessage?.({ data: ready } as MessageEvent<FieldWorkerEvent>);
    client.advance(1);
    const progress = session.handle(fake.requests.shift()!);
    if (progress.type !== 'progress') throw new Error('progress');
    const bad = structuredClone(progress) as Mutable<typeof progress>,
      retained = bad.samples[0]!;
    bad.samples = new Array<Mutable<typeof retained>>(1);
    if (kind === 'inherited-slot')
      Object.setPrototypeOf(bad.samples, Object.assign(Object.create(Array.prototype), { 0: retained }));
    fake.worker.onmessage?.({ data: bad } as unknown as MessageEvent<FieldWorkerEvent>);
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('유효하지 않은 결과') });
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
  });
  it('rejects sparse numeric fields inside a populated retained sample and error snapshot', () => {
    for (const kind of ['progress', 'error'] as const) {
      const config = { ...defaultFieldConfig('system:fput'), duration: 0.01 },
        fake = fakeWorker(),
        events: FieldWorkerEvent[] = [],
        client = createFieldWorkerClient(
          config,
          (e) => events.push(e),
          () => fake.worker
        ),
        session = createFieldWorkerSession(() => 0);
      const ready = session.handle(fake.requests.shift()!);
      if (ready.type !== 'ready') throw new Error('ready');
      fake.worker.onmessage?.({ data: ready } as MessageEvent<FieldWorkerEvent>);
      client.advance(1);
      const progress = session.handle(fake.requests.shift()!);
      if (progress.type !== 'progress') throw new Error('progress');
      const snapshot = structuredClone(progress) as Mutable<typeof progress>;
      snapshot.samples[0]!.modeEnergies = new Array<number>(config.grid.points);
      const payload =
        kind === 'progress'
          ? snapshot
          : { type: 'error', id: snapshot.id, sequence: snapshot.sequence, message: 'failed', snapshot };
      fake.worker.onmessage?.({ data: payload } as unknown as MessageEvent<FieldWorkerEvent>);
      expect(events.at(-1)).toMatchObject({
        type: 'error',
        message: expect.stringContaining(kind === 'error' ? '유효하지 않은 오류' : '유효하지 않은 결과')
      });
      expect(fake.worker.terminate).toHaveBeenCalledOnce();
    }
  });
});
