import { describe, expect, it } from 'vitest';
import { nonlinearFocusDeclaration } from '../../../src/product/experiments/nonlinear-focus-definitions';
import { executeNonlinearFocus } from '../../../src/product/experiments/nonlinear-focus-science';
import { nonlinearFocusConfig } from '../../../src/product/experiments/nonlinear-focus-config';
import { fromCanonicalPlanar } from '../../../src/product/adapters/physics/planar';
import { fromCanonicalDriven } from '../../../src/product/adapters/physics/driven';
import {
  createNonlinearSimulation,
  defaultNonlinearConfig,
  fromCanonicalNonlinear
} from '../../../src/product/adapters/physics/nonlinear';
import type { ResearchFocusResult, ResearchFields } from '../../../src/product/experiments/research-focus-contracts';

const ids = Array.from({ length: 10 }, (_, i) => `4.${i + 1}`);
const fields = (id: string): ResearchFields =>
  Object.fromEntries(nonlinearFocusDeclaration(id).fields.map((f) => [f.id, f.value]));
const results = new Map<string, ResearchFocusResult>();
/** Compute each bounded native run in its own test, rather than one aggregate startup hook. */
function nativeResult(id: string): ResearchFocusResult {
  const cached = results.get(id);
  if (cached) return cached;
  const result = executeNonlinearFocus(id, fields(id));
  results.set(id, result);
  return result;
}
const value = (id: string, key: string) => nativeResult(id)!.metrics.find((m) => m.id === key)!.value;
function finiteTree(v: unknown) {
  if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) finiteTree(x);
}

describe('S26 course four actual native experiments', () => {
  it.each(ids)('%s executes finite bounded diagnostics with exact native physical round trip', (id) => {
    const result = nativeResult(id)!,
      source = nonlinearFocusConfig(id, fields(id));
    expect(result.unitId).toBe(id);
    expect(result.metrics.length).toBeGreaterThan(0);
    expect(result.charts.length).toBeGreaterThan(0);
    finiteTree(result);
    const parsed =
      source.family === 'planar'
        ? fromCanonicalPlanar(result.canonical)
        : source.family === 'driven'
          ? fromCanonicalDriven(result.canonical)
          : fromCanonicalNonlinear(result.canonical);
    expect(parsed).toEqual({ ok: true, value: source.config });
    expect(result.canonical.analyses).toEqual([]);
    expect(result.charts.flatMap((c) => c.series).flatMap((s) => s.points).length).toBeLessThan(30000);
  });
  it('4.1 balances damping work and distinguishes conservative canonical volume', () => {
    expect(value('4.1', 'energy-change')).toBeLessThan(-1);
    expect(value('4.1', 'balance-residual')).toBeLessThan(2e-5);
    expect(value('4.1', 'canonical-volume-ratio')).toBeGreaterThan(0);
    expect(value('4.1', 'canonical-volume-ratio')).toBeLessThan(0.1);
    const passive = executeNonlinearFocus('4.1', { ...fields('4.1'), gamma: 0 });
    expect(passive.metrics.find((m) => m.id === 'canonical-volume-ratio')!.value).toBe(1);
    expect(Math.abs(passive.metrics.find((m) => m.id === 'energy-change')!.value)).toBeLessThan(1e-6);
  });
  it('4.2 native frequency sweep peaks near the linear natural scale and zero drive stays zero', () => {
    expect(value('4.2', 'sampled-peak-frequency')).toBeCloseTo(Math.sqrt(9.81), 6);
    const zero = executeNonlinearFocus('4.2', { ...fields('4.2'), amplitude: 0 });
    expect(zero.tables[0]!.rows).toHaveLength(7);
    expect(zero.tables[0]!.rows.every((r) => Math.abs(r[1] as number) < 1e-12)).toBe(true);
  });
  it('4.3 native Floquet detects the principal tongue and resolves a passive stable limit', () => {
    expect(value('4.3', 'spectral-radius')).toBeCloseTo(2.4750457859, 5);
    expect(value('4.3', 'floquet-refinement')).toBeLessThan(1e-7);
    expect(nativeResult('4.3')!.tables[0]!.rows).toHaveLength(25);
    const passive = executeNonlinearFocus('4.3', { ...fields('4.3'), epsilon: 0 });
    expect(passive.metrics.find((m) => m.id === 'spectral-radius')!.value).toBeCloseTo(1, 7);
  });
  it('4.4 compares native rapid forcing against a no-drive companion and preserves resolution rejection', () => {
    expect(value('4.4', 'averaged-curvature')).toBeCloseTo(8.19, 10);
    expect(value('4.4', 'driven-deviation')).toBeLessThan(0.2);
    expect(value('4.4', 'unforced-deviation')).toBeGreaterThan(1);
    expect(() => executeNonlinearFocus('4.4', { ...fields('4.4'), frequency: 60, step: 0.02 })).toThrow();
  });
  it('4.5 executes both native plants in open and closed loops with bounded actual force', () => {
    expect(Math.abs(value('4.5', 'cartpole-closed-angle'))).toBeLessThan(0.012);
    expect(Math.abs(value('4.5', 'inverted-closed-angle'))).toBeLessThan(1e-5);
    expect(Math.abs(value('4.5', 'cartpole-open-angle'))).toBeGreaterThan(0.1);
    expect(value('4.5', 'cartpole-max-control')).toBeLessThanOrEqual(20);
    expect(() => executeNonlinearFocus('4.5', { ...fields('4.5'), gainScale: 0 })).toThrow('안전');
  });
  it('4.6 native symmetry remains exact and zero coupling keeps the unexcited bob at rest', () => {
    expect(value('4.6', 'symmetric-defect')).toBeLessThan(1e-12);
    expect(value('4.6', 'anti-phase-frequency')).toBeGreaterThan(value('4.6', 'in-phase-frequency'));
    const uncoupled = executeNonlinearFocus('4.6', { ...fields('4.6'), coupling: 0 });
    expect(uncoupled.charts.find((c) => c.id === 'beats')!.series[1]!.points.every((p) => p.y === 0)).toBe(true);
  });
  it('4.7 actually carries sweep endpoints and separately verifies native zero-drive wells', () => {
    expect(value('4.7', 'max-sweep-gap')).toBeGreaterThan(0.5);
    const rows = nativeResult('4.7')!.tables[0]!.rows;
    expect(rows).toHaveLength(10);
    expect(rows[0]![0]).toBe('상향');
    expect(rows[5]![0]).toBe('하향');
    const base = defaultNonlinearConfig('system:duffing');
    for (const x of [-1, 1]) {
      const sim = createNonlinearSimulation({
        ...base,
        parameters: { ...base.parameters, driveAmplitude: 0 },
        initialState: [x, 0, 0],
        duration: 1
      });
      while (!sim.done) sim.step();
      expect(sim.snapshot().state.slice(0, 2)).toEqual([x, 0]);
    }
  });
  it('4.8 inner and outer runs approach the same native cycle and mu0 retains initial amplitudes', () => {
    expect(value('4.8', 'inner-tail-amplitude')).toBeGreaterThan(1.95);
    expect(value('4.8', 'outer-tail-amplitude')).toBeLessThan(2.1);
    expect(Math.abs(value('4.8', 'inner-tail-amplitude') - value('4.8', 'outer-tail-amplitude'))).toBeLessThan(0.02);
    const base = defaultNonlinearConfig('system:van-der-pol');
    const sim = createNonlinearSimulation({
      ...base,
      parameters: { mu: 0 },
      initialState: [0.2, 0],
      duration: 1,
      step: 0.005
    });
    while (!sim.done) sim.step();
    expect(sim.snapshot().state[0]).toBeCloseTo(0.2 * Math.cos(1), 9);
  });
  it('4.9 reports real stick/slip transitions and an honest empty transition table at subthreshold forcing', () => {
    expect(value('4.9', 'mode-transitions')).toBeGreaterThan(0);
    expect(value('4.9', 'friction-work')).toBeLessThan(0);
    const stopped = executeNonlinearFocus('4.9', { ...fields('4.9'), amplitude: 0.8 });
    expect(stopped.tables[0]!.rows).toEqual([]);
    expect(stopped.metrics.find((m) => m.id === 'mode-transitions')!.value).toBe(0);
    expect(stopped.charts.find((c) => c.id === 'contact-state')!.series[0]!.points.every((p) => p.y === 0)).toBe(true);
  });
  it('4.10 computes actual gain-delay candidates without claiming a UPO certificate', () => {
    expect(nativeResult('4.10')!.tables[0]!.rows).toHaveLength(9);
    expect(value('4.10', 'forcing-period')).toBeCloseTo(2 * Math.PI, 12);
    expect(value('4.10', 'smallest-periodicity-defect')).toBeGreaterThan(0);
    expect(nativeResult('4.10')!.warnings.join(' ')).toContain('UPO');
    const base = defaultNonlinearConfig('system:pyragas'),
      sim = createNonlinearSimulation({
        ...base,
        initialState: [0, 0],
        history: { kind: 'constant', state: [0, 0] },
        duration: 1
      });
    while (!sim.done) sim.step();
    expect(sim.snapshot().state).toEqual([0, 0]);
    expect(sim.snapshot().feedback).toBe(0);
  });
  it('rejects fixed-field changes, hidden inputs, wrong ids and excessive work', () => {
    expect(() => executeNonlinearFocus('4.8', { ...fields('4.8'), step: 0.001 })).toThrow();
    expect(() => executeNonlinearFocus('4.2', { ...fields('4.2'), unknown: 1 })).toThrow();
    expect(() => executeNonlinearFocus('4.11', {})).toThrow();
    expect(() => executeNonlinearFocus('4.1', { ...fields('4.1'), step: 0.001, duration: NaN })).toThrow();
  });
});
