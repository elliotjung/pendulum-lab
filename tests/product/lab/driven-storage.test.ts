import { describe, expect, it } from 'vitest';
import {
  DRIVEN_SYSTEM_IDS,
  createDrivenSimulation,
  defaultDrivenConfig,
  type DrivenSample,
  type DrivenConfig
} from '../../../src/product/adapters/physics/driven';
import {
  DRIVEN_STORAGE_PREFIX,
  serializeDrivenConfig,
  parseDrivenConfig,
  saveDrivenConfig,
  loadDrivenConfig,
  drivenTrajectoryCsv
} from '../../../src/product/lab/views/driven-storage';

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
describe('S13 native driven persistence and numeric exports', () => {
  it.each(DRIVEN_SYSTEM_IDS)('%s preserves native restart and isolated records', (id) => {
    const config: DrivenConfig = {
      ...defaultDrivenConfig(id),
      startTime: 2,
      duration: 0.013,
      step: 0.003,
      sampleEvery: 3,
      seed: { value: '00042', generator: 'reserved', generatorVersion: '1' },
      provenance: { createdByVersion: '10.36.0', source: { kind: 'manual' }, parentExperimentIds: [] }
    };
    const storage = memoryStorage([['legacy', 'original']]);
    const before = structuredClone(config);
    saveDrivenConfig(storage, config);
    expect(loadDrivenConfig(storage, id)).toEqual(config);
    expect(parseDrivenConfig(serializeDrivenConfig(config), id)).toEqual(config);
    expect(createDrivenSimulation(loadDrivenConfig(storage, id)!).step()).toEqual(
      createDrivenSimulation(config).step()
    );
    expect(config).toEqual(before);
    expect(storage.records.get('legacy')).toBe('original');
    expect([...storage.records.keys()]).toEqual(['legacy', `${DRIVEN_STORAGE_PREFIX}${id}`]);
  });
  it('keeps all five system records separate', () => {
    const storage = memoryStorage();
    expect(loadDrivenConfig(storage, 'system:driven')).toBeNull();
    for (const id of DRIVEN_SYSTEM_IDS) saveDrivenConfig(storage, defaultDrivenConfig(id));
    expect(storage.records.size).toBe(5);
    for (const id of DRIVEN_SYSTEM_IDS) expect(loadDrivenConfig(storage, id)?.systemId).toBe(id);
  });
  it.each(['{broken', '{"schema":"future"}', '{"__proto__":{"polluted":true}}'])(
    'preserves unsafe/corrupt/future originals %s',
    (text) => {
      const key = `${DRIVEN_STORAGE_PREFIX}system:driven`,
        storage = memoryStorage([[key, text]]);
      expect(() => loadDrivenConfig(storage, 'system:driven')).toThrow();
      expect(() => saveDrivenConfig(storage, defaultDrivenConfig())).toThrow();
      expect(storage.records.get(key)).toBe(text);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    }
  );
  it('rejects wrong systems, oversize payloads, unknown and unsupported fields', () => {
    const original = serializeDrivenConfig(defaultDrivenConfig());
    expect(() => parseDrivenConfig(original, 'system:parametric')).toThrow('다른 시스템');
    expect(() => parseDrivenConfig('가'.repeat(70000), 'system:driven')).toThrow('200 KB');
    for (const patch of [
      { modelVersion: 'future' },
      { unknown: 1 },
      { analyses: [{ id: 'analysis:fft', algorithmVersion: '1', settings: {} }] }
    ])
      expect(() => parseDrivenConfig(JSON.stringify({ ...JSON.parse(original), ...patch }), 'system:driven')).toThrow();
  });
  it.each(['sine', 'square', 'triangle'] as const)(
    'retains waveform %s plus phase and frequency exactly',
    (waveform) => {
      const config = {
        ...defaultDrivenConfig(),
        initialState: [0.2, -0.3, 2.1],
        forcing: { waveform, amplitude: 0.72, frequency: 1.234567890123, phase: -0.456789012345 }
      };
      const restored = parseDrivenConfig(serializeDrivenConfig(config), 'system:driven');
      expect(restored).toEqual(config);
      expect(createDrivenSimulation(restored).step()).toEqual(createDrivenSimulation(config).step());
    }
  );
  it('retains controller and constant bias, and refuses invalid saves atomically', () => {
    const base = defaultDrivenConfig('system:cartpole'),
      config = {
        ...base,
        parameters: { ...base.parameters, force: 2.5 },
        controller: { ...base.controller!, enabled: true, kp: 55, kd: 12, maxOutput: 3, reference: 0.2 }
      };
    const storage = memoryStorage();
    saveDrivenConfig(storage, config);
    expect(loadDrivenConfig(storage, 'system:cartpole')).toEqual(config);
    const before = storage.records.get(`${DRIVEN_STORAGE_PREFIX}system:cartpole`);
    expect(() => saveDrivenConfig(storage, { ...config, controller: { ...config.controller, kp: -1 } })).toThrow();
    expect(storage.records.get(`${DRIVEN_STORAGE_PREFIX}system:cartpole`)).toBe(before);
  });
  it('surfaces quota and denied storage failures', () => {
    expect(() =>
      saveDrivenConfig(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error('quota');
          }
        },
        defaultDrivenConfig()
      )
    ).toThrow('quota');
    expect(() =>
      loadDrivenConfig(
        {
          getItem: () => {
            throw new Error('denied');
          }
        },
        'system:driven'
      )
    ).toThrow('denied');
  });
  it.each(DRIVEN_SYSTEM_IDS)('%s exports aligned SI columns and exact final sample', (id) => {
    const simulation = createDrivenSimulation({ ...defaultDrivenConfig(id), step: 0.003, duration: 0.004 }),
      samples = [simulation.snapshot(), simulation.step(), simulation.step()];
    const rows = drivenTrajectoryCsv(samples, id)
        .trim()
        .split('\r\n')
        .map((row) => row.split(',')),
      header = rows[0]!,
      last = rows.at(-1)!;
    expect(rows).toHaveLength(4);
    for (const row of rows.slice(1)) {
      expect(row).toHaveLength(header.length);
      expect(row.map(Number).every(Number.isFinite)).toBe(true);
    }
    expect(Number(last[header.indexOf('time_s')])).toBe(0.004);
    expect(Number(last[header.indexOf('diagnostic_energy_J')])).toBe(samples.at(-1)!.energy);
    if (id === 'system:cartpole') {
      expect(header).toContain('x2_m');
      expect(Number(last[header.indexOf('x1_m')])).toBe(samples.at(-1)!.state[0]);
      expect(header).toContain('control_N');
    } else expect(header).toContain('control_rad_s2');
  });
  it('rejects formula cells, malformed dimensions and reversed time', () => {
    const sample = createDrivenSimulation(defaultDrivenConfig()).snapshot();
    for (const patch of [
      { state: [Infinity, 0, 0] },
      { state: ['=1+1', 0, 0] },
      { positions: [] },
      { control: '+1+1' },
      { forcing: NaN }
    ])
      expect(() => drivenTrajectoryCsv([{ ...sample, ...patch } as DrivenSample], 'system:driven')).toThrow();
    expect(() => drivenTrajectoryCsv([sample, { ...sample, time: -1 }], 'system:driven')).toThrow();
    expect(() => drivenTrajectoryCsv([], 'system:driven')).toThrow();
    expect(() => drivenTrajectoryCsv([sample], 'system:cartpole')).toThrow();
  });
});
