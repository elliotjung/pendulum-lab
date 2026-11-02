import { describe, expect, it } from 'vitest';
import { defaultFieldConfig, toCanonicalField } from '../../../../src/product/adapters/physics/field';
import { defaultDiscreteConfig, toCanonicalDiscrete } from '../../../../src/product/adapters/physics/discrete';
import type { ContractResult } from '../../../../src/product/contracts/validation';
import { buildBatch, builderFields, defaultBatchSettings } from '../../../../src/product/lab/experiments/builders';
import { createBatchQueue } from '../../../../src/product/lab/experiments/queue';
import { parseBatch, serializeBatch } from '../../../../src/product/lab/experiments/artifact';
const unwrap = <T>(value: ContractResult<T>): T => {
  if (!value.ok) throw new Error(JSON.stringify(value.issues));
  return value.value;
};
describe('S21 editable axes reflect independently writable model quantities', () => {
  it.each(['langevin', 'fput', 'lattice-fk-limit', 'sine-gordon', 'frenkel-kontorova'] as const)(
    'field %s keeps dependent transport metadata out of axes and preserves it in export',
    (name) => {
      const source = unwrap(toCanonicalField({ ...defaultFieldConfig(`system:${name}`), duration: 0.04 })),
        fields = builderFields(source),
        keys = fields.filter((f) => f.group === 'parameters').map((f) => f.key);
      expect(keys.some((key) => key.startsWith('configured'))).toBe(false);
      expect(keys).not.toContain('gridPoints');
      expect(keys.includes('gridLength')).toBe(name === 'sine-gordon');
      expect(keys.includes('ensembleMembers')).toBe(name === 'langevin');
      const plan = buildBatch(source, { ...defaultBatchSettings(source), kind: 'ensemble', axes: [], count: 2 });
      const queue = createBatchQueue(plan);
      const restored = parseBatch(serializeBatch(queue.snapshot()));
      expect(restored.plan.source.parameters).toEqual(source.parameters);
      expect(restored.plan.source.runtime).toEqual(source.runtime);
      queue.dispose();
    }
  );
  it.each(['standard-map', 'quantum-kicked-rotor', 'unitary-floquet'] as const)(
    'discrete %s excludes runtime and wavefunction/operator dimension aliases',
    (name) => {
      const source = unwrap(toCanonicalDiscrete({ ...defaultDiscreteConfig(`system:${name}`), iterations: 4 })),
        fields = builderFields(source),
        keys = fields.map((f) => f.key);
      expect(keys).not.toContain('gridSize');
      expect(keys.some((key) => key.startsWith('configured'))).toBe(false);
      expect(keys).not.toContain('wavefunction');
      expect(keys).not.toContain('operator');
      expect(keys).toContain(name === 'unitary-floquet' ? 'period' : 'kickStrength');
      expect(() =>
        buildBatch(source, {
          ...defaultBatchSettings(source),
          kind: 'grid',
          axes: [{ group: 'parameters', key: 'gridSize', start: 2, end: 4, count: 2 }]
        })
      ).toThrow('존재하는');
    }
  );
  it('retains a genuinely independent integer Langevin ensemble size control', () => {
    const source = unwrap(toCanonicalField({ ...defaultFieldConfig(), duration: 0.04 })),
      plan = buildBatch(source, {
        ...defaultBatchSettings(source),
        kind: 'grid',
        axes: [{ group: 'parameters', key: 'ensembleMembers', start: 2, end: 4, count: 3 }]
      });
    expect(plan.runs.map((run) => run.experiment.parameters.ensembleMembers)).toEqual(
      [2, 3, 4].map((value) => ({ kind: 'scalar', unit: '1', value }))
    );
    expect(
      plan.runs.every(
        (run) => run.experiment.runtime.domain === 'time' && run.experiment.runtime.duration.value === 0.04
      )
    ).toBe(true);
  });
  it('accepts physical QKR kick strength and FK coupling without dimension changes', () => {
    const sources = [
      unwrap(toCanonicalDiscrete({ ...defaultDiscreteConfig('system:quantum-kicked-rotor'), iterations: 4 })),
      unwrap(toCanonicalField({ ...defaultFieldConfig('system:frenkel-kontorova'), duration: 0.04 }))
    ];
    sources.forEach((source, i) => {
      const key = i === 0 ? 'kickStrength' : 'coupling';
      const plan = buildBatch(source, {
        ...defaultBatchSettings(source),
        kind: 'grid',
        axes: [{ group: 'parameters', key, start: 0.5, end: 1, count: 2 }]
      });
      expect(plan.runs).toHaveLength(2);
      expect(plan.runs.every((run) => run.experiment.initialConditions === source.initialConditions)).toBe(false);
      expect(plan.runs[0]!.experiment.initialConditions).toEqual(source.initialConditions);
    });
  });
});
