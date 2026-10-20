import { describe, expect, it } from 'vitest';
import type { ExperimentStateV1 } from '../../../../../src/product/contracts/experiment';
import type { ContractResult } from '../../../../../src/product/contracts/validation';
import { CORE_DIAGNOSTIC_KINDS } from '../../../../../src/product/adapters/analysis/core/contracts';
import { runCoreDiagnostic } from '../../../../../src/product/adapters/analysis/core/execute';
import { defaultCoreSettings } from '../../../../../src/product/adapters/analysis/core/settings';
import { coreDiagnosticRejection } from '../../../../../src/product/adapters/analysis/core/validation';
import { createDiagnosticSeries } from '../../../../../src/product/adapters/analysis/core/source';
import {
  createCoreDiagnosticArtifact,
  exportCoreDiagnosticArtifact,
  importCoreDiagnosticArtifact
} from '../../../../../src/product/adapters/analysis/core/artifact';
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
const staticSystems = ['system:unitary-floquet', 'system:lattice-fk-limit', 'system:frenkel-kontorova'];
const refusedFlow = [
  ...staticSystems,
  ...[
    'rope',
    'double-string',
    'spherical-embedded',
    'spherical-embedded-chain',
    'friction',
    'pyragas',
    'langevin',
    'sine-gordon',
    'standard-map',
    'quantum-kicked-rotor'
  ].map((id) => `system:${id}`)
];
const noEnergy = ['huygens-phase-pair', 'kuramoto', 'chimera-exploration', 'standard-map', 'quantum-kicked-rotor'].map(
  (id) => `system:${id}`
);
const flowKinds = ['poincare', 'lyapunov', 'sali', 'fli', 'shadowing'];

describe('all 385 core-diagnostic/product-system pairs execute or explain refusal', () => {
  it('covers exactly 35 native systems and 11 core diagnostics', () => {
    expect(new Set(cases.map((entry) => entry.id)).size).toBe(35);
    expect(CORE_DIAGNOSTIC_KINDS).toHaveLength(11);
  });
  for (const c of cases)
    for (const kind of CORE_DIAGNOSTIC_KINDS) {
      it(`${c.id} × ${kind}`, () => {
        const settings = defaultCoreSettings(kind, c.experiment);
        if (flowKinds.includes(kind)) {
          const dt = c.experiment.runtime.domain === 'time' ? c.experiment.runtime.step.value : 0.01;
          settings.duration = dt * 2;
          if ('renormEvery' in settings) settings.renormEvery = 1;
          if ('sampleEvery' in settings) settings.sampleEvery = 1;
        }
        if (kind === 'zero-one') settings.cSamples = 4;
        const refused =
          staticSystems.includes(c.id) ||
          (flowKinds.includes(kind) && refusedFlow.includes(c.id)) ||
          (kind === 'energy' && noEnergy.includes(c.id));
        const rejection = coreDiagnosticRejection(kind, c.experiment, c.series, settings);
        const request = { id: 'matrix', kind, experiment: c.experiment, series: c.series, settings };
        if (refused) {
          expect(rejection).toBeTypeOf('string');
          expect(rejection!.length).toBeGreaterThan(8);
          expect(() => runCoreDiagnostic(request)).toThrow();
        } else {
          expect(rejection, `${c.id} ${kind}: ${rejection}`).toBeNull();
          const result = runCoreDiagnostic(request);
          expect(result.kind).toBe(kind);
          expect(result.columns).toHaveLength(result.units.length);
          expect(result.rows.every((row) => row.length === result.columns.length && row.every(Number.isFinite))).toBe(
            true
          );
          expect(result.method.length).toBeGreaterThan(0);
          expect(() => JSON.stringify(result)).not.toThrow();
          const artifact = createCoreDiagnosticArtifact(request, result, {
            artifactId: 'matrix_artifact',
            inputRunId: 'matrix_run',
            createdAt: '2026-10-20T04:00:00.000Z'
          });
          expect(importCoreDiagnosticArtifact(exportCoreDiagnosticArtifact(artifact))).toEqual(artifact);
        }
      });
    }
  it('refuses a retained off-stride final observation for all uniform signal estimators', () => {
    const c = cases[0]!,
      series = structuredClone(c.series);
    series.times[series.times.length - 1]! += 0.001;
    for (const kind of ['fft', 'naff', 'zero-one'] as const)
      expect(coreDiagnosticRejection(kind, c.experiment, series, defaultCoreSettings(kind))).toContain('균일');
  });
});
