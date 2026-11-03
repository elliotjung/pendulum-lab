import { textToBytes } from '../../../src/research/zipBundle';
import {
  defaultPlanarConfig,
  createPlanarSimulation,
  toCanonicalPlanar
} from '../../../src/product/adapters/physics/planar';
import { createDiagnosticSeries } from '../../../src/product/adapters/analysis/core/source';
import { runCoreDiagnostic } from '../../../src/product/adapters/analysis/core/execute';
import { defaultCoreSettings } from '../../../src/product/adapters/analysis/core/settings';
import { createCoreDiagnosticArtifact } from '../../../src/product/adapters/analysis/core/artifact';
import { createResearchProject, addResearchSession, captureResearchRun } from '../../../src/product/provenance/project';

export const timestamp = '2026-11-03T03:00:00.000Z';
export function nativeFixture() {
  const config = { ...defaultPlanarConfig(), duration: 0.08, step: 0.01 },
    checked = toCanonicalPlanar(config);
  if (!checked.ok) throw new Error('canonical fixture');
  const simulation = createPlanarSimulation(config),
    samples = [simulation.snapshot()];
  while (!simulation.done) samples.push(simulation.step());
  const series = createDiagnosticSeries(checked.value, samples);
  const request = {
    id: 'project-core-job',
    kind: 'state-time' as const,
    experiment: checked.value,
    series,
    settings: defaultCoreSettings('state-time', checked.value)
  };
  const artifact = createCoreDiagnosticArtifact(request, runCoreDiagnostic(request), {
    artifactId: 'native-core-artifact',
    inputRunId: 'native-core-run',
    createdAt: timestamp
  });
  return {
    experiment: checked.value,
    series,
    artifact,
    bytes: textToBytes(' \n' + JSON.stringify(artifact, null, 3) + '\n\n')
  };
}
export function emptyFixture() {
  return addResearchSession(
    createResearchProject({ title: '진자 연구', description: '질문과 관측', id: 'project-test', createdAt: timestamp }),
    { title: '세션1', id: 'session-test', createdAt: timestamp }
  );
}
export async function bundleFixture(withSeries = true) {
  const native = nativeFixture();
  return captureResearchRun(emptyFixture(), {
    experiment: native.experiment,
    label: '실제 run',
    sessionId: 'session-test',
    id: 'run-test',
    createdAt: timestamp,
    ...(withSeries ? { series: native.series } : {})
  });
}
