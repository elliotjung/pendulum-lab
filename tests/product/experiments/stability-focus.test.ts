import { describe, expect, it } from 'vitest';
import { stabilityFocusDeclaration } from '../../../src/product/experiments/stability-focus-definitions';
import {
  stabilityFocusCanonical,
  stabilityFocusFields,
  stabilityFocusSettings,
  stabilityFocusAnalysis
} from '../../../src/product/experiments/stability-focus-config';
import { executeStabilityFocus } from '../../../src/product/experiments/stability-focus-science';
import { fromStabilityAnalysis } from '../../../src/product/adapters/analysis/stability/state';
import { validateResearchResult } from '../../../src/product/experiments/research-focus-validation';
import { executeResearchFocus } from '../../../src/product/experiments/research-focus-science';
import type { ResearchFocusResult } from '../../../src/product/experiments/research-focus-contracts';
const ids = Array.from({ length: 12 }, (_, i) => `6.${i + 1}`),
  results = new Map<string, ResearchFocusResult>();
const result = (id: string) => {
  let r = results.get(id);
  if (!r) {
    r = executeStabilityFocus(id, stabilityFocusFields(id));
    results.set(id, r);
  }
  return r;
};
const metric = (id: string, key: string) => result(id).metrics.find((m) => m.id === key)!.value;
describe('S27 course6 actual native equilibrium, orbit, manifold, branch and boundary computations', () => {
  it.each(ids)('%s produces bounded finite output, actual settings and canonical lineage', (id) => {
    const fields = stabilityFocusFields(id),
      raw = result(id),
      r = executeResearchFocus(id, fields);
    expect(validateResearchResult(r, { id: `fixture_${id.replace('.', '_')}`, unitId: id, fields })).toEqual(r);
    expect(r.tables.length + r.charts.length).toBeGreaterThan(0);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(raw.canonical.analyses).toEqual(stabilityFocusAnalysis(id, fields));
    expect(r.canonical.provenance?.source.id).toBe(`learn:course-6:${id}:v1`);
  });
  it('continuous lower/upper equilibrium eigenvalues agree with native perturbation response', () => {
    expect(metric('6.1', 'max-eigen-real')).toBeCloseTo(-0.25, 6);
    const f = { ...stabilityFocusFields('6.1'), equilibrium: 1 },
      upper = executeStabilityFocus('6.1', f);
    expect(upper.metrics.find((m) => m.id === 'max-eigen-real')!.value).toBeGreaterThan(0.7);
    expect(Math.abs(upper.metrics.find((m) => m.id === 'final-perturbation')!.value)).toBeGreaterThan(0.01);
  });
  it('Floquet determinant satisfies the independent constant-divergence identity', () => {
    expect(metric('6.3', 'determinant')).toBeCloseTo(Math.exp(-0.5 * 3 * Math.PI), 5);
  });
  it('actual Melnikov quadrature matches its analytic formula and manifold records retain native source', () => {
    expect(metric('6.4', 'quadrature-error')).toBeLessThan(1e-7);
    expect(result('6.4').tables.find((t) => t.id === 'manifold-saddle')?.rows[0]?.[2]).toBeLessThan(1e-7);
    expect(result('6.4').charts.some((c) => c.id === 'stable-unstable-manifolds')).toBe(true);
  });
  it('arclength passes the fold while verifying every algebraic branch residual', () => {
    const table = result('6.6').tables.find((t) => t.columns[0] === 'lambda (1)')!;
    expect(table.rows.some((row) => (row[1] as number) < 0)).toBe(true);
    for (const row of table.rows) expect(Math.abs((row[1] as number) ** 2 - (row[0] as number))).toBeLessThan(1e-7);
  });
  it('pitchfork switching finds separated signed roots instead of accepting the symmetric branch', () => {
    const table = result('6.7').tables.find((t) => t.columns[1] === 'branch (index)')!;
    expect(table.rows.some((row) => (row[2] as number) < 0)).toBe(true);
    expect(table.rows.some((row) => (row[2] as number) > 0)).toBe(true);
    for (const row of table.rows) expect(Math.abs((row[2] as number) ** 2 - (row[0] as number))).toBeLessThan(1e-6);
  });
  it('NS radius crosses one and actual invariant curves have nonzero verified amplitude', () => {
    const r = result('6.9'),
      table = r.tables.find((t) => t.columns[3] === 'spectralRadius (1)')!;
    expect(table.rows[0]![3]).toBeLessThan(1);
    expect(table.rows.at(-1)![3]).toBeGreaterThan(1);
    expect(metric('6.9', 'usable-circles')).toBeGreaterThan(0);
  });
  it('the actual driven cascade resolves successive1→2→4 changes with verified primitive P4 multipliers', () => {
    expect(metric('6.8', 'first-switch')).toBe(1);
    const r = result('6.8'),
      counts = r.tables.find((t) => t.id === 'strobe-counts')!.rows.map((row) => row[1]);
    expect(counts).toContain(1);
    expect(counts).toContain(2);
    expect(counts).toContain(4);
    const p4 = r.tables
      .find((t) => t.id === 'periodic-multipliers')!
      .rows.find((row) => row[0] === 1.08 && row[1] === 4)!;
    expect(p4[2]).toBe(1);
    expect(p4[3]).toBeLessThan(1e-7);
    expect(p4[4]).toBeLessThan(1);
    expect(p4[5]).toBeGreaterThan(0.05);
  });
  it('uncoupled circle-map rotation equals the input frequency and cusp folds have tiny algebraic residuals', () => {
    const circle = result('6.10').tables.find((t) => t.columns[0] === 'omega (turns/iteration)')!;
    for (const row of circle.rows) expect(row[1]).toBeCloseTo(row[0] as number, 10);
    for (const row of result('6.11').tables.find((t) => t.id === 'cusp-normal-form')!.rows) {
      expect(Math.abs(row[4] as number)).toBeLessThan(1e-12);
      expect(Math.abs(row[5] as number)).toBeLessThan(1e-12);
    }
  });
  it('finite flip grids preserve cell counts and never claim missing Wada information', () => {
    expect(metric('6.12', 'grid-cells')).toBe(256);
    expect(
      result('6.12')
        .tables.find((t) => t.id === 'wada-verdict')
        ?.rows.some((row) => row[0] === 'productVerdict')
    ).toBe(true);
  });
  it.each(ids)('%s rejects altered hidden values, missing fields, accessors and invalid bounds', (id) => {
    const d = stabilityFocusDeclaration(id),
      fields = stabilityFocusFields(id),
      hidden = d.fields.find((f) => !d.exposed.includes(f.id))!;
    expect(() => stabilityFocusFields(id, { ...fields, [hidden.id]: hidden.value + 1 })).toThrow();
    expect(() => stabilityFocusFields(id, { ...fields, unknown: 0 })).toThrow();
    expect(() => stabilityFocusFields(id, { ...fields, [d.exposed[0]!]: Infinity })).toThrow();
    let reads = 0;
    const unsafe = Object.defineProperty({ ...fields }, d.exposed[0]!, {
      enumerable: true,
      get() {
        reads++;
        return 1;
      }
    });
    expect(() => stabilityFocusFields(id, unsafe)).toThrow();
    expect(reads).toBe(0);
  });
  it('carried primary S20 selections restore exact settings and independent benchmark source', () => {
    for (const id of ids.filter((id) => !['6.1', '6.12'].includes(id)))
      for (const a of stabilityFocusCanonical(id, stabilityFocusFields(id)).analyses) {
        const s = fromStabilityAnalysis(a);
        expect(s.settings).toEqual(stabilityFocusSettings(id, s.kind, stabilityFocusFields(id)));
      }
  });
});
