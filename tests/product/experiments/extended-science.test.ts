import { describe, expect, it } from 'vitest';
import {
  extendedCanonical,
  extendedConfig,
  extendedPresetFields,
  validateExtendedCanonical,
  validateExtendedFields,
  type ExtendedFields
} from '../../../src/product/experiments/extended-config';
import { extendedFocusDeclaration } from '../../../src/product/experiments/extended-definitions';
import { executeExtendedExperiment, extendedBatchPlan } from '../../../src/product/experiments/extended-science';
import type { ExtendedResult } from '../../../src/product/experiments/extended-results';
import { validateExperimentState } from '../../../src/product/contracts/experiment-validation';
import { validateBatchSnapshot } from '../../../src/product/lab/experiments/validation';

const ids = [2, 3].flatMap((course) => Array.from({ length: 9 }, (_, i) => `${course}.${i + 1}`));
const run = (id: string, overrides: ExtendedFields = {}) =>
  executeExtendedExperiment(id, { ...extendedPresetFields(id), ...overrides });
const value = (result: ExtendedResult, id: string): number => {
  const found = result.metrics.find((entry) => entry.id === id);
  if (!found) throw new Error(`${result.unitId}: missing diagnostic ${id}.`);
  return found.value;
};
const table = (result: ExtendedResult, id: string) => {
  const found = result.tables.find((entry) => entry.id === id);
  if (!found) throw new Error(`${result.unitId}: missing scientific table ${id}.`);
  return found;
};

describe('S25 eighteen actual shared-engine Focus experiments', () => {
  it.each(ids)('%s executes finite bounded data with source provenance and monotonic progress', (id) => {
    const input = extendedPresetFields(id);
    const original = structuredClone(input);
    const progress: number[] = [];
    const result = executeExtendedExperiment(id, input, (fraction) => progress.push(fraction));
    expect(input).toEqual(original);
    expect(result).toMatchObject({
      schema: 'pendulum-learn-diagnostics/v1',
      algorithmVersion: 'learn-extended-v1',
      unitId: id,
      fields: input
    });
    expect(result.trace.length).toBeGreaterThan(1);
    expect(result.trace.length).toBeLessThanOrEqual(801);
    expect(result.trace[0]?.time).toBe(0);
    expect(result.trace.at(-1)?.time).toBeCloseTo(input.duration!, 10);
    for (const sample of result.trace) {
      expect(sample.state.every(Number.isFinite)).toBe(true);
      expect(Number.isFinite(sample.energy)).toBe(true);
      expect(sample.positions.length).toBeGreaterThan(0);
      for (const point of sample.positions)
        expect([point.x, point.y, ...(point.z === undefined ? [] : [point.z])].every(Number.isFinite)).toBe(true);
    }
    expect(result.metrics.every((entry) => Number.isFinite(entry.value))).toBe(true);
    expect(value(result, 'steps')).toBeGreaterThan(0);
    expect(value(result, 'steps')).toBeLessThanOrEqual(20_000);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(validateExperimentState(result.canonical).ok).toBe(true);
    expect(result.canonical.systemId).toBe(extendedFocusDeclaration(id).systemId);
    expect(result.canonical.provenance?.source).toEqual({ kind: 'derived', id: `learn:course-${id[0]}:${id}:v1` });
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((fraction, i) => fraction >= 0 && fraction <= 1 && fraction >= (progress[i - 1] ?? 0))).toBe(
      true
    );
  });

  it('2.1 reports the actual kinematic state/derivative identity under edited initial velocity', () => {
    const result = run('2.1', { omega1: 0.7 });
    const rows = table(result, 'state-derivative').rows;
    expect(rows[0]?.[1]).toBe(0.4);
    expect(rows[0]?.[3]).toBe(0.7);
    expect(rows[1]?.[3]).toBe(0);
    expect(value(result, 'kinematic-identity')).toBeLessThanOrEqual(1e-12);
    expect(rows.map((row) => row[4])).toEqual(['rad/s', 'rad/s', 'rad/s^2', 'rad/s^2']);
  });

  it('2.2 exhibits first-order Euler global convergence and second-order one-step defect', () => {
    const coarse = run('2.2');
    const fine = run('2.2', { step: 0.005 });
    const coarseError = value(coarse, 'euler-error');
    const fineError = value(coarse, 'euler-half-error');
    expect(fineError).toBeLessThan(coarseError);
    expect(coarseError / fineError).toBeGreaterThan(1.7);
    expect(coarseError / fineError).toBeLessThan(2.5);
    expect(value(coarse, 'local-euler-defect') / value(fine, 'local-euler-defect')).toBeGreaterThan(3.8);
    expect(value(coarse, 'local-euler-defect') / value(fine, 'local-euler-defect')).toBeLessThan(4.2);
    expect(value(coarse, 'energy-max-deviation')).toBeGreaterThan(1e-4);
  });

  it('2.3 records accepted DP5(4) decisions, including their normalized acceptance and exact replay', () => {
    const result = run('2.3');
    const rows = table(result, 'adaptive-steps').rows;
    expect(rows.length).toBe(value(result, 'adaptive-accepted'));
    expect(rows.length).toBeGreaterThan(2);
    expect(rows[0]?.[1]).toBe(0);
    expect(rows.at(-1)?.[2]).toBeCloseTo(extendedPresetFields('2.3').duration!, 12);
    for (const [i, row] of rows.entries()) {
      expect(row[0]).toBe(i);
      expect(Number(row[3])).toBeGreaterThan(0);
      expect(Number(row[4])).toBeLessThanOrEqual(1);
      if (i) expect(row[1]).toBe(rows[i - 1]?.[2]);
    }
    expect(new Set(rows.map((row) => row[3])).size).toBeGreaterThan(1);
    expect(value(result, 'adaptive-rhs-evaluations')).toBe(
      7 * (value(result, 'adaptive-accepted') + value(result, 'adaptive-rejected'))
    );
    expect(value(result, 'adaptive-replay-error')).toBeLessThanOrEqual(1e-12);
    expect(result.companions.find((entry) => entry.id === 'adaptive-dopri5')?.settings.absTol).toBe(1e-6);
    expect(result.canonical.integrator.kind).toBe('selectable');
    if (result.canonical.integrator.kind !== 'selectable') throw new Error('Expected selectable baseline RK4.');
    expect(result.canonical.integrator.id).toBe('integrator:rk4');
  });

  it('2.4 checks the full canonical 2-form after a converged native implicit midpoint solve', () => {
    const result = run('2.4');
    expect(value(result, 'symplectic-residual')).toBeLessThanOrEqual(1e-5);
    expect(value(result, 'midpoint-solver-residual')).toBeLessThanOrEqual(1e-11);
    expect(value(result, 'midpoint-iterations')).toBeGreaterThan(value(result, 'steps'));
    expect(value(result, 'midpoint-energy-max')).toBeGreaterThan(0);
    expect(value(result, 'midpoint-energy-max')).toBeLessThan(0.1);
    expect(table(result, 'canonical-energy').rows.at(-1)?.[0]).toBe(6);
    expect(result.companions.find((entry) => entry.id === 'canonical-midpoint')?.settings.coordinates).toBe('theta,p');
  });

  it('2.5 agrees with the g=0 radial cosine benchmark and exposes actual implicit solve residual', () => {
    const result = run('2.5');
    const frequency = Math.sqrt(1000);
    const exact = 1 + 0.02 * Math.cos(frequency * 0.5);
    expect(value(result, 'radial-frequency')).toBeCloseTo(frequency, 12);
    expect(value(result, 'implicit-r-error')).toBeLessThan(value(result, 'euler-r-error'));
    expect(value(result, 'implicit-residual')).toBeLessThanOrEqual(1e-10);
    expect(value(result, 'implicit-iterations')).toBeGreaterThan(0);
    const last = table(result, 'stiff-radius').rows.at(-1)!;
    expect(last[3]).toBeCloseTo(exact, 12);
    expect(result.trace.at(-1)?.state[0]).toBeCloseTo(exact, 4);
    const finer = run('2.5', { step: 0.005 });
    expect(value(finer, 'implicit-r-error')).toBeLessThan(value(result, 'implicit-r-error'));
  });

  it('2.5 rejects a numerically singular coarse-step run and recovers with a refined step', () => {
    expect(() => run('2.5', { stiffness: 4000, step: 0.05 })).toThrow(/특이점|시간 간격/);
    const recovered = run('2.5', { stiffness: 4000, step: 0.01 });
    expect(recovered.trace.at(-1)?.time).toBeCloseTo(0.5, 12);
    expect(value(recovered, 'implicit-residual')).toBeLessThanOrEqual(1e-10);
    expect(recovered.metrics.every((metric) => Number.isFinite(metric.value))).toBe(true);
  });

  it('2.6 locates transverse section roots more accurately than sampling at the next recorded time', () => {
    const result = run('2.6');
    const rows = table(result, 'poincare-crossings').rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(value(result, 'root-residual-max')).toBeLessThanOrEqual(1e-7);
    for (const row of rows) {
      const root = Number(row[1]);
      const sampled = Number(row[2]);
      const linear = Number(row[3]);
      expect(sampled).toBeGreaterThanOrEqual(root - 1e-8);
      expect(sampled - root).toBeLessThanOrEqual(0.04 + 1e-7);
      expect(Math.abs(linear - root)).toBeLessThanOrEqual(0.04);
    }
  });

  it('2.7 compares the same final time with both fixed-step and adaptive cost records', () => {
    const result = run('2.7');
    const fixed = table(result, 'error-cost').rows;
    expect(fixed.length).toBe(6);
    for (const method of ['integrator:euler', 'integrator:rk2', 'integrator:rk4']) {
      const rows = fixed.filter((row) => row[0] === method);
      expect(Number(rows[1]?.[2])).toBe(2 * Number(rows[0]?.[2]));
      expect(Number(rows[1]?.[3])).toBeLessThan(Number(rows[0]?.[3]));
    }
    const adaptive = table(result, 'tolerance-cost').rows;
    expect(adaptive.length).toBe(3);
    expect(adaptive.every((row) => Number(row[3]) > 0 && Number(row[4]) >= 0)).toBe(true);
    const tighter = run('2.7', { tolerance: 1e-8 });
    expect(tighter.companions.find((entry) => entry.id === 'adaptive-dopri5')?.settings.absTol).toBe(1e-8);
  });

  it('2.8 keeps exact geometric rod constraints while energy and reversal error converge independently', () => {
    const coarse = run('2.8');
    const fine = run('2.8', { step: 0.005 });
    expect(value(coarse, 'constraint-max')).toBeLessThanOrEqual(1e-10);
    expect(value(coarse, 'time-reversal-error')).toBeGreaterThan(0);
    expect(value(fine, 'time-reversal-error')).toBeLessThan(value(coarse, 'time-reversal-error'));
    expect(value(fine, 'energy-max-deviation')).toBeLessThan(value(coarse, 'energy-max-deviation'));
  });

  it('2.9 runs actual S21 controlled integrator batches with deterministic planning and results', () => {
    const fields = extendedPresetFields('2.9');
    const a = run('2.9');
    const b = run('2.9');
    expect(a.batch).toBeDefined();
    expect(b.batch).toBeDefined();
    const batch = validateBatchSnapshot(a.batch!);
    expect(batch.plan).toEqual(extendedBatchPlan('2.9', fields));
    expect(batch.plan).toEqual(b.batch!.plan);
    expect(batch.aggregate.completed).toBe(3);
    expect(batch.runs.every((entry) => entry.status === 'completed')).toBe(true);
    expect(batch.runs.map((entry) => entry.result?.summary)).toEqual(
      b.batch!.runs.map((entry) => entry.result?.summary)
    );
    expect(
      batch.plan.runs.map((entry) =>
        entry.experiment.integrator.kind === 'selectable' ? entry.experiment.integrator.id : 'internal'
      )
    ).toEqual(['integrator:rk4', 'integrator:rk2', 'integrator:euler']);
    for (const entry of batch.plan.runs) {
      expect(entry.experiment.parameters).toEqual(batch.plan.source.parameters);
      expect(entry.experiment.initialConditions).toEqual(batch.plan.source.initialConditions);
      expect(entry.experiment.runtime).toEqual(batch.plan.source.runtime);
    }
  });

  it('3.1 distinguishes downstream mass accumulation from truncating the triple matrix', () => {
    const result = run('3.1');
    const triple = table(result, 'mass-matrix').rows;
    const two = table(result, 'two-link-mass-matrix').rows;
    expect(triple[0]?.[1]).toBe(3);
    expect(triple[1]?.[2]).toBe(2);
    expect(triple[2]?.[3]).toBe(1);
    expect(two[0]?.[1]).toBe(2);
    expect(two[1]?.[2]).toBe(1);
    expect(value(result, 'triple-chain-step-distance')).toBeLessThanOrEqual(1e-10);
  });

  it('3.2 changes actual matrix and state dimensions when the bounded link count changes', () => {
    for (const links of [2, 8]) {
      const result = run('3.2', { links });
      expect(value(result, 'degrees-of-freedom')).toBe(links);
      expect(value(result, 'state-dimension')).toBe(2 * links);
      expect(value(result, 'matrix-entries')).toBe(links * links);
      expect(result.trace[0]?.state.length).toBe(2 * links);
      expect(result.trace[0]?.positions.length).toBe(links);
    }
  });

  it('3.3 uses rod intrinsic inertia instead of point-mass inertia', () => {
    const result = run('3.3');
    const rod = table(result, 'compound-matrix').rows;
    const point = table(result, 'point-matrix').rows;
    expect(rod[0]?.[1]).toBeCloseTo(4 / 3, 13);
    expect(rod[1]?.[2]).toBeCloseTo(1 / 3, 13);
    expect(point[0]?.[1]).toBe(2);
    expect(point[1]?.[2]).toBe(1);
    expect(value(result, 'compound-point-endpoint-distance')).toBeGreaterThan(1e-3);
  });

  it('3.4 separately reports radial, angular and elastic energy with finite total conservation error', () => {
    const result = run('3.4');
    const rows = table(result, 'radial-angular-exchange').rows;
    expect(rows.length).toBeGreaterThan(20);
    expect(rows.every((row) => Number(row[3]) >= 0 && Number(row[4]) >= 0 && Number(row[5]) >= 0)).toBe(true);
    expect(rows.some((row) => Number(row[3]) > 1e-3)).toBe(true);
    expect(rows.some((row) => Number(row[4]) > 1e-3)).toBe(true);
    expect(value(result, 'energy-max-deviation')).toBeLessThan(1e-3);
  });

  it.each(['3.5', '3.6'])('%s records chronological actual constraint events and capture loss', (id) => {
    const result = run(id);
    const rows = table(result, 'constraint-events').rows;
    expect(rows.length).toBe(value(result, 'event-count'));
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((row) => row[0])).size).toBe(rows.length);
    for (const [i, row] of rows.entries()) {
      expect(Number(row[1])).toBeGreaterThanOrEqual(0);
      expect(Number(row[5])).toBeGreaterThanOrEqual(0);
      expect(Number(row[1])).toBeGreaterThanOrEqual(Number(rows[i - 1]?.[1] ?? 0));
      expect(['initial-condition', 'integration']).toContain(row[4]);
    }
    expect(value(result, 'capture-loss-sum')).toBeCloseTo(
      rows.reduce((sum, row) => sum + Number(row[5]), 0),
      12
    );
    expect(value(result, 'constraint-max')).toBeLessThan(0.01);
  });

  it.each(['3.7', '3.8'])('%s preserves vertical angular momentum and finite three-dimensional geometry', (id) => {
    const result = run(id);
    expect(value(result, 'vertical-momentum-drift')).toBeLessThan(1e-3);
    expect(value(result, 'constraint-max')).toBeLessThan(1e-7);
    expect(result.trace.every((sample) => sample.positions.every((p) => Number.isFinite(p.z)))).toBe(true);
    expect(table(result, 'spatial-precession').rows.length).toBeGreaterThan(10);
  });

  it('3.9 keeps valid embedded data and explicitly reports polar comparison termination near a pole', () => {
    const result = run('3.9');
    expect(value(result, 'constraint-max')).toBeLessThan(1e-6);
    expect(result.canonical.systemId).toBe('system:spherical-embedded');
    expect(table(result, 'embedded-polar')).toBeDefined();
    expect(result.warnings.some((message) => message.includes('극좌표 비교'))).toBe(true);
    expect(result.trace.at(-1)?.time).toBeCloseTo(1, 10);
  });
});

describe('S25 bounded science input and canonical preservation', () => {
  it.each(ids)('%s rejects hidden or unknown values without mutating the valid input', (id) => {
    const input = extendedPresetFields(id);
    const declaration = extendedFocusDeclaration(id);
    const fixed = declaration.fields.find((field) => !declaration.exposed.includes(field.id))!;
    const original = structuredClone(input);
    expect(() => validateExtendedFields(id, { ...input, unknown: 1 })).toThrow();
    expect(() => validateExtendedFields(id, { ...input, [fixed.id]: fixed.value + 0.01 })).toThrow();
    expect(() => validateExtendedFields(id, { ...input, [declaration.exposed[0]!]: NaN })).toThrow();
    expect(input).toEqual(original);
  });

  it('rejects fractional link counts, unsafe data, invalid versions and cross-unit source declarations', () => {
    expect(() => run('3.2', { links: 2.5 })).toThrow();
    expect(() => run('3.2', { links: 9 })).toThrow();
    expect(() => validateExtendedFields('2.10', {})).toThrow();
    expect(() => validateExtendedFields('2.1', JSON.parse('{"__proto__":{"polluted":true}}'))).toThrow();
    const unit = { id: '2.1', courseId: 'course-2', contentVersion: 1 };
    const fields = extendedPresetFields(unit.id);
    const canonical = extendedCanonical(unit, fields);
    expect(() => validateExtendedCanonical(unit, fields, canonical)).not.toThrow();
    expect(() => validateExtendedCanonical({ ...unit, contentVersion: 2 }, fields, canonical)).toThrow();
    expect(() => validateExtendedCanonical({ ...unit, id: '2.2' }, extendedPresetFields('2.2'), canonical)).toThrow();
    expect(() =>
      validateExtendedCanonical(unit, fields, { ...canonical, modelVersion: 'unknown-model-v999' })
    ).toThrow();
    expect(extendedConfig('2.1', fields).family).toBe('planar');
  });
});
