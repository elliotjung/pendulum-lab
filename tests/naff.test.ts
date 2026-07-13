import { describe, expect, it } from 'vitest';
import { naffDecompose, naffFundamentalFrequency, type NaffComponent } from '../src/chaos/naff';
import { standardMapStep } from '../src/physics/standardMap';

function nearest(components: NaffComponent[], target: number): NaffComponent {
  let best = components[0]!;
  let bestErr = Infinity;
  for (const c of components) {
    const e = Math.abs(c.frequency - target);
    if (e < bestErr) {
      bestErr = e;
      best = c;
    }
  }
  return best;
}

describe('NAFF — sub-bin frequency precision', () => {
  it('recovers two off-bin frequencies and amplitudes far below FFT resolution', () => {
    const n = 2000;
    const dt = 0.05;
    const w1 = 0.8371;
    const w2 = 1.61803;
    const re: number[] = [];
    const im: number[] = [];
    for (let k = 0; k < n; k += 1) {
      const t = k * dt;
      re.push(Math.cos(w1 * t) + 0.5 * Math.cos(w2 * t));
      im.push(Math.sin(w1 * t) + 0.5 * Math.sin(w2 * t));
    }
    const binWidth = (2 * Math.PI) / (n * dt); // ≈ 0.0628
    const comps = naffDecompose(re, im, dt, 2);

    const c1 = nearest(comps, w1);
    const c2 = nearest(comps, w2);
    // Frequencies to ~1e-5, i.e. ≳ 1000× better than the FFT bin.
    expect(Math.abs(c1.frequency - w1)).toBeLessThan(1e-5);
    expect(Math.abs(c2.frequency - w2)).toBeLessThan(1e-5);
    expect(Math.abs(c1.frequency - w1)).toBeLessThan(binWidth / 100);
    // Amplitudes.
    expect(c1.amplitude).toBeCloseTo(1, 3);
    expect(c2.amplitude).toBeCloseTo(0.5, 3);
  });

  it('recovers a single real-cosine frequency', () => {
    const n = 1024;
    const dt = 0.1;
    const w = 1.2345;
    const re = Array.from({ length: n }, (_, k) => Math.cos(w * k * dt));
    const im = new Array<number>(n).fill(0);
    // A real cosine has ±ω; the dominant line is at |ω| = w.
    const f = naffFundamentalFrequency(re, im, dt);
    expect(Math.abs(Math.abs(f) - w)).toBeLessThan(1e-4);
  });
});

describe('NAFF frequency-map — KAM vs chaos on the standard map', () => {
  function frequencyDrift(K: number, theta0: number, p0: number, half: number): number {
    const re: number[] = [];
    const im: number[] = [];
    let theta = theta0;
    let p = p0;
    for (let n = 0; n < 2 * half; n += 1) {
      re.push(Math.cos(theta));
      im.push(Math.sin(theta));
      const next = standardMapStep(theta, p, K);
      theta = next.theta;
      p = next.p;
    }
    const f1 = naffFundamentalFrequency(re.slice(0, half), im.slice(0, half), 1);
    const f2 = naffFundamentalFrequency(re.slice(half), im.slice(half), 1);
    return Math.abs(f1 - f2);
  }

  it('a regular (KAM) orbit has an essentially constant rotation frequency', () => {
    // Below K_c with p0 on a rotational torus: frequency is stable across windows.
    expect(frequencyDrift(0.2, 0.1, 1.0, 1024)).toBeLessThan(1e-4);
  });

  it('a chaotic orbit drifts in frequency by orders of magnitude more', () => {
    expect(frequencyDrift(5.0, 0.1, 0.0, 1024)).toBeGreaterThan(0.05);
  });
});

describe('NAFF input validation', () => {
  it('rejects bad arguments', () => {
    expect(() => naffDecompose([1, 2], [0, 0], 0.1, 1)).toThrow(/at least 4/);
    expect(() => naffDecompose([1, 2, 3, 4], [0, 0, 0, 0], 0, 1)).toThrow(/dt/);
    expect(() => naffDecompose([1, 2, 3, 4], [0, 0, 0], 0.1, 1)).toThrow(/equal length/);
    expect(() => naffDecompose([1, 2, 3, 4], [0, 0, 0, 0], 0.1, 0)).toThrow(/terms/);
  });
});
