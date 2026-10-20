import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFieldSimulation, defaultFieldConfig } from '../../../src/product/adapters/physics/field';
import {
  createFieldWorkerSession,
  type FieldWorkerRequest,
  type FieldWorkerEvent
} from '../../../src/product/adapters/physics/field-worker-protocol';
import type { FieldWorker } from '../../../src/product/adapters/physics/field-client';
import { createFieldModel } from '../../../src/product/lab/views/field-model';
function fakeWorker() {
  const requests: FieldWorkerRequest[] = [],
    session = createFieldWorkerSession(() => 0);
  const worker: FieldWorker = {
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
      worker.onmessage?.({ data: event } as MessageEvent<FieldWorkerEvent>);
      return event;
    }
  };
}
afterEach(() => vi.useRealTimers());
describe('S16 bounded worker workspace lifecycle', () => {
  it('steps pauses resumes one native seeded stream and cancels without timer leaks', () => {
    vi.useFakeTimers();
    const config = { ...defaultFieldConfig(), duration: 0.2 },
      f = fakeWorker(),
      factory = vi.fn(() => f.worker),
      model = createFieldModel(config, factory);
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
    const native = createFieldSimulation(config);
    while (native.snapshot().step < model.state.sample.step) native.step();
    expect(model.state.sample).toEqual(native.snapshot());
    expect(factory).toHaveBeenCalledOnce();
    model.cancel();
    expect(model.state.status).toBe('cancelled');
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    model.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['cancel', 'reset', 'configure', 'dispose'] as const)('%s ignores stale worker replies', (operation) => {
    vi.useFakeTimers();
    const f = fakeWorker(),
      model = createFieldModel(defaultFieldConfig(), () => f.worker),
      changed = vi.fn();
    model.subscribe(changed);
    model.step();
    f.flush();
    const callback = f.worker.onmessage!,
      request = f.requests[0]!;
    if (operation === 'configure') model.configure(defaultFieldConfig('system:fput'));
    else model[operation]();
    const before = model.state,
      count = changed.mock.calls.length;
    callback({
      data: { type: 'error', id: request.id, sequence: request.sequence, message: 'stale' }
    } as MessageEvent<FieldWorkerEvent>);
    expect(model.state).toEqual(before);
    expect(changed).toHaveBeenCalledTimes(count);
    model.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('completes diagnostics without advancing fictitious time', () => {
    vi.useFakeTimers();
    const f = fakeWorker(),
      model = createFieldModel(defaultFieldConfig('system:lattice-fk-limit'), () => f.worker);
    model.run();
    f.flush();
    expect(model.state.status).toBe('completed');
    expect(model.state.progress).toBe(1);
    expect(model.state.sample.step).toBe(0);
    expect(model.state.sample.time).toBe(0);
    expect(model.state.samples).toHaveLength(1);
    expect(f.requests).toHaveLength(0);
    model.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('preserves last valid samples on invalid edits and worker startup errors', async () => {
    vi.useFakeTimers();
    const model = createFieldModel(defaultFieldConfig(), () => {
      throw new Error('fixture startup');
    });
    model.setValid(false);
    model.run();
    expect(model.state.status).toBe('cancelled');
    model.setValid(true);
    model.run();
    await Promise.resolve();
    expect(model.state.status).toBe('error');
    expect(model.state.sample.step).toBe(0);
    expect(model.state.error).toContain('fixture startup');
    model.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
