import { describe, expect, it } from 'vitest';
import { defaultChainConfig, createChainSimulation } from '../../../src/product/adapters/physics/chain';
import {
  CHAIN_STORAGE_PREFIX,
  parseChainConfig,
  serializeChainConfig,
  saveChainConfig,
  loadChainConfig,
  chainTrajectoryCsv
} from '../../../src/product/lab/views/chain-storage';

describe('S10 chain storage and numeric export', () => {
  it.each([1, 3, 4, 128])('saves and reloads N=%i without touching other records', (n) => {
    const config = defaultChainConfig('system:chain', n),
      records = new Map([['legacy', 'original']]);
    const storage = {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => {
        records.set(key, value);
      }
    };
    saveChainConfig(storage, config);
    expect(loadChainConfig(storage, 'system:chain')).toEqual(config);
    expect(records.get('legacy')).toBe('original');
    expect(records.size).toBe(2);
  });
  it.each([
    '{broken',
    '{"schema":"future"}',
    JSON.stringify({ schema: 'pendulum-experiment/v1', __proto__: { bad: 1 } })
  ])('preserves malformed/future data on read and write failure', (raw) => {
    const records = new Map([[`${CHAIN_STORAGE_PREFIX}system:chain`, raw]]);
    const storage = {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => {
        records.set(key, value);
      }
    };
    expect(() => loadChainConfig(storage, 'system:chain')).toThrow();
    expect(() => saveChainConfig(storage, defaultChainConfig())).toThrow();
    expect(records.values().next().value).toBe(raw);
  });
  it('rejects mismatched systems, unsafe data and oversize files atomically', () => {
    expect(() => parseChainConfig(serializeChainConfig(defaultChainConfig()), 'system:triple')).toThrow('다른 시스템');
    expect(() => parseChainConfig(' '.repeat(200001), 'system:chain')).toThrow('200 KB');
    expect(() => parseChainConfig('{"__proto__":{"polluted":true}}', 'system:chain')).toThrow();
  });
  it('exports every link in theta then omega order, including the final time', () => {
    const sim = createChainSimulation({ ...defaultChainConfig('system:chain', 3), duration: 0.004 });
    const samples = [sim.snapshot(), sim.step(), sim.step()];
    const rows = chainTrajectoryCsv(samples).trim().split('\r\n');
    expect(rows[0]).toBe(
      'time_s,theta1_rad,theta2_rad,theta3_rad,omega1_rad_s,omega2_rad_s,omega3_rad_s,kinetic_J,potential_J,total_J'
    );
    expect(rows[3]!.split(',').map(Number)).toEqual([
      samples[2]!.time,
      ...samples[2]!.state,
      samples[2]!.energy.KE,
      samples[2]!.energy.PE,
      samples[2]!.energy.total
    ]);
    expect(() => chainTrajectoryCsv([...samples, { ...samples[0]!, state: [Infinity, 0] }])).toThrow();
  });
  it('propagates storage policy/quota failures without false success', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      }
    };
    expect(() => saveChainConfig(storage, defaultChainConfig())).toThrow('quota');
  });
});
