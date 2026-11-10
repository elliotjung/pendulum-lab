import { describe, expect, it } from 'vitest';
import { rotateProject } from '../../../src/viz/phase3dMath';
import {
  projectPhaseSamples,
  PHASE_SPACE_LIMIT,
  type PhaseSample
} from '../../../src/product/lab/views/native-phase-space';
import { phaseDensityPoints } from '../../../src/product/lab/views/phase-density';

const sample = (step: number, state: readonly number[]): PhaseSample => ({ step, time: step * 0.004, state });
describe('S28 recorded phase views', () => {
  it('selects actual angle/velocity coordinates and uses the unchanged native 3D projection without modifying winding', () => {
    const rows = [sample(0, [4 * Math.PI + 0.25, -0.5, 2, -3]), sample(1, [4 * Math.PI + 0.75, 0.5, 4, -1])];
    const before = structuredClone(rows);
    const result = projectPhaseSamples(rows, [0, 2, 1], 0.6, 0.3, true);
    expect(result.points[0]!.raw).toEqual([rows[0]!.state[0], 2, -0.5]);
    expect(result.points[0]!.displayed[1]).toBe(2);
    expect(result.points[0]!.displayed[0]).toBeCloseTo(0.25, 14);
    for (const point of result.points) {
      const normalized = point.displayed.map(
        (value, i) => (value - result.bounds[i]!.center) / result.bounds[i]!.halfRange
      );
      expect(point.projected).toEqual(
        rotateProject({ x: normalized[0]!, y: normalized[1]!, z: normalized[2]! }, 0.6, 0.3)
      );
    }
    expect(rows).toEqual(before);
  });
  it('keeps both endpoints, time/order, explicit omitted counts and a strict4000-point figure cap', () => {
    const rows = Array.from({ length: 8000 }, (_, i) => sample(i, [i / 1000, -i / 1000, 1, 2]));
    const result = projectPhaseSamples(rows, [0, 1, 2], 0, 0, false);
    expect(result.retained).toBeLessThanOrEqual(PHASE_SPACE_LIMIT);
    expect(result.retained + result.omitted).toBe(rows.length);
    expect(result.points[0]!.step).toBe(0);
    expect(result.points.at(-1)!.step).toBe(7999);
    expect(result.points.at(-1)!.time).toBe(rows.at(-1)!.time);
    expect(result.points.every((p, i) => i === 0 || p.step > result.points[i - 1]!.step)).toBe(true);
  });
  it('refuses invalid omitted samples rather than hiding corrupt scientific input', () => {
    const rows = Array.from({ length: 8000 }, (_, i) => sample(i, [i, 1, 2, 3]));
    rows[1] = sample(1, [NaN, 1, 2, 3]);
    expect(() => projectPhaseSamples(rows, [0, 1, 2], 0, 0, false)).toThrow();
    expect(() => phaseDensityPoints(rows)).toThrow();
    expect(() => projectPhaseSamples([sample(0, [0, 1, 2])], [0, 1, 2], 0, 0, false)).toThrow();
    expect(() => projectPhaseSamples([sample(0, [0, 1, 2, 3])], [0, 1, 4], 0, 0, false)).toThrow();
  });
  it('normalizes huge finite ranges without overflow while retaining exact raw numbers', () => {
    const result = projectPhaseSamples(
      [sample(0, [-1e308, 0, 1e308, 0]), sample(1, [1e308, 0, -1e308, 0])],
      [0, 2, 1],
      0.6,
      0.3,
      false
    );
    expect(result.points.every((p) => Object.values(p.projected).every(Number.isFinite))).toBe(true);
    expect(result.points[0]!.raw).toEqual([-1e308, 1e308, 0]);
  });
  it('matches the preserved DensityTab pixel convention and selects triple omega1 at index3', () => {
    const rows = [sample(0, [3 * Math.PI, 0, 0, 0]), sample(1, [0, 0, 24, 0]), sample(2, [0, 0, -24, 0])];
    const result = phaseDensityPoints(rows, 640, 400);
    expect(result.points[0]).toMatchObject({ x: 640, y: 200, theta: 3 * Math.PI, omega: 0 });
    expect(result.points[1]!.y).toBe(0);
    expect(result.points[2]!.y).toBe(400);
    expect(result.clippedVelocity).toBe(2);
    expect(phaseDensityPoints([sample(0, [0, 0.1, 0.2, 3, 99, 100])]).points[0]!.omega).toBe(3);
  });
});
