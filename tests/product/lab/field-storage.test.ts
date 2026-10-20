import { describe, expect, it } from 'vitest';
import {
  FIELD_SYSTEM_IDS,
  defaultFieldConfig,
  createFieldSimulation,
  type FieldSample
} from '../../../src/product/adapters/physics/field';
import {
  FIELD_STORAGE_PREFIX,
  FIELD_IMPORT_MAX_BYTES,
  serializeFieldConfig,
  parseFieldConfig,
  saveFieldConfig,
  loadFieldConfig,
  fieldTrajectoryCsv,
  downsampleFieldSamples,
  fieldProvenanceJson
} from '../../../src/product/lab/views/field-storage';
function memory(entries: [string, string][] = []) {
  const records = new Map(entries);
  return {
    records,
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value)
  };
}
describe('S16 reproducible isolated persistence and honest recorded-data exports', () => {
  it.each(FIELD_SYSTEM_IDS)('%s round trips native settings without touching legacy keys', (id) => {
    const config = defaultFieldConfig(id),
      before = structuredClone(config),
      storage = memory([['legacy-state', 'untouched']]);
    saveFieldConfig(storage, config);
    expect(loadFieldConfig(storage, id)).toEqual(config);
    expect(parseFieldConfig(serializeFieldConfig(config), id)).toEqual(config);
    expect(createFieldSimulation(loadFieldConfig(storage, id)!).snapshot()).toEqual(
      createFieldSimulation(config).snapshot()
    );
    expect(config).toEqual(before);
    expect(storage.records.get('legacy-state')).toBe('untouched');
    expect([...storage.records.keys()]).toEqual(['legacy-state', `${FIELD_STORAGE_PREFIX}${id}`]);
  });
  it('preserves corrupt/future originals and refuses unsafe oversized wrong-family imports', () => {
    const config = defaultFieldConfig(),
      key = `${FIELD_STORAGE_PREFIX}${config.systemId}`;
    for (const text of [
      '{broken',
      '{"schema":"future"}',
      '{"__proto__":{"polluted":true}}',
      '{"systemId":"x","systemId":"y"}'
    ]) {
      const storage = memory([[key, text]]);
      expect(() => loadFieldConfig(storage, config.systemId)).toThrow();
      expect(() => saveFieldConfig(storage, config)).toThrow();
      expect(storage.records.get(key)).toBe(text);
    }
    expect(() => parseFieldConfig('가'.repeat(FIELD_IMPORT_MAX_BYTES), config.systemId)).toThrow('256 KiB');
    expect(() => parseFieldConfig(serializeFieldConfig(config), 'system:fput')).toThrow('다른 시스템');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it.each(FIELD_SYSTEM_IDS)('%s exports finite aligned normalized rows and explicit derivative applicability', (id) => {
    const config = { ...defaultFieldConfig(id), duration: 0.02 },
      simulation = createFieldSimulation(config),
      samples = [simulation.snapshot()];
    while (!simulation.done) samples.push(simulation.step());
    const rows = fieldTrajectoryCsv(samples, config)
        .trim()
        .split('\r\n')
        .map((row) => row.split(',')),
      header = rows[0]!;
    expect(header).toContain('rate_applicable_1');
    expect(header).toContain('variance_applicable_1');
    for (const row of rows.slice(1)) {
      expect(row).toHaveLength(header.length);
      expect(row[0]).toBe('retained-raw');
      expect(row.slice(1).map(Number).every(Number.isFinite)).toBe(true);
    }
    const provenance = JSON.parse(fieldProvenanceJson(config, samples, 1));
    expect(provenance.configuration).toEqual(config);
    expect(provenance.ensemble).toEqual(samples.at(-1)!.ensemble);
    expect(provenance.memberSeeds).toEqual(samples.at(-1)!.ensemble.seeds);
  });
  it('labels retention and additional downsampling separately while preserving endpoints and seeds', () => {
    const config = { ...defaultFieldConfig(), duration: 2 },
      simulation = createFieldSimulation(config),
      samples = [simulation.snapshot()];
    while (!simulation.done) samples.push(simulation.step());
    const before = structuredClone(samples),
      subset = downsampleFieldSamples(samples);
    expect(subset).toHaveLength(121);
    expect(subset[0]).toBe(samples[0]);
    expect(subset.at(-1)).toBe(samples.at(-1));
    const raw = fieldTrajectoryCsv(samples, config, 'retained-raw', 2),
      downsampled = fieldTrajectoryCsv(samples, config, 'downsampled', 2);
    expect(raw.split('\r\n')).toHaveLength(1 + 201 * config.ensemble.members + 1);
    expect(downsampled.split('\r\n')).toHaveLength(1 + 121 * config.ensemble.members + 1);
    expect(raw).toContain('retained-raw,2,');
    expect(downsampled).toContain('downsampled,2,');
    expect(samples).toEqual(before);
    const malformed = { ...samples[0]!, profile: [] } as FieldSample;
    expect(() => fieldTrajectoryCsv([malformed], config)).toThrow();
    expect(() =>
      fieldTrajectoryCsv([{ ...samples[0]!, state: [Infinity], memberStates: [[Infinity, 0]] }], config)
    ).toThrow();
    expect(() => fieldTrajectoryCsv([samples[1]!, samples[0]!], config)).toThrow();
    expect(() => downsampleFieldSamples(samples, 1)).toThrow();
    expect(() => fieldProvenanceJson(config, [{ ...samples[0]!, energy: Infinity }], 1)).toThrow();
  });
});
