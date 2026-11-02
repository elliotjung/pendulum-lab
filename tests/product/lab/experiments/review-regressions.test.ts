import { describe, expect, it } from 'vitest';
import { defaultPlanarConfig, toCanonicalPlanar } from '../../../../src/product/adapters/physics/planar';
import { defaultDiscreteConfig, toCanonicalDiscrete } from '../../../../src/product/adapters/physics/discrete';
import { buildBatch, defaultBatchSettings } from '../../../../src/product/lab/experiments/builders';
import { executeBatchRun } from '../../../../src/product/lab/experiments/execute';
import { validateBatchResult } from '../../../../src/product/lab/experiments/validation';
import { createBatchQueue } from '../../../../src/product/lab/experiments/queue';
import { parseBatch, serializeBatch } from '../../../../src/product/lab/experiments/artifact';
import type { BatchPlan } from '../../../../src/product/lab/experiments/contracts';

async function completedSnapshot(plan: BatchPlan) {
  const queue = createBatchQueue(plan, {
    executor(request, send) {
      send({ type: 'result', id: request.run.id, result: executeBatchRun(request) });
      return { dispose() {} };
    }
  });
  queue.start();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  const snapshot = queue.snapshot();
  queue.dispose();
  return snapshot;
}

describe('S21 independently reproduced numerical transport regressions', () => {
  it('preserves exact log-grid endpoints at the native parameter upper boundary', () => {
    const canonical = toCanonicalDiscrete(defaultDiscreteConfig('system:unitary-floquet'));
    if (!canonical.ok) throw new Error(JSON.stringify(canonical.issues));
    const plan = buildBatch(canonical.value, {
      ...defaultBatchSettings(canonical.value),
      kind: 'log',
      axes: [{ group: 'parameters', key: 'period', start: 1, end: 100, count: 3 }]
    });
    expect(plan.runs[0]!.assignments[0]!.value).toBe(1);
    expect(plan.runs.at(-1)!.assignments[0]!.value).toBe(100);
    expect(plan.runs[1]!.assignments[0]!.value).toBeCloseTo(10, 14);
  });

  it('accepts the actual native final partial step immediately above an integer duration ratio', async () => {
    const canonical = toCanonicalPlanar({ ...defaultPlanarConfig(), duration: 0.1000000000001, step: 0.01 });
    if (!canonical.ok) throw new Error(JSON.stringify(canonical.issues));
    const plan = buildBatch(canonical.value, defaultBatchSettings(canonical.value));
    const request = { batchId: plan.id, run: plan.runs[0]! };
    const result = executeBatchRun(request);
    expect(result.summary.steps).toBe(11);
    expect(result.summary.sampleCount).toBe(12);
    expect(() => validateBatchResult(result, request)).not.toThrow();
    const snapshot = await completedSnapshot(plan);
    expect(snapshot.status).toBe('completed');
    expect(parseBatch(serializeBatch(snapshot))).toEqual(snapshot);
  });

  it('transports the zero quasienergy of diag(1,-1) as canonical positive zero', async () => {
    const canonical = toCanonicalDiscrete({
      ...defaultDiscreteConfig('system:unitary-floquet'),
      gridSize: 2,
      matrix: {
        re: [
          [1, 0],
          [0, -1]
        ],
        im: [
          [0, 0],
          [0, 0]
        ]
      }
    });
    if (!canonical.ok) throw new Error(JSON.stringify(canonical.issues));
    const plan = buildBatch(canonical.value, {
      ...defaultBatchSettings(canonical.value),
      kind: 'ensemble',
      axes: [],
      count: 2
    });
    const request = { batchId: plan.id, run: plan.runs[0]! };
    const result = executeBatchRun(request);
    const zero = result.summary.metrics.find((metric) => metric.final === 0);
    expect(zero).toBeDefined();
    for (const key of ['initial', 'final', 'min', 'max', 'mean', 'rms'] as const)
      expect(Object.is(zero![key], -0), key).toBe(false);
    expect(() => validateBatchResult(result, request)).not.toThrow();
    const snapshot = await completedSnapshot(plan);
    expect(snapshot.status).toBe('completed');
    expect(parseBatch(serializeBatch(snapshot))).toEqual(snapshot);
  });
});
