import { textToBytes } from '../../../src/research/zipBundle';
import { buildBatch, defaultBatchSettings } from '../../../src/product/lab/experiments/builders';
import { createBatchQueue } from '../../../src/product/lab/experiments/queue';
import { serializeBatch } from '../../../src/product/lab/experiments/artifact';
import {
  createPlanarSimulation,
  defaultPlanarConfig,
  toCanonicalPlanar
} from '../../../src/product/adapters/physics/planar';
import { datasetFromExperiment } from '../../../src/product/adapters/analysis/data-driven/source';
import { learningDefaults } from '../../../src/product/adapters/analysis/data-driven/learning-contracts';
import { runDataDriven } from '../../../src/product/adapters/analysis/data-driven/execute';
import type { ExperimentStateV1 } from '../../../src/product/contracts/experiment';
import { captureResearchRun } from '../../../src/product/provenance/project';
import { emptyFixture, nativeFixture } from './fixtures';

export async function canonicalModelFixture() {
  const config = { ...defaultPlanarConfig(), duration: 0.63, step: 0.01 },
    canonical = toCanonicalPlanar(config);
  if (!canonical.ok) throw new Error('Canonical learning fixture failed');
  const simulation = createPlanarSimulation(config),
    samples = [simulation.snapshot()];
  while (!simulation.done) samples.push(simulation.step());
  const data = datasetFromExperiment(canonical.value, samples);
  const model = await runDataDriven({
    schema: 'pendulum-data-driven-request/v1',
    id: 'canonical-learning-project',
    mode: 'train',
    input: { kind: 'learning', data, settings: learningDefaults(data, 'dmd') }
  });
  return {
    experiment: canonical.value,
    bytes: textToBytes(JSON.stringify(model, null, 3)),
    nativeId: model.id,
    nativeInputRunId: model.inputId
  };
}
export function canonicalBatchFixture() {
  const experiment = nativeFixture().experiment,
    queue = createBatchQueue(buildBatch(experiment, defaultBatchSettings(experiment)));
  const state = queue.state;
  queue.dispose();
  return {
    experiment,
    bytes: textToBytes(serializeBatch(state)),
    nativeId: state.plan.id,
    nativeInputRunId: state.plan.sourceInputId
  };
}
export function configOnlyRun(experiment: ExperimentStateV1) {
  return captureResearchRun(emptyFixture(), {
    experiment,
    label: 'Declared canonical source',
    sessionId: 'session-test',
    id: 'run-test'
  });
}
export function changedCanonical(
  experiment: ExperimentStateV1,
  field: 'parameters' | 'seed' | 'runtime'
): ExperimentStateV1 {
  if (field === 'seed')
    return { ...experiment, seed: { value: 'other-source', generator: 'test', generatorVersion: '1' } };
  if (field === 'runtime') {
    if (experiment.runtime.domain !== 'time') throw new Error('Time fixture required');
    return {
      ...experiment,
      runtime: { ...experiment.runtime, duration: { value: experiment.runtime.duration.value + 0.01, unit: 's' } }
    };
  }
  const gravity = experiment.parameters.g;
  if (!gravity || gravity.kind !== 'scalar') throw new Error('Gravity fixture required');
  return { ...experiment, parameters: { ...experiment.parameters, g: { ...gravity, value: gravity.value + 0.1 } } };
}
