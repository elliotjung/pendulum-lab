import { describe, expect, it } from 'vitest';
import { executeReproducibilityFocus } from '../../../src/product/experiments/reproducibility-focus-science';
import { reproducibilityFocusDeclaration } from '../../../src/product/experiments/reproducibility-focus-definitions';
import {
  reproducibilityFocusFields,
  reproducibilityFocusCanonical
} from '../../../src/product/experiments/reproducibility-focus-config';
import { validateExperimentState } from '../../../src/product/contracts/experiment-validation';
import { importResearchPackage } from '../../../src/product/provenance/package';
import { previewObservationImport } from '../../../src/product/observations';
import { buildReproducibilityPackage } from '../../../src/product/experiments/reproducibility-focus-project';
import { reproducibilityLearningData } from '../../../src/product/experiments/reproducibility-focus-learning';
import {
  learningDefaults,
  type LearningModel
} from '../../../src/product/adapters/analysis/data-driven/learning-contracts';
import { runDataDriven } from '../../../src/product/adapters/analysis/data-driven/execute';
import { learningHavokProjection } from '../../../src/product/adapters/analysis/data-driven/learning-havok';
import { transformLearning } from '../../../src/product/adapters/analysis/data-driven/learning-validation';
import type { LearningHavokModel } from '../../../src/product/adapters/analysis/data-driven/learning-model';
import type { DmdResult } from '../../../src/research/dmd';

const ids = Array.from({ length: 12 }, (_, i) => `8.${i + 1}`);
const parseResearchFields = (id: string) =>
  Object.fromEntries(reproducibilityFocusDeclaration(id).fields.map((f) => [f.id, f.value]));
const metric = (result: Awaited<ReturnType<typeof executeReproducibilityFocus>>, id: string) =>
  result.metrics.find((m) => m.id === id)!.value;
describe('S27 reproducible research uses preserved S21–24 tools', () => {
  it.each(ids)('%s calculates a bounded finite native result and exact canonical baseline', async (id) => {
    const fields = parseResearchFields(id),
      fractions: number[] = [];
    const result = await executeReproducibilityFocus(id, fields, (v) => fractions.push(v));
    expect(result.unitId).toBe(id);
    expect(result.canonical).toEqual(reproducibilityFocusCanonical(id, fields));
    expect(validateExperimentState(result.canonical).ok).toBe(true);
    expect(result.metrics.length).toBeGreaterThan(0);
    expect(result.tables.length).toBeGreaterThan(0);
    expect(result.metrics.every((m) => Number.isFinite(m.value))).toBe(true);
    expect(
      result.tables.every((t) => t.rows.length <= 1200 && t.rows.every((r) => r.length === t.columns.length))
    ).toBe(true);
    expect(fractions.at(-1)).toBe(1);
    expect(fractions.every((v, i) => i === 0 || v >= fractions[i - 1]!)).toBe(true);
  });
  it('a zero paired perturbation gives identical physical endpoints', async () => {
    const result = await executeReproducibilityFocus('8.1', { ...parseResearchFields('8.1'), delta: 0 });
    expect(metric(result, 'paired-difference')).toBe(0);
  });
  it.each(ids)('%s accepts an ordinary first exposed-field edit and runs the actual tools', async (id) => {
    const d = reproducibilityFocusDeclaration(id),
      first = d.fields.find((f) => f.id === d.exposed[0])!,
      fields = parseResearchFields(id);
    const changed = { ...fields, [first.id]: first.integer ? first.value + 1 : first.value * 1.05 };
    const result = await executeReproducibilityFocus(id, changed);
    expect(result.fields).toEqual(changed);
    expect(result.metrics.every((m) => Number.isFinite(m.value))).toBe(true);
  });
  it('seeded LHS/ensemble design and native endpoints repeat exactly', async () => {
    const fields = parseResearchFields('8.2'),
      first = await executeReproducibilityFocus('8.2', fields),
      second = await executeReproducibilityFocus('8.2', fields);
    expect(second).toEqual(first);
    const changed = await executeReproducibilityFocus('8.2', { ...fields, seed: fields.seed! + 1 });
    expect(changed.tables.find((t) => t.id === 'design-lhs')).not.toEqual(
      first.tables.find((t) => t.id === 'design-lhs')
    );
  });
  it('recovers known native gravity and preserves nonconvergence', async () => {
    const fields = parseResearchFields('8.3'),
      result = await executeReproducibilityFocus('8.3', fields);
    expect(metric(result, 'estimated-g')).toBeCloseTo(fields.truthG!, 6);
    // Native fitting subdivides each observation interval; different roundoff in
    // the fixed-step observation generator leaves a small residual floor.
    expect(metric(result, 'observation-rmse')).toBeLessThan(2e-8);
    const incomplete = await executeReproducibilityFocus('8.3', { ...fields, iterations: 1 });
    expect(metric(incomplete, 'converged')).toBe(0);
    expect(incomplete.warnings.join(' ')).toMatch(/수렴하지/);
  });
  it('ms/degree input calibration changes derived data while retaining originals', async () => {
    const fields = parseResearchFields('8.4'),
      baseline = await executeReproducibilityFocus('8.4', fields),
      changed = await executeReproducibilityFocus('8.4', { ...fields, clockScale: 2, angleScale: 1.2 });
    expect(metric(changed, 'calibrated-end-time')).toBeCloseTo(2 * metric(baseline, 'calibrated-end-time'), 12);
    expect(changed.tables[0]!.rows[0]![1]).toBe(baseline.tables[0]!.rows[0]![1]);
    expect(changed.tables[0]!.rows[0]![2]).not.toBe(baseline.tables[0]!.rows[0]![2]);
  });
  it('uses native Sobol evaluation count and held-out PCE validation', async () => {
    const sobol = await executeReproducibilityFocus('8.5', parseResearchFields('8.5'));
    expect(metric(sobol, 'forward-evaluations')).toBe(48);
    const pce = await executeReproducibilityFocus('8.6', parseResearchFields('8.6'));
    expect(metric(pce, 'forward-evaluations')).toBe(24);
    expect(metric(pce, 'validation-rmse')).toBeLessThan(0.01);
    expect(pce.tables.find((t) => t.id === 'held-out')!.rows).toHaveLength(8);
  });
  it('preserves derivative/state/latent error units instead of calling mixed SI errors dimensionless', async () => {
    const sindy = await executeReproducibilityFocus('8.7', parseResearchFields('8.7'));
    expect(sindy.metrics.find((m) => m.id === 'sindy-trainingRmse')!.unit).toBe('혼합 rad/s · rad/s^2');
    expect(sindy.metrics.find((m) => m.id === 'sindy-rolloutRmse')!.unit).toBe('혼합 rad · rad/s');
    const spectral = await executeReproducibilityFocus('8.8', parseResearchFields('8.8'));
    expect(spectral.metrics.find((m) => m.id === 'dmd-validationRmse')!.unit).toBe('혼합 rad · rad/s');
    expect(spectral.metrics.find((m) => m.id === 'havok-validationRmse')!.unit).toBe('s^-1');
    expect(spectral.metrics.find((m) => m.id === 'havok-rolloutRmse')!.unit).toBe('1');
    expect(spectral.metrics.find((m) => m.id === 'havok-validationTrainingRatio')!.unit).toBe('1');
    expect(
      spectral.tables
        .find((t) => t.id === 'havok-native-semantics')!
        .rows.flat()
        .join(' ')
    ).toMatch(/도함수 오차/);
    const normalized = await executeReproducibilityFocus('8.9', parseResearchFields('8.9'));
    expect(normalized.metrics.find((m) => m.id === 'hamiltonian-trainingRmse')!.unit).toBe('정규화 (q,p)/τ');
    expect(normalized.metrics.find((m) => m.id === 'reservoir-rolloutRmse')!.unit).toBe('정규화 q,p');
  });
  it('retains actual DMD spectral modes/operator and frozen HAVOK basis, spectrum and observed forcing', async () => {
    const fields = parseResearchFields('8.8'),
      canonical = reproducibilityFocusCanonical('8.8', fields),
      data = reproducibilityLearningData('8.8', fields, canonical);
    const output = await executeReproducibilityFocus('8.8', fields);
    for (const method of ['dmd', 'havok'] as const) {
      const settings = {
        ...learningDefaults(data, method),
        seed: `s27-${fields.seed}`,
        threshold: fields.threshold!,
        rank: fields.rank!,
        delays: fields.delays!,
        reservoirSize: fields.reservoirSize!,
        polynomialDegree: 2,
        rolloutSteps: 12
      };
      const native = await runDataDriven({
        schema: 'pendulum-data-driven-request/v1',
        id: `independent_${method}`,
        mode: 'train',
        input: { kind: 'learning', data, settings }
      });
      const model = native.output.model as LearningModel;
      expect(output.tables.find((t) => t.id === `${method}-native-semantics`)!.rows).toEqual(
        native.output.details.map((d) => [d])
      );
      if (method === 'dmd') {
        const fit = model.payload as DmdResult;
        expect(output.tables.find((t) => t.id === 'dmd-spectral-modes')!.rows).toEqual(
          fit.discreteEigenvalues.map((v, i) => [
            i + 1,
            v.re,
            v.im,
            fit.continuousEigenvalues[i]!.re,
            fit.continuousEigenvalues[i]!.im,
            fit.growthRates[i]!,
            fit.angularFrequencies[i]!
          ])
        );
        expect(output.tables.find((t) => t.id === 'dmd-observable-operator')!.rows.map((r) => r[2])).toEqual(
          fit.operator
        );
      } else {
        const fit = model.payload as LearningHavokModel;
        expect(output.tables.find((t) => t.id === 'havok-core-spectrum')!.rows).toEqual(
          fit.eigenvalues.map((v, i) => [i + 1, v.re, v.im])
        );
        expect(output.tables.find((t) => t.id === 'havok-training-basis')!.rows.flatMap((r) => r.slice(1))).toEqual(
          fit.basis
        );
        const heldout = learningHavokProjection(
          transformLearning(data.values.slice(settings.splitIndex), model.preprocessing),
          fit
        );
        expect(
          output.tables.find((t) => t.id === 'havok-observed-delay-coordinates')!.rows.map((r) => r.slice(2))
        ).toEqual(heldout);
        expect(output.charts.find((c) => c.id === 'havok-observed-forcing')!.series[0]!.points).toEqual(
          heldout.map((r, i) => ({ x: data.times[settings.splitIndex + i]!, y: r[fit.rank - 1]! }))
        );
        expect(
          output.tables
            .find((t) => t.id === 'havok-core-operator')!
            .rows.slice(-fit.forcingCoupling.length)
            .map((r) => r[2])
        ).toEqual(fit.forcingCoupling);
      }
    }
    const changed = await executeReproducibilityFocus('8.8', { ...fields, rank: 3 });
    expect(changed.tables.find((t) => t.id === 'havok-core-spectrum')!.rows).toHaveLength(2);
    expect(changed.charts.find((c) => c.id === 'havok-observed-forcing')!.series[0]!.points).not.toEqual(
      output.charts.find((c) => c.id === 'havok-observed-forcing')!.series[0]!.points
    );
  });
  it('actually packages and verifies completed run records with parent hashes', async () => {
    for (const id of ['8.11', '8.12']) {
      const result = await executeReproducibilityFocus(id, parseResearchFields(id));
      expect(metric(result, 'repeated-equal')).toBe(1);
      expect(metric(result, 'restored-runs')).toBe(2);
      expect(metric(result, 'restored-artifacts')).toBe(4);
      expect(
        result.tables.find((t) => t.id === 'lineage')!.rows.every((r) => /^[0-9a-f]{64}$/.test(String(r[4])))
      ).toBe(true);
      if (id === '8.12')
        expect(result.tables.find((t) => t.id === 'package-manifest')!.rows.some((r) => r[0] === 'reviewer.html')).toBe(
          true
        );
    }
  });
  it('downloadable ZIP retains the exact supplied source canonical and rejects physical rebinding', async () => {
    const fields = parseResearchFields('8.12'),
      canonical = {
        ...reproducibilityFocusCanonical('8.12', fields),
        provenance: {
          createdByVersion: 'product-focus-v3',
          source: { kind: 'derived' as const, id: 'learn:course-8:8.12:v1' },
          parentExperimentIds: []
        }
      };
    const bytes = await buildReproducibilityPackage('8.12', fields, canonical),
      restored = await importResearchPackage(bytes);
    const displayed = await executeReproducibilityFocus('8.12', fields);
    const displayedLineage = displayed.tables.find((t) => t.id === 'lineage')!;
    expect(restored.project.artifacts.map((a) => a.sha256)).toEqual(displayedLineage.rows.map((r) => r[4]));
    expect(restored.project.runs.every((r) => JSON.stringify(r.experiment) === JSON.stringify(canonical))).toBe(true);
    await expect(buildReproducibilityPackage('8.12', fields, { ...canonical, modelVersion: 'wrong' })).rejects.toThrow(
      /기준 실험/
    );
    const corrupt = new Uint8Array(bytes);
    corrupt[Math.floor(corrupt.length / 2)]! ^= 1;
    await expect(importResearchPackage(corrupt)).rejects.toThrow();
  });
  it.each(ids)('%s rejects unknown fields, fixed changes, nonfinite values and out-of-range work', (id) => {
    const fields = parseResearchFields(id),
      d = reproducibilityFocusDeclaration(id),
      fixed = d.fields.find((f) => !d.exposed.includes(f.id))!,
      editable = d.fields.find((f) => d.exposed.includes(f.id))!;
    expect(() => reproducibilityFocusFields(id, { ...fields, unknown: 1 })).toThrow();
    expect(() => reproducibilityFocusFields(id, { ...fields, [fixed.id]: fixed.value + 0.1 })).toThrow();
    expect(() => reproducibilityFocusFields(id, { ...fields, [editable.id]: Infinity })).toThrow();
    expect(() => reproducibilityFocusFields(id, { ...fields, [editable.id]: editable.max + 1 })).toThrow();
  });
  it('rejects malformed observation and malformed package instead of inventing results', async () => {
    await expect(
      previewObservationImport({
        kind: 'csv',
        name: 'bad.csv',
        text: 't,a,b\n0,1,2\n0,2,3',
        mapping: { time: 't', theta1: 'a', theta2: 'b' }
      })
    ).rejects.toThrow();
    await expect(importResearchPackage(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});
