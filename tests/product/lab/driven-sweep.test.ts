import { describe, expect, it, vi } from 'vitest';
import {
  defaultDrivenConfig,
  createDrivenSimulation,
  type DrivenConfig
} from '../../../src/product/adapters/physics/driven';
import type { DrivenWorker } from '../../../src/product/adapters/physics/driven-client';
import {
  createDrivenWorkerSession,
  type DrivenWorkerEvent,
  type DrivenWorkerRequest
} from '../../../src/product/adapters/physics/driven-worker-protocol';
import { createDrivenSweep } from '../../../src/product/lab/views/driven-sweep';

function workers() {
  const instances: { worker: DrivenWorker; requests: DrivenWorkerRequest[]; flush(): void }[] = [];
  const factory = () => {
    const requests: DrivenWorkerRequest[] = [],
      session = createDrivenWorkerSession(() => 0);
    const worker: DrivenWorker = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage(request) {
        requests.push(request);
      },
      terminate: vi.fn()
    };
    instances.push({
      worker,
      requests,
      flush() {
        const request = requests.shift();
        if (!request) throw new Error('Expected worker request');
        worker.onmessage?.({ data: session.handle(request) } as MessageEvent<DrivenWorkerEvent>);
      }
    });
    return worker;
  };
  return {
    factory,
    instances,
    drain() {
      for (let i = 0; i < 10000; i++) {
        const instance = instances.find((w) => w.requests.length && w.worker.onmessage);
        if (!instance) return;
        instance.flush();
      }
      throw new Error('Worker drain exceeded limit');
    }
  };
}
describe('S13 bounded frequency response entry', () => {
  it('runs independent frequencies through workers and measures the last-half sample range', () => {
    const f = workers(),
      sweep = createDrivenSweep(f.factory),
      base = { ...defaultDrivenConfig(), duration: 0.04, step: 0.002 };
    sweep.run(base, 0.5, 1.5, 3);
    f.drain();
    expect(sweep.state).toMatchObject({ status: 'completed', progress: 1, error: '' });
    expect(f.instances).toHaveLength(3);
    for (const [i, point] of sweep.state.points.entries()) {
      const config: DrivenConfig = { ...base, forcing: { ...base.forcing!, frequency: 0.5 + i * 0.5 } },
        simulation = createDrivenSimulation(config),
        samples = [];
      while (!simulation.done) {
        const sample = simulation.step();
        if (sample.time >= base.duration / 2) samples.push(sample.state[0]!);
      }
      expect(point.frequency).toBe(0.5 + i * 0.5);
      expect(point.amplitude).toBeCloseTo((Math.max(...samples) - Math.min(...samples)) / 2, 14);
      expect(point.samples).toBe(samples.length);
      expect(Object.isFrozen(point)).toBe(true);
    }
    expect(Object.isFrozen(sweep.state.points)).toBe(true);
    for (const instance of f.instances) expect(instance.worker.terminate).toHaveBeenCalledOnce();
    sweep.dispose();
  });
  it('rejects incompatible systems, invalid ranges and counts atomically', () => {
    const sweep = createDrivenSweep(),
      before = sweep.state;
    for (const [start, end, count] of [
      [0, 1, 7],
      [0, 1, 1],
      [0, 1, 2.5],
      [-1, 2, 3],
      [1, 1, 3],
      [0, Infinity, 3]
    ])
      expect(() => sweep.run(defaultDrivenConfig(), start!, end!, count!)).toThrow();
    expect(() => sweep.run(defaultDrivenConfig('system:coupled'), 0, 1, 3)).toThrow();
    expect(sweep.state).toEqual(before);
    expect(Object.isFrozen(sweep.state.points)).toBe(true);
    sweep.dispose();
  });
  it.each(['cancel', 'dispose'] as const)(
    '%s during synchronous progress ignores pending work and late callbacks',
    (operation) => {
      const f = workers(),
        sweep = createDrivenSweep(f.factory);
      sweep.run(defaultDrivenConfig(), 0.5, 1, 2);
      const instance = f.instances[0]!,
        callback = instance.worker.onmessage!;
      let cancelled = false;
      sweep.subscribe(() => {
        if (!cancelled && sweep.state.status === 'running') {
          cancelled = true;
          sweep[operation]();
        }
      });
      instance.flush();
      expect(instance.requests).toHaveLength(0);
      const before = sweep.state;
      callback({
        data: { type: 'error', id: 'late', sequence: 1, message: 'stale' }
      } as MessageEvent<DrivenWorkerEvent>);
      expect(sweep.state).toEqual(before);
      expect(instance.worker.terminate).toHaveBeenCalledOnce();
      sweep.dispose();
    }
  );
  it('can cancel before ready and retry with fresh workers', () => {
    const f = workers(),
      sweep = createDrivenSweep(f.factory);
    sweep.run(defaultDrivenConfig(), 0.5, 1, 2);
    sweep.cancel();
    expect(sweep.state.status).toBe('cancelled');
    sweep.run({ ...defaultDrivenConfig(), duration: 0.01 }, 0.5, 1, 2);
    f.drain();
    expect(sweep.state.status).toBe('completed');
    expect(f.instances).toHaveLength(3);
    sweep.dispose();
  });
  it.each(['completed', 'cancelled'] as const)('clears %s results when conditions change', (status) => {
    const f = workers(),
      sweep = createDrivenSweep(f.factory);
    sweep.run({ ...defaultDrivenConfig(), duration: 0.01 }, 0.5, 1, 2);
    if (status === 'completed') f.drain();
    else sweep.cancel();
    expect(sweep.state.status).toBe(status);
    if (status === 'completed') expect(sweep.state.points).toHaveLength(2);
    sweep.reset();
    expect(sweep.state).toEqual({ status: 'ready', progress: 0, error: '', points: [] });
    expect(Object.isFrozen(sweep.state.points)).toBe(true);
    sweep.dispose();
  });
  it('reset terminates active work and ignores late progress from the cleared generation', () => {
    const f = workers(),
      sweep = createDrivenSweep(f.factory);
    sweep.run(defaultDrivenConfig(), 0.5, 1, 2);
    const instance = f.instances[0]!,
      callback = instance.worker.onmessage!;
    instance.flush();
    const request = instance.requests.shift()!;
    const lateSession = createDrivenWorkerSession(() => 0);
    lateSession.handle({ type: 'initialize', id: request.id, sequence: 0, config: defaultDrivenConfig() });
    const lateProgress = lateSession.handle(request);
    expect(lateProgress.type).toBe('progress');
    sweep.reset();
    const before = sweep.state;
    callback({ data: lateProgress } as MessageEvent<DrivenWorkerEvent>);
    expect(sweep.state).toEqual(before);
    expect(instance.worker.terminate).toHaveBeenCalledOnce();
    expect(instance.worker.onmessage).toBeNull();
    sweep.dispose();
  });
  it('reports worker failure without changing the main run or dropping completed points', () => {
    const f = workers(),
      sweep = createDrivenSweep(f.factory);
    sweep.run(defaultDrivenConfig(), 0.5, 1, 2);
    const instance = f.instances[0]!;
    instance.worker.onerror?.({ message: 'blocked', preventDefault() {} } as ErrorEvent);
    expect(sweep.state.status).toBe('error');
    expect(sweep.state.error).toContain('worker');
    expect(sweep.state.points).toEqual([]);
    expect(instance.worker.terminate).toHaveBeenCalledOnce();
    sweep.dispose();
  });
});
