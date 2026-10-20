import { describe, expect, it } from 'vitest';
import {
  createFieldSimulation,
  defaultFieldConfig,
  FIELD_MODEL_VERSION,
  FIELD_SEED_GENERATOR,
  FIELD_SYSTEM_IDS,
  fieldMemberSeed,
  fromCanonicalField,
  resizeFieldConfig,
  toCanonicalField,
  validateFieldConfig,
  type FieldConfig
} from '../../../src/product/adapters/physics/field';
import { parseExperiment, serializeExperiment } from '../../../src/product/persistence/serialization';
import { decodeShareToken, encodeShareToken } from '../../../src/product/persistence/share';

function canonical(config: FieldConfig) {
  const result = toCanonicalField(config);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}
describe('S16 closed normalized field state and transport', () => {
  it.each(FIELD_SYSTEM_IDS)('%s preserves model, grid, seed, ensemble and provenance in JSON', (systemId) => {
    const config = {
        ...defaultFieldConfig(systemId),
        provenance: {
          createdByVersion: 's16-test',
          source: { kind: 'derived' as const, id: 'field-fixture' },
          parentExperimentIds: ['parent-16']
        }
      },
      before = structuredClone(config),
      experiment = canonical(config),
      serialized = serializeExperiment(experiment);
    expect(experiment.modelVersion).toBe(FIELD_MODEL_VERSION);
    expect(experiment.modelOptions).toEqual({ boundary: config.grid.boundary, timeConvention: 'normalized' });
    expect(experiment.seed?.generator).toBe(FIELD_SEED_GENERATOR);
    expect(experiment.runtime.domain).toBe(
      ['system:lattice-fk-limit', 'system:frenkel-kontorova'].includes(systemId) ? 'evaluation' : 'time'
    );
    if (!serialized.ok) throw new Error(JSON.stringify(serialized.issues));
    const parsed = parseExperiment(serialized.value);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    expect(fromCanonicalField(parsed.value)).toEqual({ ok: true, value: config });
    expect(config).toEqual(before);
  });
  it.each(FIELD_SYSTEM_IDS)('%s transports a compact configuration through shares', (systemId) => {
    const base = defaultFieldConfig(systemId),
      config = systemId === 'system:sine-gordon' ? resizeFieldConfig(base, 9) : base,
      token = encodeShareToken(canonical(config));
    if (!token.ok) throw new Error(JSON.stringify(token.issues));
    const decoded = decodeShareToken(token.value);
    if (!decoded.ok) throw new Error(JSON.stringify(decoded.issues));
    expect(fromCanonicalField(decoded.value)).toEqual({ ok: true, value: config });
  });
  it.each(FIELD_SYSTEM_IDS)('%s rejects unknown versions, quantities and semantics without changing input', (id) => {
    const experiment = canonical(defaultFieldConfig(id));
    for (const input of [
      { ...experiment, modelVersion: 'field-model-v2' },
      { ...experiment, modelOptions: { ...experiment.modelOptions, timeConvention: 'SI' } },
      { ...experiment, modelOptions: { ...experiment.modelOptions, unknown: true } },
      { ...experiment, parameters: { ...experiment.parameters, unknown: { kind: 'scalar', value: 1, unit: '1' } } },
      {
        ...experiment,
        initialConditions: { ...experiment.initialConditions, unknown: { kind: 'scalar', value: 1, unit: '1' } }
      },
      { ...experiment, seed: { ...experiment.seed, generatorVersion: '2' } },
      {
        ...experiment,
        integrator: { ...experiment.integrator, settings: { dt: { kind: 'scalar', value: 0.01, unit: 's' } } }
      },
      { ...experiment, topology: { schema: 'pendulum-network-topology/v1', nodes: ['n1'], edges: [] } }
    ]) {
      const original = structuredClone(input);
      expect(() => fromCanonicalField(input)).not.toThrow();
      expect(fromCanonicalField(input).ok).toBe(false);
      expect(input).toEqual(original);
    }
  });
  it('requires dimensionless carriers plus explicit normalized convention', () => {
    const experiment = canonical(defaultFieldConfig('system:fput'));
    for (const unit of ['m', 'rad', 's', 'J'])
      expect(
        fromCanonicalField({
          ...experiment,
          parameters: { ...experiment.parameters, alpha: { kind: 'scalar', value: 0.25, unit } }
        }).ok
      ).toBe(false);
    expect(fromCanonicalField({ ...experiment, modelOptions: { boundary: 'fixed' } }).ok).toBe(false);
    expect(fromCanonicalField({ ...experiment, modelOptions: { timeConvention: 'normalized' } }).ok).toBe(false);
  });
  it('does not hide mismatched canonical runtime and persisted numerical controls', () => {
    const experiment = canonical(defaultFieldConfig('system:fput'));
    if (experiment.runtime.domain !== 'time') throw new Error('Expected time domain');
    for (const runtime of [
      { ...experiment.runtime, step: { value: 0.02, unit: 's' } },
      { ...experiment.runtime, duration: { value: 2, unit: 's' } },
      { ...experiment.runtime, start: { value: 1, unit: 's' } },
      { ...experiment.runtime, sampleEvery: 2 },
      { domain: 'evaluation' }
    ])
      expect(fromCanonicalField({ ...experiment, runtime }).ok).toBe(false);
  });
  it.each(FIELD_SYSTEM_IDS)('%s rejects closed-schema extras and nonfinite/coercion objects', (id) => {
    const c = defaultFieldConfig(id);
    for (const input of [
      { ...c, unexpected: true },
      { ...c, parameters: { ...c.parameters, extra: 1 } },
      { ...c, grid: { ...c.grid, extra: 1 } },
      { ...c, ensemble: { ...c.ensemble, extra: 1 } },
      { ...c, seed: { ...c.seed, extra: 'x' } },
      { ...c, grid: { ...c.grid, boundary: { toString: 'fixed' } } },
      { ...c, step: Infinity },
      { ...c, duration: NaN },
      { ...c, grid: { ...c.grid, points: 4.5 } },
      { ...c, grid: { ...c.grid, length: 0 } },
      { ...c, integratorId: 'integrator:rk4' },
      { ...c, seed: { ...c.seed, value: '../private' } },
      { ...c, seed: { ...c.seed, generator: 'unknown' } },
      { ...c, analyses: [{ id: 'analysis:fft', algorithmVersion: '1', settings: {} }] }
    ]) {
      const original = structuredClone(input);
      expect(() => validateFieldConfig(input)).not.toThrow();
      expect(validateFieldConfig(input).ok).toBe(false);
      expect(input).toEqual(original);
    }
  });
  it('enforces real native boundary, dimension and work budgets', () => {
    const f = defaultFieldConfig('system:fput'),
      s = defaultFieldConfig('system:sine-gordon'),
      l = defaultFieldConfig('system:langevin');
    for (const input of [
      { ...f, grid: { ...f.grid, boundary: 'periodic' } },
      { ...f, initialState: f.initialState.slice(1) },
      { ...f, initialState: [...f.initialState, 0] },
      { ...f, ensemble: { members: 2 } },
      { ...f, previousField: [0] },
      { ...f, duration: 1.005 },
      { ...f, step: 0.00001, duration: 2 },
      { ...resizeFieldConfig(f, 128), step: 0.001, duration: 100 },
      { ...s, grid: { ...s.grid, length: 0.01 }, step: 0.01 },
      { ...l, ensemble: { members: 1 } },
      { ...l, ensemble: { members: 65 } },
      { ...l, grid: { ...l.grid, points: 2 } },
      { ...l, grid: { ...l.grid, length: 2 } },
      { ...l, step: 0.001, duration: 100, ensemble: { members: 64 } }
    ])
      expect(validateFieldConfig(input).ok).toBe(false);
  });
  it('preserves exact two-level leapfrog state and rejects inconsistent resumed velocities', () => {
    const simulation = createFieldSimulation({ ...defaultFieldConfig('system:sine-gordon'), duration: 0.2 });
    for (let i = 0; i < 10; i++) simulation.step();
    const config = simulation.restartConfig(),
      experiment = canonical(config),
      restored = fromCanonicalField(experiment);
    expect(restored).toEqual({ ok: true, value: config });
    expect(experiment.initialConditions.previousField).toEqual({
      kind: 'vector',
      values: config.previousField,
      unit: '1'
    });
    expect(createFieldSimulation(config).snapshot().previousField).toEqual(simulation.snapshot().previousField);
    const incorrect = [...config.initialState];
    incorrect[config.grid.points]! += 1e-5;
    expect(validateFieldConfig({ ...config, initialState: incorrect }).ok).toBe(false);
    expect(validateFieldConfig({ ...config, previousField: config.previousField!.slice(1) }).ok).toBe(false);
    const resized = resizeFieldConfig(config, 41);
    expect(resized.previousField).toBeUndefined();
    expect(resized.initialState).toHaveLength(82);
  });
  it('keeps member seed identity stable when ensemble size changes and bounds member indexes', () => {
    expect(Array.from({ length: 4 }, (_, i) => fieldMemberSeed('field-16', i))).toEqual([
      2944317877, 2893985020, 2910762639, 2860429782
    ]);
    const seeds = Array.from({ length: 64 }, (_, i) => fieldMemberSeed('field-seed-16', i));
    expect(new Set(seeds).size).toBe(64);
    expect(seeds.every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffff_ffff)).toBe(true);
    expect(seeds.slice(0, 4)).toEqual(Array.from({ length: 4 }, (_, i) => fieldMemberSeed('field-seed-16', i)));
    expect(fieldMemberSeed('field-seed-17', 0)).not.toBe(seeds[0]);
    for (const index of [-1, 64, 1.5, NaN, Infinity]) expect(() => fieldMemberSeed('field-seed-16', index)).toThrow();
  });
});
