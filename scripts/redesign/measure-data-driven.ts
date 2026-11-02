import { strict as assert } from 'node:assert';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import {
  learningDefaults,
  trainLearning,
  type LearningData
} from '../../src/product/adapters/analysis/data-driven/learning';
import { runDataDriven, reevaluateDataDriven } from '../../src/product/adapters/analysis/data-driven/execute';
import {
  serializeDataDrivenResult,
  parseDataDrivenResult
} from '../../src/product/adapters/analysis/data-driven/artifact';
import { modelJson } from '../../src/product/adapters/analysis/data-driven/safe';
import type { DataDrivenRequest } from '../../src/product/adapters/analysis/data-driven/contracts';
import type { EigenOperator, EigenSettings } from '../../src/product/adapters/analysis/data-driven/eigen';

const started = performance.now();
const data: LearningData = {
  times: Array.from({ length: 400 }, (_, i) => i * 0.05),
  values: Array.from({ length: 400 }, (_, i) => [Math.sin(i * 0.05), Math.cos(i * 0.05)]),
  labels: ['q0', 'p0'],
  units: ['1', '1'],
  axisUnit: 'normalized-time',
  provenance: {
    kind: 'analytic-benchmark',
    equation: 'q=sin(t), p=cos(t); H=(q^2+p^2)/2',
    canonical: true,
    coordinateOrder: 'q,p',
    canonicalUnits: ['1', '1']
  }
};
const measurements: Record<string, unknown> = {};
const checks: Record<string, boolean> = {};
for (const method of ['sindy', 'dmd', 'havok', 'reservoir', 'hamiltonian'] as const) {
  const settings = {
    ...learningDefaults(data, method),
    polynomialDegree: method === 'hamiltonian' ? 2 : 1,
    rolloutSteps: 24
  };
  const request: DataDrivenRequest = {
    schema: 'pendulum-data-driven-request/v1',
    id: `measure-${method}`,
    mode: 'train',
    input: { kind: 'learning', data, settings }
  };
  const result = await runDataDriven(request),
    restored = await parseDataDrivenResult(await serializeDataDrivenResult(result));
  const evaluated = await reevaluateDataDriven(restored),
    retrained = await runDataDriven(request);
  const altered = structuredClone(data);
  altered.values.slice(settings.splitIndex).forEach((row) => {
    row[0] = 1.3 * row[0]! + 0.1;
    row[1] = 0.9 * row[1]!;
  });
  const changed = trainLearning(altered, settings);
  checks[`${method}Replay`] =
    modelJson(result.output) === modelJson(evaluated.output) &&
    modelJson(retrained.output) === modelJson(result.output);
  checks[`${method}NoLeakage`] = modelJson(changed.model) === modelJson(result.output.model);
  checks[method === 'havok' ? 'havokConditionalDerivativeAccuracy' : `${method}Accuracy`] =
    result.output.metrics.validationRmse! < (method === 'reservoir' ? 0.02 : 1e-6);
  measurements[method] = {
    inputId: result.inputId,
    resultId: result.id,
    metrics: result.output.metrics,
    columns: result.output.columns,
    model: result.output.model,
    warnings: result.output.warnings
  };
}
const sparse: EigenOperator = {
  kind: 'sparse',
  dimension: 48,
  entries: Array.from({ length: 48 }, (_, i) => [
    { row: i, column: i, value: 2 },
    ...(i ? [{ row: i, column: i - 1, value: -1 }] : []),
    ...(i < 47 ? [{ row: i, column: i + 1, value: -1 }] : [])
  ]).flat()
};
for (const method of ['arnoldi', 'lanczos', 'general-eigensolver'] as const) {
  const operator: EigenOperator =
    method === 'general-eigensolver'
      ? {
          kind: 'dense',
          matrix: [
            [2, -3, 0],
            [3, 2, 0],
            [0, 0, -0.5]
          ]
        }
      : sparse;
  const settings: EigenSettings = {
    method,
    k: 2,
    krylovDim: method === 'general-eigensolver' ? 3 : 48,
    maxRestarts: 4,
    tolerance: 1e-7,
    seed: 'measure23',
    which: 'LA'
  };
  const request: DataDrivenRequest = {
    schema: 'pendulum-data-driven-request/v1',
    id: `measure-${method}`,
    mode: 'train',
    input: { kind: 'eigen', operator, settings }
  };
  const result = await runDataDriven(request),
    restored = await parseDataDrivenResult(await serializeDataDrivenResult(result));
  checks[`${method}Replay`] = modelJson(result.output) === modelJson((await reevaluateDataDriven(restored)).output);
  checks[method === 'general-eigensolver' ? 'generalEigensolverTraceInvariant' : `${method}Residual`] =
    method === 'general-eigensolver'
      ? result.output.metrics.traceError! < 1e-8
      : result.output.metrics.accepted === 1 && result.output.metrics.maximumResidual! <= settings.tolerance;
  if (method !== 'general-eigensolver') {
    const expected = [48, 47].map((j) => 2 - 2 * Math.cos((j * Math.PI) / 49));
    checks[`${method}AnalyticSpectrum`] = result.output.rows.every((row, i) => Math.abs(row[1]! - expected[i]!) < 1e-7);
  } else {
    const expected = [
      [2, 3],
      [2, -3],
      [-0.5, 0]
    ];
    const unmatched = result.output.rows.map((row) => row.slice(1));
    checks.generalEigensolverAnalyticSpectrum =
      expected.every(([re, im]) => {
        const match = unmatched.findIndex((row) => Math.hypot(row[0]! - re!, row[1]! - im!) < 1e-8);
        if (match < 0) return false;
        unmatched.splice(match, 1);
        return true;
      }) && unmatched.length === 0;
  }
  measurements[method] = {
    inputId: result.inputId,
    resultId: result.id,
    metrics: result.output.metrics,
    rows: result.output.rows,
    warnings: result.output.warnings
  };
}
for (const [name, passed] of Object.entries(checks)) assert(passed, name);
const report = {
  schemaVersion: 'pendulum-S23-numerical-metrics/v1',
  generatedAtUtc: new Date().toISOString(),
  implementationHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  interpretation:
    'Local synthetic/native recovery, held-out leakage and saved-model consistency benchmarks. No physical-device, external-data authenticity, long-horizon forecasting or S28 full-parity claim.',
  elapsedMs: performance.now() - started,
  measurements,
  checks,
  passed: Object.values(checks).every(Boolean)
};
writeFileSync('documents/redesign/stage-runs/S23-numerical-metrics.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ checks, elapsedMs: report.elapsedMs }));
