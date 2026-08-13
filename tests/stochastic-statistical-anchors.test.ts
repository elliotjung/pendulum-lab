import { describe, expect, it } from 'vitest';

import { runLangevinEnsemble } from '../src/physics/stochastic';
import type { Derivative } from '../src/physics/types';

describe('runLangevinEnsemble — statistical analytic anchors', () => {
  it('free Brownian motion has variance σ²·t (MSD linear in time)', () => {
    const sigma = 0.5;
    const dt = 0.01;
    const steps = 100; // t_final = 1.0
    const zeroDrift: Derivative = (_s, out) => {
      out[0] = 0;
    };
    const result = runLangevinEnsemble({
      drift: zeroDrift,
      initialState: [0],
      diffusion: [sigma],
      dt,
      steps,
      realizations: 4000,
      seed: 7,
      recordEvery: 25
    });

    // Var[x(t)] = σ² t exactly for additive noise with zero drift.
    for (let k = 0; k < result.times.length; k += 1) {
      const t = result.times[k]!;
      const expected = sigma * sigma * t;
      const got = result.variance[k]![0]!;
      // ±8% statistical tolerance at 4000 realisations.
      if (t === 0) {
        expect(got).toBe(0);
      } else {
        expect(got).toBeGreaterThan(expected * 0.9);
        expect(got).toBeLessThan(expected * 1.1);
      }
      // Mean stays ≈ 0.
      expect(Math.abs(result.mean[k]![0]!)).toBeLessThan(0.05);
    }
  });

  it('Ornstein–Uhlenbeck relaxes the mean and reaches the stationary variance σ²/2θ', () => {
    // dx = -θ x dt + σ dW. Mean: x0 e^{-θt}. Stationary Var: σ²/(2θ).
    const theta = 2.0;
    const sigma = 0.6;
    const x0 = 1.0;
    const dt = 0.002;
    const steps = 3000; // t_final = 6.0, well past the 1/θ = 0.5 s relaxation time
    const ouDrift: Derivative = (s, out) => {
      out[0] = -theta * s[0]!;
    };
    const result = runLangevinEnsemble({
      drift: ouDrift,
      initialState: [x0],
      diffusion: [sigma],
      dt,
      steps,
      realizations: 5000,
      seed: 19,
      recordEvery: 500
    });

    const last = result.times.length - 1;
    const stationaryVar = (sigma * sigma) / (2 * theta);
    expect(result.variance[last]![0]!).toBeGreaterThan(stationaryVar * 0.9);
    expect(result.variance[last]![0]!).toBeLessThan(stationaryVar * 1.1);
    // Mean has decayed essentially to zero by t = 6 s.
    expect(Math.abs(result.mean[last]![0]!)).toBeLessThan(0.05);

    // At an intermediate time the mean tracks x0 e^{-θt}.
    const midIndex = 1; // t = 1.0 s
    const tMid = result.times[midIndex]!;
    expect(result.mean[midIndex]![0]!).toBeCloseTo(x0 * Math.exp(-theta * tMid), 1);
  });

  it('recovers the Geometric Brownian Motion moments (multiplicative noise)', () => {
    // dx = μ x dt + σ x dW. E[x(t)] = x0 e^{μt}; Var = x0² e^{2μt}(e^{σ²t} − 1).
    const mu = 0.3;
    const sigma = 0.4;
    const x0 = 1;
    const result = runLangevinEnsemble({
      drift: (s, out) => {
        out[0] = mu * s[0]!;
      },
      initialState: [x0],
      diffusion: [0], // overridden by multiplicative
      scheme: 'milstein',
      multiplicative: {
        diffusion: (s, out) => {
          out[0] = sigma * s[0]!;
        },
        diffusionPrime: (_s, out) => {
          out[0] = sigma;
        }
      },
      dt: 1e-3,
      steps: 1000,
      realizations: 8000,
      seed: 2027
    });

    const last = result.times.length - 1;
    const expectedMean = x0 * Math.exp(mu);
    const expectedVar = x0 * x0 * Math.exp(2 * mu) * (Math.exp(sigma * sigma) - 1);
    expect(result.mean[last]![0]!).toBeGreaterThan(expectedMean * 0.97);
    expect(result.mean[last]![0]!).toBeLessThan(expectedMean * 1.03);
    expect(result.variance[last]![0]!).toBeGreaterThan(expectedVar * 0.88);
    expect(result.variance[last]![0]!).toBeLessThan(expectedVar * 1.12);
  });

  it('commutative-milstein on diagonal GBM recovers the Itô moments (= diagonal Milstein)', () => {
    // 1-D B(x) = σx, ∂B/∂x = σ ⇒ commutative Milstein equals the diagonal Milstein GBM.
    const mu = 0.3;
    const sigma = 0.4;
    const x0 = 1;
    const result = runLangevinEnsemble({
      drift: (s, out) => {
        out[0] = mu * s[0]!;
      },
      initialState: [x0],
      diffusion: [0],
      scheme: 'commutative-milstein',
      matrixNoise: {
        noiseDimension: 1,
        diffusion: (s, matrix) => {
          matrix[0] = sigma * s[0]!;
        },
        jacobian: (_s, jac) => {
          jac[0] = sigma; // dB[0,0]/dx[0]
        }
      },
      dt: 1e-3,
      steps: 1000,
      realizations: 8000,
      seed: 4242
    });
    const last = result.times.length - 1;
    const expectedMean = x0 * Math.exp(mu);
    const expectedVar = x0 * x0 * Math.exp(2 * mu) * (Math.exp(sigma * sigma) - 1);
    expect(result.mean[last]![0]!).toBeGreaterThan(expectedMean * 0.97);
    expect(result.mean[last]![0]!).toBeLessThan(expectedMean * 1.03);
    expect(result.variance[last]![0]!).toBeGreaterThan(expectedVar * 0.85);
    expect(result.variance[last]![0]!).toBeLessThan(expectedVar * 1.15);
    expect(result.scheme).toBe('commutative-milstein');
    expect(result.strongOrder).toContain('only when');
    expect(result.caveats.join(' ')).toMatch(/non-commutative.*not strong order 1/i);
  });

  it('heun-stratonovich with additive matrix noise reproduces Brownian variance σ²t', () => {
    const sigma = 0.5;
    const result = runLangevinEnsemble({
      drift: (_s, out) => {
        out[0] = 0;
      },
      initialState: [0],
      diffusion: [0],
      scheme: 'heun-stratonovich',
      matrixNoise: {
        noiseDimension: 1,
        diffusion: (_s, matrix) => {
          matrix[0] = sigma; // constant ⇒ Itô = Stratonovich
        }
      },
      dt: 0.01,
      steps: 100,
      realizations: 5000,
      seed: 99,
      recordEvery: 50
    });
    const last = result.times.length - 1;
    const t = result.times[last]!;
    expect(result.variance[last]![0]!).toBeGreaterThan(sigma * sigma * t * 0.9);
    expect(result.variance[last]![0]!).toBeLessThan(sigma * sigma * t * 1.1);
  });
});
