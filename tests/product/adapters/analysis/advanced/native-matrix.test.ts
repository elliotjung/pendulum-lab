import { describe, expect, it } from 'vitest';
import type { ExperimentStateV1 } from '../../../../../src/product/contracts/experiment';
import type { ContractResult } from '../../../../../src/product/contracts/validation';
import { ADVANCED_DIAGNOSTIC_KINDS } from '../../../../../src/product/adapters/analysis/advanced/contracts';
import { runAdvancedDiagnostic } from '../../../../../src/product/adapters/analysis/advanced/execute';
import { defaultAdvancedSettings } from '../../../../../src/product/adapters/analysis/advanced/settings';
import { advancedDiagnosticRejection } from '../../../../../src/product/adapters/analysis/advanced/validation';
import { createDiagnosticSeries } from '../../../../../src/product/adapters/analysis/core/source';
import {
  createAdvancedDiagnosticArtifact,
  exportAdvancedDiagnosticArtifact,
  importAdvancedDiagnosticArtifact
} from '../../../../../src/product/adapters/analysis/advanced/artifact';
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
  simulation: (c: C) => { snapshot(): unknown; step(): unknown }
) {
  const parsed = canonical(config);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  const engine = simulation(config),
    samples = [engine.snapshot()];
  for (let i = 1; i < 32; i++) samples.push(engine.step());
  return { id: config.systemId, experiment: parsed.value, series: createDiagnosticSeries(parsed.value, samples) };
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
describe('S19 matrix: 35 native systems × 12 advanced diagnostics', () => {
  it('covers every integrated native system and every requested advanced tool', () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(35);
    expect(ADVANCED_DIAGNOSTIC_KINDS).toHaveLength(12);
  });
  for (const c of cases)
    for (const kind of ADVANCED_DIAGNOSTIC_KINDS)
      it(`${c.id} × ${kind}`, () => {
        const settings = defaultAdvancedSettings(kind, c.experiment);
        if ('maxSamples' in settings) settings.maxSamples = 32;
        if ('dt' in settings) settings.dt = 0.01;
        if ('duration' in settings) settings.duration = 0.02;
        if (kind === 'clv')
          Object.assign(settings, { forwardTransient: 0, window: 4, backwardTransient: 1, renormEvery: 1 });
        if (kind === 'lcs-ridge' || kind === 'basin' || kind === 'uncertainty') settings.resolution = 4;
        const rejection = advancedDiagnosticRejection(kind, c.experiment, c.series, settings);
        const request = { id: 'advanced_matrix', kind, experiment: c.experiment, series: c.series, settings };
        if (rejection !== null) {
          expect(rejection.length).toBeGreaterThan(8);
          expect(() => runAdvancedDiagnostic(request)).toThrow();
          refusals++;
          if (['topological-entropy', 'transfer-operator'].includes(kind))
            throw new Error(`Independent benchmark unexpectedly refused: ${rejection}`);
        } else {
          const result = runAdvancedDiagnostic(request);
          expect(result.kind).toBe(kind);
          expect(result.rows.length).toBeGreaterThan(0);
          expect(result.rows.every((row) => row.length === result.columns.length && row.every(Number.isFinite))).toBe(
            true
          );
          expect(result.warnings.length).toBeGreaterThan(0);
          expect(result.method).toContain('native');
          const artifact = createAdvancedDiagnosticArtifact(request, result, {
            artifactId: 'matrix_artifact',
            inputRunId: 'matrix_run',
            createdAt: '2026-10-21T00:00:00.000Z'
          });
          expect(importAdvancedDiagnosticArtifact(exportAdvancedDiagnosticArtifact(artifact))).toEqual(artifact);
          calculations++;
        }
      });
  it('contains both actual finite calculations/artifact roundtrips and explained refusals', () => {
    expect(calculations + refusals).toBe(420);
    expect(calculations).toBeGreaterThan(150);
    expect(refusals).toBeGreaterThan(100);
  });
});
