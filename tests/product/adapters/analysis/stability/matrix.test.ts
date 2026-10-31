import { describe, expect, it } from 'vitest';
import type { ExperimentStateV1 } from '../../../../../src/product/contracts/experiment';
import type { ContractResult } from '../../../../../src/product/contracts/validation';
import { STABILITY_KINDS } from '../../../../../src/product/adapters/analysis/stability/contracts';
import { runStability } from '../../../../../src/product/adapters/analysis/stability/execute';
import { defaultStabilitySettings } from '../../../../../src/product/adapters/analysis/stability/settings';
import { stabilityRejection } from '../../../../../src/product/adapters/analysis/stability/settings';
import {
  createStabilityArtifact,
  exportStabilityArtifact,
  importStabilityArtifact
} from '../../../../../src/product/adapters/analysis/stability/artifact';
import {
  PLANAR_SYSTEM_IDS,
  defaultPlanarConfig,
  createPlanarSimulation,
  toCanonicalPlanar
} from '../../../../../src/product/adapters/physics/planar';
import {
  CHAIN_SYSTEM_IDS,
  defaultChainConfig,
  createChainSimulation,
  toCanonicalChain
} from '../../../../../src/product/adapters/physics/chain';
import {
  CONSTRAINT_SYSTEM_IDS,
  defaultConstraintConfig,
  createConstraintSimulation,
  toCanonicalConstraint
} from '../../../../../src/product/adapters/physics/constraint';
import {
  SPATIAL_SYSTEM_IDS,
  defaultSpatialConfig,
  createSpatialSimulation,
  toCanonicalSpatial
} from '../../../../../src/product/adapters/physics/spatial';
import {
  DRIVEN_SYSTEM_IDS,
  defaultDrivenConfig,
  createDrivenSimulation,
  toCanonicalDriven
} from '../../../../../src/product/adapters/physics/driven';
import {
  NONLINEAR_SYSTEM_IDS,
  defaultNonlinearConfig,
  createNonlinearSimulation,
  toCanonicalNonlinear
} from '../../../../../src/product/adapters/physics/nonlinear';
import {
  NETWORK_SYSTEM_IDS,
  defaultNetworkConfig,
  createNetworkSimulation,
  toCanonicalNetwork
} from '../../../../../src/product/adapters/physics/network';
import {
  FIELD_SYSTEM_IDS,
  defaultFieldConfig,
  createFieldSimulation,
  toCanonicalField
} from '../../../../../src/product/adapters/physics/field';
import {
  DISCRETE_SYSTEM_IDS,
  defaultDiscreteConfig
} from '../../../../../src/product/adapters/physics/discrete-schema';
import { toCanonicalDiscrete } from '../../../../../src/product/adapters/physics/discrete-contract';
import { createDiscreteSession } from '../../../../../src/product/adapters/physics/discrete-engine';

function nativeCase<C extends { systemId: string }>(
  config: C,
  canonical: (c: C) => ContractResult<ExperimentStateV1>,
  _simulation: (c: C) => unknown
) {
  const parsed = canonical(config);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return { id: config.systemId, experiment: parsed.value };
}
const cases = [
  ...PLANAR_SYSTEM_IDS.map((id) => nativeCase(defaultPlanarConfig(id), toCanonicalPlanar, createPlanarSimulation)),
  ...CHAIN_SYSTEM_IDS.map((id) => nativeCase(defaultChainConfig(id), toCanonicalChain, createChainSimulation)),
  ...CONSTRAINT_SYSTEM_IDS.map((id) =>
    nativeCase(defaultConstraintConfig(id), toCanonicalConstraint, createConstraintSimulation)
  ),
  ...SPATIAL_SYSTEM_IDS.map((id) => nativeCase(defaultSpatialConfig(id), toCanonicalSpatial, createSpatialSimulation)),
  ...DRIVEN_SYSTEM_IDS.map((id) => nativeCase(defaultDrivenConfig(id), toCanonicalDriven, createDrivenSimulation)),
  ...NONLINEAR_SYSTEM_IDS.map((id) =>
    nativeCase(defaultNonlinearConfig(id), toCanonicalNonlinear, createNonlinearSimulation)
  ),
  ...NETWORK_SYSTEM_IDS.map((id) => nativeCase(defaultNetworkConfig(id), toCanonicalNetwork, createNetworkSimulation)),
  ...FIELD_SYSTEM_IDS.map((id) => nativeCase(defaultFieldConfig(id), toCanonicalField, createFieldSimulation)),
  ...DISCRETE_SYSTEM_IDS.map((id) => nativeCase(defaultDiscreteConfig(id), toCanonicalDiscrete, createDiscreteSession))
];

let calculations = 0,
  refusals = 0;
describe('S20 matrix: 35 canonical systems × 11 stability workflows', () => {
  for (const c of cases)
    for (const kind of STABILITY_KINDS)
      it(`${c.id} × ${kind}`, () => {
        const settings = defaultStabilitySettings(kind, c.experiment);
        if ('points' in settings) settings.points = 2;
        if ('steps' in settings) settings.steps = 4;
        if (kind === 'torus') Object.assign(settings, { collocation: 9, maxIterations: 1 });
        if (kind === 'arnold-tongue') Object.assign(settings, { iterations: 500, transient: 100 });
        if (kind === 'codim-two') settings.resolution = 4;
        const request = { id: 'matrix-job', kind, experiment: c.experiment, settings };
        const reason = stabilityRejection(kind, c.experiment, settings);
        if (reason) {
          expect(reason.length).toBeGreaterThan(8);
          expect(() => runStability(request)).toThrow();
          refusals++;
        } else {
          const result = runStability(request);
          expect(result.kind).toBe(kind);
          expect(result.source).toBe(settings.source);
          expect(result.rows.every((r) => r.every(Number.isFinite))).toBe(true);
          const artifact = createStabilityArtifact(request, result, {
            artifactId: 'matrix-artifact',
            inputRunId: 'matrix-input',
            createdAt: '2026-10-31T00:00:00.000Z'
          });
          expect(importStabilityArtifact(exportStabilityArtifact(artifact))).toEqual(artifact);
          calculations++;
        }
      });
  it('covers actual results or explained refusals without a silent fallback', () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(35);
    expect(calculations + refusals).toBe(385);
    expect(calculations).toBeGreaterThan(100);
    expect(refusals).toBeGreaterThan(100);
  });
});
