import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNonlinearSimulation, defaultNonlinearConfig } from '../../../src/product/adapters/physics/nonlinear';
import { type NonlinearWorker } from '../../../src/product/adapters/physics/nonlinear-client';
import {
  createNonlinearWorkerSession,
  type NonlinearWorkerEvent,
  type NonlinearWorkerRequest
} from '../../../src/product/adapters/physics/nonlinear-worker-protocol';
import { createNonlinearModel } from '../../../src/product/lab/views/nonlinear-model';

function fakeWorker() {
  const requests: NonlinearWorkerRequest[] = [];
  const worker: NonlinearWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(request) {
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
      if (!request) throw new Error('Expected a queued worker request');
      const event = session.handle(request);
      worker.onmessage?.({ data: event } as MessageEvent<NonlinearWorkerEvent>);
      return event;
    }
  };
}

afterEach(() => vi.useRealTimers());

describe('S14 nonlinear model lifecycle', () => {
  it('advances only through the worker and resumes the exact paused native state', () => {
    vi.useFakeTimers();
    const config = { ...defaultNonlinearConfig('system:duffing'), duration: 0.1 };
    const f = fakeWorker(),
      factory = vi.fn(() => f.worker),
      model = createNonlinearModel(config, factory);
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
    const direct = createNonlinearSimulation(config);
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
        model = createNonlinearModel(defaultNonlinearConfig(), () => f.worker);
      const listener = vi.fn();
      model.subscribe(listener);
      model.step();
      f.flush();
      const callback = f.worker.onmessage!,
        pending = f.requests[0]!;
      if (operation === 'configure') model.configure(defaultNonlinearConfig('system:van-der-pol'));
      else model[operation]();
      const before = model.state,
        calls = listener.mock.calls.length;
      callback({
        data: { type: 'error', id: pending.id, sequence: pending.sequence, message: 'stale' }
      } as MessageEvent<NonlinearWorkerEvent>);
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
      model = createNonlinearModel(defaultNonlinearConfig(), () => f.worker);
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
    expect(() => model.configure({ ...defaultNonlinearConfig(), initialState: [NaN, 0, 0] })).toThrow();
    expect(model.state.sample).toBe(before);
    expect(model.state.revision).toBe(revision);
    model.configure(defaultNonlinearConfig('system:van-der-pol'));
    expect(model.state).toMatchObject({ status: 'ready', valid: true, revision: revision + 1 });
    expect(model.state.sample.state).toHaveLength(2);
    expect(model.state.sample.step).toBe(0);
    model.dispose();
  });

  it('completes a fractional last step with exact start time and retains sparse final samples', () => {
    vi.useFakeTimers();
    const config = { ...defaultNonlinearConfig(), startTime: 2, step: 0.003, duration: 0.01, sampleEvery: 100 };
    const f = fakeWorker(),
      model = createNonlinearModel(config, () => f.worker);
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
    const original = defaultNonlinearConfig('system:duffing');
    const model = createNonlinearModel(original);
    const state = model.state;
    for (const value of [
      state.samples,
      state.sample,
      state.sample.state,
      state.sample.positions,
      ...state.sample.positions,
      state.sample.phase,
      state.sample.warnings,
      state.sample.potential,
      state.sample.history,
      ...state.sample.potential,
      ...state.sample.history
    ])
      expect(Object.isFrozen(value)).toBe(true);
    // Probe runtime aliasing even though the public configuration is statically readonly.
    expect(Reflect.set(state.config.parameters, 'linearStiffness', 99)).toBe(true);
    expect(Reflect.set(original.parameters, 'damping', 99)).toBe(true);
    expect(model.state.config.parameters.linearStiffness).not.toBe(99);
    expect(model.state.config.parameters.damping).not.toBe(99);
    model.dispose();
  });

  it('rejects unsupported analyses atomically without dropping requests or resetting a run', () => {
    vi.useFakeTimers();
    const f = fakeWorker(),
      model = createNonlinearModel(defaultNonlinearConfig(), () => f.worker);
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

  it('reports unavailable workers and permits a fresh worker retry', async () => {
    vi.useFakeTimers();
    const f = fakeWorker(),
      factory = vi
        .fn<() => NonlinearWorker>()
        .mockImplementationOnce(() => {
          throw new Error('blocked');
        })
        .mockImplementation(() => f.worker);
    const model = createNonlinearModel(defaultNonlinearConfig(), factory);
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

  it('exposes an independent continuation configuration with full accepted delay history', () => {
    vi.useFakeTimers();
    const config = defaultNonlinearConfig('system:pyragas'),
      f = fakeWorker(),
      model = createNonlinearModel(config, () => f.worker);
    model.step();
    f.flush();
    f.flush();
    const continuation = model.state.restartConfig!;
    expect(continuation.startTime).toBe(model.state.sample.time);
    expect(continuation.initialState).toEqual(model.state.sample.state);
    expect(continuation.delayState?.times.at(-1)).toBe(0);
    expect(continuation.delayState!.times[0]).toBeLessThanOrEqual(-config.parameters.delay!);
    expect(continuation.duration).toBe(config.duration);
    Reflect.set(continuation.delayState!.states[0]!, '0', 99);
    expect(model.state.restartConfig!.delayState!.states[0]![0]).not.toBe(99);
    model.reset();
    expect(model.state.restartConfig).toBeUndefined();
    model.dispose();
  });

  it('retains worker-only Floquet diagnostics on the initial CSV sample', () => {
    const f = fakeWorker(),
      model = createNonlinearModel(defaultNonlinearConfig('system:mathieu'), () => f.worker);
    expect(model.state.sample.stability).toBeUndefined();
    model.step();
    f.flush();
    expect(model.state.samples[0]!.stability).toEqual(model.state.sample.stability);
    expect(model.state.samples[0]!.stability?.spectralRadius).toBeGreaterThan(1);
    model.dispose();
  });
});
