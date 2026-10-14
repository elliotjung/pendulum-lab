import { describe, expect, it } from 'vitest';
import {
  createSpatialSimulation,
  defaultSpatialConfig,
  validateSpatialConfig,
  toCanonicalSpatial,
  fromCanonicalSpatial,
  SPATIAL_SYSTEM_IDS,
  spatialIsChain,
  spatialIsEmbedded,
  withSpatialAngles,
  spatialInitialAngles,
  type SpatialConfig,
  type SpatialSample,
  type SpatialPoint
} from '../../../../src/product/adapters/physics/spatial';
import {
  SphericalPendulum,
  sphericalEnergy,
  sphericalLz,
  type SphericalState
} from '../../../../src/physics/spherical';
import {
  EmbeddedSphericalPendulum,
  sphericalEmbeddedEnergy,
  sphericalEmbeddedLz,
  type EmbeddedSphericalState
} from '../../../../src/physics/sphericalEmbedded';
import { SphericalChain, sphericalChainEnergy, sphericalChainLz } from '../../../../src/physics/sphericalChain';
import {
  EmbeddedSphericalChain,
  embeddedChainEnergy,
  embeddedChainLz
} from '../../../../src/physics/sphericalEmbeddedChain';
import { createExperimentRoute, resolveProductRoute } from '../../../../src/product/persistence';
import { validateExperimentState } from '../../../../src/product/contracts/experiment-validation';

function trajectory(config: SpatialConfig): SpatialSample[] {
  const sim = createSpatialSimulation(config),
    samples = [sim.snapshot()];
  while (!sim.done) samples.push(sim.step());
  return samples;
}
const rotate = (p: SpatialPoint, a: number): SpatialPoint => ({
  x: p.x * Math.cos(a) - p.z * Math.sin(a),
  y: p.y,
  z: p.x * Math.sin(a) + p.z * Math.cos(a)
});
function closeVector(actual: SpatialPoint, expected: SpatialPoint, digits = 9) {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}

describe('S12 original-engine characterization and physical invariants', () => {
  it.each(SPATIAL_SYSTEM_IDS)(
    '%s preserves native legacy states, mass-scaled energy and the true +y momentum',
    (systemId) => {
      const base = defaultSpatialConfig(systemId),
        n = base.parameters.masses.length;
      const config = {
        ...base,
        parameters: { ...base.parameters, masses: Array(n).fill(2.3), lengths: Array(n).fill(0.8), damping: 0.1 },
        duration: 0.2
      };
      const p = config.parameters,
        singleParams = { l: p.lengths[0]!, g: p.g, damping: p.damping };
      const original =
        systemId === 'system:spherical'
          ? new SphericalPendulum(singleParams, config.initialState as SphericalState, config.step)
          : systemId === 'system:spherical-embedded'
            ? new EmbeddedSphericalPendulum(singleParams, config.initialState as EmbeddedSphericalState, config.step)
            : systemId === 'system:spherical-chain'
              ? new SphericalChain(p, config.initialState, { dt: config.step, method: 'rk4' })
              : new EmbeddedSphericalChain(p, Float64Array.from(config.initialState), config.step);
      const sim = createSpatialSimulation(config);
      while (true) {
        const state = original.current(),
          sample = sim.snapshot();
        expect(sample.state).toEqual(Array.from(state));
        expect(sample.positions).toEqual('positions' in original ? original.positions() : [original.position()]);
        const energy =
          systemId === 'system:spherical'
            ? p.masses[0]! * sphericalEnergy(state as SphericalState, singleParams)
            : systemId === 'system:spherical-embedded'
              ? p.masses[0]! * sphericalEmbeddedEnergy(state as EmbeddedSphericalState, singleParams)
              : systemId === 'system:spherical-chain'
                ? sphericalChainEnergy(state, p).total
                : embeddedChainEnergy(state, p).total;
        const momentum =
          systemId === 'system:spherical'
            ? -p.masses[0]! * sphericalLz(state as SphericalState, singleParams)
            : systemId === 'system:spherical-embedded'
              ? -p.masses[0]! * sphericalEmbeddedLz(state as EmbeddedSphericalState, singleParams)
              : systemId === 'system:spherical-chain'
                ? sphericalChainLz(state, p)
                : embeddedChainLz(state, p);
        expect(sample.energy.total).toBe(energy);
        expect(sample.verticalMomentum).toBeCloseTo(momentum, 12);
        expect(sample.angularMomentum.y).toBe(sample.verticalMomentum);
        const kinetic = sample.velocities.reduce(
          (sum, v, i) => sum + 0.5 * p.masses[i]! * (v.x ** 2 + v.y ** 2 + v.z ** 2),
          0
        );
        expect(sample.energy.KE).toBeCloseTo(kinetic, 12);
        expect(
          Math.max(...sample.constraintErrors, ...sample.unitConstraintErrors, ...sample.tangentConstraintErrors)
        ).toBeLessThan(1e-12);
        if (sim.done) break;
        original.step(config.step);
        sim.step();
      }
    }
  );
  it.each(['rk4', 'rk2', 'euler'] as const)('polar chain exposes the original selectable %s', (method) => {
    const config = {
      ...defaultSpatialConfig('system:spherical-chain'),
      integratorId: `integrator:${method}` as const,
      duration: 0.04
    };
    const original = new SphericalChain(config.parameters, config.initialState, { dt: config.step, method });
    const sim = createSpatialSimulation(config);
    while (!sim.done) {
      original.step(config.step);
      expect(sim.step().state).toEqual(Array.from(original.current()));
    }
  });
  it.each(SPATIAL_SYSTEM_IDS)('%s is covariant under rotations about gravity and conserves E and Ly', (systemId) => {
    const config = { ...defaultSpatialConfig(systemId), duration: 0.4 },
      angle = 0.73;
    const initial = spatialInitialAngles(config).map((value, index) =>
      index < 2 * config.parameters.masses.length && index % 2 === 1 ? value + angle : value
    );
    const original = trajectory(config),
      rotated = trajectory(withSpatialAngles(config, initial));
    const first = original[0]!;
    for (let i = 0; i < original.length; i++) {
      const a = original[i]!,
        b = rotated[i]!;
      expect(b.energy.total).toBeCloseTo(a.energy.total, 9);
      expect(b.verticalMomentum).toBeCloseTo(a.verticalMomentum, 9);
      a.positions.forEach((point, k) => closeVector(b.positions[k]!, rotate(point, angle)));
      a.velocities.forEach((point, k) => closeVector(b.velocities[k]!, rotate(point, angle)));
      closeVector(b.angularMomentum, rotate(a.angularMomentum, angle));
      expect(Math.abs(a.energy.total - first.energy.total)).toBeLessThan(1e-7);
      expect(Math.abs(a.verticalMomentum - first.verticalMomentum)).toBeLessThan(1e-8);
    }
  });
  it.each(['system:spherical-embedded', 'system:spherical-embedded-chain'] as const)(
    '%s remains constrained through a downward pole and preserves native state on restart',
    (systemId) => {
      const base = defaultSpatialConfig(systemId),
        n = base.parameters.masses.length;
      const initialState = [
        ...Array.from({ length: n }, () => [0, -1, 0]).flat(),
        ...Array.from({ length: n }, () => [0.6, 0, 0.2]).flat()
      ];
      const config = { ...base, initialState, duration: 0.4 };
      const samples = trajectory(config);
      expect(samples[0]!.warnings.join()).toContain('극점');
      for (const sample of samples) {
        expect(
          Math.max(...sample.constraintErrors, ...sample.unitConstraintErrors, ...sample.tangentConstraintErrors)
        ).toBeLessThan(1e-12);
        expect(sample.state.every(Number.isFinite)).toBe(true);
        expect(Math.abs(sample.energy.total - samples[0]!.energy.total)).toBeLessThan(1e-7);
      }
      const native = { ...config, initialState: samples[100]!.state, startTime: samples[100]!.time };
      const encoded = toCanonicalSpatial(native);
      if (!encoded.ok) throw new Error('canonical');
      const decoded = fromCanonicalSpatial(encoded.value);
      if (!decoded.ok) throw new Error('restore');
      expect(decoded.value.initialState).toEqual(native.initialState);
      expect(trajectory(decoded.value)).toEqual(trajectory(native));
    }
  );
  it.each([false, true])('embedded and polar trajectories agree away from poles (chain=%s)', (chain) => {
    const a = { ...defaultSpatialConfig(chain ? 'system:spherical-chain' : 'system:spherical'), duration: 0.1 };
    const b = withSpatialAngles(
      {
        ...defaultSpatialConfig(chain ? 'system:spherical-embedded-chain' : 'system:spherical-embedded'),
        duration: a.duration
      },
      a.initialState
    );
    const polar = trajectory(a),
      embedded = trajectory(b);
    for (let i = 0; i < polar.length; i++)
      polar[i]!.positions.forEach((point, k) => closeVector(embedded[i]!.positions[k]!, point, 8));
  });
});

describe('S12 canonical native-coordinate contract', () => {
  it.each(['system:spherical-chain', 'system:spherical-embedded-chain'] as const)(
    '%s supports both link-count boundaries and rejects larger or empty chains',
    (systemId) => {
      for (const n of [1, 16]) {
        const config = { ...defaultSpatialConfig(systemId, n), duration: 0.02 };
        const samples = trajectory(config);
        expect(samples.at(-1)?.positions).toHaveLength(n);
        expect(samples.every((sample) => sample.state.every(Number.isFinite))).toBe(true);
        expect(Math.max(...samples.flatMap((sample) => sample.constraintErrors))).toBeLessThan(1e-12);
      }
      for (const n of [0, 17]) {
        expect(() => defaultSpatialConfig(systemId, n)).toThrow(RangeError);
        const base = defaultSpatialConfig(systemId);
        expect(
          validateSpatialConfig({
            ...base,
            parameters: { ...base.parameters, masses: Array(n).fill(1), lengths: Array(n).fill(1) },
            initialState: Array((spatialIsEmbedded(systemId) ? 6 : 4) * n).fill(0)
          }).ok
        ).toBe(false);
      }
    }
  );
  it.each(SPATIAL_SYSTEM_IDS)(
    '%s rejects catalog-valid analysis requests that have no spatial dispatch',
    (systemId) => {
      const base = defaultSpatialConfig(systemId);
      const encoded = toCanonicalSpatial(base);
      if (!encoded.ok) throw new Error('canonical');
      const analyses = [{ id: 'analysis:energy', algorithmVersion: 'v1', settings: {} }] as const;
      const canonical = { ...encoded.value, analyses };
      expect(validateExperimentState(canonical).ok).toBe(true);
      for (const result of [validateSpatialConfig({ ...base, analyses }), fromCanonicalSpatial(canonical)]) {
        expect(result.ok).toBe(false);
        if (!result.ok)
          expect(result.issues).toContainEqual(
            expect.objectContaining({ code: 'unsupported-analysis', path: '$.analyses' })
          );
      }
      expect(base.analyses).toEqual([]);
      expect(canonical.analyses).toEqual(analyses);
    }
  );
  it.each(SPATIAL_SYSTEM_IDS)('%s round-trips native coordinates, metadata and a Lab URL', (systemId) => {
    const config: SpatialConfig = {
      ...defaultSpatialConfig(systemId),
      startTime: 1.25,
      sampleEvery: 3,
      seed: { value: '42', generator: 'xoshiro128ss', generatorVersion: '1' },
      provenance: { createdByVersion: '1.0.0', source: { kind: 'manual' }, parentExperimentIds: [] }
    };
    const canonical = toCanonicalSpatial(config);
    if (!canonical.ok) throw new Error('canonical');
    expect(Object.keys(canonical.value.initialConditions)).toEqual(
      spatialIsEmbedded(systemId) ? ['direction', 'directionRate'] : ['angles', 'angularRates']
    );
    const restored = fromCanonicalSpatial(canonical.value);
    expect(restored).toMatchObject({ ok: true, value: config });
    const route = createExperimentRoute(canonical.value);
    if (!route.ok) throw new Error('route');
    const result = resolveProductRoute(route.value);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.value.experiment) throw new Error('route restore');
    expect(fromCanonicalSpatial(result.value.experiment)).toEqual(restored);
  });
  it.each(SPATIAL_SYSTEM_IDS)('%s rejects malformed configs without changing them', (systemId) => {
    const base = defaultSpatialConfig(systemId);
    for (const patch of [
      { parameters: { ...base.parameters, g: -1 } },
      { parameters: { ...base.parameters, masses: [0] } },
      { parameters: { ...base.parameters, lengths: [] } },
      { initialState: [] },
      { initialState: [NaN] },
      { initialState: [Infinity] },
      { step: 0 },
      { duration: 1000 },
      { step: 1e-6, duration: 1 },
      { startTime: null },
      { sampleEvery: 1.2 },
      { analyses: null },
      { unknown: true },
      { integratorId: 'integrator:leapfrog' },
      { systemId: 'system:double' }
    ]) {
      const value = { ...base, ...patch },
        before = structuredClone(value);
      expect(validateSpatialConfig(value).ok).toBe(false);
      expect(value).toEqual(before);
    }
  });
  it.each(SPATIAL_SYSTEM_IDS)(
    '%s refuses unsupported canonical versions, options, units and split dimensions',
    (systemId) => {
      const encoded = toCanonicalSpatial(defaultSpatialConfig(systemId));
      if (!encoded.ok) throw new Error('canonical');
      const state = encoded.value;
      for (const patch of [
        { schema: 'pendulum-experiment/v99' },
        { modelVersion: 'future' },
        { modelOptions: {} },
        { integrator: { ...state.integrator, version: 'future' } },
        { integrator: { ...state.integrator, options: {} } },
        { integrator: { ...state.integrator, settings: { tolerance: { kind: 'scalar', value: 1, unit: '1' } } } },
        { runtime: { domain: 'evaluation' } },
        { analyses: [{ id: 'analysis:lyapunov', algorithmVersion: 'v1', settings: {} }] },
        { parameters: { ...state.parameters, masses: { kind: 'vector', values: [1], unit: 'm' } } },
        { parameters: { ...state.parameters, masses: { kind: 'scalar', value: 1, unit: 'kg' } } },
        { parameters: { ...state.parameters, unknown: { kind: 'scalar', value: 1, unit: '1' } } },
        { initialConditions: { ...state.initialConditions, unknown: { kind: 'scalar', value: 1, unit: '1' } } }
      ])
        expect(fromCanonicalSpatial({ ...state, ...patch }).ok).toBe(false);
      const names = Object.keys(state.initialConditions),
        first = state.initialConditions[names[0]!]!,
        second = state.initialConditions[names[1]!]!;
      if (first.kind !== 'vector' || second.kind !== 'vector') throw new Error('vectors');
      expect(
        fromCanonicalSpatial({
          ...state,
          initialConditions: {
            [names[0]!]: { ...first, values: [...first.values, second.values[0]] },
            [names[1]!]: { ...second, values: second.values.slice(1) }
          }
        }).ok
      ).toBe(false);
    }
  );
  it('rejects non-unit and non-tangent native states instead of silently projecting imports', () => {
    const base = defaultSpatialConfig('system:spherical-embedded');
    for (const initialState of [
      [0, -2, 0, 0, 0, 0],
      [0, -1, 0, 1, 1, 0]
    ])
      expect(validateSpatialConfig({ ...base, initialState }).ok).toBe(false);
  });
  it('rejects unsafe objects without evaluating getters', () => {
    let invoked = false;
    const data = Object.defineProperty({}, 'parameters', {
      enumerable: true,
      get() {
        invoked = true;
        return {};
      }
    });
    expect(validateSpatialConfig(data).ok).toBe(false);
    expect(invoked).toBe(false);
    expect(validateSpatialConfig(JSON.parse('{"__proto__":{"polluted":true}}')).ok).toBe(false);
  });
  it('respects legacy gravity and integrator restrictions', () => {
    for (const id of SPATIAL_SYSTEM_IDS) {
      const config = defaultSpatialConfig(id);
      expect(validateSpatialConfig({ ...config, parameters: { ...config.parameters, g: 0 } }).ok).toBe(
        !spatialIsChain(id)
      );
      expect(validateSpatialConfig({ ...config, integratorId: 'internal' }).ok).toBe(id !== 'system:spherical-chain');
    }
  });
  it.each(SPATIAL_SYSTEM_IDS)(
    '%s stops at fractional duration and detaches all input and output buffers',
    (systemId) => {
      const config = { ...defaultSpatialConfig(systemId), step: 0.003, duration: 0.01, startTime: 2 },
        sim = createSpatialSimulation(config);
      const snapshot = sim.snapshot(),
        original = snapshot.state[0];
      (snapshot.state as number[])[0] = 999;
      (config.initialState as number[])[0] = 888;
      (sim.config.initialState as number[])[0] = 777;
      expect(sim.snapshot().state[0]).toBe(original);
      while (!sim.done) sim.step();
      expect(sim.snapshot()).toMatchObject({ step: 4, time: 2.01 });
      expect(sim.step()).toEqual(sim.snapshot());
    }
  );
  it('preserves the finite last-valid state and refuses further steps after numerical overflow', () => {
    const sim = createSpatialSimulation({
      ...defaultSpatialConfig(),
      initialState: [0.01, 0, 10000, 10000],
      step: 0.05,
      duration: 1
    });
    let last = sim.snapshot(),
      failed = false;
    while (!sim.done) {
      try {
        last = sim.step();
      } catch {
        failed = true;
        break;
      }
    }
    expect(failed).toBe(true);
    expect(last.state.every(Number.isFinite)).toBe(true);
    expect(sim.snapshot()).toEqual(last);
    expect(() => sim.step()).toThrow();
    expect(sim.snapshot()).toEqual(last);
  });
});
