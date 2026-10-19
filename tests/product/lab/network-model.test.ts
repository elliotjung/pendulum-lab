import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createNetworkSimulation,
  defaultNetworkConfig,
  resizeNetworkConfig,
  type NetworkConfig
} from '../../../src/product/adapters/physics/network';
import type { NetworkWorker } from '../../../src/product/adapters/physics/network-client';
import {
  createNetworkWorkerSession,
  createNetworkBasinWorkerSession,
  type NetworkWorkerRequest,
  type NetworkBasinWorkerRequest,
  type NetworkWorkerEvent,
  type NetworkBasinWorkerEvent
} from '../../../src/product/adapters/physics/network-worker-protocol';
import { createNetworkModel } from '../../../src/product/lab/views/network-model';
import { createNetworkBasinModel } from '../../../src/product/lab/views/network-basin';

function fakeWorker(basin = false) {
  const requests: (NetworkWorkerRequest | NetworkBasinWorkerRequest)[] = [],
    session = createNetworkWorkerSession(() => 0),
    grid = createNetworkBasinWorkerSession(() => 0);
  const worker: NetworkWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(request) {
      requests.push(request);
    },
    terminate: vi.fn()
  };
  return {
    worker,
    requests,
    flush() {
      const request = requests.shift();
      if (!request) throw new Error('Expected queued request');
      const event = basin
        ? grid.handle(request as NetworkBasinWorkerRequest)
        : session.handle(request as NetworkWorkerRequest);
      worker.onmessage?.({ data: event } as MessageEvent<NetworkWorkerEvent | NetworkBasinWorkerEvent>);
      return event;
    }
  };
}
afterEach(() => vi.useRealTimers());
describe('S15 bounded network workspace lifecycle', () => {
  it('steps through the worker, pauses and resumes the same native state, then cancels', () => {
    vi.useFakeTimers();
    const config = { ...defaultNetworkConfig('system:kuramoto'), duration: 0.1 },
      f = fakeWorker(),
      factory = vi.fn(() => f.worker),
      model = createNetworkModel(config, factory);
    model.step();
    expect(model.state.sample.step).toBe(0);
    f.flush();
    f.flush();
    expect(model.state).toMatchObject({ status: 'paused', busy: false });
    expect(model.state.sample.step).toBe(1);
    model.run();
    vi.advanceTimersByTime(16);
    model.pause();
    f.flush();
    const paused = model.state.sample;
    vi.advanceTimersByTime(100);
    expect(model.state.sample).toEqual(paused);
    expect(f.requests).toHaveLength(0);
    model.run();
    vi.advanceTimersByTime(16);
    f.flush();
    expect(model.state.sample.step).toBeGreaterThan(paused.step);
    const native = createNetworkSimulation(config);
    while (native.snapshot().step < model.state.sample.step) native.step();
    expect(model.state.sample).toEqual(native.snapshot());
    expect(factory).toHaveBeenCalledOnce();
    model.cancel();
    expect(model.state.status).toBe('cancelled');
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    model.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['cancel', 'reset', 'configure', 'dispose'] as const)(
    '%s ignores queued responses from an older worker generation',
    (operation) => {
      vi.useFakeTimers();
      const f = fakeWorker(),
        model = createNetworkModel(defaultNetworkConfig('system:kuramoto'), () => f.worker),
        listener = vi.fn();
      model.subscribe(listener);
      model.step();
      f.flush();
      const callback = f.worker.onmessage!,
        pending = f.requests[0]!;
      if (operation === 'configure') model.configure(defaultNetworkConfig('system:pendulum-network'));
      else model[operation]();
      const before = model.state,
        calls = listener.mock.calls.length;
      callback({
        data: { type: 'error', id: pending.id, sequence: pending.sequence, message: 'stale' }
      } as MessageEvent<NetworkWorkerEvent>);
      expect(model.state).toEqual(before);
      expect(listener).toHaveBeenCalledTimes(calls);
      expect(f.worker.terminate).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      model.dispose();
    }
  );
  it('rejects configurations whose initial derived diagnostics overflow before replacing any state', () => {
    const current = defaultNetworkConfig('system:pendulum-network'),
      model = createNetworkModel(current),
      before = model.state;
    const invalid: NetworkConfig = {
      ...current,
      initialState: [
        ...current.initialState.slice(0, current.graph.nodes.length),
        ...current.graph.nodes.map(() => 10000)
      ]
    };
    expect(() => model.configure(invalid)).toThrow('유한 안전');
    expect(model.state).toEqual(before);
    model.dispose();
  });
  it('stops on invalid edits and preserves last accepted samples after worker startup failure', async () => {
    vi.useFakeTimers();
    const f = fakeWorker(),
      model = createNetworkModel(defaultNetworkConfig('system:kuramoto'), () => f.worker);
    model.step();
    f.flush();
    f.flush();
    const accepted = model.state.sample;
    model.setValid(false);
    model.run();
    model.step();
    expect(model.state.sample).toBe(accepted);
    expect(model.state.valid).toBe(false);
    model.dispose();
    const failing = createNetworkModel(defaultNetworkConfig(), () => {
      throw new Error('startup failed');
    });
    failing.run();
    await Promise.resolve();
    expect(failing.state).toMatchObject({ status: 'error', busy: false });
    expect(failing.state.sample.step).toBe(0);
    expect(failing.state.error).toContain('startup failed');
    failing.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('retains the fractional final sample even when the requested recording stride is larger than the run', () => {
    vi.useFakeTimers();
    const config = {
        ...defaultNetworkConfig('system:kuramoto'),
        startTime: 2,
        duration: 0.01,
        step: 0.003,
        sampleEvery: 100
      },
      f = fakeWorker(),
      model = createNetworkModel(config, () => f.worker);
    model.run();
    f.flush();
    vi.advanceTimersByTime(16);
    f.flush();
    expect(model.state.status).toBe('completed');
    expect(model.state.samples.map((sample) => sample.step)).toEqual([0, 4]);
    expect(model.state.sample.time).toBe(2.01);
    expect(model.state.progress).toBe(1);
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    model.dispose();
  });
  it('cancels a 128-node run while a reply is pending and leaves no timers or restart requests', () => {
    vi.useFakeTimers();
    const config = resizeNetworkConfig(defaultNetworkConfig('system:kuramoto'), 128, 2),
      f = fakeWorker(),
      model = createNetworkModel(config, () => f.worker);
    model.run();
    f.flush();
    vi.advanceTimersByTime(16);
    const callback = f.worker.onmessage!,
      request = f.requests[0]!;
    model.cancel();
    const before = model.state;
    callback({
      data: { type: 'error', id: request.id, sequence: request.sequence, message: 'stale' }
    } as MessageEvent<NetworkWorkerEvent>);
    vi.advanceTimersByTime(1000);
    expect(model.state).toEqual(before);
    expect(model.state.status).toBe('cancelled');
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    model.dispose();
  });
});
describe('S15 independently cancellable magnetic seed grid', () => {
  it('completes a deterministic bounded grid and disposes worker/timer resources', () => {
    vi.useFakeTimers();
    const base = defaultNetworkConfig(),
      config = { ...base, basin: { ...base.basin!, size: 2, maxSteps: 3 } },
      f = fakeWorker(true),
      changed = vi.fn(),
      model = createNetworkBasinModel(changed, () => f.worker);
    model.run(config);
    f.flush();
    vi.advanceTimersByTime(0);
    f.flush();
    expect(model.state.status).toBe('completed');
    expect(model.state.snapshot?.completed).toBe(4);
    expect(model.state.snapshot?.cells.every((cell) => !cell.converged)).toBe(true);
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    model.dispose();
  });
  it.each(['cancel', 'reset', 'dispose'] as const)(
    '%s terminates an in-progress cell and ignores its later result',
    (operation) => {
      vi.useFakeTimers();
      const f = fakeWorker(true),
        changed = vi.fn(),
        model = createNetworkBasinModel(changed, () => f.worker);
      model.run(defaultNetworkConfig());
      f.flush();
      vi.advanceTimersByTime(0);
      const callback = f.worker.onmessage!,
        request = f.requests[0]!;
      model[operation]();
      const before = model.state,
        calls = changed.mock.calls.length;
      callback({
        data: { type: 'error', id: request.id, sequence: request.sequence, message: 'stale' }
      } as MessageEvent<NetworkBasinWorkerEvent>);
      vi.advanceTimersByTime(1000);
      expect(model.state).toEqual(before);
      expect(changed).toHaveBeenCalledTimes(calls);
      expect(f.worker.terminate).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      model.dispose();
    }
  );
  it('keeps completed cells when a later worker request fails', () => {
    vi.useFakeTimers();
    const base = defaultNetworkConfig(),
      config = { ...base, basin: { ...base.basin!, size: 2, maxSteps: 64 } },
      f = fakeWorker(true),
      model = createNetworkBasinModel(
        () => {},
        () => f.worker
      );
    model.run(config);
    f.flush();
    vi.advanceTimersByTime(0);
    f.flush();
    expect(model.state.snapshot?.completed).toBe(1);
    const snapshot = model.state.snapshot;
    f.worker.onerror?.({ preventDefault: vi.fn() } as unknown as ErrorEvent);
    expect(model.state).toMatchObject({ status: 'error', snapshot });
    expect(model.state.error).toContain('worker');
    model.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
