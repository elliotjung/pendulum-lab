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

describe('runLangevinEnsemble — deterministic and reproducibility contracts', () => {
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
    const expected =
      state[0]! + 0.5 * (a * state[0]! + a * predictor) * dt + 0.5 * (b * state[0]! + b * predictor) * dW;
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

    const lie0 = sigma * state[0]! * sigma;
    const lie1 = sigma * state[1]! * sigma;
    expect(out[0]!).toBeCloseTo(state[0]! + sigma * state[1]! * dW + 0.5 * lie0 * (dW * dW - dt), 14);
    expect(out[1]!).toBeCloseTo(state[1]! + sigma * state[0]! * dW + 0.5 * lie1 * (dW * dW - dt), 14);
  });
});

describe('matrix-noise ensemble schemes (Heun / commutative Milstein wired into runLangevinEnsemble)', () => {
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
      runLangevinEnsemble({
        ...base,
        scheme: 'euler-maruyama',
        matrixNoise: {
          noiseDimension: 1,
          diffusion: (_s: StateVector, m: number[]) => {
            m[0] = 0.1;
          }
        }
      } as unknown as LangevinEnsembleSpec)
    ).toThrow(/matrixNoise requires/);
    // commutative-milstein requires the diffusion jacobian.
    expect(() =>
      runLangevinEnsemble({
        ...base,
        scheme: 'commutative-milstein',
        matrixNoise: {
          noiseDimension: 1,
          diffusion: (_s: StateVector, m: number[]) => {
            m[0] = 0.1;
          }
        }
      } as unknown as LangevinEnsembleSpec)
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
    expect(grid.increment(0, grid.steps, 0)).toBeCloseTo(
      grid.increment(0, 128, 0) + grid.increment(128, grid.steps, 0),
      12
    );
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
    const adaptive = runAdaptiveLangevinPath({
      drift,
      diffusion: [0],
      initialState: [1],
      grid,
      absoluteTolerance: 1e-6,
      relativeTolerance: 1e-6
    });
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
