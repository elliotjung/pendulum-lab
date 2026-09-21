import { describe, expect, it } from 'vitest';
import {
  CONSTRAINT_SYSTEM_IDS,
  createConstraintSimulation,
  defaultConstraintConfig,
  type ConstraintConfig,
  type ConstraintEvent,
  type ConstraintSample
} from '../../../src/product/adapters/physics/constraint';
import {
  CONSTRAINT_STORAGE_PREFIX,
  constraintEventsCsv,
  constraintTrajectoryCsv,
  loadConstraintConfig,
  parseConstraintConfig,
  saveConstraintConfig,
  serializeConstraintConfig
} from '../../../src/product/lab/views/constraint-storage';

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

describe('S11 constraint settings and numerical exports', () => {
  it.each(CONSTRAINT_SYSTEM_IDS)('%s saves original restart conditions and preserves other records', (systemId) => {
    const config = defaultConstraintConfig(systemId);
    const storage = memoryStorage([
      ['legacy', 'original'],
      ['pendulum-product/chain/v1/system:chain', 'untouched']
    ]);
    const simulation = createConstraintSimulation(config);
    simulation.step();
    saveConstraintConfig(storage, config);
    expect(loadConstraintConfig(storage, systemId)).toEqual(config);
    expect(storage.records.get('legacy')).toBe('original');
    expect(storage.records.get('pendulum-product/chain/v1/system:chain')).toBe('untouched');
    expect(storage.records.size).toBe(3);
    expect(config.initialState).toEqual(defaultConstraintConfig(systemId).initialState);
  });

  it('keeps the three new system records isolated', () => {
    const storage = memoryStorage();
    for (const systemId of CONSTRAINT_SYSTEM_IDS) saveConstraintConfig(storage, defaultConstraintConfig(systemId));
    expect(storage.records.size).toBe(3);
    for (const systemId of CONSTRAINT_SYSTEM_IDS)
      expect(loadConstraintConfig(storage, systemId)?.systemId).toBe(systemId);
  });

  it.each(['{broken', '{"schema":"future"}', '{"__proto__":{"polluted":true}}'])(
    'preserves unsafe/future source records on both read and write failure: %s',
    (raw) => {
      const key = `${CONSTRAINT_STORAGE_PREFIX}system:rope`;
      const storage = memoryStorage([[key, raw]]);
      expect(() => loadConstraintConfig(storage, 'system:rope')).toThrow();
      expect(() => saveConstraintConfig(storage, defaultConstraintConfig('system:rope'))).toThrow();
      expect(storage.records.get(key)).toBe(raw);
    }
  );

  it('refuses wrong systems, byte-oversized and prototype-bearing imports', () => {
    const valid = serializeConstraintConfig(defaultConstraintConfig('system:rope'));
    expect(() => parseConstraintConfig(valid, 'system:spring')).toThrow('다른 시스템');
    expect(() => parseConstraintConfig('가'.repeat(70_000), 'system:rope')).toThrow('200 KB');
    expect(() => parseConstraintConfig('{"constructor":{"prototype":{"x":true}}}', 'system:rope')).toThrow();
    const future = JSON.parse(valid);
    future.modelVersion = 'future';
    expect(() => parseConstraintConfig(JSON.stringify(future), 'system:rope')).toThrow();
  });

  it('never replaces existing valid settings when the new config is invalid', () => {
    const config = defaultConstraintConfig('system:spring');
    const storage = memoryStorage();
    saveConstraintConfig(storage, config);
    const original = storage.records.get(`${CONSTRAINT_STORAGE_PREFIX}system:spring`);
    expect(() => saveConstraintConfig(storage, { ...config, initialState: [-1, 0, 0, 0] })).toThrow();
    expect(storage.records.get(`${CONSTRAINT_STORAGE_PREFIX}system:spring`)).toBe(original);
  });

  it('preserves a valid other-system payload stored under the wrong key', () => {
    const key = `${CONSTRAINT_STORAGE_PREFIX}system:spring`;
    const source = serializeConstraintConfig(defaultConstraintConfig('system:rope'));
    const storage = memoryStorage([[key, source]]);
    expect(() => loadConstraintConfig(storage, 'system:spring')).toThrow('다른 시스템');
    expect(() => saveConstraintConfig(storage, defaultConstraintConfig('system:spring'))).toThrow('다른 시스템');
    expect(storage.records.get(key)).toBe(source);
  });

  it.each([0.000002, 10000])('retains the complete supported spring radius boundary %s through storage', (radius) => {
    const config: ConstraintConfig = {
      ...defaultConstraintConfig('system:spring'),
      initialState: [radius, 0, 0, 0]
    };
    const restored = parseConstraintConfig(serializeConstraintConfig(config), 'system:spring');
    expect(restored.initialState[0]).toBe(radius);
  });

  it('retains the double-string legacy damping unit and rejects an incompatible SI replacement', () => {
    const config = defaultConstraintConfig('system:double-string');
    const canonical = JSON.parse(serializeConstraintConfig(config));
    expect(canonical.parameters.damping.unit).toBe('1');
    canonical.parameters.damping.unit = 's^-1';
    expect(() => parseConstraintConfig(JSON.stringify(canonical), config.systemId)).toThrow('damping');
  });

  it('propagates quota and denied-read errors without reporting successful persistence', () => {
    const quota = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      }
    };
    expect(() => saveConstraintConfig(quota, defaultConstraintConfig())).toThrow('quota');
    const denied = {
      getItem: () => {
        throw new Error('denied');
      }
    };
    expect(() => loadConstraintConfig(denied, 'system:spring')).toThrow('denied');
  });

  it.each(CONSTRAINT_SYSTEM_IDS)(
    '%s trajectory exports finite coordinates, force, length and energy through final time',
    (systemId) => {
      const config = { ...defaultConstraintConfig(systemId), duration: 0.004 };
      const simulation = createConstraintSimulation(config);
      const samples = [simulation.snapshot(), simulation.step(), simulation.step()];
      const rows = constraintTrajectoryCsv(samples, systemId).trim().split('\r\n');
      expect(rows).toHaveLength(4);
      expect(rows[0]).toContain('time_s');
      expect(rows[0]).toContain('length');
      expect(rows[0]).toContain('tension');
      expect(rows[0]).toContain('total_J');
      const header = rows[0]!.split(',');
      const last = rows[3]!.split(',');
      expect(last).toHaveLength(header.length);
      expect(last[header.indexOf('phase')]).toBe(samples[2]!.phase);
      expect(Number(last[header.indexOf('length1_m')])).toBe(samples[2]!.lengths[0]);
      expect(Number(last[header.indexOf('tension1_N')])).toBe(samples[2]!.tensions[0]);
      expect(Number(last[header.indexOf('total_J')])).toBe(samples[2]!.energy.total);
      expect(Number(rows[3]!.split(',')[0])).toBeCloseTo(0.004, 12);
      expect(rows.join('\n')).not.toMatch(/NaN|Infinity/);
      expect(() => constraintTrajectoryCsv([{ ...samples[0]!, state: [Infinity] }], systemId)).toThrow();
      expect(() => constraintTrajectoryCsv([{ ...samples[0]!, tensions: [NaN] }], systemId)).toThrow();
    }
  );

  it('blocks mixed-system phases, wrong dimensions and spreadsheet formulas', () => {
    const sample = createConstraintSimulation(defaultConstraintConfig('system:rope')).snapshot();
    for (const phase of ['=1+1', 'outer-slack', 'full-slack', 'elastic']) {
      expect(() => constraintTrajectoryCsv([{ ...sample, phase } as ConstraintSample], 'system:rope')).toThrow();
    }
    expect(() => constraintTrajectoryCsv([{ ...sample, lengths: [1, 2] }], 'system:rope')).toThrow();
    expect(() => constraintTrajectoryCsv([], 'system:rope')).toThrow();
  });

  it('rejects event formula cells, wrong residual units, missing sequence and reversed time', () => {
    const release: ConstraintEvent = {
      sequence: 0,
      type: 'slack',
      link: 'inner',
      time: 0,
      energyLoss: 0,
      residual: 0,
      residualUnit: 'N',
      source: 'initial-condition'
    };
    const capture: ConstraintEvent = {
      sequence: 1,
      type: 'capture',
      link: 'inner',
      time: 1,
      energyLoss: 2,
      residual: 0,
      residualUnit: 'm',
      source: 'integration'
    };
    expect(constraintEventsCsv([release, capture])).toContain('1,1,capture,inner,integration,2,0,m');
    for (const patch of [
      { type: '=HYPERLINK("unsafe")' },
      { link: '=1+1' },
      { source: '+1+1' },
      { residualUnit: 'm' },
      { residual: -1 },
      { energyLoss: -1 },
      { sequence: 1 }
    ]) {
      expect(() => constraintEventsCsv([{ ...release, ...patch } as ConstraintEvent])).toThrow();
    }
    expect(() => constraintEventsCsv([release, { ...capture, time: -1 }])).toThrow();
    expect(() => constraintEventsCsv([release, { ...capture, sequence: 2 }])).toThrow();
  });

  it('exports initial releases and captures with explicit SI units, chronological sequence and source', () => {
    const config: ConstraintConfig = { ...defaultConstraintConfig('system:rope'), initialState: [2.5, 0], duration: 1 };
    const simulation = createConstraintSimulation(config);
    const events: ConstraintEvent[] = [...simulation.snapshot().events];
    for (let step = 0; step < 500; step += 1) events.push(...simulation.step().events);
    expect(events[0]).toMatchObject({ type: 'slack', time: 0, source: 'initial-condition' });
    expect(events.some((event) => event.type === 'capture' && event.energyLoss > 0)).toBe(true);
    const csv = constraintEventsCsv(events);
    expect(csv).toContain('energy_loss_J');
    expect(csv).toContain('residual_unit');
    expect(csv).toContain('initial-condition');
    expect(csv).toContain('integration');
    expect(csv).not.toMatch(/NaN|Infinity/);
    expect(constraintEventsCsv([]).trim().split('\r\n')).toHaveLength(1);
    expect(() => constraintEventsCsv([{ ...events[0]!, time: Infinity }])).toThrow();
  });
});
