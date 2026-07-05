import { describe, expect, it } from 'vitest';
import { tsitouras54Step, tsitouras54StepDense } from '../src/physics/adaptive';
import type { Derivative } from '../src/physics/types';

/** Simple harmonic oscillator y'' = −y, exact solution available. */
const sho: Derivative = (s, o) => {
  o[0] = Number(s[1] ?? 0);
  o[1] = -Number(s[0] ?? 0);
};

describe('Tsitouras 5(4) dense output', () => {
  it('matches the plain step at both endpoints (b_i(1) reproduces the FSAL weights)', () => {
    const state = Float64Array.from([1, 0.3]);
    const plain = tsitouras54Step(state, 0.1, sho);
    const dense = tsitouras54StepDense(state, 0.1, sho);
    expect(Array.from(dense.y)).toEqual(Array.from(plain.y));
    expect(dense.error).toBe(plain.error);
    const out = new Float64Array(2);
    dense.interpolate(0, out);
    expect(Array.from(out)).toEqual(Array.from(state));
    // Transcription self-check: the interpolant weights at θ = 1 must
    // reproduce the 5th-order solution weights (a7j row) to the published
    // coefficient precision.
    dense.interpolate(1, out);
    for (let i = 0; i < 2; i += 1) expect(Math.abs((out[i] ?? 0) - (dense.y[i] ?? 0))).toBeLessThan(1e-10);
  });

  it('interpolates mid-step at high order (wrong weights would collapse the ratio)', () => {
    const state = Float64Array.from([1, 0]);
    const out = new Float64Array(2);
    const midError = (h: number): number => {
      const dense = tsitouras54StepDense(state, h, sho);
      dense.interpolate(0.5, out);
      const t = h / 2;
      return Math.max(Math.abs((out[0] ?? 0) - Math.cos(t)), Math.abs((out[1] ?? 0) + Math.sin(t)));
    };
    const e1 = midError(0.4);
    const e2 = midError(0.2);
    const e3 = midError(0.1);
    // 4th-order free interpolant: local error O(h^5) → ratio ≈ 32 per halving.
    expect(e1 / e2).toBeGreaterThan(20);
    expect(e2 / e3).toBeGreaterThan(20);
  });

  it('stays accurate across the whole step, not just the endpoints', () => {
    const state = Float64Array.from([0.6, -0.4]);
    const h = 0.2;
    const dense = tsitouras54StepDense(state, h, sho);
    const out = new Float64Array(2);
    for (const theta of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      dense.interpolate(theta, out);
      const t = theta * h;
      const exact0 = 0.6 * Math.cos(t) - 0.4 * Math.sin(t);
      const exact1 = -0.6 * Math.sin(t) - 0.4 * Math.cos(t);
      expect(Math.abs((out[0] ?? 0) - exact0), `theta=${theta}`).toBeLessThan(1e-7);
      expect(Math.abs((out[1] ?? 0) - exact1), `theta=${theta}`).toBeLessThan(1e-7);
    }
  });
});
