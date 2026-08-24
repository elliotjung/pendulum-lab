import { describe, expect, it } from 'vitest';
import { interpolatePendulumRenderState, renderInterpolationAlpha } from '../src/app/renderInterpolation';

describe('fixed-step render interpolation', () => {
  it('uses the wall-clock remainder only when interpolation is enabled', () => {
    expect(
      renderInterpolationAlpha({ enabled: true, timingMode: 'wall-clock', timingDebtSeconds: 0.0015, dt: 0.003 })
    ).toBeCloseTo(0.5);
    expect(
      renderInterpolationAlpha({ enabled: false, timingMode: 'wall-clock', timingDebtSeconds: 0.0015, dt: 0.003 })
    ).toBe(1);
    expect(
      renderInterpolationAlpha({ enabled: true, timingMode: 'deterministic', timingDebtSeconds: 0.0015, dt: 0.003 })
    ).toBe(1);
    expect(
      renderInterpolationAlpha({ enabled: true, timingMode: 'wall-clock', timingDebtSeconds: 0.03, dt: 0.003 })
    ).toBe(1);
  });

  it('takes the shortest angular path while interpolating velocities linearly', () => {
    const previous = Float64Array.from([Math.PI - 0.1, -1, 2, -2]);
    const current = Float64Array.from([-Math.PI + 0.1, 1, 4, 2]);
    const out = new Float64Array(4);

    interpolatePendulumRenderState(previous, current, 0.5, out);

    expect(out[0]).toBeCloseTo(Math.PI, 12);
    expect(out[1]).toBeCloseTo(0, 12);
    expect(out[2]).toBeCloseTo(3, 12);
    expect(out[3]).toBeCloseTo(0, 12);
  });

  it('rejects malformed state and alpha inputs', () => {
    expect(() => interpolatePendulumRenderState([0, 1], [0], 0.5, new Float64Array(1))).toThrow(/equally sized/);
    expect(() => interpolatePendulumRenderState([0, 1], [0, 1], 2, new Float64Array(2))).toThrow(/alpha/);
    expect(() => interpolatePendulumRenderState([0, Number.NaN], [0, 1], 0.5, new Float64Array(2))).toThrow(/finite/);
  });
});
