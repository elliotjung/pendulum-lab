import { describe, expect, test } from 'vitest';
import { ddDoublePendulumRhs, ddDoublePendulumEnergy } from '../src/validation/doubleDoublePendulum';
import { ddToNumber, ddRk4Step } from '../src/validation/doubleDouble';
import { rhsDouble, energyDouble } from '../src/physics/double';
import { rk4Step } from '../src/physics/integrators';
import type { Derivative } from '../src/physics/types';

/**
 * The double-double double-pendulum reference must (1) reproduce the trusted
 * float64 `rhsDouble`/`energyDouble` exactly (the safety net that catches any
 * algebra mistake in the port), and (2) serve as an extended-precision ground
 * truth that exposes how float64 round-off, amplified by the chaotic dynamics,
 * destroys the float64 trajectory's accuracy on a timescale of seconds — the
 * thing an in-precision reference can never reveal about itself.
 */

const paramSets = [
  { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
  { m1: 2, m2: 0.5, l1: 1.2, l2: 0.8, g: 9.81 }
];
const states = [
  [2.0, 2.5, 0, 0],
  [0.3, -1.1, 0.5, -0.7],
  [3.5, -2.9, 1.2, 0.4],
  [-4.2, 5.1, -2.0, 3.0]
];

describe('the double-double port reproduces the trusted float64 dynamics', () => {
  test('ddDoublePendulumRhs matches rhsDouble component-wise to ~machine precision', () => {
    for (const params of paramSets) {
      const ddRhs = ddDoublePendulumRhs(params);
      for (const st of states) {
        const o = new Float64Array(4);
        rhsDouble(st, params, 0, o);
        const yHi = Float64Array.from(st),
          yLo = new Float64Array(4);
        const oHi = new Float64Array(4),
          oLo = new Float64Array(4);
        ddRhs(yHi, yLo, oHi, oLo);
        for (let i = 0; i < 4; i += 1) {
          expect(Math.abs(ddToNumber([oHi[i]!, oLo[i]!]) - o[i]!)).toBeLessThan(1e-11);
        }
      }
    }
  });

  test('ddDoublePendulumEnergy matches energyDouble', () => {
    for (const params of paramSets) {
      const ddE = ddDoublePendulumEnergy(params);
      for (const st of states) {
        const ef = energyDouble(st, params).total;
        const ed = ddToNumber(ddE(Float64Array.from(st), new Float64Array(4)));
        expect(Math.abs(ef - ed)).toBeLessThan(1e-9);
      }
    }
  });
});

describe('the double-double reference exposes float64 round-off in the chaotic orbit', () => {
  const params = paramSets[0]!;
  const ddRhs = ddDoublePendulumRhs(params);
  const f64Rhs: Derivative = (s, o) => {
    rhsDouble(s, params, 0, o);
  };

  function f64Run(y0: number[], dt: number, steps: number): number[] {
    let cur = Float64Array.from(y0);
    let nxt = new Float64Array(4);
    for (let s = 0; s < steps; s += 1) {
      rk4Step(cur, dt, f64Rhs, nxt);
      [cur, nxt] = [nxt, cur];
    }
    return Array.from(cur);
  }
  function ddRun(y0: number[], dt: number, steps: number): number[] {
    const yHi = Float64Array.from(y0),
      yLo = new Float64Array(4);
    for (let s = 0; s < steps; s += 1) ddRk4Step(yHi, yLo, dt, ddRhs);
    return Array.from(yHi).map((h, i) => ddToNumber([h, yLo[i]!]));
  }
  const l2 = (a: number[], b: number[]): number => Math.hypot(...a.map((v, i) => v - b[i]!));

  test('float64 tracks the reference briefly, then chaos amplifies its round-off by orders of magnitude', () => {
    const y0 = [2.0, 2.5, 0, 0]; // chaotic
    const dt = 0.005;
    const shortDiff = l2(f64Run(y0, dt, 400), ddRun(y0, dt, 400)); // T = 2
    const longDiff = l2(f64Run(y0, dt, 2000), ddRun(y0, dt, 2000)); // T = 10

    // Short term: the float64 orbit differs from the exact-arithmetic reference
    // only by accumulated round-off (same method, same dt) — minuscule.
    expect(shortDiff).toBeLessThan(1e-10);
    // The chaotic dynamics amplify that round-off exponentially.
    expect(longDiff).toBeGreaterThan(1e-9);
    expect(longDiff).toBeLessThan(1e-2); // still a finite, faithful orbit at T = 10
    expect(longDiff).toBeGreaterThan(shortDiff * 1e4);
  });
});
