import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
  createPlanarSimulation,
  toCanonicalPlanar,
  type PlanarConfig
} from '../../src/product/adapters/physics/planar';
import { defaultDiscreteConfig, toCanonicalDiscrete } from '../../src/product/adapters/physics/discrete';
import { confirmObservationImport, previewObservationImport } from '../../src/product/observations';
import { runInverse } from '../../src/product/adapters/analysis/inverse/execute';
import { exportInverseResult, importInverseResult } from '../../src/product/adapters/analysis/inverse/artifact';
import type { InverseRequest } from '../../src/product/adapters/analysis/inverse/contracts';

const started = performance.now();
const truth: PlanarConfig = {
  systemId: 'system:double',
  parameters: { m1: 1, m2: 1.2, l1: 1, l2: 0.8, g: 9.81 },
  gamma: 0.05,
  initialState: [0.5, -0.3, 0, 0],
  integratorId: 'integrator:rk4',
  step: 0.01,
  duration: 0.8,
  sampleEvery: 1
};
const simulation = createPlanarSimulation(truth);
const samples = [simulation.snapshot()];
while (!simulation.done) samples.push(simulation.step());
const raw = [
  'clock,a,b',
  ...samples.map((v) => `${v.time * 1000},${(v.state[0] * 180) / Math.PI},${(v.state[1] * 180) / Math.PI}`)
].join('\n');
const observation = confirmObservationImport(
  await previewObservationImport({
    name: 'known-gravity-degrees-ms.csv',
    kind: 'sensor',
    text: raw,
    mapping: { time: 'clock', theta1: 'a', theta2: 'b' },
    options: { timeUnit: 'ms', angleUnit: 'deg' }
  })
);
const canonical = toCanonicalPlanar({ ...truth, parameters: { ...truth.parameters, g: 8 } });
assert(canonical.ok);
const estimate = await runInverse({
  schema: 'pendulum-inverse-request/v1',
  id: 'measure-estimate',
  experiment: canonical.value,
  settings: { kind: 'estimate', observation, parameters: [{ key: 'g', min: 5, max: 15 }], maxIterations: 30 }
});
const restored = await importInverseResult(exportInverseResult(estimate));
const recoveredGravity = estimate.rows[0]![1]!;
const map = toCanonicalDiscrete({
  ...defaultDiscreteConfig('system:standard-map'),
  parameters: { kickStrength: 0 },
  initialState: [0.15, 0.3],
  iterations: 1
});
assert(map.ok);
const request: InverseRequest = {
  schema: 'pendulum-inverse-request/v1',
  id: 'measure-sobol',
  experiment: map.value,
  settings: {
    kind: 'sobol',
    variables: [
      { group: 'initialConditions', key: 'theta', min: 0.1, max: 0.2 },
      { group: 'initialConditions', key: 'p', min: 0.2, max: 0.4 }
    ],
    metric: { index: 0, statistic: 'final' },
    samples: 256,
    degree: 1,
    seed: 'measure22'
  }
};
const sobol = await runInverse(request);
assert(request.settings.kind === 'sobol');
const pce = await runInverse({
  ...request,
  id: 'measure-pce',
  settings: { ...request.settings, kind: 'pce', samples: 32 }
});
const checks = {
  nativeGravityRecovery: Math.abs(recoveredGravity - truth.parameters.g) < 1e-5,
  originalRawSourcePreserved:
    restored.request.settings.kind === 'estimate' && restored.request.settings.observation.original.text === raw,
  relationRestored:
    restored.inputId === estimate.inputId && restored.observationId === observation.id && restored.id === estimate.id,
  explicitUnits: observation.data.timeUnit === 's' && observation.data.angleUnit === 'rad',
  sobolAnalyticFractions: sobol.rows.every(
    (v, i) => Math.abs(v[1]! - (i === 0 ? 0.2 : 0.8)) < 0.03 && Math.abs(v[2]! - (i === 0 ? 0.2 : 0.8)) < 0.03
  ),
  pceAnalyticFractions: pce.rows.every((v, i) => Math.abs(v[1]! - (i === 0 ? 0.2 : 0.8)) < 1e-8),
  pceValidationError: Number(pce.payload.validationRmse) < 1e-9 && Number(pce.payload.validationMaxError) < 1e-9
};
for (const [name, passed] of Object.entries(checks)) assert(passed, name);
const output = {
  schemaVersion: 'pendulum-S22-numerical-metrics/v1',
  generatedAtUtc: new Date().toISOString(),
  implementationHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  elapsedMs: performance.now() - started,
  interpretation:
    'Local numerical workflow measurement, not browser responsiveness, physical-device accuracy, posterior calibration or full S28 parity.',
  estimate: {
    truthGravity: truth.parameters.g,
    initialGuess: 8,
    recoveredGravity,
    absoluteError: Math.abs(recoveredGravity - truth.parameters.g),
    nativeObservationSamples: samples.length,
    sourceInputUnits: ['ms', 'deg'],
    fitted: estimate.payload.fit
  },
  sobol: {
    model: 'Native standard map, K=0, one iteration, away from angular wrapping; theta final=theta initial+p initial',
    exactFractions: [0.2, 0.8],
    rows: sobol.rows,
    evaluations: sobol.evaluations
  },
  pce: {
    rows: pce.rows,
    validationRmse: pce.payload.validationRmse,
    validationMaxError: pce.payload.validationMaxError,
    evaluations: pce.evaluations
  },
  checks,
  passed: Object.values(checks).every(Boolean)
};
writeFileSync('documents/redesign/stage-runs/S22-numerical-metrics.json', JSON.stringify(output, null, 2) + '\n');
console.log(
  JSON.stringify({
    checks,
    gravityError: output.estimate.absoluteError,
    sobolRows: sobol.rows,
    pceValidationRmse: pce.payload.validationRmse,
    elapsedMs: output.elapsedMs
  })
);
