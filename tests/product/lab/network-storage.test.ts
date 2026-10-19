import { describe, expect, it } from 'vitest';
import {
  NETWORK_SYSTEM_IDS,
  defaultNetworkConfig,
  createNetworkSimulation,
  createNetworkBasinJob,
  type NetworkSample,
  type NetworkConfig
} from '../../../src/product/adapters/physics/network';
import {
  NETWORK_STORAGE_PREFIX,
  NETWORK_IMPORT_MAX_BYTES,
  serializeNetworkConfig,
  parseNetworkConfig,
  saveNetworkConfig,
  loadNetworkConfig,
  serializeNetworkTopology,
  parseNetworkTopology,
  networkTrajectoryCsv
} from '../../../src/product/lab/views/network-storage';
import { networkBasinCsv } from '../../../src/product/lab/views/network-basin';

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
describe('S15 network identity, atomic persistence and exports', () => {
  it.each(NETWORK_SYSTEM_IDS)(
    '%s round trips explicit states, graph identities and seed without regeneration',
    (id) => {
      const original = { ...defaultNetworkConfig(id), duration: 0.013, step: 0.003, sampleEvery: 3, startTime: 4 },
        before = structuredClone(original),
        storage = memoryStorage([['legacy', 'untouched']]);
      saveNetworkConfig(storage, original);
      expect(loadNetworkConfig(storage, id)).toEqual(original);
      expect(parseNetworkConfig(serializeNetworkConfig(original), id)).toEqual(original);
      expect(parseNetworkTopology(serializeNetworkTopology(original), original)).toEqual(original);
      expect(createNetworkSimulation(loadNetworkConfig(storage, id)!).step()).toEqual(
        createNetworkSimulation(original).step()
      );
      expect(original).toEqual(before);
      expect(storage.records.get('legacy')).toBe('untouched');
      expect([...storage.records.keys()]).toEqual(['legacy', `${NETWORK_STORAGE_PREFIX}${id}`]);
    }
  );
  it('preserves corrupt/future originals and refuses unsafe, oversized or wrong-family imports', () => {
    const original = defaultNetworkConfig(),
      key = `${NETWORK_STORAGE_PREFIX}${original.systemId}`;
    for (const text of ['{broken', '{"schema":"future"}', '{"__proto__":{"polluted":true}}']) {
      const storage = memoryStorage([[key, text]]);
      expect(() => loadNetworkConfig(storage, original.systemId)).toThrow();
      expect(() => saveNetworkConfig(storage, original)).toThrow();
      expect(storage.records.get(key)).toBe(text);
    }
    expect(() => parseNetworkConfig(serializeNetworkConfig(original), 'system:kuramoto')).toThrow('다른 시스템');
    expect(() => parseNetworkTopology('가'.repeat(NETWORK_IMPORT_MAX_BYTES), original)).toThrow('256 KiB');
    expect(() =>
      parseNetworkTopology(serializeNetworkTopology(defaultNetworkConfig('system:kuramoto')), original)
    ).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('rejects duplicate keys, malformed graph endpoints and extra fields before any mutation', () => {
    const original = defaultNetworkConfig('system:kuramoto'),
      before = structuredClone(original),
      text = serializeNetworkTopology(original),
      data = JSON.parse(text);
    for (const bad of [
      text.replace('"schema":', '"schema":"discarded","schema":'),
      text.replace('"schema":', '"\\u0073chema":"discarded","schema":'),
      JSON.stringify({ ...data, unknown: 1 }),
      JSON.stringify({
        ...data,
        graph: { ...data.graph, edges: [{ id: 'bad', source: 'n1', target: 'missing', weight: 1 }] }
      }),
      JSON.stringify({ ...data, initialState: [0] })
    ])
      expect(() => parseNetworkTopology(bad, original)).toThrow();
    expect(original).toEqual(before);
  });
  it.each(NETWORK_SYSTEM_IDS)('%s exports finite aligned rows with stable identity and final fractional time', (id) => {
    const simulation = createNetworkSimulation({ ...defaultNetworkConfig(id), duration: 0.004, step: 0.003 }),
      samples = [simulation.snapshot(), simulation.step(), simulation.step()],
      rows = networkTrajectoryCsv(samples, id)
        .trim()
        .split('\r\n')
        .map((row) => row.split(',')),
      header = rows[0]!;
    expect(header).toContain('node_id');
    for (const row of rows.slice(1)) {
      expect(row).toHaveLength(header.length);
      expect(
        row
          .filter((_, i) => i !== 1)
          .map(Number)
          .every(Number.isFinite)
      ).toBe(true);
      expect(row[1]).toBe(id === 'system:magnetic' ? 'bob' : samples[0]!.nodeIds[Number(row[2])]);
    }
    expect(Number(rows.at(-1)![0])).toBe(0.004);
    expect(header[0]).toBe(id === 'system:magnetic' ? 'time_normalized' : 'time_s');
    if (id === 'system:magnetic') expect(header.join(',')).not.toContain('_J');
  });
  it('rejects formula cells, nonfinite metrics, wrong dimensions, identity changes and reversed time', () => {
    const sample = createNetworkSimulation(defaultNetworkConfig('system:kuramoto')).snapshot();
    expect(() => networkTrajectoryCsv([sample], 'system:unknown' as NetworkConfig['systemId'])).toThrow('지원하는');
    for (const patch of [
      { state: [Infinity] },
      { state: sample.state.map(() => '=1+1') },
      { nodeIds: sample.nodeIds.map(() => '=1+1') },
      { order: NaN },
      { localCoherence: [] }
    ])
      expect(() => networkTrajectoryCsv([{ ...sample, ...patch } as NetworkSample], 'system:kuramoto')).toThrow();
    expect(() => networkTrajectoryCsv([sample, { ...sample, time: -1 }], 'system:kuramoto')).toThrow();
    expect(() =>
      networkTrajectoryCsv([sample, { ...sample, nodeIds: [...sample.nodeIds].reverse() }], 'system:kuramoto')
    ).toThrow();
  });
  it('exports finite seed-grid cells including unresolved classifications with stable magnet IDs', () => {
    const base = defaultNetworkConfig(),
      config: NetworkConfig = { ...base, basin: { ...base.basin!, size: 2, maxSteps: 3 } },
      job = createNetworkBasinJob(config);
    while (!job.done) job.step();
    const snapshot = job.snapshot(),
      rows = networkBasinCsv(config, snapshot)
        .trim()
        .split('\r\n')
        .map((row) => row.split(','));
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual(['x_normalized', 'y_normalized', 'magnet_id', 'magnet_index', 'converged_1', 'steps']);
    for (const row of rows.slice(1)) {
      expect(row).toHaveLength(6);
      expect(
        row
          .filter((_, i) => i !== 2)
          .map(Number)
          .every(Number.isFinite)
      ).toBe(true);
      expect(config.graph.nodes[Number(row[3])]!.id).toBe(row[2]);
    }
    expect(snapshot.cells.every((cell) => !cell.converged)).toBe(true);
  });
});
