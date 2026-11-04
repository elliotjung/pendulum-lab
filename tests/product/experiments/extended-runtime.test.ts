import { describe, expect, it, vi } from 'vitest';
import { createExtendedRuntime } from '../../../src/product/experiments/extended-runtime';
import { extendedPresetFields } from '../../../src/product/experiments/extended-config';
import { executeExtendedExperiment } from '../../../src/product/experiments/extended-science';
import type {
  ExtendedExecutor,
  ExtendedEvent,
  ExtendedRequest
} from '../../../src/product/experiments/extended-worker';
import type {
  BatchExecutor,
  BatchWorkerEvent,
  BatchWorkerRequest
} from '../../../src/product/lab/experiments/contracts';
import { executeBatchRun } from '../../../src/product/lab/experiments/execute';
import type { LearnUnit } from '../../../src/product/learn/schema';

const lesson = (id = '2.1') => ({ id, courseId: `course-${id[0]}`, contentVersion: 1 }) as LearnUnit;
function controlledExecutor() {
  const requests: {
    request: ExtendedRequest;
    callback: (event: ExtendedEvent) => void;
    dispose: ReturnType<typeof vi.fn>;
  }[] = [];
  const executor: ExtendedExecutor = (request, callback) => {
    const dispose = vi.fn();
    requests.push({ request, callback, dispose });
    return { dispose };
  };
  return {
    executor,
    requests,
    complete(index: number) {
      const task = requests[index]!;
      task.callback({
        type: 'result',
        id: task.request.id,
        result: executeExtendedExperiment(task.request.unitId, task.request.fields, undefined, task.request.batch)
      });
    }
  };
}
function controlledBatch() {
  const requests: {
    request: BatchWorkerRequest;
    callback: (event: BatchWorkerEvent) => void;
    dispose: ReturnType<typeof vi.fn>;
  }[] = [];
  const executor: BatchExecutor = (request, callback) => {
    const dispose = vi.fn();
    requests.push({ request, callback, dispose });
    return { dispose };
  };
  return {
    executor,
    requests,
    complete(index: number) {
      const task = requests[index]!;
      task.callback({ type: 'result', id: task.request.run.id, result: executeBatchRun(task.request) });
    }
  };
}
describe('S25 unit-scoped workers and S21 queue lifecycle', () => {
  it('terminates cancelled jobs and ignores stale results even after another run starts', () => {
    const jobs = controlledExecutor(),
      runtime = createExtendedRuntime(lesson(), { executor: jobs.executor });
    runtime.run();
    expect(runtime.getSnapshot().status).toBe('running');
    expect(runtime.setFields({ omega1: 0.1 }).ok).toBe(false);
    runtime.cancel();
    expect(jobs.requests[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(runtime.getSnapshot().status).toBe('cancelled');
    runtime.run();
    jobs.complete(0);
    expect(runtime.getSnapshot().status).toBe('running');
    expect(runtime.getSnapshot().result).toBeNull();
    jobs.complete(1);
    expect(runtime.getSnapshot().status).toBe('completed');
    expect(jobs.requests[1]!.dispose).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });
  it('retains results on rejected edits and rejects accessors without evaluating them', () => {
    const jobs = controlledExecutor(),
      runtime = createExtendedRuntime(lesson(), { executor: jobs.executor });
    runtime.run();
    jobs.complete(0);
    const before = runtime.getSnapshot();
    expect(runtime.setFields({ m1: 2 }).ok).toBe(false);
    expect(runtime.getSnapshot()).toEqual(before);
    const getter = vi.fn(() => 0.5),
      input = {};
    Object.defineProperty(input, 'omega1', { enumerable: true, get: getter });
    expect(runtime.setFields(input).ok).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(runtime.getSnapshot()).toEqual(before);
    runtime.dispose();
  });
  it('handles a synchronous executor result and detaches its disposed job exactly once', () => {
    const dispose = vi.fn(),
      unit = lesson();
    const runtime = createExtendedRuntime(unit, {
      executor: (request, callback) => {
        callback({ type: 'result', id: request.id, result: executeExtendedExperiment(request.unitId, request.fields) });
        return { dispose };
      }
    });
    runtime.run();
    expect(runtime.getSnapshot().status).toBe('completed');
    expect(dispose).toHaveBeenCalledTimes(1);
    runtime.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
  it('isolates its unit identity and all returned snapshots from caller mutations', () => {
    const unit = lesson(),
      jobs = controlledExecutor(),
      runtime = createExtendedRuntime(unit, { executor: jobs.executor });
    (unit as { id: string }).id = '3.1';
    (runtime.getSnapshot().fields as Record<string, number>).m1 = 5;
    runtime.run();
    expect(jobs.requests[0]!.request.unitId).toBe('2.1');
    expect(jobs.requests[0]!.request.fields.m1).toBe(1);
    runtime.cancel();
    runtime.dispose();
  });
  it('surfaces startup errors and ignores all work after disposal', () => {
    const runtime = createExtendedRuntime(lesson(), {
        executor: () => {
          throw new Error('worker unavailable');
        }
      }),
      listener = vi.fn();
    runtime.subscribe(listener);
    runtime.run();
    expect(runtime.getSnapshot().status).toBe('error');
    expect(runtime.getSnapshot().error).toContain('worker unavailable');
    runtime.dispose();
    const calls = listener.mock.calls.length;
    runtime.run();
    runtime.restart();
    expect(listener).toHaveBeenCalledTimes(calls);
  });
  it('uses the real S21 queue at concurrency two and feeds its exact native results to diagnostics', async () => {
    const jobs = controlledExecutor(),
      batch = controlledBatch(),
      runtime = createExtendedRuntime(lesson('2.9'), { executor: jobs.executor, batchExecutor: batch.executor });
    runtime.run();
    await vi.waitFor(() => expect(batch.requests).toHaveLength(2));
    expect(jobs.requests).toHaveLength(0);
    batch.complete(0);
    await vi.waitFor(() => expect(batch.requests).toHaveLength(3));
    batch.complete(1);
    batch.complete(2);
    await vi.waitFor(() => expect(jobs.requests).toHaveLength(1));
    const request = jobs.requests[0]!.request;
    expect(request.batch?.status).toBe('completed');
    expect(request.batch?.aggregate.completed).toBe(3);
    expect(request.batch?.plan.source).toEqual(request.batch?.plan.runs[0]!.experiment);
    jobs.complete(0);
    const result = runtime.getSnapshot().result!;
    expect(runtime.getSnapshot().status).toBe('completed');
    expect(result.batch).toEqual(request.batch);
    expect(result.canonical).toEqual(request.batch!.plan.source);
    runtime.dispose();
  });
  it('terminates all running S21 jobs on cancel and never adopts their late results', async () => {
    const jobs = controlledExecutor(),
      batch = controlledBatch(),
      runtime = createExtendedRuntime(lesson('2.9'), { executor: jobs.executor, batchExecutor: batch.executor });
    runtime.run();
    await vi.waitFor(() => expect(batch.requests).toHaveLength(2));
    runtime.cancel();
    for (const task of batch.requests) expect(task.dispose).toHaveBeenCalledTimes(1);
    batch.complete(0);
    batch.complete(1);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(runtime.getSnapshot().status).toBe('cancelled');
    expect(jobs.requests).toHaveLength(0);
    runtime.dispose();
  });
  it('reports S21 partial failure without losing the declared restart settings', async () => {
    const jobs = controlledExecutor(),
      batch = controlledBatch(),
      runtime = createExtendedRuntime(lesson('2.9'), { executor: jobs.executor, batchExecutor: batch.executor });
    runtime.run();
    await vi.waitFor(() => expect(batch.requests).toHaveLength(2));
    const task = batch.requests[0]!;
    task.callback({ type: 'error', id: task.request.run.id, message: 'failed native run' });
    batch.complete(1);
    await vi.waitFor(() => expect(batch.requests).toHaveLength(3));
    batch.complete(2);
    await vi.waitFor(() => expect(runtime.getSnapshot().status).toBe('error'));
    expect(runtime.getSnapshot().fields).toEqual(extendedPresetFields('2.9'));
    expect(jobs.requests).toHaveLength(0);
    runtime.dispose();
  });
});
