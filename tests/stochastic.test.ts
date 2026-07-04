import { describe, it, expect } from 'vitest';
import {
  gaussianSampler,
  runLangevinEnsemble,
  eulerMaruyamaStep,
  milsteinStep,
  stochasticHeunStratonovichStep,
  commutativeMilsteinStep,
  buildBrownianGrid,
  runAdaptiveLangevinPath,
  fixedGridLangevinPath,
  type LangevinEnsembleSpec,
  type AdaptiveLangevinSpec
} from '../src/physics/stochastic';
import { rhsDouble } from '../src/physics/double';
import type { Derivative, StateVector } from '../src/physics/types';

describe('gaussianSampler', () => {
  it('produces a standard normal stream (mean≈0, var≈1) deterministically', () => {
    const g = gaussianSampler(12345);
    const n = 200_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i += 1) {
      const x = g();
      sum += x;
      sumSq += x * x;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(variance).toBeCloseTo(1, 1);
  });

  it('is reproducible for a given seed', () => {
    const a = gaussianSampler(42);
    const b = gaussianSampler(42);
    for (let i = 0; i < 50; i += 1) expect(a()).toBe(b());
  });
});

describe('runLangevinEnsemble — analytic anchors', () => {
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
    // dx = -θ x dt + σ dW.  Mean: x0 e^{-θt}.  Stationary Var: σ²/(2θ).
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

  it('zero diffusion reduces Euler–Maruyama to deterministic Euler', () => {
    // With σ = 0 the ensemble variance must be exactly 0 and the mean equals a
    // single deterministic Euler trajectory of the double pendulum.
    const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
    const drift: Derivative = (s, out) => {
      rhsDouble(s, params, 0, out);
    };
    const ic = [0.4, 0.2, 0, 0];
    const dt = 1e-3;
    const steps = 500;

    const ensemble = runLangevinEnsemble({
      drift,
      initialState: ic,
      diffusion: [0, 0, 0, 0],
      dt,
      steps,
      realizations: 3,
      seed: 1
    });

    // Reference deterministic Euler.
    const state = Float64Array.from(ic) as StateVector;
    const out = new Float64Array(4) as StateVector;
    for (let s = 0; s < steps; s += 1) {
      drift(state, out);
      for (let i = 0; i < 4; i += 1) state[i] = state[i]! + out[i]! * dt;
    }

    const last = ensemble.times.length - 1;
    for (let i = 0; i < 4; i += 1) {
      expect(ensemble.variance[last]![i]!).toBe(0);
      expect(ensemble.mean[last]![i]!).toBeCloseTo(state[i]!, 10);
    }
  });

  it('is bit-for-bit reproducible across runs with the same seed', () => {
    const spec: LangevinEnsembleSpec = {
      drift: (s, out) => {
        out[0] = -s[0]!;
      },
      initialState: [1],
      diffusion: [0.3],
      dt: 0.01,
      steps: 50,
      realizations: 100,
      seed: 2024
    };
    const a = runLangevinEnsemble(spec);
    const b = runLangevinEnsemble(spec);
    expect(b.mean).toEqual(a.mean);
    expect(b.variance).toEqual(a.variance);
  });

  it('eulerMaruyamaStep with zero noise equals a plain Euler step', () => {
    const drift: Derivative = (s, out) => {
      out[0] = 2 * s[0]!;
      out[1] = -s[1]!;
    };
    const state = Float64Array.from([1, 1]) as StateVector;
    const out = new Float64Array(2) as StateVector;
    eulerMaruyamaStep(state, 0.1, drift, [0, 0], gaussianSampler(0), out);
    expect(out[0]!).toBeCloseTo(1 + 2 * 1 * 0.1, 12);
    expect(out[1]!).toBeCloseTo(1 + -1 * 0.1, 12);
  });
});

describe('Milstein scheme & multiplicative noise', () => {
  it('milsteinStep with additive noise (σ′=0) equals eulerMaruyamaStep', () => {
    const drift: Derivative = (s, out) => {
      out[0] = -0.5 * s[0]!;
    };
    const state = Float64Array.from([1.2]) as StateVector;
    const em = new Float64Array(1) as StateVector;
    const mil = new Float64Array(1) as StateVector;
    // Identical Gaussian streams ⇒ the two steppers must agree exactly.
    eulerMaruyamaStep(state, 0.05, drift, [0.4], gaussianSampler(123), em);
    milsteinStep(state, 0.05, drift, [0.4], [0], gaussianSampler(123), mil);
    expect(mil[0]!).toBe(em[0]!);
  });

  it('recovers the Geometric Brownian Motion moments (multiplicative noise)', () => {
    // dx = μ x dt + σ x dW.  E[x(t)] = x0 e^{μt};  Var = x0² e^{2μt}(e^{σ²t} − 1).
    const mu = 0.3;
    const sigma = 0.4;
    const x0 = 1;
    const dt = 1e-3;
    const steps = 1000; // t = 1.0
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
      dt,
      steps,
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

  it('Milstein equals Euler–Maruyama for constant additive diffusion (ensemble)', () => {
    const spec: LangevinEnsembleSpec = {
      drift: (s, out) => {
        out[0] = -s[0]!;
      },
      initialState: [1],
      diffusion: [0.3],
      dt: 0.01,
      steps: 40,
      realizations: 200,
      seed: 5
    };
    const em = runLangevinEnsemble({ ...spec, scheme: 'euler-maruyama' });
    const mil = runLangevinEnsemble({ ...spec, scheme: 'milstein' });
    expect(mil.mean).toEqual(em.mean);
    expect(mil.variance).toEqual(em.variance);
  });

  it('throws when Milstein is requested without σ′ for multiplicative noise', () => {
    expect(() =>
      runLangevinEnsemble({
        drift: (s, out) => {
          out[0] = 0;
        },
        initialState: [1],
        diffusion: [0],
        scheme: 'milstein',
        multiplicative: {
          diffusion: (s, out) => {
            out[0] = 0.2 * s[0]!;
          }
        },
        dt: 0.01,
        steps: 10,
        realizations: 4
      })
    ).toThrow(/diffusionPrime/);
  });

  it('stochastic Heun applies the Stratonovich predictor-corrector formula', () => {
    const a = -0.3;
    const b = 0.7;
    const state = Float64Array.from([1.2]) as StateVector;
    const out = new Float64Array(1) as StateVector;
    const dt = 0.04;
    const xi = 0.25;
    const dW = Math.sqrt(dt) * xi;

    stochasticHeunStratonovichStep(
      state,
      dt,
      (s, o) => {
        o[0] = a * s[0]!;
      },
      1,
      (s, matrix) => {
        matrix[0] = b * s[0]!;
      },
      () => xi,
      out
    );

    const predictor = state[0]! + a * state[0]! * dt + b * state[0]! * dW;
    const expected = state[0]! + 0.5 * (a * state[0]! + a * predictor) * dt + 0.5 * (b * state[0]! + b * predictor) * dW;
    expect(out[0]!).toBeCloseTo(expected, 14);
  });

  it('commutativeMilsteinStep handles non-diagonal state-coupled diffusion', () => {
    const sigma = 0.4;
    const state = Float64Array.from([2, 3]) as StateVector;
    const out = new Float64Array(2) as StateVector;
    const dt = 0.05;
    const xi = 0.7;
    const dW = Math.sqrt(dt) * xi;

    commutativeMilsteinStep(
      state,
      dt,
      (_s, o) => {
        o[0] = 0;
        o[1] = 0;
      },
      1,
      (s, matrix) => {
        matrix[0] = sigma * s[1]!;
        matrix[1] = sigma * s[0]!;
      },
      (_s, jac) => {
        jac[0] = 0;
        jac[1] = sigma;
        jac[2] = sigma;
        jac[3] = 0;
      },
      () => xi,
      out
    );

    const lie0 = (sigma * state[0]!) * sigma;
    const lie1 = (sigma * state[1]!) * sigma;
    expect(out[0]!).toBeCloseTo(state[0]! + sigma * state[1]! * dW + 0.5 * lie0 * (dW * dW - dt), 14);
    expect(out[1]!).toBeCloseTo(state[1]! + sigma * state[0]! * dW + 0.5 * lie1 * (dW * dW - dt), 14);
  });
});

describe('matrix-noise ensemble schemes (Heun / commutative Milstein wired into runLangevinEnsemble)', () => {
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

  it('rejects mismatched scheme/matrixNoise combinations', () => {
    const base = {
      drift: (_s: number[], out: number[]) => {
        out[0] = 0;
      },
      initialState: [1],
      diffusion: [0.1],
      dt: 0.01,
      steps: 10,
      realizations: 4
    };
    // matrixNoise requires a matrix scheme.
    expect(() =>
      runLangevinEnsemble({ ...base, scheme: 'euler-maruyama', matrixNoise: { noiseDimension: 1, diffusion: (_s: StateVector, m: number[]) => { m[0] = 0.1; } } } as unknown as LangevinEnsembleSpec)
    ).toThrow(/matrixNoise requires/);
    // commutative-milstein requires the diffusion jacobian.
    expect(() =>
      runLangevinEnsemble({ ...base, scheme: 'commutative-milstein', matrixNoise: { noiseDimension: 1, diffusion: (_s: StateVector, m: number[]) => { m[0] = 0.1; } } } as unknown as LangevinEnsembleSpec)
    ).toThrow(/jacobian/);
    // a matrix scheme without matrixNoise.
    expect(() =>
      runLangevinEnsemble({ ...base, scheme: 'heun-stratonovich' } as unknown as LangevinEnsembleSpec)
    ).toThrow(/requires matrixNoise/);
  });
});

describe('adaptive SDE integration over a frozen Brownian grid', () => {
  it('a Brownian grid increment is additive across subintervals (consistent refinement)', () => {
    const grid = buildBrownianGrid(1, 8, 1, 7);
    // ΔW[0,256] = ΔW[0,128] + ΔW[128,256] exactly.
    expect(grid.increment(0, grid.steps, 0)).toBeCloseTo(grid.increment(0, 128, 0) + grid.increment(128, grid.steps, 0), 12);
  });

  it('σ = 0 reduces to an adaptive Euler ODE that tracks the true decay while coarsening', () => {
    // dx = -x dt, x(1) = e^{-1}. With no noise the adaptive stepper is a step-doubling
    // adaptive Euler: it must track the true solution and take steps coarser than the fine grid.
    // (Under relative-tolerance control the local error dt²|x|/(rtol|x|) is uniform, so the
    // optimal step here is *constant* — adaptivity shows up as coarsening below the fine grid.)
    const grid = buildBrownianGrid(1, 14, 1, 1);
    const drift: Derivative = (s, out) => {
      out[0] = -s[0]!;
    };
    const adaptive = runAdaptiveLangevinPath({ drift, diffusion: [0], initialState: [1], grid, absoluteTolerance: 1e-6, relativeTolerance: 1e-6 });
    const xEnd = adaptive.states[adaptive.states.length - 1]![0]!;
    expect(xEnd).toBeCloseTo(Math.exp(-1), 3); // adaptive Euler tracks the true decay
    expect(adaptive.acceptedSteps).toBeLessThan(grid.steps); // coarsened well below the fine grid
    expect(adaptive.maxDt).toBeGreaterThan(grid.dt); // and the accepted step is coarser than a fine node
  });

  it('pathwise: the adaptive solution stays close to the all-fine EM on the SAME path', () => {
    // dx = μx dt + σx dW (GBM). Adaptive and all-fine Milstein share one Brownian path,
    // so the adaptive solution stays within the controlled coarsening error — strong
    // (pathwise) convergence, not just a moment match.
    const mu = 0.5;
    const sigma = 0.3;
    const grid = buildBrownianGrid(1, 16, 1, 20240617);
    const spec: AdaptiveLangevinSpec = {
      drift: (s, out) => {
        out[0] = mu * s[0]!;
      },
      diffusion: (s, out) => {
        out[0] = sigma * s[0]!;
      },
      diffusionPrime: (_s, out) => {
        out[0] = sigma;
      },
      initialState: [1],
      grid,
      base: 'milstein',
      absoluteTolerance: 1e-5,
      relativeTolerance: 1e-5
    };
    const adaptive = runAdaptiveLangevinPath(spec);
    const fine = fixedGridLangevinPath(spec);
    const xEnd = adaptive.states[adaptive.states.length - 1]![0]!;
    expect(Math.abs(xEnd - fine[0]!)).toBeLessThan(2e-2 * Math.abs(fine[0]!));
    expect(adaptive.acceptedSteps).toBeLessThan(grid.steps); // genuinely coarser than all-fine
  });

  it('is reproducible for a given grid seed', () => {
    const spec: AdaptiveLangevinSpec = {
      drift: (s, out) => {
        out[0] = -2 * s[0]!;
      },
      diffusion: [0.4],
      initialState: [1],
      grid: buildBrownianGrid(0.5, 12, 1, 555),
      absoluteTolerance: 1e-4,
      relativeTolerance: 1e-4
    };
    const a = runAdaptiveLangevinPath(spec);
    const b = runAdaptiveLangevinPath(spec);
    expect(a.states[a.states.length - 1]).toEqual(b.states[b.states.length - 1]);
    expect(a.acceptedSteps).toBe(b.acceptedSteps);
  });
});

describe('stochastic validation and recording contracts', () => {
  it('records the final sample even when recordEvery does not divide the run', () => {
    const result = runLangevinEnsemble({
      drift: (_s, out) => {
        out[0] = 1;
      },
      initialState: [0],
      diffusion: [0],
      dt: 0.1,
      steps: 5,
      realizations: 2,
      seed: 17,
      recordEvery: 2
    });

    expect(result.times).toEqual([0, 0.2, 0.4, 0.5]);
    expect(result.mean.map((row) => row[0])).toEqual([0, 0.2, 0.4, 0.5]);
    expect(result.variance.map((row) => row[0])).toEqual([0, 0, 0, 0]);
  });

  it('rejects ensemble specs that cannot define statistics or time evolution', () => {
    const base: LangevinEnsembleSpec = {
      drift: (_s, out) => {
        out[0] = 0;
      },
      initialState: [0],
      diffusion: [0],
      dt: 0.1,
      steps: 1,
      realizations: 2
    };
    expect(() => runLangevinEnsemble({ ...base, initialState: [] })).toThrow(/empty initial state/);
    expect(() => runLangevinEnsemble({ ...base, realizations: 1 })).toThrow(/at least 2/);
    expect(() => runLangevinEnsemble({ ...base, steps: 0 })).toThrow(/steps/);
    expect(() => runLangevinEnsemble({ ...base, recordEvery: 0 })).toThrow(/recordEvery/);
  });

  it('rejects Brownian grids whose time, level, or dimension cannot form a dyadic path', () => {
    expect(() => buildBrownianGrid(0, 4, 1)).toThrow(/totalTime/);
    expect(() => buildBrownianGrid(1, 0, 1)).toThrow(/levels/);
    expect(() => buildBrownianGrid(1, 25, 1)).toThrow(/levels/);
    expect(() => buildBrownianGrid(1, 4, 0)).toThrow(/dimension/);
  });

  it('rejects adaptive paths when the frozen Brownian dimension differs from the state', () => {
    const grid = buildBrownianGrid(1, 4, 1, 123);
    expect(() =>
      runAdaptiveLangevinPath({
        drift: (_s, out) => {
          out[0] = 0;
          out[1] = 0;
        },
        diffusion: [0, 0],
        initialState: [0, 0],
        grid
      })
    ).toThrow(/grid dimension/);
  });
});
