import { describe, expect, it } from 'vitest';
import {
  createChainSimulation,
  defaultChainConfig,
  validateChainConfig,
  toCanonicalChain,
  fromCanonicalChain,
  type ChainConfig
} from '../../../../src/product/adapters/physics/chain';
import {
  addChainLink,
  removeChainLink,
  bulkChainLinks,
  resizeChainLinks
} from '../../../../src/product/adapters/physics/chain-edit';
import { rhsChain, energyChain } from '../../../../src/physics/nPendulum';
import { rhsTriple } from '../../../../src/physics/triple';
import { energyTriple } from '../../../../src/physics/energy';
import { rk4Step, rk2Step, eulerStep } from '../../../../src/physics/integrators';
import { chainPresets } from '../../../../src/product/adapters/physics/chain-presets';
import { EXPANSION_PRESETS, createExpansionSystem } from '../../../../src/physics/expandedModels-factory';
import { createExperimentRoute, resolveProductRoute } from '../../../../src/product/persistence';

describe('S10 variable-DOF physical contract', () => {
  it.each(Array.from({ length: 128 }, (_, i) => i + 1))('validates and round trips all supported N=%i', (n) => {
    const config = defaultChainConfig('system:chain', n);
    const before = structuredClone(config);
    expect(validateChainConfig(config).ok).toBe(true);
    const state = toCanonicalChain(config);
    expect(state.ok).toBe(true);
    if (!state.ok) throw new Error('canonical');
    const restored = fromCanonicalChain(state.value);
    expect(restored).toEqual({ ok: true, value: config });
    expect(config).toEqual(before);
    const simulation = createChainSimulation(config);
    expect(simulation.step().state).toHaveLength(2 * n);
    expect(Number.isFinite(simulation.snapshot().energy.total)).toBe(true);
  });
  it.each([0, 129, 1.5, NaN])('rejects invalid N=%s', (n) =>
    expect(() => defaultChainConfig('system:chain', n)).toThrow()
  );
  it.each(['system:triple', 'system:chain'] as const)(
    '%s: reuses legacy RHS/energy through all exposed steppers',
    (systemId) => {
      for (const [integratorId, stepper] of [
        ['integrator:rk4', rk4Step],
        ['integrator:rk2', rk2Step],
        ['integrator:euler', eulerStep]
      ] as const) {
        const config: ChainConfig = {
          ...defaultChainConfig(systemId, 3),
          parameters: { masses: [1.2, 0.7, 0.9], lengths: [0.8, 1.1, 0.6], g: 9.81 },
          initialState: [0.4, -0.3, 0.2, 0.1, -0.2, 0.3],
          gamma: 0.07,
          integratorId,
          step: 0.001,
          duration: 0.1
        };
        const p = { m1: 1.2, m2: 0.7, m3: 0.9, l1: 0.8, l2: 1.1, l3: 0.6, g: 9.81 };
        const rhs = (s: Float64Array, out: Float64Array) =>
          systemId === 'system:triple'
            ? rhsTriple(s, p, config.gamma, out)
            : rhsChain(s, config.parameters, config.gamma, out);
        const state = Float64Array.from(config.initialState),
          out = new Float64Array(6),
          sim = createChainSimulation(config);
        for (let i = 0; i < 100; i++) {
          stepper(state, config.step, rhs, out);
          state.set(out);
          const sample = sim.step();
          expect(sample.state).toEqual(Array.from(state));
          expect(sample.energy).toEqual(
            systemId === 'system:triple' ? energyTriple(state, p) : energyChain(state, config.parameters)
          );
        }
        expect(sim.done).toBe(true);
        expect(sim.snapshot().time).toBe(0.1);
      }
    }
  );
  it('matches the single-pendulum acceleration, Cartesian lengths and energy reference', () => {
    const config = {
      ...defaultChainConfig('system:chain', 1),
      parameters: { masses: [2], lengths: [3], g: 9.81 },
      initialState: [0.4, 0.2],
      gamma: 0.3,
      integratorId: 'integrator:euler' as const,
      step: 0.001,
      duration: 0.001
    };
    const sim = createChainSimulation(config),
      first = sim.snapshot(),
      last = sim.step();
    expect((last.state[1]! - 0.2) / 0.001).toBeCloseTo((-9.81 / 3) * Math.sin(0.4) - (0.3 * 0.2) / (2 * 9), 12);
    expect(first.positions[0]).toEqual({ x: 3 * Math.sin(0.4), y: -3 * Math.cos(0.4) });
    expect(first.energy.PE).toBeCloseTo(-2 * 9.81 * 3 * Math.cos(0.4), 12);
  });
  it('preserves gamma and matches triple against N=3 chain across a full short run', () => {
    const a = createChainSimulation({ ...defaultChainConfig('system:triple'), gamma: 0.1, duration: 0.2 });
    const b = createChainSimulation({ ...a.config, systemId: 'system:chain' });
    while (!a.done) {
      const x = a.step(),
        y = b.step();
      x.state.forEach((v, i) => expect(v).toBeCloseTo(y.state[i]!, 11));
      expect(x.energy.total).toBeCloseTo(y.energy.total, 10);
    }
  });
  it.each([
    { gamma: NaN },
    { gamma: -1 },
    { step: 0 },
    { step: 0.1 },
    { duration: 301 },
    { step: 1e-6, duration: 1 },
    { sampleEvery: 1.5 },
    { sampleEvery: null },
    { startTime: null },
    { analyses: null },
    { initialState: [1, 2] },
    { parameters: { masses: [1, 0], lengths: [1, 1], g: 9.81 } },
    { parameters: { masses: [1], lengths: [1], g: 0 } },
    { unknown: 'preserve' },
    { initialState: new Array(8) },
    { integratorId: 'integrator:yoshida4' },
    { parameters: { masses: [1], lengths: [1, 2], g: 9.81 } }
  ])('rejects malformed or unsupported settings without source mutation: %j', (patch) => {
    const config = { ...defaultChainConfig(), ...patch };
    const before = structuredClone(config);
    expect(validateChainConfig(config).ok).toBe(false);
    expect(config).toEqual(before);
  });
  it('allows zero gravity only for triple and rejects wrong triple dimensions', () => {
    const c = defaultChainConfig('system:triple');
    expect(validateChainConfig({ ...c, parameters: { ...c.parameters, g: 0 } }).ok).toBe(true);
    expect(validateChainConfig({ ...defaultChainConfig('system:chain', 4), systemId: 'system:triple' }).ok).toBe(false);
  });
  it('does not advance past duration and isolates inspection/config buffers', () => {
    const config = { ...defaultChainConfig(), step: 0.003, duration: 0.01, startTime: 1 };
    const sim = createChainSimulation(config);
    while (!sim.done) sim.step();
    expect(sim.snapshot().step).toBe(4);
    expect(sim.snapshot().time).toBe(1.01);
    const before = sim.snapshot();
    (sim.config.initialState as number[])[0] = 90;
    (config.initialState as number[])[0] = 70;
    expect(sim.step()).toEqual(before);
  });
  it('strictly preserves canonical units, seed, provenance and unknown versions', () => {
    const c = {
      ...defaultChainConfig(),
      seed: { value: '42', generator: 'fixture', generatorVersion: 'v1' },
      provenance: { source: { kind: 'manual' as const } }
    };
    // Seed preservation is independent of whether this deterministic engine consumes it.
    const canonical = toCanonicalChain({ ...defaultChainConfig(), seed: c.seed });
    if (!canonical.ok) throw new Error('state');
    const route = createExperimentRoute(canonical.value);
    if (!route.ok) throw new Error('route');
    const restored = resolveProductRoute(route.value);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.value.experiment).toEqual(canonical.value);
    for (const patch of [
      { modelVersion: 'future' },
      { modelOptions: {} },
      { integrator: { ...canonical.value.integrator, options: {} } },
      { parameters: { ...canonical.value.parameters, extra: { kind: 'scalar', unit: 'kg', value: 1 } } }
    ])
      expect(fromCanonicalChain({ ...canonical.value, ...patch }).ok).toBe(false);
    expect(
      fromCanonicalChain({
        ...canonical.value,
        initialConditions: {
          ...canonical.value.initialConditions,
          theta: { kind: 'vector', values: [1, 2, 3, 4], unit: 'deg' }
        }
      }).ok
    ).toBe(false);
  });
  it('preserves the existing cascade preset values and numerical result', () => {
    const config = chainPresets('system:chain').find((p) => p.id === 'chain-cascade')!.config;
    const preset = EXPANSION_PRESETS.find((p) => p.id === 'chain-cascade')!;
    const legacy = createExpansionSystem('chain', preset.config.parameterOverrides, preset.config.initialState);
    expect(config.initialState).toEqual(Array.from(legacy.initialState));
    const state = Float64Array.from(config.initialState),
      out = new Float64Array(state.length);
    rk4Step(state, config.step, legacy.rhs, out);
    expect(createChainSimulation(config).step().state).toEqual(Array.from(out));
  });
});
describe('S10 atomic link correspondence', () => {
  const config: ChainConfig = {
    ...defaultChainConfig('system:chain', 3),
    parameters: { masses: [1, 2, 3], lengths: [4, 5, 6], g: 9.81 },
    initialState: [0.1, 0.2, 0.3, 1, 2, 3]
  };
  it.each([0, 1, 2])('deletes link %i without mixing the two state halves', (i) => {
    const next = removeChainLink(config, i),
      keep = [0, 1, 2].filter((j) => j !== i);
    expect(next.parameters.masses).toEqual(keep.map((j) => config.parameters.masses[j]));
    expect(next.initialState).toEqual([
      ...keep.map((j) => config.initialState[j]),
      ...keep.map((j) => config.initialState[j + 3])
    ]);
  });
  it.each([0, 1, 3])('insertion at %i can be removed losslessly', (i) =>
    expect(removeChainLink(addChainLink(config, i), i)).toEqual(config)
  );
  it('resizes directly to 128 and restores all existing values', () =>
    expect(resizeChainLinks(resizeChainLinks(config, 128), 3)).toEqual(config));
  it.each(['mass', 'length', 'theta', 'omega'] as const)('bulk %s changes only its matching vector', (field) => {
    const before = structuredClone(config),
      next = bulkChainLinks(config, field, 0.5);
    expect(config).toEqual(before);
    const n = 3;
    if (field === 'mass' || field === 'length') {
      expect(next.parameters[field === 'mass' ? 'masses' : 'lengths']).toEqual([0.5, 0.5, 0.5]);
      expect(next.initialState).toEqual(config.initialState);
    } else {
      expect(next.initialState.slice(field === 'theta' ? 0 : n, field === 'theta' ? n : 2 * n)).toEqual([
        0.5, 0.5, 0.5
      ]);
      expect(next.parameters).toEqual(config.parameters);
    }
  });
  it('rejects invalid bulk/edits without mutation', () => {
    const before = structuredClone(config);
    expect(() => bulkChainLinks(config, 'mass', -1)).toThrow();
    expect(() => removeChainLink(config, 3)).toThrow();
    expect(() => removeChainLink(defaultChainConfig('system:chain', 1), 0)).toThrow();
    expect(() => addChainLink(defaultChainConfig('system:triple'))).toThrow();
    expect(config).toEqual(before);
  });
});
