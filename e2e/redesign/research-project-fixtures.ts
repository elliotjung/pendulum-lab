import {
  createPlanarSimulation,
  defaultPlanarConfig,
  toCanonicalPlanar
} from '../../src/product/adapters/physics/planar';
import { createDiagnosticSeries } from '../../src/product/adapters/analysis/core/source';
import { addResearchSession, captureResearchRun, createResearchProject } from '../../src/product/provenance/project';
import { buildResearchPackage } from '../../src/product/provenance/package';
import { researchExportEntries } from '../../src/product/provenance/render';

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
