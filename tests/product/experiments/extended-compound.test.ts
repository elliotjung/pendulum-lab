import { describe, expect, it } from 'vitest';
import { poincareSection } from '../../../src/chaos/poincare';
import {
  createPlanarSimulation,
  defaultPlanarConfig,
  type PlanarConfig
} from '../../../src/product/adapters/physics/planar';
import { compoundComparison } from '../../../src/product/experiments/extended-compound';
import type { ExtendedTrace } from '../../../src/product/experiments/extended-results';

function nativeTrace(config: PlanarConfig): ExtendedTrace[] {
  const native = createPlanarSimulation(config);
  const read = (sample: ReturnType<typeof native.snapshot>): ExtendedTrace => ({
    time: sample.time,
    state: [...sample.state],
    energy: sample.energy.total,
    positions: [sample.positions.first, sample.positions.second]
  });
  const output = [read(native.snapshot())];
  while (!native.done) output.push(read(native.step()));
  return output;
}
const settings = (overrides: Partial<PlanarConfig> = {}): PlanarConfig => ({
  ...defaultPlanarConfig('system:compound-double'),
  initialState: [0.4, 0.2, 0, 0],
  duration: 6,
  step: 0.01,
  ...overrides
});

describe('S25 matched compound and point-mass recurrence comparison', () => {
  it('retains matched physical times and original native angles for both models', () => {
    const config = settings();
    const original = structuredClone(config);
    const rod = nativeTrace(config);
    const point = nativeTrace({ ...config, systemId: 'system:double' });
    const byTime = new Map(point.map((sample) => [sample.time, sample.state[0]]));
    const result = compoundComparison(config, rod);
    const table = result.tables.find((entry) => entry.id === 'compound-time-comparison')!;
    expect(table.rows.length).toBeGreaterThan(20);
    expect(table.rows[0]?.[0]).toBe(0);
    expect(table.rows.at(-1)?.[0]).toBe(6);
    for (const row of table.rows) {
      expect(row.every(Number.isFinite)).toBe(true);
      expect(row[1]).toBe(rod.find((sample) => sample.time === row[0])?.state[0]);
      expect(row[2]).toBe(byTime.get(Number(row[0])));
    }
    expect(table.rows.some((row) => Math.abs(Number(row[1]) - Number(row[2])) > 0.01)).toBe(true);
    expect(config).toEqual(original);
  });

  it('uses rising native roots and their successive finite-time intervals for each model', () => {
    const config = settings();
    const result = compoundComparison(config, nativeTrace(config));
    const table = result.tables.find((entry) => entry.id === 'compound-crossing-intervals')!;
    for (const [name, systemId, prefix] of [
      ['균일 막대', 'system:compound-double', 'rod'],
      ['끝점 질점', 'system:double', 'point']
    ] as const) {
      const current = { ...config, systemId };
      const derivative = createPlanarSimulation(current).derivative;
      const reference = poincareSection(current.initialState, derivative, {
        section: (state) => state[0]!,
        direction: 'rising',
        dt: config.step,
        maxTime: config.duration,
        rootTol: 1e-10,
        maxPoints: 64
      });
      const rows = table.rows.filter((row) => row[0] === name);
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.map((row) => row[2])).toEqual(reference.times);
      expect(reference.directions.every((direction) => direction === 1)).toBe(true);
      expect(reference.points.every((state) => state[2]! > 0 && Math.abs(state[0]!) <= 1e-8)).toBe(true);
      expect(result.metrics.find((entry) => entry.id === `${prefix}-rising-crossings`)?.value).toBe(rows.length);
      const intervals = reference.times.slice(1).map((time, index) => time - reference.times[index]!);
      expect(rows[0]?.[3]).toBe('앞선 동방향 교차 없음');
      expect(rows.slice(1).map((row) => row[3])).toEqual(intervals);
      expect(result.metrics.find((entry) => entry.id === `${prefix}-mean-crossing-interval`)?.value).toBeCloseTo(
        intervals.reduce((sum, value) => sum + value, 0) / intervals.length,
        12
      );
    }
    expect(result.warnings.join(' ')).toMatch(/유한 시간 재귀 간격/);
    expect(result.warnings.join(' ')).toMatch(/고유한 주기를 인증하지 않습니다/);
  });

  it.each([
    ['short', settings({ duration: 0.1 })],
    ['equilibrium', settings({ initialState: [0, 0, 0, 0] })]
  ] as const)('does not invent a period or recurrence mean for the %s observation', (_name, config) => {
    const result = compoundComparison(config, nativeTrace(config));
    expect(result.metrics.some((entry) => entry.id.includes('mean-crossing-interval'))).toBe(false);
    expect(result.metrics.some((entry) => /period|frequency/.test(entry.id))).toBe(false);
    expect(result.tables.find((entry) => entry.id === 'compound-crossing-intervals')?.rows).toEqual([]);
    expect(result.metrics.every((entry) => Number.isFinite(entry.value))).toBe(true);
  });

  it('matches a fractional final step rather than the preceding rounded step', () => {
    const config = settings({ step: 0.03, duration: 0.1 });
    const rod = nativeTrace(config);
    const point = nativeTrace({ ...config, systemId: 'system:double' });
    const result = compoundComparison(config, rod);
    const table = result.tables.find((entry) => entry.id === 'compound-time-comparison')!;
    expect(rod.map((sample) => sample.time)).toEqual([0, 0.03, 0.06, 0.09, 0.1]);
    expect(table.rows.at(-1)).toEqual([0.1, rod.at(-1)!.state[0], point.at(-1)!.state[0]]);
    expect(table.rows.every((row) => row.every(Number.isFinite))).toBe(true);
  });

  it('keeps the final time row when downsampling and shifts reported crossings by physical start time', () => {
    const config = settings({ step: 0.007, duration: 6.001, startTime: 1.25 });
    const trace = nativeTrace(config);
    const shifted = compoundComparison(config, trace);
    const zero = settings({ step: config.step, duration: config.duration });
    const reference = compoundComparison(zero, nativeTrace(zero));
    const rows = shifted.tables.find((entry) => entry.id === 'compound-time-comparison')!.rows;
    expect(rows[0]?.[0]).toBe(1.25);
    expect(rows.at(-1)?.[0]).toBeCloseTo(7.251, 12);
    expect(rows.every((row) => row.every(Number.isFinite))).toBe(true);
    const crossings = shifted.tables.find((entry) => entry.id === 'compound-crossing-intervals')!.rows;
    const originals = reference.tables.find((entry) => entry.id === 'compound-crossing-intervals')!.rows;
    expect(crossings).toHaveLength(originals.length);
    crossings.forEach((row, index) => {
      expect(Number(row[2]) - Number(originals[index]?.[2])).toBeCloseTo(1.25, 12);
      expect(row[3]).toBe(originals[index]?.[3]);
    });
  });
});
