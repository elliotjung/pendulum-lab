import { describe, expect, it } from 'vitest';
import { chaosFocusDeclaration } from '../../../src/product/experiments/chaos-focus-definitions';
import {
  chaosFocusCanonical,
  chaosFocusFields,
  chaosFocusSettings
} from '../../../src/product/experiments/chaos-focus-config';
import { executeChaosFocus, chaosSyntheticTone } from '../../../src/product/experiments/chaos-focus-science';
import { executeResearchFocus } from '../../../src/product/experiments/research-focus-science';
import { validateResearchResult } from '../../../src/product/experiments/research-focus-validation';
import { runCoreDiagnostic } from '../../../src/product/adapters/analysis/core/execute';
import { runAdvancedDiagnostic } from '../../../src/product/adapters/analysis/advanced/execute';
import { defaultCoreSettings } from '../../../src/product/adapters/analysis/core/settings';
import { defaultAdvancedSettings } from '../../../src/product/adapters/analysis/advanced/settings';
import { recurrenceMatrix, recurrenceQuantification } from '../../../src/chaos/rqa';
import { recurrenceNetworkMetrics } from '../../../src/chaos/recurrenceNetwork';
import { generalizedDimensions } from '../../../src/chaos/multifractal';
import { correlationDimension } from '../../../src/chaos/correlationDimension';
import { lyapunovSpectrum } from '../../../src/chaos/lyapunov';
import { createDiagnosticFlow } from '../../../src/product/adapters/analysis/core/source';
import { encodeShareToken, decodeShareToken } from '../../../src/product/persistence/share';
import type { ResearchFocusResult } from '../../../src/product/experiments/research-focus-contracts';

const ids = Array.from({ length: 13 }, (_, i) => `5.${i + 1}`);
const value = (r: ResearchFocusResult, id: string) => r.metrics.find((m) => m.id === id)!.value;
const field = (id: string) => chaosFocusFields(id);
const primaryTable = (r: ResearchFocusResult) => r.tables.find((t) => t.id === 'diagnostic-1')!;
function unwrap<T>(r: { ok: true; value: T } | { ok: false; issues: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

describe('S26 course five shared diagnostic Focus experiments', () => {
  it.each(ids)('%s executes, preserves complete restart state and passes the worker result boundary', (id) => {
    const fields = field(id),
      original = structuredClone(fields),
      progress: number[] = [];
    const result = executeResearchFocus(id, fields, (n) => progress.push(n));
    expect(validateResearchResult(result, { id: 'course5_fixture', unitId: id, fields })).toEqual(result);
    expect(fields).toEqual(original);
    expect(result.canonical.systemId).toBe('system:double');
    expect(result.metrics.every((m) => Number.isFinite(m.value))).toBe(true);
    expect(progress[0]).toBeGreaterThanOrEqual(0);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((p, i) => p >= 0 && p <= 1 && (i === 0 || p >= progress[i - 1]!))).toBe(true);
    const restored = unwrap(decodeShareToken(unwrap(encodeShareToken(result.canonical))));
    expect(restored).toEqual(result.canonical);
    expect(result.canonical.analyses.map((a) => a.id)).toEqual(chaosFocusDeclaration(id).analysisIds);
    const again = executeResearchFocus(id, fields);
    expect(again).toEqual(result);
  });
  it('keeps actual settings, units, kinds and algorithm versions in canonical state', () => {
    for (const id of ids.filter((id) => id !== '5.1')) {
      const f = field(id),
        canonical = chaosFocusCanonical(id, f),
        s = chaosFocusSettings(id, f),
        entry = canonical.analyses[0]!;
      for (const [key, v] of Object.entries(s)) {
        if (typeof v === 'string') expect(entry.options?.[key]).toBe(v);
        else
          expect(entry.settings[key]).toMatchObject({
            kind: 'scalar',
            value: v,
            unit: ['duration', 'transient'].includes(key) ? 's' : key === 'sectionValue' ? 'rad' : '1'
          });
      }
      expect(entry.algorithmVersion).toBe(
        Number(id.slice(2)) >= 10 ? 'advanced-diagnostics-v1' : 'core-diagnostics-v1'
      );
    }
  });
  it('reconstructs exact native forward delay points and loses the declared number of samples', () => {
    const base = executeChaosFocus('5.1', field('5.1')),
      changed = executeChaosFocus('5.1', { ...field('5.1'), delay: 12 });
    expect(value(base, 'embedded-points')).toBe(value(base, 'observed-samples') - 6);
    expect(value(base, 'embedded-points') - value(changed, 'embedded-points')).toBe(6);
    expect(base.tables[0]).toEqual(changed.tables[0]);
    const raw = base.tables[0]!.rows,
      embedded = base.tables.find((t) => t.id === 'configuration')!;
    expect(embedded.rows[0]![2]).toBe(raw[6]![1]);
  });
  it('checks FFT amplitude and NAFF frequency on an independent known real tone', () => {
    const f = field('5.3'),
      experiment = chaosFocusCanonical('5.3', f),
      series = chaosSyntheticTone();
    const fft = runCoreDiagnostic({
      id: 'tone_fft',
      kind: 'fft',
      experiment,
      series,
      settings: defaultCoreSettings('fft')
    });
    const peak = fft.rows.reduce((a, b) => (b[1]! > a[1]! ? b : a));
    expect(peak[0]).toBeCloseTo(0.625, 12);
    expect(peak[1]).toBeCloseTo(1, 10);
    const naff = runCoreDiagnostic({
      id: 'tone_naff',
      kind: 'naff',
      experiment,
      series,
      settings: defaultCoreSettings('naff')
    });
    const best = naff.rows.reduce((a, b) => (b[1]! > a[1]! ? b : a));
    expect(Math.abs(best[0]!) / (2 * Math.PI)).toBeCloseTo(0.625, 4);
    expect(naff.units[0]).toBe('rad/s');
    expect(fft.units[0]).toBe('Hz');
  });
  it('makes finite-record resolution smaller while keeping Nyquist fixed at longer duration', () => {
    const short = executeChaosFocus('5.2', field('5.2')),
      long = executeChaosFocus('5.2', { ...field('5.2'), duration: 16 });
    expect(value(short, 'nyquist')).toBe(value(long, 'nyquist'));
    expect(value(long, 'observed-samples')).toBeGreaterThan(value(short, 'observed-samples'));
    expect(short.tables.filter((t) => t.title.includes('분석 설정'))).toHaveLength(2);
  });
  it('preserves empty sections and uses scatter geometry without invented return segments', () => {
    const r = executeResearchFocus('5.4', { ...field('5.4'), sectionValue: 2 });
    expect(value(r, 'crossings-rising')).toBe(0);
    expect(value(r, 'crossings-falling')).toBe(0);
    expect(r.charts.find((c) => c.id === 'section-points')).toMatchObject({
      mode: 'scatter',
      series: [{ points: [] }]
    });
    expect(r.charts.some((c) => c.id === 'return-map')).toBe(false);
  });
  it('compares leading tangent growth against the exact unchanged native algorithm', () => {
    const id = '5.5',
      f = field(id),
      r = executeChaosFocus(id, f),
      flow = createDiagnosticFlow(r.canonical);
    const native = lyapunovSpectrum(flow.initial, flow.rhs, 1, {
      dt: f.step!,
      steps: f.duration! / f.step!,
      transientSteps: 0,
      renormEvery: f.renormEvery!,
      seed: 40503,
      method: 'rk4'
    });
    expect(value(r, 'largest-exponent')).toBe(native.spectrum[0]);
  });
  it('compares full finite-time spectrum volume with matched-coordinate mean divergence', () => {
    const r = executeChaosFocus('5.6', field('5.6'));
    expect(primaryTable(r).rows).toHaveLength(4);
    expect(Math.abs(value(r, 'exponent-sum') - value(r, 'mean-divergence'))).toBeLessThan(0.01);
  });
  it('evaluates SALI and FLI on the same nine distinct initial conditions without classifying them', () => {
    const r = executeChaosFocus('5.7', field('5.7')),
      grid = r.tables.find((t) => t.id === 'same-initial-grid')!;
    expect(grid.rows).toHaveLength(9);
    expect(new Set(grid.rows.map((row) => `${row[0]},${row[1]}`)).size).toBe(9);
    expect(
      grid.rows.every((row) => Number(row[2]) >= 0 && Number(row[2]) <= Math.sqrt(2) + 1e-12 && Number.isFinite(row[3]))
    ).toBe(true);
    expect(r.warnings.join(' ')).toContain('인증이 아닙니다');
  });
  it('preserves threshold censoring and does not turn missing shadowing horizons into Infinity', () => {
    const r = executeChaosFocus('5.9', { ...field('5.9'), threshold: 0.1 });
    expect(value(r, 'threshold-crossed')).toBe(0);
    expect(r.warnings.join(' ')).toContain('무한 신뢰 시간');
    expect(JSON.stringify(r)).not.toContain('Infinity');
  });
  it('RQA and recurrence network exactly reuse the same native threshold and graph conventions', () => {
    for (const id of ['5.10', '5.11']) {
      const f = field(id),
        experiment = chaosFocusCanonical(id, f),
        series = chaosSyntheticTone(256),
        settings = chaosFocusSettings(id, f),
        kind = id === '5.10' ? 'rqa' : 'recurrence-network';
      const r = runAdvancedDiagnostic({ id: 'recurrence_fixture', kind, experiment, series, settings });
      const values = series.states.slice(0, 192).map((s) => s[0]!);
      const opts = { dimension: 2, delay: 6, targetRecurrenceRate: 0.1, theiler: 1 };
      if (kind === 'rqa')
        expect((r.details as { native: unknown }).native).toEqual(
          recurrenceQuantification(values, { ...opts, lMin: 2, vMin: 2 })
        );
      else {
        const m = recurrenceMatrix(values, opts);
        for (let i = 0; i < m.size; i++)
          for (let j = Math.max(0, i - 1); j <= Math.min(m.size - 1, i + 1); j++) m.matrix[i * m.size + j] = 0;
        expect((r.details as { native: unknown }).native).toEqual(recurrenceNetworkMetrics(m.matrix, m.size));
      }
    }
  });
  it('increasing target recurrence preserves point count and does not decrease epsilon or edge count', () => {
    const a = executeChaosFocus('5.11', field('5.11'));
    const main = primaryTable(a),
      companion = a.tables.find((t) => t.title === '목표 재귀율을 1.5배로 한 비교')!;
    expect(value(a, 'comparison-epsilon')).toBeGreaterThanOrEqual(value(a, 'epsilon') - 1e-12);
    expect(companion.rows[0]![0]).toBe(main.rows[0]![0]);
    expect(companion.rows[0]![1]).toBeGreaterThanOrEqual(main.rows[0]![1] as number);
  });
  it.each(['5.10', '5.11'])(
    '%s displays recurrence points across the full native matrix under the visual cap',
    (id) => {
      const f = field(id),
        result = executeChaosFocus(id, f);
      const rows = result.tables.find((table) => table.id === 'observed-run')!.rows as readonly (readonly number[])[];
      const native = runAdvancedDiagnostic({
        id: 'recurrence_display',
        kind: id === '5.10' ? 'rqa' : 'recurrence-network',
        experiment: result.canonical,
        settings: chaosFocusSettings(id, f),
        series: {
          axisUnit: 's',
          labels: ['theta1', 'theta2', 'omega1', 'omega2'],
          units: ['rad', 'rad', 'rad/s', 'rad/s'],
          times: rows.map((row) => row[0]!),
          states: rows.map((row) => row.slice(1)),
          warnings: []
        }
      });
      const { matrix, size } = native.details as { matrix: number[]; size: number };
      const connected = matrix.flatMap((value, index) =>
        value ? [{ x: index % size, y: Math.floor(index / size) }] : []
      );
      const chart = result.charts.find((item) => item.id === 'recurrence-matrix')!,
        points = chart.series[0]!.points;
      expect(chart.mode).toBe('scatter');
      expect(points).toHaveLength(Math.min(2500, connected.length));
      expect(points[0]).toEqual(connected[0]);
      expect(points.at(-1)).toEqual(connected.at(-1));
      expect(points.every((point) => matrix[point.y * size + point.x] === 1)).toBe(true);
      expect(result.warnings.join(' ')).toContain('균일한 간격');
    }
  );
  it('checks a known circle dimension and a uniform-segment generalized spectrum', () => {
    const circle = Array.from({ length: 512 }, (_, i) => [
      Math.cos((i * 2 * Math.PI) / 512),
      Math.sin((i * 2 * Math.PI) / 512)
    ]);
    expect(
      Math.abs(
        correlationDimension(circle, { radiusCount: 64, fitLowFraction: 0.03, fitHighFraction: 0.2, theilerWindow: 1 })
          .dimension - 1
      )
    ).toBeLessThan(0.15);
    const points = Array.from({ length: 1024 }, (_, i) => [(i + 0.5) / 1024]);
    const dimensions = generalizedDimensions(points, { qs: [0, 1, 2], boxSizes: [0.5, 0.25, 0.125, 0.0625] });
    expect(dimensions.Dq.every((v) => Math.abs(v - 1) < 0.1)).toBe(true);
  });
  it('rejects malformed, nonuniform and oversized requests without changing originals', () => {
    const f = field('5.2'),
      before = structuredClone(f);
    expect(() => executeChaosFocus('5.2', { ...f, duration: 8.003 })).toThrow('균일');
    expect(() => executeChaosFocus('5.2', { ...f, window: 2 })).toThrow();
    expect(() => executeChaosFocus('5.10', { ...field('5.10'), maxSamples: 999 })).toThrow();
    expect(() => executeChaosFocus('5.2', { ...f, unknown: 1 })).toThrow();
    expect(f).toEqual(before);
    const experiment = chaosFocusCanonical('5.3', field('5.3')),
      series = chaosSyntheticTone();
    series.times[20]! += 0.01;
    expect(() =>
      runCoreDiagnostic({ id: 'bad_sampling', kind: 'fft', experiment, series, settings: defaultCoreSettings('fft') })
    ).toThrow('균일');
    const constant = chaosSyntheticTone();
    constant.states = constant.states.map(() => [1, 0]);
    expect(() =>
      runAdvancedDiagnostic({
        id: 'constant_cloud',
        kind: 'rqa',
        experiment,
        series: constant,
        settings: defaultAdvancedSettings('rqa')
      })
    ).toThrow('상수');
  });
});
