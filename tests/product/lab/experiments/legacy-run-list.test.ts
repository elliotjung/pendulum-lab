import { describe, expect, it } from 'vitest';
import {
  defaultPlanarConfig,
  toCanonicalPlanar,
  createPlanarSimulation
} from '../../../../src/product/adapters/physics/planar';
import {
  buildLegacyRunList,
  partitionLegacyRunList,
  parseLegacyRunQueue,
  serializeLegacyRunQueue,
  validateLegacyRunSnapshot,
  type LegacyRunEntry
} from '../../../../src/product/lab/experiments/legacy-run-list';
import { createLegacyRunQueue } from '../../../../src/product/lab/experiments/legacy-run-list-queue';
import { executeBatchRun } from '../../../../src/product/lab/experiments/execute';
import {
  defaultFieldConfig,
  resizeFieldConfig,
  toCanonicalField
} from '../../../../src/product/adapters/physics/field';
import type {
  BatchExecutor,
  BatchWorkerEvent,
  BatchWorkerRequest
} from '../../../../src/product/lab/experiments/contracts';

function entries(count = 3): LegacyRunEntry[] {
  return Array.from({ length: count }, (_, index) => {
    const result = toCanonicalPlanar({
      ...defaultPlanarConfig(),
      duration: 0.02,
      step: 0.01,
      initialState: [7 * Math.PI + index / 100, -8 * Math.PI, 0.1, -0.2]
    });
    if (!result.ok) throw new Error('fixture');
    return {
      sourceId: `old-point-${index}`,
      experiment: {
        ...result.value,
        seed: { value: String(-42 - index), generator: 'legacy-session-int32', generatorVersion: '1' }
      }
    };
  });
}
const tick = async () => {
  for (let index = 0; index < 6; index++) await Promise.resolve();
};
function controlled() {
  const calls: { request: BatchWorkerRequest; send(event: BatchWorkerEvent): void; disposed: boolean }[] = [];
  const executor: BatchExecutor = (request, send) => {
    const call = { request, send, disposed: false };
    calls.push(call);
    return {
      dispose() {
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

describe('S28 exact legacy run-list execution', () => {
  it('preserves arbitrary input order, winding, signed seed and original IDs without a generated design', () => {
    const input = entries().reverse(),
      plan = buildLegacyRunList(input);
    expect(plan.entries).toEqual(input);
    expect(plan.runs.map((run) => run.experiment)).toEqual(input.map((entry) => entry.experiment));
    expect(plan.runs.map((run) => run.assignments[0]!.value)).toEqual(input.map((entry) => entry.sourceId));
    expect(plan.id).toBe(buildLegacyRunList(input).id);
    expect(plan.id).not.toBe(buildLegacyRunList([...input].reverse()).id);
    Object.assign(input[0]!.experiment.initialConditions, { theta1: { kind: 'scalar', unit: 'rad', value: 0 } });
    expect(plan.entries[0]!.experiment.initialConditions.theta1).not.toEqual(
      input[0]!.experiment.initialConditions.theta1
    );
  });
  it('partitions all513 inputs contiguously, retaining the last original input', () => {
    const input = entries(513),
      parts = partitionLegacyRunList(input);
    expect(parts.map((part) => part.entries.length)).toEqual([512, 1]);
    expect(parts.flatMap((part) => part.entries)).toEqual(input);
  });
  it('partitions the complete provenance-heavy list by full input/result byte budget without dropping a tail', () => {
    const parents = Array.from({ length: 32 }, (_, index) => `parent-${index}-`.padEnd(128, 'x'));
    const input = entries(512).map((entry) => ({
      ...entry,
      experiment: {
        ...entry.experiment,
        provenance: {
          createdByVersion: 'S28',
          source: { kind: 'derived' as const, id: 'original-study' },
          parentExperimentIds: parents
        }
      }
    }));
    const parts = partitionLegacyRunList(input);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.estimatedArtifactBytes <= 16 * 1024 * 1024)).toBe(true);
    expect(parts.flatMap((part) => part.entries.map((entry) => entry.sourceId))).toEqual(
      input.map((entry) => entry.sourceId)
    );
    expect(parts.at(-1)!.entries.at(-1)).toEqual(input.at(-1));
    for (const part of parts)
      expect(parseLegacyRunQueue(serializeLegacyRunQueue(createLegacyRunQueue(part.entries).snapshot())).plan).toEqual(
        part
      );
  });
  it('reserves dimension-dependent native summary bytes when small work alone would allow512 high-dimensional runs', () => {
    const result = toCanonicalField({ ...resizeFieldConfig(defaultFieldConfig('system:fput'), 128), duration: 0.01 });
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const input = Array.from({ length: 512 }, (_, index) => ({
      sourceId: `field-point-${index}`,
      experiment: result.value
    }));
    const parts = partitionLegacyRunList(input);
    expect(parts.length).toBeGreaterThan(1);
    expect(
      parts.every((part) => part.estimatedWork <= 4_000_000 && part.estimatedArtifactBytes <= 16 * 1024 * 1024)
    ).toBe(true);
    expect(parts.flatMap((part) => part.entries.map((entry) => entry.sourceId))).toEqual(
      input.map((entry) => entry.sourceId)
    );
  });
  it('partitions by native work bound and rejects an individually oversized run without modifying it', () => {
    const input = entries(11).map((entry) => ({
      ...entry,
      experiment: {
        ...entry.experiment,
        runtime: {
          domain: 'time' as const,
          start: { value: 0, unit: 's' as const },
          duration: { value: 100, unit: 's' as const },
          step: { value: 0.001, unit: 's' as const },
          sampleEvery: 100
        }
      }
    }));
    expect(partitionLegacyRunList(input).map((part) => part.entries.length)).toEqual([10, 1]);
    const tooLarge = structuredClone(input[0]!);
    if (tooLarge.experiment.runtime.domain !== 'time') throw new Error('fixture');
    tooLarge.experiment.runtime.step = { value: 0.0001, unit: 's' };
    expect(() => partitionLegacyRunList([tooLarge])).toThrow(/100000/);
    expect(tooLarge.experiment.runtime.step.value).toBe(0.0001);
  });
  it('rejects empty, duplicate, unknown, sparse, accessor and malformed canonical inputs', () => {
    expect(() => buildLegacyRunList([])).toThrow();
    const duplicate = entries();
    duplicate[1] = duplicate[0]!;
    expect(() => partitionLegacyRunList(duplicate)).toThrow(/중복/);
    expect(() => buildLegacyRunList([{ ...entries()[0]!, unknown: 1 }] as unknown as LegacyRunEntry[])).toThrow();
    expect(() => partitionLegacyRunList(new Array(3) as unknown as LegacyRunEntry[])).toThrow();
    const accessor: LegacyRunEntry[] = [];
    Object.defineProperty(accessor, '0', {
      get: () => {
        throw new Error('must not run');
      },
      enumerable: true
    });
    expect(() => partitionLegacyRunList(accessor)).toThrow(/접근자/);
    const invalid = entries();
    (invalid[0]!.experiment as unknown as { systemId: string }).systemId = 'system:unknown';
    expect(() => buildLegacyRunList(invalid)).toThrow();
  });
  it('runs exact canonical input through the native adapter and preserves per-run summary lineage', async () => {
    const input = entries(3),
      executor: BatchExecutor = (request, send) => {
        send({ type: 'result', id: request.run.id, result: executeBatchRun(request) });
        return { dispose() {} };
      };
    const queue = createLegacyRunQueue(input, { executor, concurrency: 1 });
    expect(queue.start()).toBe(true);
    await tick();
    expect(queue.state.status).toBe('completed');
    const final = createPlanarSimulation({
      ...defaultPlanarConfig(),
      duration: 0.02,
      step: 0.01,
      initialState: [7 * Math.PI, -8 * Math.PI, 0.1, -0.2]
    });
    while (!final.done) final.step();
    expect(queue.state.runs[0]!.result!.summary.metrics.map((metric) => metric.final)).toEqual([
      ...final.snapshot().state
    ]);
    queue.state.runs.forEach((run, index) => {
      expect(run.result!.inputIndex).toBe(index);
      expect(run.result!.batchId).toBe(queue.state.plan.id);
      expect(run.result!.runId).toBe(run.id);
    });
    expect('aggregate' in queue.state).toBe(false);
    queue.dispose();
  });
  it('enforces concurrency, cancels active jobs, ignores late events and resumes exact originals', async () => {
    const worker = controlled(),
      queue = createLegacyRunQueue(entries(4), { executor: worker.executor, concurrency: 2 });
    queue.start();
    await tick();
    expect(worker.calls).toHaveLength(2);
    worker.complete(0);
    await tick();
    expect(worker.calls).toHaveLength(3);
    queue.cancel();
    expect(worker.calls[1]!.disposed).toBe(true);
    expect(worker.calls[2]!.disposed).toBe(true);
    worker.complete(1);
    expect(queue.state.runs[1]!.status).toBe('pending');
    queue.resume();
    await tick();
    expect(worker.calls).toHaveLength(5);
    expect(worker.calls[3]!.request.run).toEqual(worker.calls[1]!.request.run);
    worker.complete(3);
    worker.complete(4);
    await tick();
    worker.complete(5);
    await tick();
    expect(queue.state.status).toBe('completed');
    expect(queue.state.runs[0]!.attempts).toBe(1);
    expect(queue.state.runs[1]!.attempts).toBe(2);
    queue.dispose();
  });
  it('retries only failed source runs while retaining successful results', async () => {
    const worker = controlled(),
      queue = createLegacyRunQueue(entries(2), { executor: worker.executor });
    queue.start();
    await tick();
    worker.complete(0);
    worker.calls[1]!.send({ type: 'error', id: worker.calls[1]!.request.run.id, message: 'native failure' });
    await tick();
    const first = queue.state.runs[0]!.result;
    expect(queue.state.status).toBe('partial');
    expect(queue.retryFailed(['unknown'])).toBe(false);
    expect(queue.retryFailed()).toBe(true);
    await tick();
    worker.complete(2);
    await tick();
    expect(queue.state.status).toBe('completed');
    expect(queue.state.runs[0]!.result).toEqual(first);
    expect(queue.state.runs[1]!.attempts).toBe(2);
    queue.dispose();
  });
  it('fails mismatched results and non-monotone progress rather than accepting forged lineage', async () => {
    const worker = controlled(),
      queue = createLegacyRunQueue(entries(2), { executor: worker.executor });
    queue.start();
    await tick();
    const call = worker.calls[0]!;
    call.send({
      type: 'result',
      id: call.request.run.id,
      result: { ...executeBatchRun(call.request), batchId: 'wrong' }
    });
    const second = worker.calls[1]!;
    second.send({ type: 'progress', id: second.request.run.id, fraction: 0.8 });
    second.send({ type: 'progress', id: second.request.run.id, fraction: 0.7 });
    await tick();
    expect(queue.state.status).toBe('partial');
    expect(queue.state.runs.every((run) => run.status === 'failed')).toBe(true);
    queue.dispose();
  });
  it('fails an oversized worker summary explicitly while retaining exact inputs and exportable state', async () => {
    const worker = controlled(),
      queue = createLegacyRunQueue(entries(1), { executor: worker.executor });
    queue.start();
    await tick();
    const call = worker.calls[0]!,
      result = executeBatchRun(call.request);
    (result.summary as { warnings: readonly string[] }).warnings = [
      ...result.summary.warnings,
      'x'.repeat(16_384),
      'y'.repeat(16_384)
    ];
    call.send({ type: 'result', id: call.request.run.id, result });
    await tick();
    expect(queue.state.status).toBe('partial');
    expect(queue.state.runs[0]!.error).toContain('byte');
    expect(queue.state.plan.entries).toEqual(entries(1));
    expect(parseLegacyRunQueue(serializeLegacyRunQueue(queue.state)).runs[0]!.status).toBe('failed');
    queue.dispose();
  });
  it('exports and imports completed results, restarting interrupted runs only at run boundaries', async () => {
    const worker = controlled(),
      queue = createLegacyRunQueue(entries(2), { executor: worker.executor });
    queue.start();
    await tick();
    worker.complete(0);
    await tick();
    const imported = parseLegacyRunQueue(serializeLegacyRunQueue(queue.state));
    queue.dispose();
    const resumed = createLegacyRunQueue(imported, { executor: worker.executor });
    expect(resumed.state.status).toBe('cancelled');
    expect(resumed.state.runs[0]!.status).toBe('completed');
    expect(resumed.state.runs[1]!.status).toBe('pending');
    resumed.resume();
    await tick();
    worker.complete(2);
    await tick();
    expect(resumed.state.status).toBe('completed');
    resumed.dispose();
  });
  it.each(['id', 'seed', 'order', 'work', 'progress', 'status', 'result'] as const)(
    'rejects tampered %s metadata on resume',
    async (field) => {
      const executor: BatchExecutor = (request, send) => {
        send({ type: 'result', id: request.run.id, result: executeBatchRun(request) });
        return { dispose() {} };
      };
      const queue = createLegacyRunQueue(entries(2), { executor });
      queue.start();
      await tick();
      const snapshot = queue.snapshot();
      queue.dispose();
      if (field === 'id') (snapshot.plan as { id: string }).id = 'changed';
      if (field === 'seed') (snapshot.plan.entries[0]!.experiment.seed as { value: string }).value = 'changed';
      if (field === 'order') (snapshot.plan.entries as LegacyRunEntry[]).reverse();
      if (field === 'work') (snapshot.plan as { estimatedWork: number }).estimatedWork++;
      if (field === 'progress') (snapshot as { progress: number }).progress = 0;
      if (field === 'status') (snapshot.runs[0] as { status: string }).status = 'pending';
      if (field === 'result') (snapshot.runs[0]!.result as { runId: string }).runId = 'wrong';
      expect(() => validateLegacyRunSnapshot(snapshot)).toThrow();
    }
  );
  it('rejects duplicate JSON keys, wrong versions and invalid concurrency without running accessors', () => {
    expect(() => parseLegacyRunQueue('{"schema":"a","schema":"b"}')).toThrow(/Duplicate/);
    expect(() => parseLegacyRunQueue('{"schema":"old"}')).toThrow();
    expect(() => createLegacyRunQueue(entries(), { concurrency: 5 })).toThrow();
    const input = entries();
    const original = structuredClone(input);
    const queue = createLegacyRunQueue(input);
    input.reverse();
    expect(queue.state.plan.entries).toEqual(original);
    queue.dispose();
  });
  it('disposes synchronous-completion jobs and prevents worker mutation of stored canonical settings', async () => {
    let disposed = 0;
    const executor: BatchExecutor = (request, send) => {
      const result = executeBatchRun(request);
      Object.assign(request.run.experiment.initialConditions, { theta1: { kind: 'scalar', value: 0, unit: 'rad' } });
      send({ type: 'result', id: request.run.id, result });
      return {
        dispose() {
          disposed++;
        }
      };
    };
    const input = entries(2),
      queue = createLegacyRunQueue(input, { executor });
    queue.start();
    await tick();
    expect(queue.state.status).toBe('completed');
    expect(queue.state.plan.entries).toEqual(input);
    expect(disposed).toBe(2);
    queue.dispose();
  });
});
