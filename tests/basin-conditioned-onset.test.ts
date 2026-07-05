import { describe, expect, test } from 'vitest';
import { DAMPED_DRIVEN_CHAOS_PRESET } from '../src/physics/driven';
import { melnikovCriticalAmplitude } from '../src/chaos/melnikov';
import { basinChaoticFraction, basinConditionedOnset } from '../src/chaos/basinConditionedOnset';

/**
 * Measured (2026-07-05 probe, default 4x4 grid, dt=0.02, 12000 steps):
 * - fraction: A=0.95 -> 0, A=1.05 -> 0, A=1.15 -> 1.0, A=1.2 -> 1.0,
 *   A=1.35 -> 0 (the classic periodic window above the chaotic band).
 * - onset(target 0.25, bracket [1.05, 1.15]) = 1.0836 (bracket 1.0828..1.0844),
 *   ratio to Melnikov A_c = 1.0188 is 1.064 - consistent with the literature
 *   period-doubling accumulation near A = 1.083 for gamma=0.5, omega=2/3.
 */
const p = DAMPED_DRIVEN_CHAOS_PRESET;

describe('basin-conditioned chaos onset (driven pendulum)', () => {
  test('chaotic fraction is 0 below the Melnikov threshold and saturates in the chaotic band', () => {
    const below = basinChaoticFraction(p, 0.95);
    expect(below.chaoticFraction).toBe(0);
    expect(below.total).toBe(16);
    const inside = basinChaoticFraction(p, 1.2);
    expect(inside.chaoticFraction).toBeGreaterThanOrEqual(0.9);
    expect(Math.max(...inside.lambdas)).toBeGreaterThan(0.08);
  });

  test('the band is non-monotone: A=1.35 falls in a periodic window (why brackets are explicit)', () => {
    const window = basinChaoticFraction(p, 1.35);
    expect(window.chaoticFraction).toBeLessThan(0.25);
  });

  test('onset sits above the analytic Melnikov tangle threshold, near the period-doubling accumulation', () => {
    const onset = basinConditionedOnset(p, [1.05, 1.15], 0.25, {}, 5);
    expect(onset.onsetAmplitude).toBeGreaterThan(1.07);
    expect(onset.onsetAmplitude).toBeLessThan(1.1);
    expect(onset.melnikovAmplitude).toBeCloseTo(melnikovCriticalAmplitude(p), 12);
    expect(onset.onsetToMelnikovRatio).toBeGreaterThan(1.03);
    expect(onset.onsetToMelnikovRatio).toBeLessThan(1.15);
    expect(onset.bracket[1] - onset.bracket[0]).toBeLessThanOrEqual(0.1 / 2 ** 5 + 1e-12);
    expect(onset.evaluations.length).toBe(2 + 5);
    expect(onset.caveat).toContain('4x4 grid');
    expect(onset.caveat).toContain('Melnikov');
  });

  test('refuses to report an onset when the bracket does not straddle the target', () => {
    const cheap = { lyapunov: { dt: 0.02, steps: 2_000, transientSteps: 500 } };
    expect(() => basinConditionedOnset(p, [0.7, 0.95], 0.25, cheap, 2)).toThrow(/bracket does not straddle/);
    expect(() => basinConditionedOnset(p, [0.9, 0.5], 0.25)).toThrow(/bracket/);
    expect(() => basinConditionedOnset(p, [0.9, 1.2], 1.5)).toThrow(/fractionTarget/);
  });
});
