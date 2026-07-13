import { describe, expect, it } from 'vitest';
import {
  buildSynchronizationExploration,
  magneticBasinCsv,
  magneticBasinFingerprint
} from '../src/app/researchPlusModels';
import type { MagneticBasinGrid } from '../src/physics/magneticPendulum';

describe('Research+ extended experiment view models', () => {
  it('builds a deterministic r(t) transition with the pinned Lorentzian Kc', () => {
    const first = buildSynchronizationExploration(1.4, 'mean-field', { count: 16, steps: 80, dt: 0.02 });
    const second = buildSynchronizationExploration(1.4, 'mean-field', { count: 16, steps: 80, dt: 0.02 });
    expect(first.criticalCoupling).toBeCloseTo(1, 12);
    expect(first.order).toEqual(second.order);
    expect(first.times[0]).toBe(0);
    expect(first.times.at(-1)).toBeCloseTo(1.6, 12);
    expect(first.order.every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it('exposes a finite-size local-order diagnosis for a non-local chimera seed', () => {
    const result = buildSynchronizationExploration(0, 'chimera-seed', { count: 32, steps: 1, dt: 0.02 });
    expect(result.chimera.coherentFraction).toBeGreaterThan(0);
    expect(result.chimera.incoherentFraction).toBeGreaterThan(0);
    expect(result.chimera.classification).toBe('chimera-candidate');
    expect(result.chimera.caveat).toContain('Finite-size');
  });

  it('serializes every magnetic basin cell and fingerprints labels plus convergence', () => {
    const grid: MagneticBasinGrid = {
      width: 2,
      height: 2,
      labels: Int32Array.of(0, 1, 2, 0),
      converged: Uint8Array.of(1, 1, 0, 1),
      convergedFraction: 0.75,
      meanSteps: 12,
      xRange: [-1, 1],
      yRange: [-2, 2]
    };
    const csv = magneticBasinCsv(grid);
    expect(csv.split('\n')).toHaveLength(5);
    expect(csv).toContain('-1.000000000,-2.000000000,0,1');
    expect(magneticBasinFingerprint(grid)).toMatch(/^[0-9a-f]{8}$/);
    expect(magneticBasinFingerprint({ ...grid, converged: Uint8Array.of(1, 1, 1, 1) })).not.toBe(magneticBasinFingerprint(grid));
  });
});
