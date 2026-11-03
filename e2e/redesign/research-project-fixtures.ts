import {
  createPlanarSimulation,
  defaultPlanarConfig,
  toCanonicalPlanar
} from '../../src/product/adapters/physics/planar';
import { createDiagnosticSeries } from '../../src/product/adapters/analysis/core/source';
import { addResearchSession, captureResearchRun, createResearchProject } from '../../src/product/provenance/project';
import { buildResearchPackage } from '../../src/product/provenance/package';
import { researchExportEntries } from '../../src/product/provenance/render';
import { buildBatch, defaultBatchSettings } from '../../src/product/lab/experiments/builders';
import { createBatchQueue } from '../../src/product/lab/experiments/queue';
import { serializeBatch } from '../../src/product/lab/experiments/artifact';
import { datasetFromExperiment } from '../../src/product/adapters/analysis/data-driven/source';
import { learningDefaults } from '../../src/product/adapters/analysis/data-driven/learning-contracts';
import { runDataDriven } from '../../src/product/adapters/analysis/data-driven/execute';
import { textToBytes } from '../../src/research/zipBundle';
import type { ExperimentStateV1 } from '../../src/product/contracts/experiment';

/** Native valid files exercise association checks rather than malformed-file refusal. */
export async function researchNativeAttachment(
  kind: 'batch' | 'model',
  gravity: number
): Promise<{ bytes: Uint8Array; nativeId: string; nativeInputRunId: string; experiment: ExperimentStateV1 }> {
  const defaults = defaultPlanarConfig();
  const config = {
    ...defaults,
    parameters: { ...defaults.parameters, g: gravity },
    duration: kind === 'model' ? 1.59 : 0.04,
    step: 0.01
  };
  const canonical = toCanonicalPlanar(config);
  if (!canonical.ok) throw new Error('Invalid S24 native source fixture');
  if (kind === 'batch') {
    const plan = buildBatch(canonical.value, defaultBatchSettings(canonical.value));
    const queue = createBatchQueue(plan);
    const snapshot = queue.state;
    queue.dispose();
    return {
      bytes: textToBytes(serializeBatch(snapshot)),
      nativeId: plan.id,
      nativeInputRunId: plan.sourceInputId,
      experiment: canonical.value
    };
  }
  const simulation = createPlanarSimulation(config);
  const samples = [simulation.snapshot()];
  while (!simulation.done) samples.push(simulation.step());
  const data = datasetFromExperiment(canonical.value, samples);
  const result = await runDataDriven({
    schema: 'pendulum-data-driven-request/v1',
    id: 's24-native-model',
    mode: 'train',
    input: { kind: 'learning', data, settings: learningDefaults(data, 'dmd') }
  });
  return {
    bytes: textToBytes(JSON.stringify(result)),
    nativeId: result.id,
    nativeInputRunId: result.inputId,
    experiment: canonical.value
  };
}

/** Real engine samples, with fixed metadata so mobile line boxes have a stable origin. */
export async function researchVisualPackage(title: string, description: string): Promise<Uint8Array> {
  const timestamp = '2026-11-03T00:00:00.000Z';
  const config = { ...defaultPlanarConfig(), duration: 0.04, step: 0.01 };
  const canonical = toCanonicalPlanar(config);
  if (!canonical.ok) throw new Error('Invalid S24 visual engine fixture');
  const simulation = createPlanarSimulation(config);
  const samples = [simulation.snapshot()];
  while (!simulation.done) samples.push(simulation.step());
  let bundle = createResearchProject({ id: 'project-s24-visual', title, description, createdAt: timestamp });
  bundle = addResearchSession(bundle, { id: 'session-s24-visual', title: 'Replicate B', createdAt: timestamp });
  bundle = await captureResearchRun(bundle, {
    id: 'run-s24-visual',
    createdAt: timestamp,
    label: 'Recorded run A',
    sessionId: 'session-s24-visual',
    experiment: canonical.value,
    series: createDiagnosticSeries(canonical.value, samples),
    status: 'completed'
  });
  const source = bundle.project.artifacts.find((artifact) => artifact.kind === 'series')!;
  bundle.project.updatedAt = timestamp;
  bundle.project.notebook = [
    {
      id: 'narrative-s24-visual',
      title: 'Recorded observation',
      text: 'These values are preserved observations from the existing engine.',
      artifactIds: [source.id]
    }
  ];
  bundle.project.citations = [
    {
      id: 'citation-s24-visual',
      text: 'S24 automated test fixture reference',
      url: 'https://example.org/reference'
    }
  ];
  bundle.project.figures = [
    {
      id: 'figure-s24-visual',
      title: 'Recorded theta1',
      caption: 'Exact samples with angular units; no interpolation.',
      runId: 'run-s24-visual',
      sourceArtifactId: source.id,
      xColumn: -1,
      yColumn: 0,
      theme: 'print'
    }
  ];
  return buildResearchPackage(bundle, { extraEntries: researchExportEntries(bundle) });
}
