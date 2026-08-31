import { describe, expect, it } from 'vitest';
import { endpointSeparationQuantiles, type7Quantile } from '../src/app/ensembleSeparationStatistics';

describe('ensemble endpoint separation statistics', () => {
  it('pins R-7 quantiles for a regular narrow fixture', () => {
    expect(type7Quantile([0, 1, 2, 3, 4], 0.05)).toBeCloseTo(0.2, 12);
    expect(type7Quantile([0, 1, 2, 3, 4], 0.5)).toBe(2);
    expect(type7Quantile([0, 1, 2, 3, 4], 0.95)).toBeCloseTo(3.8, 12);

    const regular = endpointSeparationQuantiles(
      { x: 0, y: 0 },
      Array.from({ length: 12 }, (_, index) => ({ x: 1e-4 + index * 1e-6, y: 0 }))
    );
    expect(regular.validCount).toBe(12);
    expect(regular.warning).toBeNull();
    expect(regular.p95! - regular.p05!).toBeLessThan(2e-5);
  });

  it('resolves a broad chaotic fixture without assuming a distribution', () => {
    const chaotic = endpointSeparationQuantiles(
      { x: 0, y: 0 },
      [0.001, 0.002, 0.004, 0.008, 0.016, 0.032, 0.064, 0.128, 0.256, 0.512, 1, 1.8].map((x) => ({ x, y: 0 }))
    );
    expect(chaotic.p05).toBeLessThan(chaotic.p50!);
    expect(chaotic.p50).toBeLessThan(chaotic.p95!);
    expect(chaotic.p95! / chaotic.p05!).toBeGreaterThan(100);
  });

  it('excludes non-finite members and reports small or insufficient samples', () => {
    const summary = endpointSeparationQuantiles(
      { x: 0, y: 0 },
      [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
        { x: Number.NaN, y: 0 },
        { x: 0, y: Number.POSITIVE_INFINITY }
      ],
      5
    );
    expect(summary).toMatchObject({ validCount: 3, excludedCount: 2, warning: 'small-sample' });
    expect(summary.p50).toBe(2);

    const insufficient = endpointSeparationQuantiles({ x: 0, y: 0 }, [{ x: 1, y: 0 }]);
    expect(insufficient.warning).toBe('insufficient-sample');
  });

  it('fails closed when the reference endpoint is non-finite', () => {
    const summary = endpointSeparationQuantiles({ x: Number.NaN, y: 0 }, [
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ]);
    expect(summary).toEqual({
      p05: null,
      p50: null,
      p95: null,
      requestedCount: 2,
      validCount: 0,
      excludedCount: 2,
      warning: 'insufficient-sample'
    });
  });
});
