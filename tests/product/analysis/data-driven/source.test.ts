import { describe, expect, it } from 'vitest';
import { datasetFromExperiment, parseLearningData } from '../../../../src/product/adapters/analysis/data-driven/source';
import {
  createNonlinearSimulation,
  defaultNonlinearConfig,
  toCanonicalNonlinear
} from '../../../../src/product/adapters/physics/nonlinear';
import {
  createPlanarSimulation,
  defaultPlanarConfig,
  toCanonicalPlanar
} from '../../../../src/product/adapters/physics/planar';
import { previewObservationImport, confirmObservationImport } from '../../../../src/product/observations';
import { learningDefaults } from '../../../../src/product/adapters/analysis/data-driven/learning-contracts';
import { validateLearning } from '../../../../src/product/adapters/analysis/data-driven/learning';
import { oscillatorData } from './fixtures';

describe('S23 actual Lab and immutable observation sources', () => {
  it('maps only undamped unforced normalized unit-mass Duffing into canonical q,p', () => {
    const defaults = defaultNonlinearConfig('system:duffing');
    const config = {
      ...defaults,
      parameters: { ...defaults.parameters, damping: 0, driveAmplitude: 0 },
      duration: 2,
      step: 0.01
    };
    const experiment = toCanonicalNonlinear(config);
    if (!experiment.ok) throw new Error('fixture');
    const simulation = createNonlinearSimulation(config),
      samples = [simulation.snapshot()];
    while (!simulation.done) samples.push(simulation.step());
    const data = datasetFromExperiment(experiment.value, samples);
    expect(data.labels).toEqual(['q0', 'p0']);
    expect(data.units).toEqual(['1', '1']);
    expect(data.provenance).toMatchObject({ canonical: true, coordinateOrder: 'q,p', experiment: experiment.value });
    expect(data.values[0]).toEqual(samples[0]!.state.slice(0, 2));
    expect(() => validateLearning(data, learningDefaults(data, 'hamiltonian'))).not.toThrow();
    const driven = toCanonicalNonlinear({ ...config, parameters: { ...config.parameters, damping: 0.1 } });
    if (!driven.ok) throw new Error('fixture');
    const noncanonical = datasetFromExperiment(driven.value, samples);
    expect(noncanonical.provenance.canonical).toBeUndefined();
    expect(() => validateLearning(noncanonical, learningDefaults(noncanonical, 'hamiltonian'))).toThrow();
  });
  it('preserves time, units, exact recorded slice and angle/velocity meaning in the double pendulum', () => {
    const config = { ...defaultPlanarConfig(), duration: 6, step: 0.01 },
      simulation = createPlanarSimulation(config);
    const samples = [simulation.snapshot()];
    while (!simulation.done) samples.push(simulation.step());
    const canonical = toCanonicalPlanar(config);
    if (!canonical.ok) throw new Error('fixture');
    const data = datasetFromExperiment(canonical.value, samples, 10, 170);
    expect(data.values[0]).toEqual(samples[10]!.state);
    expect(data.times[0]).toBe(samples[10]!.time);
    expect(data.units).toEqual(['rad', 'rad', 'rad/s', 'rad/s']);
    expect(data.provenance.retainedSlice).toEqual({ start: 10, end: 170, total: samples.length });
    expect(() => validateLearning(data, learningDefaults(data, 'hamiltonian'))).toThrow();
    expect(() => datasetFromExperiment(canonical.value, samples, 0, 513)).toThrow();
    expect(Object.isFrozen(data.values[0])).toBe(true);
  });
  it('restores S22 raw text, hashes and transformations as complete embedded lineage', async () => {
    const raw = ['clock,a', ...Array.from({ length: 160 }, (_, i) => `${i * 20},${20 * Math.cos(i * 0.04)}`)].join(
      '\n'
    );
    const observation = confirmObservationImport(
      await previewObservationImport({
        name: 'angles.csv',
        kind: 'sensor',
        text: raw,
        mapping: { time: 'clock', theta1: 'a' },
        options: { timeUnit: 'ms', angleUnit: 'deg' }
      })
    );
    const data = await parseLearningData(JSON.stringify(observation));
    expect(data.times).toEqual(observation.data.times);
    expect(data.values).toEqual(observation.data.angles);
    expect(data.provenance.observation).toEqual(observation);
    expect(data.provenance.observation).toMatchObject({ original: { text: raw } });
    expect(data.labels).toEqual(['theta1']);
    expect(data.units).toEqual(['rad']);
    expect(data.axisUnit).toBe('s');
    const forged = structuredClone(observation);
    forged.original.text += '\n0,0';
    await expect(parseLearningData(JSON.stringify(forged))).rejects.toThrow();
  });
  it('accepts bounded data envelopes and rejects oversized, irregular, malformed and unsafe data', async () => {
    const data = oscillatorData();
    expect(await parseLearningData(JSON.stringify({ schema: 'pendulum-learning-data/v1', data }))).toEqual(data);
    await expect(
      parseLearningData(JSON.stringify({ schema: 'pendulum-learning-data/v1', data, extra: 1 }))
    ).rejects.toThrow();
    const irregular = structuredClone(data);
    irregular.times[8]! += 0.001;
    await expect(parseLearningData(JSON.stringify(irregular))).rejects.toThrow();
    await expect(parseLearningData('{"__proto__":{}}')).rejects.toThrow();
    await expect(parseLearningData('{"schema":"pendulum-learning-data/v99"}')).rejects.toThrow(/버전/);
    await expect(parseLearningData('{"values":[]}')).rejects.toThrow(/times, values, labels, units/);
    await expect(parseLearningData('{"schema":"pendulum-learning-data/v1","data":null}')).rejects.toThrow(/배열/);
  });
});
