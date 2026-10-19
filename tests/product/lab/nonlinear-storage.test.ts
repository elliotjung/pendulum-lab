import { describe, expect, it } from 'vitest';
import {
  NONLINEAR_SYSTEM_IDS,
  createNonlinearSimulation,
  defaultNonlinearConfig,
  nonlinearPresetConfig,
  type NonlinearSample,
  type NonlinearConfig
} from '../../../src/product/adapters/physics/nonlinear';
import {
  NONLINEAR_STORAGE_PREFIX,
  NONLINEAR_IMPORT_MAX_BYTES,
  serializeNonlinearConfig,
  parseNonlinearConfig,
  saveNonlinearConfig,
  loadNonlinearConfig,
  nonlinearTrajectoryCsv,
  nonlinearIsNormalized
} from '../../../src/product/lab/views/nonlinear-storage';

function memoryStorage(entries: [string, string][] = []) {
  const records = new Map(entries);
  return {
    records,
    getItem: (key: string) => records.get(key) ?? null,
    setItem(key: string, value: string) {
      records.set(key, value);
    }
  };
}
describe('S14 nonlinear restart persistence and numerical exports', () => {
  it.each(NONLINEAR_SYSTEM_IDS)('%s preserves native configuration and isolated records', (id) => {
    const config: NonlinearConfig = {
      ...defaultNonlinearConfig(id),
      startTime: 2,
      duration: 0.013,
      step: 0.003,
      sampleEvery: 3,
      seed: { value: '00042', generator: 'reserved', generatorVersion: '1' },
      provenance: { createdByVersion: '10.36.0', source: { kind: 'manual' }, parentExperimentIds: [] }
    };
    const storage = memoryStorage([['legacy', 'original']]),
      before = structuredClone(config);
    saveNonlinearConfig(storage, config);
    expect(loadNonlinearConfig(storage, id)).toEqual(config);
    expect(parseNonlinearConfig(serializeNonlinearConfig(config), id)).toEqual(config);
    expect(createNonlinearSimulation(loadNonlinearConfig(storage, id)!).step()).toEqual(
      createNonlinearSimulation(config).step()
    );
    expect(config).toEqual(before);
    expect(storage.records.get('legacy')).toBe('original');
    expect([...storage.records.keys()]).toEqual(['legacy', `${NONLINEAR_STORAGE_PREFIX}${id}`]);
  });
  it('keeps six independent system records and preserves corrupt, future and unsafe originals', () => {
    const storage = memoryStorage();
    expect(loadNonlinearConfig(storage, 'system:duffing')).toBeNull();
    for (const id of NONLINEAR_SYSTEM_IDS) saveNonlinearConfig(storage, defaultNonlinearConfig(id));
    expect(storage.records.size).toBe(6);
    for (const id of NONLINEAR_SYSTEM_IDS) expect(loadNonlinearConfig(storage, id)?.systemId).toBe(id);
    for (const text of ['{broken', '{"schema":"future"}', '{"__proto__":{"polluted":true}}']) {
      const key = `${NONLINEAR_STORAGE_PREFIX}system:duffing`,
        damaged = memoryStorage([[key, text]]);
      expect(() => loadNonlinearConfig(damaged, 'system:duffing')).toThrow();
      expect(() => saveNonlinearConfig(damaged, defaultNonlinearConfig())).toThrow();
      expect(damaged.records.get(key)).toBe(text);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('preserves linear prehistory, accepted tape and continuation replay exactly', () => {
    const simulation = createNonlinearSimulation(nonlinearPresetConfig('system:pyragas', 'linear-history'));
    for (let i = 0; i < 140; i++) simulation.step();
    const continuation = simulation.serialize(),
      text = serializeNonlinearConfig(continuation),
      restored = parseNonlinearConfig(text, 'system:pyragas');
    expect(restored).toEqual(continuation);
    expect(restored.history).toEqual({ kind: 'linear', state: [0.3, 0.2] });
    expect(restored.delayState!.times.at(-1)).toBe(0);
    expect(restored.delayState!.states.at(-1)).toEqual(restored.initialState);
    const direct = createNonlinearSimulation(continuation),
      replay = createNonlinearSimulation(restored);
    for (let i = 0; i < 120; i++) expect(replay.step()).toEqual(direct.step());
  });
  it('rejects wrong systems, large UTF-8 payloads and unsupported versions without mutation', () => {
    const original = serializeNonlinearConfig(defaultNonlinearConfig());
    expect(() => parseNonlinearConfig(original, 'system:pyragas')).toThrow('다른 시스템');
    expect(() =>
      parseNonlinearConfig('가'.repeat(Math.ceil(NONLINEAR_IMPORT_MAX_BYTES / 3) + 1), 'system:duffing')
    ).toThrow('256 KiB');
    for (const patch of [
      { modelVersion: 'future' },
      { unknown: 1 },
      { analyses: [{ id: 'analysis:fft', algorithmVersion: '1', settings: {} }] },
      { modelOptions: { timeConvention: 'si' } }
    ])
      expect(() =>
        parseNonlinearConfig(JSON.stringify({ ...JSON.parse(original), ...patch }), 'system:duffing')
      ).toThrow();
  });
  it('refuses invalid saves atomically and reports storage denial/quota', () => {
    const config = defaultNonlinearConfig(),
      storage = memoryStorage();
    saveNonlinearConfig(storage, config);
    const before = storage.records.get(`${NONLINEAR_STORAGE_PREFIX}system:duffing`);
    expect(() => saveNonlinearConfig(storage, { ...config, initialState: [NaN, 0, 0] })).toThrow();
    expect(storage.records.get(`${NONLINEAR_STORAGE_PREFIX}system:duffing`)).toBe(before);
    expect(() =>
      saveNonlinearConfig(
        {
          getItem: () => null,
          setItem() {
            throw new Error('quota');
          }
        },
        config
      )
    ).toThrow('quota');
    expect(() =>
      loadNonlinearConfig(
        {
          getItem() {
            throw new Error('denied');
          }
        },
        'system:duffing'
      )
    ).toThrow('denied');
  });
  it.each(NONLINEAR_SYSTEM_IDS)('%s exports aligned finite columns and exact last sample with honest units', (id) => {
    const simulation = createNonlinearSimulation(
        { ...defaultNonlinearConfig(id), step: 0.003, duration: 0.004 },
        { stability: true }
      ),
      samples = [simulation.snapshot(), simulation.step(), simulation.step()],
      rows = nonlinearTrajectoryCsv(samples, id)
        .trim()
        .split('\r\n')
        .map((row) => row.split(',')),
      header = rows[0]!;
    expect(rows).toHaveLength(4);
    for (const row of rows.slice(1)) {
      expect(row).toHaveLength(header.length);
      expect(row.map(Number).every(Number.isFinite)).toBe(true);
    }
    expect(Number(rows.at(-1)![0])).toBe(0.004);
    expect(header[0]).toBe(nonlinearIsNormalized(id) ? 'time_normalized' : 'time_s');
    if (nonlinearIsNormalized(id)) expect(header.join(',')).not.toContain('_J');
    expect(header.join(',')).not.toContain('__');
    const forcingHeader = {
      'system:duffing': 'drive_acceleration_normalized',
      'system:van-der-pol': 'nonlinear_damping_acceleration_normalized',
      'system:kapitza': 'pivot_displacement_m',
      'system:mathieu': 'restoring_modulation_normalized',
      'system:friction': 'drive_force_N',
      'system:pyragas': 'drive_angular_acceleration_rad_s2'
    }[id];
    expect(header).toContain(forcingHeader);
    expect(header).toContain('pyragas_feedback_rad_s2');
    expect(header).toContain('friction_force_N');
    if (id === 'system:mathieu') expect(header).toContain('spectral_radius');
  });
  it('rejects malformed, unsafe or reversed numerical data', () => {
    const sample = createNonlinearSimulation(defaultNonlinearConfig()).snapshot();
    for (const patch of [
      { state: [Infinity, 0, 0] },
      { state: ['=1+1', 0, 0] },
      { state: [0] },
      { energy: '+1+1' },
      { forcing: NaN },
      { mode: 'formula' }
    ])
      expect(() => nonlinearTrajectoryCsv([{ ...sample, ...patch } as NonlinearSample], 'system:duffing')).toThrow();
    expect(() => nonlinearTrajectoryCsv([sample, { ...sample, time: -1 }], 'system:duffing')).toThrow();
    expect(() => nonlinearTrajectoryCsv([], 'system:duffing')).toThrow();
  });
});
