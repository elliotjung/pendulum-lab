import { afterEach, describe, expect, it, vi } from 'vitest';
import { stochasticResonanceCurve } from '../../../../src/physics/stochasticResonance';
import {
  FIELD_RESONANCE_DEFAULTS,
  fieldResonanceSigmas,
  validateFieldResonanceSettings,
  nativeFieldResonanceResponse,
  serializeFieldResonanceArtifact
} from '../../../../src/product/adapters/physics/field-resonance';
import {
  createFieldResonanceWorkerSession,
  type FieldResonanceEvent,
  type FieldResonanceRequest
} from '../../../../src/product/adapters/physics/field-resonance-worker-protocol';
import {
  createFieldResonanceClient,
  type FieldResonanceWorker
} from '../../../../src/product/adapters/physics/field-resonance-client';

const settings = {
  ...FIELD_RESONANCE_DEFAULTS,
  driveOmega: 3,
  dt: 0.05,
  periods: 1,
  transientPeriods: 0,
  sigmaCount: 3,
  realizations: 2,
  seed: 0xffffffff
};
afterEach(() => vi.useRealTimers());
function fakeWorker() {
  const requests: FieldResonanceRequest[] = [],
    session = createFieldResonanceWorkerSession();
  const worker: FieldResonanceWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (request) => {
      requests.push(request);
    },
    terminate: vi.fn()
  };
  return {
    worker,
    requests,
    flush() {
      const request = requests.shift();
      if (!request) throw new Error('request');
      const event = session.handle(request);
      worker.onmessage?.({ data: event } as MessageEvent<FieldResonanceEvent>);
      return event;
    }
  };
}
describe('S28 independent native quartic stochastic resonance', () => {
  it('worker aggregation matches the complete native curve exactly, including uint32 seed wrap', () => {
    const expected = stochasticResonanceCurve(
      {
        amplitude: settings.amplitude,
        driveOmega: settings.driveOmega,
        dt: settings.dt,
        periods: settings.periods,
        transientPeriods: settings.transientPeriods,
        seed: settings.seed,
        x0: settings.x0
      },
      fieldResonanceSigmas(settings),
      settings.realizations
    );
    const session = createFieldResonanceWorkerSession();
    expect(session.handle({ type: 'initialize', id: 'curve', sequence: 0, settings })).toMatchObject({
      type: 'ready',
      total: 6,
      completed: 0
    });
    let final: FieldResonanceEvent | undefined;
    for (let sequence = 1; sequence <= 6; sequence++) {
      final = session.handle({ type: 'advance', id: 'curve', sequence });
      expect(final).toMatchObject({ type: 'progress', completed: sequence, total: 6, done: sequence === 6 });
      if (sequence < 6) expect('result' in final).toBe(false);
    }
    if (final?.type !== 'progress' || !final.result) throw new Error('result');
    expect(final.result.rows).toEqual(expected);
    const artifact = JSON.parse(serializeFieldResonanceArtifact(final.result));
    expect(artifact).toMatchObject({
      schema: 'pendulum-stochastic-resonance/v1',
      scope: 'independent-overdamped-quartic',
      algorithmVersion: 'stochastic-resonance-native-v1',
      source: 'stochasticResonanceCurve',
      settings,
      rows: expected
    });
    expect(artifact.warnings.join(' ')).toContain('독립적인');
    expect(session.handle({ type: 'advance', id: 'curve', sequence: 7 }).type).toBe('error');
  });
  it('client progresses one response per request, completes once and terminates its worker', () => {
    const fake = fakeWorker(),
      events: FieldResonanceEvent[] = [];
    createFieldResonanceClient(
      settings,
      (event) => events.push(event),
      () => fake.worker
    );
    while (fake.requests.length) fake.flush();
    expect(events).toHaveLength(7);
    expect(events.at(-1)).toMatchObject({ type: 'progress', completed: 6, done: true });
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
  });
  it('disposal terminates an in-flight worker and ignores already queued results', () => {
    const fake = fakeWorker(),
      events: FieldResonanceEvent[] = [];
    const client = createFieldResonanceClient(
      settings,
      (event) => events.push(event),
      () => fake.worker
    );
    const callback = fake.worker.onmessage!;
    fake.flush();
    const pending = fake.requests[0]!;
    client.dispose();
    callback({
      data: { type: 'progress', id: pending.id, sequence: pending.sequence, completed: 1, total: 6, done: false }
    } as MessageEvent<FieldResonanceEvent>);
    expect(events).toHaveLength(1);
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
  });
  it('protocol cancellation refuses later work without evaluating a native response', () => {
    const session = createFieldResonanceWorkerSession();
    session.handle({ type: 'initialize', id: 'cancel', sequence: 0, settings });
    expect(session.handle({ type: 'cancel', id: 'cancel', sequence: 1 }).type).toBe('cancelled');
    expect(session.handle({ type: 'advance', id: 'cancel', sequence: 2 }).type).toBe('error');
  });
  it.each([{ sequence: 2 }, { id: 'other' }, { type: 'initialize' }])(
    'protocol rejects out-of-order/repeated requests %j',
    (patch) => {
      const session = createFieldResonanceWorkerSession();
      session.handle({ type: 'initialize', id: 'run', sequence: 0, settings });
      expect(session.handle({ type: 'advance', id: 'run', sequence: 1, ...patch } as FieldResonanceRequest).type).toBe(
        'error'
      );
    }
  );
  it('client reports timeout once and terminates the native worker', () => {
    vi.useFakeTimers();
    const fake = fakeWorker(),
      events: FieldResonanceEvent[] = [];
    createFieldResonanceClient(
      settings,
      (event) => events.push(event),
      () => fake.worker
    );
    vi.advanceTimersByTime(15000);
    vi.advanceTimersByTime(15000);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('error');
    expect(fake.worker.terminate).toHaveBeenCalledOnce();
  });
  it.each(['wrong-total', 'wrong-progress', 'premature-result', 'invalid-final'] as const)(
    'client rejects malformed worker %s data',
    (kind) => {
      const fake = fakeWorker(),
        events: FieldResonanceEvent[] = [];
      createFieldResonanceClient(
        settings,
        (event) => events.push(event),
        () => fake.worker
      );
      const first = fake.requests[0]!;
      if (kind === 'wrong-total')
        fake.worker.onmessage!({
          data: { type: 'ready', id: first.id, sequence: 0, total: 0, completed: 0, done: false }
        } as MessageEvent<FieldResonanceEvent>);
      else {
        fake.flush();
        const pending = fake.requests[0]!;
        const data =
          kind === 'wrong-progress'
            ? { completed: 3, total: 6, done: false }
            : kind === 'premature-result'
              ? { completed: 1, total: 6, done: false, result: {} }
              : { completed: 1, total: 6, done: true, result: {} };
        fake.worker.onmessage!({
          data: { type: 'progress', id: pending.id, sequence: pending.sequence, ...data }
        } as unknown as MessageEvent<FieldResonanceEvent>);
      }
      expect(events.at(-1)?.type).toBe('error');
      expect(fake.worker.terminate).toHaveBeenCalledOnce();
    }
  );
  it.each([
    { seed: -1 },
    { seed: 0x100000000 },
    { seed: 1.5 },
    { dt: 0 },
    { driveOmega: 0 },
    { periods: 0 },
    { transientPeriods: -1 },
    { sigmaMin: 1, sigmaMax: 0.1 },
    { sigmaCount: 1 },
    { realizations: 1.5 },
    { amplitude: 1 },
    { x0: Infinity },
    { unexpected: 1 },
    { periods: 100, driveOmega: 0.01, dt: 0.0001 }
  ])('refuses invalid or over-budget resonance settings %j before worker allocation', (patch) => {
    const source = { ...settings, ...patch },
      before = structuredClone(source);
    expect(validateFieldResonanceSettings(source).ok).toBe(false);
    expect(source).toEqual(before);
  });
  it('validates accessors without executing callbacks and forbids hidden seed coercion', () => {
    let calls = 0;
    expect(
      validateFieldResonanceSettings({
        ...settings,
        get seed() {
          calls++;
          return 1;
        }
      }).ok
    ).toBe(false);
    expect(calls).toBe(0);
    expect(() => nativeFieldResonanceResponse(settings, 0, -1)).toThrow();
    expect(() => nativeFieldResonanceResponse(settings, 0.123, 0)).toThrow();
  });
  it('refuses accessor worker requests before reading their ID or invoking callbacks', () => {
    let calls = 0;
    const request = {
      type: 'initialize' as const,
      get id() {
        calls++;
        return 'unsafe';
      },
      sequence: 0,
      settings
    };
    expect(createFieldResonanceWorkerSession().handle(request).type).toBe('error');
    expect(calls).toBe(0);
  });
});
