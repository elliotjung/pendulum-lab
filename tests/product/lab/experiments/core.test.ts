import { describe, expect, it } from 'vitest';
import {
  defaultPlanarConfig,
  toCanonicalPlanar,
  createPlanarSimulation
} from '../../../../src/product/adapters/physics/planar';
import {
  buildBatch,
  defaultBatchSettings,
  compatibleBatchIntegrators
} from '../../../../src/product/lab/experiments/builders';
import { createBatchQueue } from '../../../../src/product/lab/experiments/queue';
import { executeBatchRun } from '../../../../src/product/lab/experiments/execute';
import { parseBatch, serializeBatch } from '../../../../src/product/lab/experiments/artifact';
import { batchData } from '../../../../src/product/lab/experiments/safe';
import type {
  BatchBuilderSettings,
  BatchExecutor,
  BatchWorkerEvent,
  BatchWorkerRequest
} from '../../../../src/product/lab/experiments/contracts';

function source() {
  const checked = toCanonicalPlanar({ ...defaultPlanarConfig(), step: 0.01, duration: 0.02 });
  if (!checked.ok) throw new Error('fixture');
  return checked.value;
}
function settings(patch: Partial<BatchBuilderSettings> = {}): BatchBuilderSettings {
  return { ...defaultBatchSettings(source()), ...patch };
}
const axis = (key = 'theta1', start = 0.1, end = 0.3, count = 3) => ({
  group: 'initialConditions' as const,
  key,
  start,
  end,
  count
});
const tick = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
function controlled() {
  const calls: { request: BatchWorkerRequest; send(event: BatchWorkerEvent): void; disposed: boolean }[] = [];
  const executor: BatchExecutor = (request, send) => {
    const call = { request, send, disposed: false };
    calls.push(call);
    return {
      dispose: () => {
        call.disposed = true;
      }
    };
  };
  const complete = (index: number) => {
    const call = calls[index]!;
    call.send({ type: 'result', id: call.request.run.id, result: executeBatchRun(call.request) });
  };
  return { calls, executor, complete };
}

describe('S21 deterministic experiment builders', () => {
  it('paired preserves the entire baseline and changes one decreasing canonical quantity', () => {
    const input = source(),
      frozen = structuredClone(input);
    const plan = buildBatch(input, settings({ axes: [axis('theta1', 1, -0.3)] }));
    expect(plan.runs[0]!.experiment).toEqual(input);
    expect(plan.runs[1]!.experiment.initialConditions.theta1).toEqual({ kind: 'scalar', value: -0.3, unit: 'rad' });
    expect(input).toEqual(frozen);
    expect(plan.runs[1]!.experiment.integrator).toEqual(input.integrator);
    expect(plan.runs[1]!.experiment.runtime).toEqual(input.runtime);
  });
  it('grid is Cartesian in stable axis order and logarithmic grid hits endpoints', () => {
    const grid = buildBatch(
      source(),
      settings({ kind: 'grid', axes: [axis('theta1', 0.1, 0.3, 2), axis('theta2', 0.2, 0.6, 3)] })
    );
    expect(grid.runs).toHaveLength(6);
    expect(grid.runs.map((r) => r.assignments.map((v) => v.value))).toEqual([
      [0.1, 0.2],
      [0.1, 0.4],
      [0.1, 0.6],
      [0.3, 0.2],
      [0.3, 0.4],
      [0.3, 0.6]
    ]);
    const log = buildBatch(source(), settings({ kind: 'log', axes: [axis('theta1', 0.01, 1, 3)] }));
    expect(log.runs.map((r) => r.assignments[0]!.value)).toEqual([
      expect.closeTo(0.01, 14),
      expect.closeTo(0.1, 14),
      1
    ]);
  });
  it('LHS uses every stratum once in each dimension with deterministic seeded assignments', () => {
    const config = settings({ kind: 'lhs', axes: [axis('theta1', 0, 1), axis('theta2', 0, 1)], count: 100 });
    const a = buildBatch(source(), config),
      b = buildBatch(source(), config);
    expect(a).toEqual(b);
    for (const dim of [0, 1])
      expect(new Set(a.runs.map((r) => Math.floor(Number(r.assignments[dim]!.value) * 100))).size).toBe(100);
    expect(buildBatch(source(), { ...config, seed: 'changed' }).runs).not.toEqual(a.runs);
  });
  it('ensemble owns stable design seed identities without inventing a deterministic model seed', () => {
    const input = source();
    const a = buildBatch(input, settings({ kind: 'ensemble', axes: [], count: 256 }));
    expect(new Set(a.runs.map((r) => r.assignments[0]!.value)).size).toBe(256);
    expect(a.runs.every((r) => r.experiment.seed === undefined)).toBe(true);
    expect(a.source).toEqual(input);
    expect(a.runs.every((r) => r.experiment.analyses.length === input.analyses.length)).toBe(true);
    expect(a.runs[0]!.id).toBe(buildBatch(input, settings({ kind: 'ensemble', axes: [], count: 256 })).runs[0]!.id);
  });
  it('integrator comparison retains same seed state horizon and sampling', () => {
    const input = source(),
      ids = compatibleBatchIntegrators(input);
    expect(ids).toEqual(expect.arrayContaining(['integrator:euler', 'integrator:rk2', 'integrator:rk4']));
    const plan = buildBatch(input, settings({ kind: 'integrators', axes: [], integratorIds: ids }));
    for (const run of plan.runs) {
      expect(run.experiment.initialConditions).toEqual(input.initialConditions);
      expect(run.experiment.runtime).toEqual(input.runtime);
      expect(run.experiment.seed).toEqual(input.seed);
    }
  });
  it.each([
    { kind: 'grid', axes: [axis('theta1', 0, 1, 512), axis('theta2', 0, 1, 2)] },
    { kind: 'log', axes: [axis('theta1', 0, 1)] },
    { kind: 'grid', axes: [axis(), axis()] },
    { kind: 'lhs', concurrency: 5 },
    { kind: 'ensemble', count: 513 },
    { kind: 'integrators', axes: [], integratorIds: ['integrator:canonical', 'integrator:rk4'] }
  ] as Partial<BatchBuilderSettings>[])('rejects unsafe or unsupported plan %#', (patch) =>
    expect(() => buildBatch(source(), settings(patch))).toThrow()
  );
  it('refuses whole-batch resource excess before any execution', () => {
    const input = source();
    if (input.runtime.domain !== 'time') throw new Error();
    const large = { ...input, runtime: { ...input.runtime, duration: { value: 500, unit: 's' as const } } };
    expect(() => buildBatch(large, settings({ kind: 'ensemble', axes: [], count: 512 }))).toThrow();
  });
  it('refuses accessors, unknown fields and unsafe nested keys without invoking code', () => {
    let invoked = false;
    const input = {
      ...settings(),
      get extra() {
        invoked = true;
        return 1;
      }
    };
    expect(() => buildBatch(source(), input)).toThrow();
    expect(invoked).toBe(false);
    expect(() => batchData(JSON.parse('{"x":{"__proto__":{}}}'))).toThrow();
    expect(() => buildBatch(source(), { ...settings(), unknown: 1 } as BatchBuilderSettings)).toThrow();
  });
});

describe('S21 immutable execution scheduling and run artifacts', () => {
  it('has native endpoint parity with retained physical samples', () => {
    const input = source(),
      plan = buildBatch(input, settings()),
      request = { batchId: plan.id, run: plan.runs[0]! },
      result = executeBatchRun(request);
    const native = createPlanarSimulation({ ...defaultPlanarConfig(), step: 0.01, duration: 0.02 });
    while (!native.done) native.step();
    expect(result.summary.metrics.map((m) => m.final)).toEqual(native.snapshot().state);
    expect(result.summary.steps).toBe(2);
    expect(result.summary.sampleCount).toBe(3);
  });
  it('honors bounded concurrency and original aggregate order under reversed completion', async () => {
    const c = controlled(),
      plan = buildBatch(source(), settings({ kind: 'ensemble', axes: [], count: 8, concurrency: 2 })),
      queue = createBatchQueue(plan, { executor: c.executor });
    queue.start();
    await tick();
    expect(c.calls).toHaveLength(2);
    c.complete(1);
    await tick();
    expect(c.calls).toHaveLength(3);
    c.complete(0);
    await tick();
    for (let i = 2; i < 8; i++) {
      c.complete(i);
      await tick();
    }
    expect(queue.state.status).toBe('completed');
    expect(queue.state.aggregate.childRunIds).toEqual(plan.runs.map((r) => r.id));
    expect(queue.state.runs.every((r) => r.attempts === 1)).toBe(true);
    queue.dispose();
  });
  it('cancel preserves completed runs; stale results cannot change a restarted slot', async () => {
    const c = controlled(),
      plan = buildBatch(source(), settings({ kind: 'ensemble', axes: [], count: 3, concurrency: 1 })),
      queue = createBatchQueue(plan, { executor: c.executor });
    queue.start();
    await tick();
    c.complete(0);
    await tick();
    queue.cancel();
    expect(c.calls[1]!.disposed).toBe(true);
    expect(queue.state.runs.map((r) => r.status)).toEqual(['completed', 'pending', 'pending']);
    queue.resume();
    await tick();
    c.complete(1);
    expect(queue.state.runs[1]!.status).toBe('running');
    c.complete(2);
    await tick();
    c.complete(3);
    await tick();
    expect(queue.state.runs.map((r) => r.attempts)).toEqual([1, 2, 1]);
    expect(queue.state.status).toBe('completed');
    queue.dispose();
  });
  it('identifies partial failure and reruns selected failed run without changing successful outputs', async () => {
    const c = controlled(),
      queue = createBatchQueue(buildBatch(source(), settings()), { executor: c.executor });
    queue.start();
    await tick();
    c.complete(0);
    c.calls[1]!.send({ type: 'error', id: c.calls[1]!.request.run.id, message: 'native failure' });
    await tick();
    expect(queue.state.status).toBe('partial');
    const saved = queue.state.runs[0]!.result;
    expect(queue.retryFailed([queue.state.runs[1]!.id])).toBe(true);
    await tick();
    c.complete(2);
    await tick();
    expect(queue.state.status).toBe('completed');
    expect(queue.state.runs[0]!.result).toEqual(saved);
    expect(queue.state.runs[1]!.attempts).toBe(2);
    queue.dispose();
  });
  it('serializes full plan and completed partial progress for offline resume', async () => {
    const c = controlled(),
      queue = createBatchQueue(buildBatch(source(), settings({ kind: 'ensemble', axes: [], count: 4 })), {
        executor: c.executor
      });
    queue.start();
    await tick();
    c.complete(0);
    await tick();
    const parsed = parseBatch(serializeBatch(queue.snapshot()));
    const restored = createBatchQueue(parsed, { executor: c.executor });
    expect(restored.state.status).toBe('cancelled');
    expect(restored.state.runs[0]!.status).toBe('completed');
    expect(restored.state.runs.filter((r) => r.status === 'pending')).toHaveLength(3);
    queue.dispose();
    restored.dispose();
  });
  it('handles synchronous executors and hundreds of runs without exceeding configured slots', async () => {
    let active = 0,
      max = 0;
    const executor: BatchExecutor = (request, send) => {
      active++;
      max = Math.max(active, max);
      send({ type: 'result', id: request.run.id, result: executeBatchRun(request) });
      active--;
      return { dispose() {} };
    };
    const queue = createBatchQueue(
      buildBatch(source(), settings({ kind: 'ensemble', axes: [], count: 512, concurrency: 4 })),
      { executor }
    );
    queue.start();
    await tick();
    expect(queue.state.status).toBe('completed');
    expect(queue.state.aggregate.completed).toBe(512);
    expect(max).toBeLessThanOrEqual(4);
    queue.dispose();
  });
  it('cancel from an observer prevents even the first worker from starting', async () => {
    const c = controlled(),
      queue = createBatchQueue(buildBatch(source(), settings()), { executor: c.executor });
    queue.subscribe((state) => {
      if (state.runs.some((r) => r.status === 'running')) queue.cancel();
    });
    queue.start();
    await tick();
    expect(c.calls).toHaveLength(0);
    expect(queue.state.status).toBe('cancelled');
    queue.dispose();
  });
  it('rejects imported numerical lineage, aggregate and plan corruption', async () => {
    const queue = createBatchQueue(buildBatch(source(), settings()), {
      executor: (request, send) => {
        send({ type: 'result', id: request.run.id, result: executeBatchRun(request) });
        return { dispose() {} };
      }
    });
    queue.start();
    await tick();
    const snapshot = queue.snapshot();
    expect(parseBatch(serializeBatch(snapshot))).toEqual(snapshot);
    const badRun = structuredClone(snapshot) as unknown as { runs: { result: { runId: string } }[] };
    badRun.runs[0]!.result.runId = 'foreign';
    expect(() => parseBatch(JSON.stringify(badRun))).toThrow();
    const badPlan = structuredClone(snapshot) as unknown as { plan: { runs: { index: number }[] } };
    badPlan.plan.runs[1]!.index = 0;
    expect(() => parseBatch(JSON.stringify(badPlan))).toThrow();
    const badAggregate = structuredClone(snapshot) as unknown as { aggregate: { completed: number } };
    badAggregate.aggregate.completed = 999;
    expect(() => parseBatch(JSON.stringify(badAggregate))).toThrow();
    queue.dispose();
  });
});
