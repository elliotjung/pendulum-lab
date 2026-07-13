import { describe, expect, test } from 'vitest';
import {
  twoSum,
  twoProd,
  ddFromNumber,
  ddToNumber,
  ddAddDouble,
  ddAdd,
  ddSub,
  ddMul,
  ddMulDouble,
  ddNeg,
  ddDiv,
  ddDivDouble,
  ddSin,
  ddCos,
  ddSinCos,
  ddRk4Step,
  ddVerletStep,
  type DD
} from '../src/validation/doubleDouble';
import { rk4Step } from '../src/physics/integrators';
import type { Derivative } from '../src/physics/types';

/**
 * Double-double must (1) be *exact* on the error-free transforms it is built
 * from, (2) carry far more precision than float64 — shown by a forward/backward
 * round trip of the *time-symmetric* Verlet integrator, which isolates pure
 * round-off — and (3) serve as an exact-arithmetic reference that measures the
 * round-off the float64 RK4 accumulates. The Hénon–Heiles Hamiltonian is used
 * because its vector field is polynomial (no transcendental functions needed).
 *
 *   V = ½(x²+y²) + x²y − y³/3,  Fx = −x − 2xy,  Fy = −y − x² + y².
 */

describe('error-free transforms are exact', () => {
  test('twoSum keeps the bit float64 addition drops', () => {
    expect(twoSum(1, 1e-20)).toEqual([1, 1e-20]);
    // Baseline: plain float64 loses it.
    expect(1 + 1e-20 - 1).toBe(0);
  });

  test('twoProd reconstructs a product that overflows 53 bits', () => {
    // (2^27+1)² = 2^54 + 2^28 + 1; the trailing +1 cannot fit in one double.
    expect(twoProd(134217729, 134217729)).toEqual([18014398777917440, 1]);
  });

  test('double-double add preserves a tiny tail through cancellation', () => {
    const onePlusTiny = ddAddDouble(ddFromNumber(1), 1e-20);
    const tail = ddAddDouble(onePlusTiny, -1);
    expect(ddToNumber(tail)).toBeCloseTo(1e-20, 24);
  });

  test('ddMul/ddSub agree with float64 in the easy regime', () => {
    expect(ddToNumber(ddMul(ddFromNumber(1.5), ddFromNumber(2.25)))).toBeCloseTo(3.375, 12);
    expect(ddToNumber(ddSub(ddFromNumber(0.3), ddFromNumber(0.1)))).toBeCloseTo(0.2, 12);
  });
});

describe('double-double division', () => {
  test('ddDiv inverts multiplication to double-double precision', () => {
    const a: DD = [7, 0];
    const b: DD = [3, 0];
    const q = ddDiv(a, b);
    expect(ddToNumber(q)).toBeCloseTo(7 / 3, 14);
    // q·b must reconstruct a far below float64 ε.
    expect(Math.abs(ddToNumber(ddSub(ddMul(q, b), a)))).toBeLessThan(1e-29);
  });

  test('ddDivDouble divides by an exact integer to double-double precision', () => {
    const a: DD = ddAddDouble(ddFromNumber(1), 1e-20); // 1 + 1e-20
    const q = ddDivDouble(a, 7);
    expect(Math.abs(ddToNumber(ddSub(ddMulDouble(q, 7), a)))).toBeLessThan(1e-30);
  });
});

describe('double-double sin/cos', () => {
  const samples = [0, 0.3, -1.1, Math.PI / 4, 2.0, -3.5, 6.7, 12.3, -20.4];

  test('agree with Math.sin/Math.cos to float64 precision', () => {
    for (const x of samples) {
      expect(ddToNumber(ddSin(ddFromNumber(x)))).toBeCloseTo(Math.sin(x), 13);
      expect(ddToNumber(ddCos(ddFromNumber(x)))).toBeCloseTo(Math.cos(x), 13);
    }
  });

  test('satisfy sin²+cos² = 1 to double-double precision (float64 only manages ~1e-16)', () => {
    for (const x of samples) {
      const [s, c] = ddSinCos(ddFromNumber(x));
      const residual = ddToNumber(ddSub(ddAdd(ddMul(s, s), ddMul(c, c)), ddFromNumber(1)));
      expect(Math.abs(residual)).toBeLessThan(1e-29);
    }
  });

  test('satisfy the angle-addition identity to double-double precision', () => {
    const x = ddFromNumber(0.9);
    const y = ddFromNumber(1.7);
    const [sx, cx] = ddSinCos(x);
    const [sy, cy] = ddSinCos(y);
    const sinSum = ddSin(ddAdd(x, y));
    const expected = ddAdd(ddMul(sx, cy), ddMul(cx, sy)); // sin(x+y)=sx cy + cx sy
    expect(Math.abs(ddToNumber(ddSub(sinSum, expected)))).toBeLessThan(1e-29);
  });
});

// --- Hénon–Heiles vector field, in float64 and double-double -------------------

const f64Rhs: Derivative = (s, o) => {
  o[0] = s[2] ?? 0;
  o[1] = s[3] ?? 0;
  o[2] = -(s[0] ?? 0) - 2 * (s[0] ?? 0) * (s[1] ?? 0);
  o[3] = -(s[1] ?? 0) - (s[0] ?? 0) * (s[0] ?? 0) + (s[1] ?? 0) * (s[1] ?? 0);
};

const ddRhs = (yHi: Float64Array, yLo: Float64Array, outHi: Float64Array, outLo: Float64Array): void => {
  const x: DD = [yHi[0] ?? 0, yLo[0] ?? 0];
  const y: DD = [yHi[1] ?? 0, yLo[1] ?? 0];
  outHi[0] = yHi[2] ?? 0;
  outLo[0] = yLo[2] ?? 0; // ẋ = px
  outHi[1] = yHi[3] ?? 0;
  outLo[1] = yLo[3] ?? 0; // ẏ = py
  const fx = ddNeg(ddAdd(x, ddMulDouble(ddMul(x, y), 2))); // −x − 2xy
  const fy = ddSub(ddSub(ddMul(y, y), y), ddMul(x, x)); // y² − y − x²
  outHi[2] = fx[0];
  outLo[2] = fx[1];
  outHi[3] = fy[0];
  outLo[3] = fy[1];
};

const ddForce = (qHi: Float64Array, qLo: Float64Array, outHi: Float64Array, outLo: Float64Array): void => {
  const x: DD = [qHi[0] ?? 0, qLo[0] ?? 0];
  const y: DD = [qHi[1] ?? 0, qLo[1] ?? 0];
  const fx = ddNeg(ddAdd(x, ddMulDouble(ddMul(x, y), 2)));
  const fy = ddSub(ddSub(ddMul(y, y), y), ddMul(x, x));
  outHi[0] = fx[0];
  outLo[0] = fx[1];
  outHi[1] = fy[0];
  outLo[1] = fy[1];
};

/** Plain float64 Störmer–Verlet for the same separable system. */
function f64Verlet(q: number[], p: number[], dt: number, steps: number): void {
  const F = (qx: number, qy: number): [number, number] => [-qx - 2 * qx * qy, -qy - qx * qx + qy * qy];
  for (let s = 0; s < steps; s += 1) {
    let [fx, fy] = F(q[0]!, q[1]!);
    p[0]! += (dt / 2) * fx;
    p[1]! += (dt / 2) * fy;
    q[0]! += dt * p[0]!;
    q[1]! += dt * p[1]!;
    [fx, fy] = F(q[0]!, q[1]!);
    p[0]! += (dt / 2) * fx;
    p[1]! += (dt / 2) * fy;
  }
}

describe('double-double carries ~15 more digits than float64 (Verlet round trip)', () => {
  test('forward+backward Verlet returns to the start far more precisely in double-double', () => {
    // A bounded but energetic Hénon–Heiles orbit (E ≈ 0.148 < the escape energy
    // 1/6) over a long round trip, so float64 round-off accumulates to a clearly
    // visible level while double-double stays at its ~1e-31 floor.
    const q0 = [0, 0.35];
    const p0 = [0.45, 0];
    const dt = 0.01;
    const steps = 8000;

    // float64 round trip.
    const qf = [...q0],
      pf = [...p0];
    f64Verlet(qf, pf, dt, steps);
    f64Verlet(qf, pf, -dt, steps);
    const f64Err =
      Math.abs(qf[0]! - q0[0]!) + Math.abs(qf[1]! - q0[1]!) + Math.abs(pf[0]! - p0[0]!) + Math.abs(pf[1]! - p0[1]!);

    // double-double round trip.
    const qHi = Float64Array.from(q0),
      qLo = new Float64Array(2);
    const pHi = Float64Array.from(p0),
      pLo = new Float64Array(2);
    for (let s = 0; s < steps; s += 1) ddVerletStep(qHi, qLo, pHi, pLo, dt, ddForce);
    for (let s = 0; s < steps; s += 1) ddVerletStep(qHi, qLo, pHi, pLo, -dt, ddForce);
    const ddErr =
      Math.abs(ddToNumber([qHi[0]!, qLo[0]!]) - q0[0]!) +
      Math.abs(ddToNumber([qHi[1]!, qLo[1]!]) - q0[1]!) +
      Math.abs(ddToNumber([pHi[0]!, pLo[0]!]) - p0[0]!) +
      Math.abs(ddToNumber([pHi[1]!, pLo[1]!]) - p0[1]!);

    expect(f64Err).toBeGreaterThan(1e-14); // float64 round-off is clearly visible (~5e-14)
    expect(ddErr).toBeLessThan(1e-22); // double-double is essentially exact (~1e-31)
    expect(ddErr).toBeLessThan(f64Err * 1e-6); // ≥ 6 orders of magnitude better (actually ~17)
  });
});

describe('double-double RK4 is an exact-arithmetic reference for the float64 RK4', () => {
  function integrate(rhsKind: 'f64' | 'dd', y0: number[], dt: number, steps: number): number[] {
    if (rhsKind === 'f64') {
      let cur = Float64Array.from(y0);
      let nxt = new Float64Array(y0.length);
      for (let s = 0; s < steps; s += 1) {
        rk4Step(cur, dt, f64Rhs, nxt);
        [cur, nxt] = [nxt, cur];
      }
      return Array.from(cur);
    }
    const yHi = Float64Array.from(y0),
      yLo = new Float64Array(y0.length);
    for (let s = 0; s < steps; s += 1) ddRk4Step(yHi, yLo, dt, ddRhs);
    return Array.from(yHi).map((h, i) => ddToNumber([h, yLo[i]!]));
  }

  test('float64 RK4 matches the double-double reference, with round-off that grows over time', () => {
    const y0 = [0.0, 0.1, 0.45, 0.0]; // bounded Hénon–Heiles orbit
    const dt = 0.005;

    const l2 = (a: number[], b: number[]): number => Math.hypot(...a.map((v, i) => v - b[i]!));

    const shortDiff = l2(integrate('f64', y0, dt, 200), integrate('dd', y0, dt, 200));
    const longDiff = l2(integrate('f64', y0, dt, 4000), integrate('dd', y0, dt, 4000));

    // At short time the two methods (identical dt/order) differ only by float64 round-off.
    expect(shortDiff).toBeLessThan(1e-11);
    // Round-off accumulates (and is amplified by the dynamics) over the longer run.
    expect(longDiff).toBeGreaterThan(shortDiff);
    expect(longDiff).toBeLessThan(1e-3); // still a faithful orbit, not blow-up
  });
});
