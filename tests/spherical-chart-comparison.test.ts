import { describe, expect, test } from 'vitest';
import { compareSphericalCharts } from '../src/physics/sphericalChartComparison';

/**
 * Measured (2026-07-05 probe, dt=1e-3, N=2 chain m=[1,0.7] l=[1,0.8]):
 * - regular IC, T=5:   maxDist 7.5e-9; polar E drift 1.9e-9; embedded E drift 1.1e-12.
 * - chaotic IC, T=0.5: maxDist 3.0e-12 (charts identical before Lyapunov growth).
 * - chaotic IC, T=5:   final dist 2.3e-3, growing monotonically across samples.
 * - near-pole IC, T=2: maxDist 4.1e-11 (embedded chart regular, no clamp stress).
 */
const params = { masses: [1, 0.7], lengths: [1, 0.8], g: 9.81, damping: 0 };
const REGULAR_IC = [0.8, 0, 0.9, Math.PI / 3, 0.1, 0.6, -0.1, 0.4];
const CHAOTIC_IC = [2.4, 0, 2.8, 1.2, 0.5, 1.5, -0.7, 0.9];

describe('polar vs embedded spherical-chain chart comparison', () => {
  test('regular trajectories: the two charts agree to integrator precision over 5s', () => {
    const result = compareSphericalCharts(params, REGULAR_IC, { dt: 0.001, totalTime: 5 });
    expect(result.n).toBe(2);
    expect(result.maxBobDistance).toBeLessThan(1e-6);
    expect(result.polar.energyDrift).toBeLessThan(1e-6);
    expect(result.embedded.energyDrift).toBeLessThan(1e-9);
    expect(result.embedded.unitConstraintError).toBeLessThan(1e-10);
    expect(result.samples.length).toBe(10);
    expect(result.caveat).toContain('pole');
  });

  test('chaotic trajectories: identical at short horizon, Lyapunov-divergent at long horizon', () => {
    const short = compareSphericalCharts(params, CHAOTIC_IC, { dt: 0.001, totalTime: 0.5, sampleEvery: 0.1 });
    expect(short.maxBobDistance).toBeLessThan(1e-9);

    const long = compareSphericalCharts(params, CHAOTIC_IC, { dt: 0.001, totalTime: 5 });
    expect(long.finalBobDistance).toBeGreaterThan(1e-5);
    expect(long.finalBobDistance).toBeLessThan(1);
    const first = long.samples[0]!.maxBobDistance;
    const last = long.samples[long.samples.length - 1]!.maxBobDistance;
    expect(last).toBeGreaterThan(first * 1e3);
  });

  test('near-pole initial conditions stay in agreement (embedded chart regularity)', () => {
    const result = compareSphericalCharts(params, [0.01, 0, 0.02, 0.5, 0.05, 2.0, 0.05, 1.0], { dt: 0.001, totalTime: 2, sampleEvery: 0.25 });
    expect(result.maxBobDistance).toBeLessThan(1e-8);
  });

  test('damped runs switch the caveat and both charts dissipate together', () => {
    const damped = compareSphericalCharts({ ...params, damping: 0.3 }, REGULAR_IC, { dt: 0.001, totalTime: 2, sampleEvery: 0.5 });
    expect(damped.caveat).toContain('Damped');
    expect(damped.maxBobDistance).toBeLessThan(1e-6);
  });

  test('rejects non-positive horizons and steps', () => {
    expect(() => compareSphericalCharts(params, REGULAR_IC, { dt: 0 })).toThrow();
    expect(() => compareSphericalCharts(params, REGULAR_IC, { totalTime: -1 })).toThrow();
    expect(() => compareSphericalCharts(params, REGULAR_IC, { sampleEvery: 0 })).toThrow();
  });
});
