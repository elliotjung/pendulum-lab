/** Methods-text serializer for publication exports. */
/**
 * Publication outputs: figures, captions, paper packs, notebook, bundles, provenance, ZIP.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */
import { createSubmissionManifest } from '../../export/manifest';
import { integratorRegistry } from '../../physics/integrators';

import { currentSnapshot } from './shared';

export function buildMethodsText(snapshot = currentSnapshot()): string {
  const method = integratorRegistry[snapshot.method];
  const limitations = createSubmissionManifest(snapshot)
    .limitations.map((item) => `- ${item}`)
    .join('\n');
  return [
    '# Pendulum Lab Methods',
    '',
    `System: ${snapshot.systemType} pendulum.`,
    `Integrator: ${method.name} (id ${method.id}, order ${method.order}, symplectic label: ${method.symplectic}).`,
    `Time step: ${snapshot.dt}; steps per frame: ${snapshot.stepsPerFrame}; tolerance: ${snapshot.tolerance}.`,
    `Damping gamma: ${snapshot.damping}; mode: ${snapshot.mode}; state hash: ${snapshot.hash}.`,
    `Parameters: ${JSON.stringify(snapshot.parameters)}.`,
    '',
    'Reproducibility:',
    `Seed: ${snapshot.seed ?? 'none'}.`,
    'All exported runs include the runtime snapshot, selected integrator metadata, browser-worker policy, and limitation notes.',
    '',
    'Limitations:',
    limitations
  ].join('\n');
}
