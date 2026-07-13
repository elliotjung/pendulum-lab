import { describe, expect, it } from 'vitest';
import { hankelMatrix, havokAnalysis } from '../src/research/havok';
import { thinSvd } from '../src/research/svd';
import { dynamicModeDecomposition } from '../src/research/dmd';
import { complexAbs, type Complex } from '../src/research/complexEig';
import { rhsDuffing, DUFFING_CHAOS_PRESET } from '../src/physics/duffing';
import { rk4Step } from '../src/physics/integrators';
import type { StateVector } from '../src/physics/types';

const c = (re: number, im = 0): Complex => ({ re, im });
function matchesSet(recovered: Complex[], expected: Complex[], tol: number): boolean {
  if (recovered.length !== expected.length) return false;
  const used = new Array<boolean>(recovered.length).fill(false);
  for (const e of expected) {
    let found = -1;
    for (let i = 0; i < recovered.length; i += 1) {
      if (!used[i] && complexAbs({ re: recovered[i]!.re - e.re, im: recovered[i]!.im - e.im }) < tol) {
        found = i;
        break;
      }
    }
    if (found < 0) return false;
    used[found] = true;
  }
  return true;
}

describe('Hankel matrix', () => {
  it('lays out the delay-embedded series row by row', () => {
    const h = hankelMatrix([1, 2, 3, 4, 5], 3); // rows=3, cols=3
    expect(h.rows).toBe(3);
    expect(h.cols).toBe(3);
    // H[i][j] = series[i+j].
    expect(h.data).toEqual([1, 2, 3, 2, 3, 4, 3, 4, 5]);
  });

  it('rejects too-few delays or too-short series', () => {
    expect(() => hankelMatrix([1, 2, 3], 1)).toThrow(/delays/);
    expect(() => hankelMatrix([1, 2], 2)).toThrow(/too short/);
  });
});

describe('HAVOK — eigen-time-delay coordinates of a clean signal', () => {
  it('a sinusoid Hankel matrix is rank 2 and its delay coordinates carry the frequency', () => {
    const w = 2;
    const dt = 0.02;
    const series = Array.from({ length: 1500 }, (_, k) => Math.sin(w * k * dt));
    const h = hankelMatrix(series, 50);
    const svd = thinSvd(h.data, h.rows, h.cols, { maxRank: 6 });
    // Exactly two dominant singular values (the sin/cos pair).
    expect(svd.singularValues[2]! / svd.singularValues[0]!).toBeLessThan(1e-5);
    // The two leading delay coordinates rotate at ω: DMD recovers ±ω i.
    const hv = havokAnalysis(series, dt, { delays: 50, rank: 2 });
    const dmd = dynamicModeDecomposition(hv.delayCoordinates, dt);
    expect(matchesSet(dmd.continuousEigenvalues, [c(0, w), c(0, -w)], 1e-3)).toBe(true);
  });
});

describe('HAVOK — intermittent forcing of a chaotic attractor', () => {
  it('fits the Ueda Duffing core linearly with a strongly intermittent forcing', () => {
    // Scalar x(t) on the Ueda strange attractor (engine DUFFING_CHAOS_PRESET).
    const dt = 0.01;
    const warmup = 2000;
    const samples = 6000;
    let st = Float64Array.from([0.5, 0.1, 0]) as unknown as StateVector;
    const nx = new Float64Array(3) as unknown as StateVector;
    for (let k = 0; k < warmup; k += 1) {
      rk4Step(st, dt, (a, o) => rhsDuffing(a, DUFFING_CHAOS_PRESET, o), nx);
      st = Float64Array.from(nx) as unknown as StateVector;
    }
    const series: number[] = [];
    for (let k = 0; k < samples; k += 1) {
      series.push(st[0]!);
      rk4Step(st, dt, (a, o) => rhsDuffing(a, DUFFING_CHAOS_PRESET, o), nx);
      st = Float64Array.from(nx) as unknown as StateVector;
    }

    const hv = havokAnalysis(series, dt, { delays: 100, rank: 15 });
    expect(hv.rank).toBe(15);
    // The leading r−1 coordinates close almost linearly under the forcing.
    expect(hv.reconstructionError).toBeLessThan(1e-2);
    // The defining HAVOK signature: the forcing is bursty (leptokurtic) while
    // the leading coordinate is a smooth oscillation (platykurtic).
    expect(hv.forcingExcessKurtosis).toBeGreaterThan(0.8);
    expect(hv.leadingExcessKurtosis).toBeLessThan(0);
    expect(hv.forcingExcessKurtosis - hv.leadingExcessKurtosis).toBeGreaterThan(1.5);
  });
});

describe('HAVOK input validation', () => {
  it('rejects rank < 2 and a positive-dt requirement', () => {
    const series = Array.from({ length: 200 }, (_, k) => Math.sin(0.1 * k));
    expect(() => havokAnalysis(series, 0.1, { delays: 20, rank: 1 })).toThrow(/rank/);
    expect(() => havokAnalysis(series, 0, { delays: 20, rank: 3 })).toThrow(/dt/);
  });
});
