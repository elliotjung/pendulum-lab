import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObservedDoublePendulumCsv } from '../src/research/experimentalDataImport';
import { fitDoublePendulum } from '../src/research/parameterEstimation';

/**
 * End-to-end regression for the theory-vs-hardware lane
 * (docs/hardware-validation.md): the committed tracker fixture — a seeded
 * synthetic camera emulation with pixel projection and sub-pixel noise — must
 * round-trip through import → angle extraction → LM fit and recover the
 * ground-truth parameters within tight relative error, at the injected noise
 * floor. If the importer conventions (pivot, y-down), the forward model, or
 * the optimiser regress, this fit drifts and the tolerances catch it.
 */

const CSV = 'data/experimental/double-pendulum-tracker.csv';
const META = 'data/experimental/double-pendulum-tracker.meta.json';

interface Meta {
  import: { pivot: { x: number; y: number }; yAxis: 'down' | 'up' };
  truth: { m1: number; m2: number; l1: number; l2: number; g: number; gamma: number };
  fit: { estimate: ReadonlyArray<'l1' | 'l2' | 'g'>; initialGuess: number[]; fixed: { m1: number; m2: number; gamma: number } };
}

describe('hardware comparison pipeline (tracked fixture)', () => {
  const meta = JSON.parse(readFileSync(META, 'utf8')) as Meta;
  const observation = parseObservedDoublePendulumCsv(readFileSync(CSV, 'utf8'), {
    pivot: meta.import.pivot,
    yAxis: meta.import.yAxis
  });

  it('recovers l1, l2 and g from pixel-space tracking data within 1%', () => {
    const fit = fitDoublePendulum(observation, {
      initialState: [observation.angles[0]![0], observation.angles[0]![1], 0, 0],
      estimateInitialAngles: true,
      base: { m1: meta.fit.fixed.m1, m2: meta.fit.fixed.m2, l1: 0.3, l2: 0.3, g: 9.5 },
      gamma: meta.fit.fixed.gamma,
      estimate: meta.fit.estimate,
      initialGuess: meta.fit.initialGuess
    });
    expect(fit.converged).toBe(true);
    // Noise floor: 0.7 px tracker jitter ≈ 6 mrad angle noise.
    expect(fit.rmse).toBeLessThan(0.01);
    expect(Math.abs(fit.estimated.l1! - meta.truth.l1) / meta.truth.l1).toBeLessThan(0.01);
    expect(Math.abs(fit.estimated.l2! - meta.truth.l2) / meta.truth.l2).toBeLessThan(0.01);
    expect(Math.abs(fit.estimated.g! - meta.truth.g) / meta.truth.g).toBeLessThan(0.01);
    // Uncertainty must be reported for every estimated quantity (3 physical + 2 initial angles).
    expect(fit.standardErrors).toHaveLength(5);
    expect(fit.standardErrors.every(Number.isFinite)).toBe(true);
  });

  it('echoes fixed initial angles when co-estimation is off (API contract)', () => {
    const initialState: [number, number, number, number] = [
      observation.angles[0]![0],
      observation.angles[0]![1],
      0,
      0
    ];
    const fit = fitDoublePendulum(
      { times: observation.times.slice(0, 60), angles: observation.angles.slice(0, 60) },
      {
        initialState,
        base: { m1: meta.fit.fixed.m1, m2: meta.fit.fixed.m2, l1: 0.32, l2: 0.24, g: 9.8 },
        gamma: meta.fit.fixed.gamma,
        estimate: ['g'],
        initialGuess: [9.8]
      }
    );
    expect(fit.initialAngles[0]).toBe(initialState[0]);
    expect(fit.initialAngles[1]).toBe(initialState[1]);
    expect(fit.standardErrors).toHaveLength(1);
  });
});
