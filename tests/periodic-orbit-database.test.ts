import { describe, expect, it } from 'vitest';
import {
  buildPeriodicOrbitDatabase,
  cycleExpansionObservable,
  cyclicOrbitDistance
} from '../src/chaos/periodicOrbitDatabase';
import type { MapFn } from '../src/chaos/chaosControl';

const logistic: MapFn = (x, out) => {
  out[0] = 4 * x[0]! * (1 - x[0]!);
};

const seeds = [[0.01], [0.2], [0.35], [0.5], [0.7], [0.85], [0.95]];

describe('periodic-orbit database and cycle expansion', () => {
  it('deduplicates cyclic rotations and reduces subperiodic roots', () => {
    const db = buildPeriodicOrbitDatabase(logistic, seeds, [1, 2]);
    expect(db.schemaVersion).toBe('pendulum-periodic-orbits/v1');
    expect(db.records.filter((record) => record.period === 1)).toHaveLength(2); // x=0 and x=3/4
    expect(db.records.filter((record) => record.period === 2)).toHaveLength(1); // two rotations, one prime orbit
    const p2 = db.records.find((record) => record.period === 2)!;
    expect(p2.points).toHaveLength(2);
    expect(p2.points[0]![0]).toBeCloseTo(0.3454915028, 8);
    expect(p2.points[1]![0]).toBeCloseTo(0.9045084972, 8);
    expect(p2.stabilityDeterminant).toBeCloseTo(5, 5); // multiplier -4 => |1-(-4)|
  });

  it('measures cyclic equivalence independently of the representative point', () => {
    const a = [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]];
    const b = [[0.3, 0.4], [0.5, 0.6], [0.1, 0.2]];
    expect(cyclicOrbitDistance(a, b)).toBeLessThan(1e-15);
    expect(cyclicOrbitDistance(a, [[0.3, 0.4]])).toBe(Infinity);
  });

  it('returns truncated Euler-product coefficients and a transparent observable estimate', () => {
    const db = buildPeriodicOrbitDatabase(logistic, seeds, [1, 2]);
    const result = cycleExpansionObservable(db.records, (point) => point[0]!, { maxPeriod: 2 });
    expect(result.usedOrbits).toBe(3);
    expect(result.zetaCoefficients).toHaveLength(3);
    expect(result.zetaCoefficients[0]).toBe(1);
    expect(result.observableDerivativeCoefficients.some((value) => value !== 0)).toBe(true);
    expect(result.weightedAverage).toBeGreaterThan(0.4);
    expect(result.weightedAverage).toBeLessThan(0.5);
    expect(result.caveat).toContain('Finite prime-cycle');
  });

  it('is deterministic across seed order and rejects empty inputs', () => {
    const a = buildPeriodicOrbitDatabase(logistic, seeds, [1, 2]);
    const b = buildPeriodicOrbitDatabase(logistic, [...seeds].reverse(), [2, 1]);
    expect(a.records.map((record) => record.id)).toEqual(b.records.map((record) => record.id));
    expect(() => buildPeriodicOrbitDatabase(logistic, [], [1])).toThrow(/seed/);
    expect(() => cycleExpansionObservable([], () => 0)).toThrow(/at least one/);
  });
});
