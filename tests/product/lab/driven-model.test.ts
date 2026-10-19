import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDrivenSimulation, defaultDrivenConfig } from '../../../src/product/adapters/physics/driven';
import { type DrivenWorker } from '../../../src/product/adapters/physics/driven-client';
import {
  createDrivenWorkerSession,
  type DrivenWorkerEvent,
  type DrivenWorkerRequest
} from '../../../src/product/adapters/physics/driven-worker-protocol';
import { createDrivenModel } from '../../../src/product/lab/views/driven-model';

function fakeWorker() {
  const requests: DrivenWorkerRequest[] = [];
  const worker: DrivenWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(request) {
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
      if (!request) throw new Error('Expected a queued worker request');
      const event = session.handle(request);
      worker.onmessage?.({ data: event } as MessageEvent<DrivenWorkerEvent>);
      return event;
    }
  };
}

afterEach(() => vi.useRealTimers());

describe('S13 driven model lifecycle', () => {
  it('advances only through the worker and resumes the exact paused native state', () => {
    vi.useFakeTimers();
    const config = { ...defaultDrivenConfig('system:driven'), duration: 0.1 };
    const f = fakeWorker(),
      factory = vi.fn(() => f.worker),
      model = createDrivenModel(config, factory);
    model.step();
    expect(model.state.busy).toBe(true);
    expect(model.state.sample.step).toBe(0);
    f.flush();
    expect(f.requests[0]).toMatchObject({ type: 'advance', count: 1 });
    f.flush();
    expect(model.state.status).toBe('paused');
    expect(model.state.sample.step).toBe(1);
    model.run();
    vi.advanceTimersByTime(16);
    model.pause();
    f.flush();
    expect(model.state.status).toBe('paused');
    const paused = model.state.sample;
    vi.advanceTimersByTime(100);
    expect(model.state.sample).toEqual(paused);
    expect(f.requests).toHaveLength(0);
    model.run();
    vi.advanceTimersByTime(16);
    f.flush();
    expect(model.state.sample.step).toBeGreaterThan(paused.step);
    const direct = createDrivenSimulation(config);
    while (direct.snapshot().step < model.state.sample.step) direct.step();
    expect(model.state.sample).toEqual(direct.snapshot());
    expect(factory).toHaveBeenCalledOnce();
    model.cancel();
    expect(model.state.status).toBe('cancelled');
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    model.dispose();
  });

  it.each(['cancel', 'reset', 'configure', 'dispose'] as const)(
    '%s ignores a queued response from the previous worker generation',
    (operation) => {
      vi.useFakeTimers();
      const f = fakeWorker(),
        model = createDrivenModel(defaultDrivenConfig(), () => f.worker);
      const listener = vi.fn();
      model.subscribe(listener);
      model.step();
      f.flush();
      const callback = f.worker.onmessage!,
        pending = f.requests[0]!;
      if (operation === 'configure') model.configure(defaultDrivenConfig('system:inverted'));
      else model[operation]();
      const before = model.state,
        calls = listener.mock.calls.length;
      callback({
        data: { type: 'error', id: pending.id, sequence: pending.sequence, message: 'stale' }
      } as MessageEvent<DrivenWorkerEvent>);
      expect(model.state).toEqual(before);
      expect(listener).toHaveBeenCalledTimes(calls);
      expect(f.worker.terminate).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      model.dispose();
    }
  );

  it('retains the last valid sample on an invalid edit and resets only after a valid configuration', () => {
    vi.useFakeTimers();
    const f = fakeWorker(),
      model = createDrivenModel(defaultDrivenConfig(), () => f.worker);
    model.step();
    f.flush();
    f.flush();
    const before = model.state.sample,
      revision = model.state.revision;
    model.setValid(false);
    model.run();
    model.step();
    expect(model.state.sample).toBe(before);
    expect(model.state.status).toBe('cancelled');
    expect(model.state.valid).toBe(false);
    expect(() => model.configure({ ...defaultDrivenConfig(), initialState: [NaN, 0, 0] })).toThrow();
    expect(model.state.sample).toBe(before);
    expect(model.state.revision).toBe(revision);
    model.configure(defaultDrivenConfig('system:inverted'));
    expect(model.state).toMatchObject({ status: 'ready', valid: true, revision: revision + 1 });
    expect(model.state.sample.state).toHaveLength(2);
    expect(model.state.sample.step).toBe(0);
    model.dispose();
  });

  it('completes a fractional last step with exact start time and retains sparse final samples', () => {
    vi.useFakeTimers();
    const config = { ...defaultDrivenConfig(), startTime: 2, step: 0.003, duration: 0.01, sampleEvery: 100 };
    const f = fakeWorker(),
      model = createDrivenModel(config, () => f.worker);
    model.run();
    f.flush();
    vi.advanceTimersByTime(16);
    f.flush();
    expect(model.state).toMatchObject({ status: 'completed', progress: 1, busy: false });
    expect(model.state.sample.time).toBe(2.01);
    expect(model.state.samples.map((sample) => sample.step)).toEqual([0, 4]);
    expect(model.state.samples.at(-1)).toEqual(model.state.sample);
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    model.dispose();
  });

  it('exposes immutable samples and independent configuration copies', () => {
    const original = defaultDrivenConfig('system:driven');
    const model = createDrivenModel(original);
    const state = model.state;
    for (const value of [
      state.samples,
      state.sample,
      state.sample.state,
      state.sample.positions,
      ...state.sample.positions,
      state.sample.phase,
      state.sample.warnings
    ])
      expect(Object.isFrozen(value)).toBe(true);
    // Probe runtime aliasing even though the public configuration is statically readonly.
    expect(Reflect.set(state.config.parameters, 'g', 99)).toBe(true);
    expect(Reflect.set(original.parameters, 'length', 99)).toBe(true);
    expect(model.state.config.parameters.g).not.toBe(99);
    expect(model.state.config.parameters.length).not.toBe(99);
    model.dispose();
  });

  it('rejects unsupported analyses atomically without dropping requests or resetting a run', () => {
    vi.useFakeTimers();
    const f = fakeWorker(),
      model = createDrivenModel(defaultDrivenConfig(), () => f.worker);
    model.step();
    f.flush();
    f.flush();
    const before = model.state;
    expect(() => model.setAnalyses([{ id: 'analysis:fft', algorithmVersion: '1', settings: {} }])).toThrow();
    expect(model.state).toEqual(before);
    model.setAnalyses([]);
    expect(model.state.config.analyses).toEqual([]);
    expect(model.state.sample).toBe(before.sample);
    expect(model.state.revision).toBe(before.revision);
    model.dispose();
  });

  it('keeps the last finite numerical sample on failure and terminates scheduling', () => {
    vi.useFakeTimers();
    const base = defaultDrivenConfig('system:inverted');
    const config = {
      ...base,
      controller: { ...base.controller!, enabled: true, kp: 0, kd: 0 },
      initialState: [0.1, 100],
      step: 0.05,
      duration: 1
    };
    const f = fakeWorker(),
      model = createDrivenModel(config, () => f.worker);
    model.run();
    f.flush();
    for (let i = 0; i < 200 && model.state.status === 'running'; i++) {
      vi.advanceTimersByTime(16);
      if (f.requests.length) f.flush();
    }
    expect(model.state.status).toBe('error');
    expect(model.state.sample.state.every(Number.isFinite)).toBe(true);
    expect(model.state.samples.at(-1)).toEqual(model.state.sample);
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    model.dispose();
  });

  it('reports unavailable workers and permits a fresh worker retry', async () => {
    vi.useFakeTimers();
    const f = fakeWorker(),
      factory = vi
        .fn<() => DrivenWorker>()
        .mockImplementationOnce(() => {
          throw new Error('blocked');
        })
        .mockImplementation(() => f.worker);
    const model = createDrivenModel(defaultDrivenConfig(), factory);
    model.run();
    await Promise.resolve();
    expect(model.state.status).toBe('error');
    expect(model.state.error).toContain('worker');
    model.step();
    f.flush();
    f.flush();
    expect(model.state).toMatchObject({ status: 'paused', error: '', busy: false });
    expect(model.state.sample.step).toBe(1);
    expect(factory).toHaveBeenCalledTimes(2);
    model.dispose();
  });
});
