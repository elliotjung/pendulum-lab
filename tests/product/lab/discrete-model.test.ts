import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDiscreteSimulation, defaultDiscreteConfig } from '../../../src/product/adapters/physics/discrete';
import {
  createDiscreteWorkerSession,
  type DiscreteWorkerRequest,
  type DiscreteWorkerEvent
} from '../../../src/product/adapters/physics/discrete-worker-protocol';
import type { DiscreteWorker } from '../../../src/product/adapters/physics/discrete-client';
import { createDiscreteModel } from '../../../src/product/lab/views/discrete-model';
function fakeWorker() {
  const requests: DiscreteWorkerRequest[] = [],
    session = createDiscreteWorkerSession(() => 0);
  const worker: DiscreteWorker = {
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
      const event = session.handle(request);
      worker.onmessage?.({ data: event } as MessageEvent<DiscreteWorkerEvent>);
      return event;
    }
  };
}
afterEach(() => vi.useRealTimers());
describe('S17 discrete worker workspace lifecycle', () => {
  it('steps pauses and resumes exact native state; cancels and disposes timers', () => {
    vi.useFakeTimers();
    const config = { ...defaultDiscreteConfig('system:quantum-kicked-rotor'), iterations: 40 },
      f = fakeWorker(),
      factory = vi.fn(() => f.worker),
      model = createDiscreteModel(config, factory);
    model.step();
    f.flush();
    f.flush();
    expect(model.state.sample.step).toBe(1);
    expect(model.state.status).toBe('paused');
    model.run();
    vi.advanceTimersByTime(16);
    model.pause();
    f.flush();
    const paused = model.state.sample;
    vi.advanceTimersByTime(100);
    expect(model.state.sample).toBe(paused);
    expect(f.requests).toHaveLength(0);
    model.run();
    vi.advanceTimersByTime(16);
    f.flush();
    const direct = createDiscreteSimulation(config);
    while (direct.snapshot().step < model.state.sample.step) direct.step();
    expect(model.state.sample).toEqual(direct.snapshot());
    expect(factory).toHaveBeenCalledOnce();
    model.cancel();
    expect(model.state.status).toBe('cancelled');
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    model.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['cancel', 'reset', 'configure', 'dispose'] as const)('%s rejects stale worker replies', (operation) => {
    vi.useFakeTimers();
    const f = fakeWorker(),
      model = createDiscreteModel(defaultDiscreteConfig(), () => f.worker),
      changed = vi.fn();
    model.subscribe(changed);
    model.step();
    f.flush();
    const callback = f.worker.onmessage!,
      request = f.requests[0]!;
    if (operation === 'configure') model.configure(defaultDiscreteConfig('system:quantum-kicked-rotor'));
    else model[operation]();
    const before = model.state,
      count = changed.mock.calls.length;
    callback({
      data: { type: 'error', id: request.id, sequence: request.sequence, message: 'stale' }
    } as MessageEvent<DiscreteWorkerEvent>);
    expect(model.state).toEqual(before);
    expect(changed).toHaveBeenCalledTimes(count);
    model.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('evaluates a Floquet matrix without inventing iteration progress', () => {
    vi.useFakeTimers();
    const f = fakeWorker(),
      model = createDiscreteModel(defaultDiscreteConfig('system:unitary-floquet'), () => f.worker);
    model.run();
    f.flush();
    expect(model.state.status).toBe('completed');
    expect(model.state.progress).toBe(1);
    expect(model.state.sample.step).toBe(0);
    expect(model.state.sample.iteration).toBe(0);
    expect(model.state.samples).toHaveLength(1);
    expect(f.requests).toHaveLength(0);
    model.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects failed Floquet roots before replacing the applied configuration or observations', () => {
    const model = createDiscreteModel(defaultDiscreteConfig('system:unitary-floquet')),
      before = model.state,
      changed = vi.fn();
    model.subscribe(changed);
    expect(() =>
      model.configure({
        ...before.config,
        gridSize: 2,
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
      })
    ).toThrow();
    expect(model.state).toEqual(before);
    expect(model.state.sample).toBe(before.sample);
    expect(changed).not.toHaveBeenCalled();
    model.dispose();
  });
  it('retains valid state on invalid edits, invalid configuration and startup errors', async () => {
    vi.useFakeTimers();
    const model = createDiscreteModel(defaultDiscreteConfig(), () => {
        throw new Error('fixture startup');
      }),
      before = model.state.config;
    expect(() => model.configure({ ...before, iterations: 0 })).toThrow();
    expect(model.state.config).toEqual(before);
    model.setValid(false);
    model.run();
    expect(model.state.status).toBe('cancelled');
    model.setValid(true);
    model.run();
    await Promise.resolve();
    expect(model.state.status).toBe('error');
    expect(model.state.error).toContain('fixture startup');
    expect(model.state.sample.step).toBe(0);
    model.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
