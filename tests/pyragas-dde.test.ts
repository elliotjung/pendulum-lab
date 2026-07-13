import { describe, expect, it } from 'vitest';
import { integratePyragasPendulumDde, pyragasFeedback, rhsPyragasPendulum } from '../src/physics/pyragasDde';

describe('Pyragas time-delay pendulum', () => {
  it('makes feedback non-invasive when current and delayed states coincide', () => {
    expect(pyragasFeedback(1.2, 1.2, 50)).toBe(0);
    const out = new Float64Array(2);
    rhsPyragasPendulum(
      [0.4, 0.2],
      [0.4, -99],
      0,
      {
        g: 0,
        length: 1,
        damping: 0,
        feedbackGain: 3,
        delay: 1
      },
      out
    );
    expect(Array.from(out)).toEqual([0.2, 0]);
  });

  it('reduces to exact constant-velocity motion when all accelerations vanish', () => {
    const result = integratePyragasPendulumDde(
      [0.3, -0.4],
      {
        g: 0,
        length: 1,
        damping: 0,
        feedbackGain: 0,
        delay: 0.2
      },
      { dt: 0.01, duration: 1 }
    );
    expect(result.finalState[0]).toBeCloseTo(-0.1, 12);
    expect(result.finalState[1]).toBeCloseTo(-0.4, 12);
    expect(result.method).toContain('method-of-steps');
  });

  it('uses the negative-time history through the first delay interval', () => {
    // For t<tau: theta'' = 1-theta, theta(0)=theta'(0)=0, so theta=1-cos(t).
    const result = integratePyragasPendulumDde(
      [0, 0],
      {
        g: 0,
        length: 1,
        damping: 0,
        feedbackGain: 1,
        delay: 1
      },
      {
        dt: 0.002,
        duration: 0.5,
        history: () => [1, 0]
      }
    );
    expect(result.finalState[0]).toBeCloseTo(1 - Math.cos(0.5), 8);
    expect(result.finalState[1]).toBeCloseTo(Math.sin(0.5), 8);
  });

  it('is deterministic, decimates output, and rejects an implicit within-step delay', () => {
    const parameters = { g: 1, length: 1, damping: 0.1, feedbackGain: 0.2, delay: 0.1 };
    const options = { dt: 0.01, duration: 0.4, recordEvery: 5 };
    const a = integratePyragasPendulumDde([0.2, 0], parameters, options);
    const b = integratePyragasPendulumDde([0.2, 0], parameters, options);
    expect(a).toEqual(b);
    expect(a.times).toHaveLength(9);
    expect(() => integratePyragasPendulumDde([0, 0], { ...parameters, delay: 0.001 }, options)).toThrow(/delay >= dt/);
  });
});
