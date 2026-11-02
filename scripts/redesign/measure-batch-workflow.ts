import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { defaultDiscreteConfig, toCanonicalDiscrete } from '../../src/product/adapters/physics/discrete';
import { defaultDrivenConfig, toCanonicalDriven } from '../../src/product/adapters/physics/driven';
import { buildBatch, defaultBatchSettings } from '../../src/product/lab/experiments/builders';
import { executeBatchRun } from '../../src/product/lab/experiments/execute';
import { createBatchQueue } from '../../src/product/lab/experiments/queue';
import { parseBatch, serializeBatch } from '../../src/product/lab/experiments/artifact';
import type { BatchExecutor, BatchSnapshot } from '../../src/product/lab/experiments/contracts';

const source = toCanonicalDiscrete({ ...defaultDiscreteConfig('system:standard-map'), iterations: 8 });
assert(source.ok);
const settings = {
  ...defaultBatchSettings(source.value),
  kind: 'ensemble' as const,
  axes: [],
  count: 256,
  concurrency: 4
};
const plan = buildBatch(source.value, settings);
let active = 0,
  maximumActive = 0,
  calls = 0;
const completedCalls = new Map<string, number>();
// This injected asynchronous executor measures orchestration and reproducibility.
// Real browser worker responsiveness is measured separately by Playwright.
const executor: BatchExecutor = (request, event) => {
  active++;
  calls++;
  maximumActive = Math.max(maximumActive, active);
  let disposed = false;
  const timer = setTimeout(() => {
    if (disposed) return;
    const result = executeBatchRun(request);
    completedCalls.set(request.run.id, (completedCalls.get(request.run.id) ?? 0) + 1);
    event({ type: 'result', id: request.run.id, result });
  }, request.run.index % 3);
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      active--;
      clearTimeout(timer);
    }
  };
};
function finish(queue: ReturnType<typeof createBatchQueue>, stopAt?: number): Promise<BatchSnapshot> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      queue.dispose();
      reject(new Error('Measurement queue exceeded 30 seconds.'));
    }, 30_000);
    const unsubscribe = queue.subscribe((state) => {
      if (stopAt !== undefined && state.status === 'running' && state.aggregate.completed >= stopAt) queue.cancel();
      if (['completed', 'partial', 'cancelled'].includes(state.status)) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(state);
      }
    });
    queue.start();
  });
}
const queue = createBatchQueue(plan, { executor });
const started = performance.now();
const interrupted = await finish(queue, 4);
assert.equal(interrupted.status, 'cancelled');
const retainedIds = interrupted.runs.filter((run) => run.status === 'completed').map((run) => run.id);
const artifact = serializeBatch(interrupted);
const restored = parseBatch(artifact);
queue.dispose();
const resumed = createBatchQueue(restored, { executor });
const complete = await finish(resumed);
const elapsedMs = performance.now() - started;
const native = executeBatchRun({ batchId: plan.id, run: plan.runs[0]! });
const maxEndpointError = Math.max(
  ...complete.runs.flatMap((run) =>
    run.result!.summary.metrics.map((metric, index) => Math.abs(metric.final - native.summary.metrics[index]!.final))
  )
);
const checks = {
  exactly256Runs: complete.runs.length === 256 && complete.aggregate.completed === 256,
  boundedConcurrency: maximumActive === 4 && active === 0,
  completedRunsPreserved: retainedIds.length >= 4 && retainedIds.every((id) => completedCalls.get(id) === 1),
  noFailures: complete.status === 'completed' && complete.aggregate.failed === 0,
  exactNativeEndpoint: maxEndpointError === 0,
  savedCancellationRoundtrip:
    restored.status === 'cancelled' && restored.aggregate.completed === interrupted.aggregate.completed,
  aggregateLineage: complete.aggregate.childRunIds.join(',') === complete.runs.map((run) => run.id).join(','),
  fullResultRoundtrip: JSON.stringify(parseBatch(serializeBatch(complete))) === JSON.stringify(complete)
};
resumed.dispose();

const driven = toCanonicalDriven({ ...defaultDrivenConfig(), step: 0.01, duration: 0.04 });
assert(driven.ok);
// Read the canonical field name from the existing source instead of inferring it.
const firstAxis = defaultBatchSettings(driven.value).axes[0]!;
const lhsSettings = {
  ...defaultBatchSettings(driven.value),
  kind: 'lhs' as const,
  count: 32,
  axes: [{ ...firstAxis, start: 0.1, end: 0.9, count: 4 }]
};
const lhs = buildBatch(driven.value, lhsSettings);
const strata = lhs.runs.map((run) => Math.floor(((Number(run.assignments[0]!.value) - 0.1) / 0.8) * 32));
const lhsChecks = {
  exactlyOneSamplePerStratum: new Set(strata).size === 32 && strata.every((stratum) => stratum >= 0 && stratum < 32),
  repeatedSeedIdenticalPlan: JSON.stringify(lhs) === JSON.stringify(buildBatch(driven.value, lhsSettings))
};
const allChecks = { ...checks, ...lhsChecks };
const report = {
  schemaVersion: 'pendulum-S21-numerical-metrics/v1',
  stage: 21,
  generatedAtUtc: new Date().toISOString(),
  implementationCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  nodeVersion: process.version,
  passed: Object.values(allChecks).filter(Boolean).length,
  total: Object.keys(allChecks).length,
  checks: allChecks,
  measurements: {
    runs: 256,
    maximumActive,
    callsIncludingInterrupted: calls,
    completedBeforeCancel: retainedIds.length,
    maximumNativeEndpointError: maxEndpointError,
    elapsedMs,
    cancellationFileBytes: Buffer.byteLength(artifact),
    completedFileBytes: Buffer.byteLength(serializeBatch(complete)),
    lhsStrata: strata
  },
  limits:
    'This asynchronous in-process executor measures queue scheduling and exact native endpoints, not browser UI latency or worker hardware throughput. Production browser journeys separately exercise real workers. No stochastic confidence or human review is implied.'
};
const output = process.argv[2] ?? 'documents/redesign/stage-runs/S21-numerical-metrics.json';
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, passed: report.passed, total: report.total, measurements: report.measurements }));
assert(Object.values(allChecks).every(Boolean), 'A measured S21 workflow invariant failed; inspect the report.');
