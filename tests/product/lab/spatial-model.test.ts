import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpatialSimulation, defaultSpatialConfig } from '../../../src/product/adapters/physics/spatial';
import { type SpatialWorker } from '../../../src/product/adapters/physics/spatial-client';
import {
  createSpatialWorkerSession,
  type SpatialWorkerEvent,
  type SpatialWorkerRequest
} from '../../../src/product/adapters/physics/spatial-worker-protocol';
import { createSpatialModel } from '../../../src/product/lab/views/spatial-model';

function fakeWorker() {
  const requests: SpatialWorkerRequest[] = [];
  const worker: SpatialWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(request) {
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
      if (!request) throw new Error('Expected a queued worker request');
      const event = session.handle(request);
      worker.onmessage?.({ data: event } as MessageEvent<SpatialWorkerEvent>);
      return event;
    }
  };
}

afterEach(() => vi.useRealTimers());

describe('S12 spatial model lifecycle', () => {
  it('advances only through the worker and resumes the exact paused native state', () => {
    vi.useFakeTimers();
    const config = { ...defaultSpatialConfig('system:spherical-embedded-chain'), duration: 0.1 };
    const f = fakeWorker(),
      factory = vi.fn(() => f.worker),
      model = createSpatialModel(config, factory);
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
    const direct = createSpatialSimulation(config);
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
        model = createSpatialModel(defaultSpatialConfig(), () => f.worker);
      const listener = vi.fn();
      model.subscribe(listener);
      model.step();
      f.flush();
      const callback = f.worker.onmessage!,
        pending = f.requests[0]!;
      if (operation === 'configure') model.configure(defaultSpatialConfig('system:spherical-embedded'));
      else model[operation]();
      const before = model.state,
        calls = listener.mock.calls.length;
      callback({
        data: { type: 'error', id: pending.id, sequence: pending.sequence, message: 'stale' }
      } as MessageEvent<SpatialWorkerEvent>);
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
      model = createSpatialModel(defaultSpatialConfig(), () => f.worker);
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
    expect(() => model.configure({ ...defaultSpatialConfig(), initialState: [NaN, 0, 0, 0] })).toThrow();
    expect(model.state.sample).toBe(before);
    expect(model.state.revision).toBe(revision);
    model.configure(defaultSpatialConfig('system:spherical-embedded'));
    expect(model.state).toMatchObject({ status: 'ready', valid: true, revision: revision + 1 });
    expect(model.state.sample.state).toHaveLength(6);
    expect(model.state.sample.step).toBe(0);
    model.dispose();
  });

  it('completes a fractional last step with exact start time and retains sparse final samples', () => {
    vi.useFakeTimers();
    const config = { ...defaultSpatialConfig(), startTime: 2, step: 0.003, duration: 0.01, sampleEvery: 100 };
    const f = fakeWorker(),
      model = createSpatialModel(config, () => f.worker);
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
    const original = defaultSpatialConfig('system:spherical-embedded-chain');
    const model = createSpatialModel(original);
    const state = model.state;
    for (const value of [
      state.samples,
      state.sample,
      state.sample.state,
      state.sample.positions,
      ...state.sample.positions,
      state.sample.velocities,
      ...state.sample.velocities,
      state.sample.energy,
      state.sample.angularMomentum,
      state.sample.constraintErrors,
      state.sample.unitConstraintErrors,
      state.sample.tangentConstraintErrors,
      state.sample.poleProximity,
      state.sample.warnings
    ])
      expect(Object.isFrozen(value)).toBe(true);
    // Probe runtime aliasing even though the public configuration is statically readonly.
    expect(Reflect.set(state.config.parameters.masses, '0', 99)).toBe(true);
    expect(Reflect.set(original.parameters.lengths, '0', 99)).toBe(true);
    expect(model.state.config.parameters.masses[0]).toBe(1);
    expect(model.state.config.parameters.lengths[0]).toBe(1);
    model.dispose();
  });

  it('rejects unsupported analyses atomically without dropping requests or resetting a run', () => {
    vi.useFakeTimers();
    const f = fakeWorker(),
      model = createSpatialModel(defaultSpatialConfig(), () => f.worker);
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
    const config = { ...defaultSpatialConfig(), initialState: [0.01, 0, 10000, 10000], step: 0.05, duration: 1 };
    const f = fakeWorker(),
      model = createSpatialModel(config, () => f.worker);
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
        .fn<() => SpatialWorker>()
        .mockImplementationOnce(() => {
          throw new Error('blocked');
        })
        .mockImplementation(() => f.worker);
    const model = createSpatialModel(defaultSpatialConfig(), factory);
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
