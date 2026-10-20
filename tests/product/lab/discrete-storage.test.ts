import { describe, expect, it } from 'vitest';
import {
  createDiscreteSimulation,
  defaultDiscreteConfig,
  DISCRETE_SYSTEM_IDS,
  type DiscreteSample
} from '../../../src/product/adapters/physics/discrete';
import {
  DISCRETE_STORAGE_PREFIX,
  DISCRETE_IMPORT_MAX_BYTES,
  serializeDiscreteConfig,
  parseDiscreteConfig,
  saveDiscreteConfig,
  loadDiscreteConfig,
  discreteTrajectoryCsv,
  discreteStateJson,
  downsampleDiscreteSamples
} from '../../../src/product/lab/views/discrete-storage';
function memory(entries: [string, string][] = []) {
  const records = new Map(entries);
  return {
    records,
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value)
  };
}
describe('S17 isolated persistence, exact complex continuation and honest exports', () => {
  it.each(DISCRETE_SYSTEM_IDS)('%s round trips initial configuration and protects legacy keys', (id) => {
    const config = defaultDiscreteConfig(id),
      before = structuredClone(config),
      storage = memory([['legacy', 'untouched']]);
    saveDiscreteConfig(storage, config);
    expect(loadDiscreteConfig(storage, id)).toEqual({ ...config, analyses: [] });
    expect(parseDiscreteConfig(serializeDiscreteConfig(config), id)).toEqual({ ...config, analyses: [] });
    expect(createDiscreteSimulation(loadDiscreteConfig(storage, id)!).snapshot()).toEqual(
      createDiscreteSimulation(config).snapshot()
    );
    expect(config).toEqual(before);
    expect([...storage.records.keys()]).toEqual(['legacy', `${DISCRETE_STORAGE_PREFIX}${id}`]);
    expect(storage.records.get('legacy')).toBe('untouched');
  });
  it('preserves malformed/future originals before writing and rejects wrong-system or oversized imports', () => {
    const config = defaultDiscreteConfig(),
      key = `${DISCRETE_STORAGE_PREFIX}${config.systemId}`;
    for (const value of [
      '{broken',
      '{"schema":"future"}',
      '{"__proto__":{"polluted":true}}',
      '{"systemId":"x","systemId":"y"}'
    ]) {
      const storage = memory([[key, value]]);
      expect(() => loadDiscreteConfig(storage, config.systemId)).toThrow();
      expect(() => saveDiscreteConfig(storage, config)).toThrow();
      expect(storage.records.get(key)).toBe(value);
    }
    expect(() => parseDiscreteConfig('가'.repeat(DISCRETE_IMPORT_MAX_BYTES), config.systemId)).toThrow('256 KiB');
    expect(() => parseDiscreteConfig(serializeDiscreteConfig(config), 'system:unitary-floquet')).toThrow('다른 시스템');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it.each(['system:standard-map', 'system:quantum-kicked-rotor', 'system:unitary-floquet'] as const)(
    '%s restores an endpoint without losing native state or iteration',
    (id) => {
      const config = { ...defaultDiscreteConfig(id), iterations: 12 },
        run = createDiscreteSimulation(config),
        samples = [run.snapshot()];
      while (!run.done) samples.push(run.step());
      const text = discreteStateJson(config, samples, 1),
        parsed = parseDiscreteConfig(text, id),
        resumed = createDiscreteSimulation(parsed),
        direct = createDiscreteSimulation({ ...config, iterations: 13 });
      while (!direct.done) direct.step();
      expect(parsed.startIteration).toBe(samples.at(-1)!.iteration);
      expect(resumed.snapshot().re).toEqual(samples.at(-1)!.re);
      expect(resumed.snapshot().im).toEqual(samples.at(-1)!.im);
      expect(resumed.snapshot().state).toEqual(samples.at(-1)!.state);
      const next = resumed.step();
      expect(next.iteration).toBe(direct.snapshot().iteration);
      expect(next.re).toEqual(direct.snapshot().re);
      expect(next.im).toEqual(direct.snapshot().im);
      expect(next.state).toEqual(direct.snapshot().state);
      const future = { ...JSON.parse(text), futureState: 1 };
      expect(() => parseDiscreteConfig(JSON.stringify(future), id)).toThrow('필드');
      const inconsistent = JSON.parse(text);
      inconsistent.iteration++;
      expect(() => parseDiscreteConfig(JSON.stringify(inconsistent), id)).toThrow('iteration');
    }
  );
  it('preserves nonunit complex coefficients, distinguishes m² from p² and detects tampered continuation data', () => {
    const config = {
        ...defaultDiscreteConfig('system:quantum-kicked-rotor'),
        gridSize: 4,
        parameters: { kickStrength: 1.2, hbar: 2 },
        wavefunction: { re: [1, 0.5, 0, 0], im: [0, 0.5, 0, 0] }
      },
      run = createDiscreteSimulation(config),
      samples = [run.snapshot(), run.step()],
      artifact = JSON.parse(discreteStateJson(config, samples, 1));
    expect(artifact.norm).toBeCloseTo(1.5);
    expect(artifact.normDrift).toBeCloseTo(0.5);
    expect(artifact.meanPhysicalMomentumSquared).toBeCloseTo(4 * artifact.meanSquareMomentum);
    expect(parseDiscreteConfig(JSON.stringify(artifact), config.systemId).wavefunction).toEqual({
      re: samples[1]!.re,
      im: samples[1]!.im
    });
    artifact.probability[0] += 0.1;
    expect(() => parseDiscreteConfig(JSON.stringify(artifact), config.systemId)).toThrow('일치하지');
    const csv = discreteTrajectoryCsv(samples, config);
    expect(csv).toContain('mean_m_squared,mean_p_squared_normalized');
    expect(csv).toContain('psi_real,psi_imag,probability,norm_squared');
  });
  it('labels retained records separately from endpoint-preserving figure downsampling and refuses nonfinite rows', () => {
    const config = { ...defaultDiscreteConfig(), iterations: 250 },
      run = createDiscreteSimulation(config),
      samples = [run.snapshot()];
    while (!run.done) samples.push(run.step());
    const subset = downsampleDiscreteSamples(samples);
    expect(subset).toHaveLength(121);
    expect(subset[0]).toBe(samples[0]);
    expect(subset.at(-1)).toBe(samples.at(-1));
    const raw = discreteTrajectoryCsv(samples, config, 'retained-raw', 2),
      downsampled = discreteTrajectoryCsv(samples, config, 'downsampled', 2);
    expect(raw.trim().split('\r\n')).toHaveLength(252);
    expect(downsampled.trim().split('\r\n')).toHaveLength(122);
    expect(raw).toContain('retained-raw,2,');
    expect(raw).not.toContain('time_');
    const rows = raw
      .trim()
      .split('\r\n')
      .map((row) => row.split(','));
    for (const row of rows.slice(1)) expect(row).toHaveLength(rows[0]!.length);
    expect(() => discreteTrajectoryCsv([{ ...samples[0]!, p: Infinity } as DiscreteSample], config)).toThrow();
    expect(() => discreteTrajectoryCsv([samples[1]!, samples[0]!], config)).toThrow();
    expect(() => downsampleDiscreteSamples(samples, 1)).toThrow();
  });
});
