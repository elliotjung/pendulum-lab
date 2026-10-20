import { describe, expect, it } from 'vitest';
import { rk4Step } from '../../../../../src/physics/integrators';
import { fputAcceleration } from '../../../../../src/physics/fput';
import { type ExperimentStateV1 } from '../../../../../src/product/contracts/experiment';
import type { ContractResult } from '../../../../../src/product/contracts/validation';
import {
  createDiagnosticFlow,
  createDiagnosticSeries,
  diagnosticFlowRejection,
  validateDiagnosticExperiment
} from '../../../../../src/product/adapters/analysis/core/source';
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
  toCanonicalDriven,
  type DrivenConfig
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

function unwrap<T>(result: ContractResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}
const refused = new Set(
  [
    'rope',
    'double-string',
    'spherical-embedded',
    'spherical-embedded-chain',
    'friction',
    'pyragas',
    'langevin',
    'sine-gordon',
    'lattice-fk-limit',
    'frenkel-kontorova',
    'standard-map',
    'quantum-kicked-rotor',
    'unitary-floquet'
  ].map((s) => `system:${s}`)
);
const statics = new Set(['system:lattice-fk-limit', 'system:frenkel-kontorova', 'system:unitary-floquet']);
type Sample = { state: readonly number[] };
type Fixture = { id: string; experiment: ExperimentStateV1; samples: unknown[]; next: readonly number[]; dt: number };
function fixture<C extends { systemId: string }>(
  c: C,
  canonical: (c: C) => ContractResult<ExperimentStateV1>,
  simulation: (c: C) => { snapshot(): Sample; step(): Sample }
): Fixture {
  const experiment = unwrap(canonical(c)),
    sim = simulation(c),
    first = sim.snapshot(),
    next = sim.step();
  return {
    id: c.systemId,
    experiment,
    samples: [first, next],
    next: next.state,
    dt: experiment.runtime.domain === 'time' ? experiment.runtime.step.value : 1
  };
}
function fixtures(small = false): Fixture[] {
  const time = small ? { step: 0.00001, duration: 0.00002 } : {};
  return [
    ...PLANAR_SYSTEM_IDS.map((id) =>
      fixture({ ...defaultPlanarConfig(id), ...time }, toCanonicalPlanar, createPlanarSimulation)
    ),
    ...CHAIN_SYSTEM_IDS.map((id) =>
      fixture({ ...defaultChainConfig(id), ...time }, toCanonicalChain, createChainSimulation)
    ),
    ...CONSTRAINT_SYSTEM_IDS.map((id) =>
      fixture({ ...defaultConstraintConfig(id), ...time }, toCanonicalConstraint, createConstraintSimulation)
    ),
    ...SPATIAL_SYSTEM_IDS.map((id) =>
      fixture({ ...defaultSpatialConfig(id), ...time }, toCanonicalSpatial, createSpatialSimulation)
    ),
    ...DRIVEN_SYSTEM_IDS.map((id) =>
      fixture({ ...defaultDrivenConfig(id), ...time }, toCanonicalDriven, createDrivenSimulation)
    ),
    ...NONLINEAR_SYSTEM_IDS.map((id) =>
      fixture(
        { ...defaultNonlinearConfig(id), ...(refused.has(id) ? {} : time) },
        toCanonicalNonlinear,
        createNonlinearSimulation
      )
    ),
    ...NETWORK_SYSTEM_IDS.map((id) =>
      fixture({ ...defaultNetworkConfig(id), ...time }, toCanonicalNetwork, createNetworkSimulation)
    ),
    ...FIELD_SYSTEM_IDS.map((id) =>
      fixture({ ...defaultFieldConfig(id), ...time }, toCanonicalField, createFieldSimulation)
    ),
    ...DISCRETE_SYSTEM_IDS.map((id) => fixture(defaultDiscreteConfig(id), toCanonicalDiscrete, createDiscreteSession))
  ];
}

describe('diagnostic native source compatibility across all 35 product systems', () => {
  const all = fixtures();
  it('has exactly 35 distinct native fixtures', () => expect(new Set(all.map((f) => f.id)).size).toBe(35));
  for (const f of all) {
    it(`${f.id}: explicit columns, units, original retained observations and capability reason`, () => {
      const input = structuredClone(f.samples),
        experiment = structuredClone(f.experiment);
      const series = createDiagnosticSeries(f.experiment, f.samples);
      expect(f.samples).toEqual(input);
      expect(f.experiment).toEqual(experiment);
      expect(series.axisUnit).toBe(
        f.id.includes('standard-map') || f.id.includes('quantum') || f.id.includes('unitary')
          ? 'iteration'
          : [
                'duffing',
                'van-der-pol',
                'mathieu',
                'magnetic',
                'langevin',
                'fput',
                'sine-gordon',
                'frenkel-kontorova',
                'lattice-fk-limit'
              ].some((id) => f.id === `system:${id}`)
            ? 'normalized-time'
            : 's'
      );
      expect(series.labels.length).toBe(series.units.length);
      if (statics.has(f.id)) {
        expect(series.times).toEqual([]);
        expect(series.states).toEqual([]);
        expect(series.warnings.join(' ')).toContain('정적');
      } else {
        expect(series.times).toHaveLength(2);
        expect(series.states).toHaveLength(2);
        expect(series.states.every((s) => s.length === series.labels.length)).toBe(true);
        expect(series.units.every((u) => u.length > 0)).toBe(true);
        if (f.id === 'system:quantum-kicked-rotor') {
          expect(series.labels).toEqual(['meanSquareMomentum', 'norm']);
          expect(series.states[0]).toEqual([
            (input[0] as { meanSquareMomentum: number }).meanSquareMomentum,
            (input[0] as { norm: number }).norm
          ]);
        } else expect(series.states).toEqual(input.map((s) => (s as Sample).state));
      }
      if (series.energy) expect(series.energyUnit).toBeTruthy();
      if (refused.has(f.id)) {
        expect(diagnosticFlowRejection(f.experiment)).toBeTruthy();
        expect(() => createDiagnosticFlow(f.experiment)).toThrow();
      } else {
        expect(diagnosticFlowRejection(f.experiment)).toBeNull();
        const flow = createDiagnosticFlow(f.experiment);
        expect(flow.dt).toBe(f.dt);
        const out = new Float64Array(flow.initial.length);
        flow.rhs(Float64Array.from(flow.initial), out);
        expect([...out].every(Number.isFinite)).toBe(true);
      }
    });
  }
  it('rejects invalid retained coordinates, energy and time rather than repairing observations', () => {
    const f = all[0]!,
      sample = f.samples[0] as Record<string, unknown>;
    expect(() => createDiagnosticSeries(f.experiment, [{ ...sample, state: [NaN, 0, 0, 0] }])).toThrow('유한');
    expect(() => createDiagnosticSeries(f.experiment, [{ ...sample, state: [1, 2] }])).toThrow('4개');
    expect(() => createDiagnosticSeries(f.experiment, [sample, sample])).toThrow('증가');
    expect(() => createDiagnosticSeries(f.experiment, [{ ...sample, energy: NaN }])).toThrow('에너지');
  });
  it('rejects unfamiliar native versions/units/options for signal-only reload too', () => {
    const f = all[0]!;
    expect(() => validateDiagnosticExperiment({ ...f.experiment, modelVersion: 'future-v99' })).toThrow();
    expect(() =>
      createDiagnosticSeries(
        {
          ...f.experiment,
          initialConditions: { ...f.experiment.initialConditions, theta1: { kind: 'scalar', value: 1, unit: 'm' } }
        },
        f.samples
      )
    ).toThrow();
    expect(() =>
      createDiagnosticSeries({ ...f.experiment, modelOptions: { unknownPhysics: true } }, f.samples)
    ).toThrow();
  });
  it('does not invent energy for phase-only networks or quantum/maps', () => {
    for (const id of [
      'huygens-phase-pair',
      'kuramoto',
      'chimera-exploration',
      'standard-map',
      'quantum-kicked-rotor'
    ]) {
      const f = all.find((value) => value.id === `system:${id}`)!;
      expect(createDiagnosticSeries(f.experiment, f.samples).energy).toBeUndefined();
    }
  });
});

describe('native smooth flow parity and time/forcing fidelity', () => {
  for (const f of fixtures(true).filter((f) => !refused.has(f.id))) {
    it(`${f.id}: one RK4 step agrees with its product path at small dt`, () => {
      const flow = createDiagnosticFlow(f.experiment),
        next = new Float64Array(flow.initial.length);
      rk4Step(Float64Array.from(flow.initial), flow.dt, flow.rhs, next);
      // FPUT uses Verlet and chimera uses midpoint RK2. At 1e-5, their O(dt^3) local differences are below this fixed bound.
      f.next.forEach((value, i) => {
        const difference = next[i]! - value;
        const error =
          f.id === 'system:chimera-exploration' ? Math.atan2(Math.sin(difference), Math.cos(difference)) : difference;
        expect(Math.abs(error)).toBeLessThan(1e-11);
      });
    });
  }
  for (const id of DRIVEN_SYSTEM_IDS) {
    it(`${id}: damping, force and absolute start clock survive the shared native RHS`, () => {
      const base = defaultDrivenConfig(id);
      const c: DrivenConfig = {
        ...base,
        startTime: 4.37,
        parameters: {
          ...base.parameters,
          ...(id === 'system:cartpole' ? { friction: 0.27, force: 0.31 } : { damping: 0.27 })
        },
        initialState: base.initialState.map((v, i) => v + 0.01 * (i + 1)),
        ...(base.forcing ? { forcing: { ...base.forcing, amplitude: 0.12, phase: 0.39, frequency: 1.7 } } : {})
      };
      const flow = createDiagnosticFlow(unwrap(toCanonicalDriven(c))),
        next = new Float64Array(flow.initial.length);
      rk4Step(Float64Array.from(flow.initial), flow.dt, flow.rhs, next);
      const actual = createDrivenSimulation(c).step().state;
      actual.forEach((value, i) => expect(next[i]).toBe(value));
      if (id === 'system:cartpole') {
        expect(flow.initial).toHaveLength(5);
        expect(flow.warnings.join(' ')).toContain('시간 방향');
      }
    });
  }
  it('refuses nonsmooth waveforms and saturation controllers with actionable reasons', () => {
    const driven = defaultDrivenConfig(),
      inverted = defaultDrivenConfig('system:inverted');
    const square = unwrap(toCanonicalDriven({ ...driven, forcing: { ...driven.forcing!, waveform: 'square' } }));
    expect(() => createDiagnosticFlow(square)).toThrow('sine');
    const controlled = unwrap(
      toCanonicalDriven({ ...inverted, controller: { ...inverted.controller!, enabled: true } })
    );
    expect(() => createDiagnosticFlow(controlled)).toThrow('포화');
  });
  it('uses native FPUT acceleration without modifying masses or couplings', () => {
    const c = defaultFieldConfig('system:fput'),
      flow = createDiagnosticFlow(unwrap(toCanonicalField(c)));
    const expected = new Float64Array(c.grid.points),
      out = new Float64Array(flow.initial.length);
    fputAcceleration(
      c.initialState,
      { size: c.grid.points, alpha: c.parameters.alpha!, beta: c.parameters.beta! },
      expected
    );
    flow.rhs(Float64Array.from(flow.initial), out);
    expect([...out.subarray(c.grid.points)]).toEqual([...expected]);
    expect(flow.conservative).toBe(true);
  });
  it('retains the Mathieu absolute start time and discloses the extra clock direction', () => {
    const c = { ...defaultNonlinearConfig('system:mathieu'), startTime: 2.5 };
    const flow = createDiagnosticFlow(unwrap(toCanonicalNonlinear(c))),
      next = new Float64Array(3);
    rk4Step(Float64Array.from(flow.initial), flow.dt, flow.rhs, next);
    expect([...next.slice(0, 2)]).toEqual(createNonlinearSimulation(c).step().state);
    expect(flow.warnings.join(' ')).toContain('정규화');
    expect(flow.warnings.join(' ')).toContain('시간 방향');
  });
});
