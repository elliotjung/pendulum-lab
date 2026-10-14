import { describe, expect, it } from 'vitest';
import {
  SPATIAL_SYSTEM_IDS,
  createSpatialSimulation,
  defaultSpatialConfig,
  spatialIsEmbedded,
  type SpatialConfig,
  type SpatialSample
} from '../../../src/product/adapters/physics/spatial';
import {
  SPATIAL_STORAGE_PREFIX,
  loadSpatialConfig,
  parseSpatialConfig,
  saveSpatialConfig,
  serializeSpatialConfig,
  spatialTrajectoryCsv
} from '../../../src/product/lab/views/spatial-storage';

function memoryStorage(entries: [string, string][] = []) {
  const records = new Map(entries);
  return {
    records,
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value);
    }
  };
}

describe('S12 native spatial persistence and exports', () => {
  it.each(SPATIAL_SYSTEM_IDS)('%s retains the complete restart state and isolates legacy records', (systemId) => {
    const config: SpatialConfig = {
      ...defaultSpatialConfig(systemId),
      startTime: 2,
      duration: 0.013,
      step: 0.003,
      sampleEvery: 3,
      seed: { value: '00042', generator: 'reserved', generatorVersion: '1' },
      provenance: { createdByVersion: '10.36.0', source: { kind: 'manual' }, parentExperimentIds: [] }
    };
    const before = structuredClone(config);
    const storage = memoryStorage([
      ['legacy', 'original'],
      ['pendulum-product/constraint/v1/system:rope', 'original']
    ]);
    saveSpatialConfig(storage, config);
    const restored = loadSpatialConfig(storage, systemId)!;
    expect(restored).toEqual(config);
    expect(parseSpatialConfig(serializeSpatialConfig(config), systemId)).toEqual(config);
    expect(createSpatialSimulation(restored).step()).toEqual(createSpatialSimulation(config).step());
    expect(config).toEqual(before);
    expect([...storage.records.keys()]).toEqual([
      'legacy',
      'pendulum-product/constraint/v1/system:rope',
      `${SPATIAL_STORAGE_PREFIX}${systemId}`
    ]);
    expect(storage.records.get('legacy')).toBe('original');
    expect(storage.records.get('pendulum-product/constraint/v1/system:rope')).toBe('original');
  });

  it('keeps all four records separate and returns null for missing data', () => {
    const storage = memoryStorage();
    expect(loadSpatialConfig(storage, 'system:spherical')).toBeNull();
    for (const id of SPATIAL_SYSTEM_IDS) saveSpatialConfig(storage, defaultSpatialConfig(id));
    expect(storage.records.size).toBe(4);
    for (const id of SPATIAL_SYSTEM_IDS) expect(loadSpatialConfig(storage, id)?.systemId).toBe(id);
  });

  it.each(['{broken', '{"schema":"future"}', '{"__proto__":{"polluted":true}}'])(
    'preserves corrupt/future/unsafe records when reads and writes fail: %s',
    (text) => {
      const key = `${SPATIAL_STORAGE_PREFIX}system:spherical`;
      const storage = memoryStorage([[key, text]]);
      expect(() => loadSpatialConfig(storage, 'system:spherical')).toThrow();
      expect(() => saveSpatialConfig(storage, defaultSpatialConfig())).toThrow();
      expect(storage.records.get(key)).toBe(text);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    }
  );

  it('rejects oversized bytes, wrong systems, unknown fields and unsupported analysis imports', () => {
    const original = serializeSpatialConfig(defaultSpatialConfig());
    expect(() => parseSpatialConfig('가'.repeat(70_000), 'system:spherical')).toThrow('200 KB');
    expect(() => parseSpatialConfig(original, 'system:spherical-embedded')).toThrow('다른 시스템');
    for (const patch of [
      { modelVersion: 'future' },
      { unexpected: true },
      { analyses: [{ id: 'analysis:fft', algorithmVersion: '1', settings: {} }] }
    ]) {
      const text = JSON.stringify({ ...JSON.parse(original), ...patch });
      expect(() => parseSpatialConfig(text, 'system:spherical')).toThrow();
      const key = `${SPATIAL_STORAGE_PREFIX}system:spherical`,
        storage = memoryStorage([[key, text]]);
      expect(() => saveSpatialConfig(storage, defaultSpatialConfig())).toThrow();
      expect(storage.records.get(key)).toBe(text);
    }
  });

  it('retains native embedded pole states exactly with direction rates in inverse seconds', () => {
    const config = { ...defaultSpatialConfig('system:spherical-embedded'), initialState: [0, -1, 0, 1.5, 0, -2] };
    const serialized = serializeSpatialConfig(config),
      state = JSON.parse(serialized);
    expect(state.initialConditions.direction).toEqual({ kind: 'vector', unit: '1', values: [0, -1, 0] });
    expect(state.initialConditions.directionRate).toEqual({ kind: 'vector', unit: 's^-1', values: [1.5, 0, -2] });
    expect(state.parameters.damping.unit).toBe('s^-1');
    expect(parseSpatialConfig(serialized, config.systemId)).toEqual(config);
    state.initialConditions.directionRate.unit = 'rad/s';
    expect(() => parseSpatialConfig(JSON.stringify(state), config.systemId)).toThrow();
  });

  it('does not replace valid data with invalid settings or another system', () => {
    const storage = memoryStorage(),
      config = defaultSpatialConfig();
    saveSpatialConfig(storage, config);
    const key = `${SPATIAL_STORAGE_PREFIX}${config.systemId}`,
      original = storage.records.get(key);
    expect(() => saveSpatialConfig(storage, { ...config, initialState: [NaN, 0, 0, 0] })).toThrow();
    expect(storage.records.get(key)).toBe(original);
    const wrong = serializeSpatialConfig(defaultSpatialConfig('system:spherical-chain'));
    storage.records.set(key, wrong);
    expect(() => saveSpatialConfig(storage, config)).toThrow('다른 시스템');
    expect(storage.records.get(key)).toBe(wrong);
  });

  it('surfaces storage quota and denied reads without successful writes', () => {
    expect(() =>
      saveSpatialConfig(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error('quota');
          }
        },
        defaultSpatialConfig()
      )
    ).toThrow('quota');
    expect(() =>
      loadSpatialConfig(
        {
          getItem: () => {
            throw new Error('denied');
          }
        },
        'system:spherical'
      )
    ).toThrow('denied');
  });

  it.each(SPATIAL_SYSTEM_IDS)('%s exports aligned finite SI columns and exact final samples', (systemId) => {
    const config = { ...defaultSpatialConfig(systemId), step: 0.003, duration: 0.004 };
    const simulation = createSpatialSimulation(config);
    const samples = [simulation.snapshot(), simulation.step(), simulation.step()];
    const rows = spatialTrajectoryCsv(samples, systemId)
      .trim()
      .split('\r\n')
      .map((row) => row.split(','));
    expect(rows).toHaveLength(4);
    const header = rows[0]!,
      last = rows.at(-1)!;
    expect(header).toContain(spatialIsEmbedded(systemId) ? 'wx1_s-1' : 'thetaDot1_rad_s');
    for (const row of rows.slice(1)) {
      expect(row).toHaveLength(header.length);
      expect(row.map(Number).every(Number.isFinite)).toBe(true);
    }
    expect(Number(last[header.indexOf('time_s')])).toBe(0.004);
    expect(Number(last[header.indexOf('Ly_kg_m2_s')])).toBe(samples[2]!.verticalMomentum);
    expect(Number(last[header.indexOf('x1_m')])).toBe(samples[2]!.positions[0]!.x);
    expect(Number(last[header.indexOf('total_J')])).toBe(samples[2]!.energy.total);
    expect(Number(last[header.indexOf('tangent_residual1_s-1')])).toBe(samples[2]!.tangentConstraintErrors[0]);
  });

  it('rejects malformed dimensions, reversed time and nonnumeric/formula CSV cells', () => {
    const sample = createSpatialSimulation(defaultSpatialConfig()).snapshot();
    for (const patch of [
      { state: [Infinity, 0, 0, 0] },
      { state: ['=1+1', 0, 0, 0] },
      { positions: [] },
      { velocities: [{ x: 0, y: NaN, z: 0 }] },
      { tangentConstraintErrors: [] },
      { energy: { KE: 0, PE: 0, total: '+1+1' } }
    ])
      expect(() => spatialTrajectoryCsv([{ ...sample, ...patch } as SpatialSample], 'system:spherical')).toThrow();
    expect(() => spatialTrajectoryCsv([sample, { ...sample, time: -1 }], 'system:spherical')).toThrow();
    expect(() => spatialTrajectoryCsv([], 'system:spherical')).toThrow();
    expect(() => spatialTrajectoryCsv([sample], 'system:spherical-embedded')).toThrow();
    const chain = createSpatialSimulation(defaultSpatialConfig('system:spherical-chain')).snapshot();
    expect(() => spatialTrajectoryCsv([chain], 'system:spherical')).toThrow();
  });
});
