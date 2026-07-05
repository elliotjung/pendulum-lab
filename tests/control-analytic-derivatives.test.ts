import { describe, expect, test } from 'vitest';
import { jacobianDoubleActuated, rhsDoubleActuated } from '../src/control/actuated';
import {
  boxQpSolve,
  ilqrSolve,
  ilqrSolveAsync,
  makeDoublePendulumControlledSystem,
  makeDoublePendulumStepMap,
  makeDoubleSwingUpProblem,
  makeRk4StepDerivatives
} from '../src/control/ilqr';
import { matZeros } from '../src/control/lqr';
import { mulberry32 } from '../src/chaos/variational';

const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };

describe('jacobianDoubleActuated', () => {
  test('matches central differences of the actuated RHS at nonzero torque', () => {
    const rng = mulberry32(0xdeed);
    for (let trial = 0; trial < 12; trial += 1) {
      const state = new Float64Array([rng() * 6 - 3, rng() * 6 - 3, rng() * 4 - 2, rng() * 4 - 2]);
      const tau = [rng() * 8 - 4, rng() * 8 - 4];
      const gamma = trial % 2 === 0 ? 0 : 0.15;
      const jac = new Float64Array(16);
      jacobianDoubleActuated(state, params, gamma, tau, jac);

      const h = 1e-6;
      const plus = new Float64Array(4);
      const minus = new Float64Array(4);
      const probe = new Float64Array(4);
      for (let j = 0; j < 4; j += 1) {
        probe.set(state);
        probe[j] = state[j]! + h;
        rhsDoubleActuated(probe, params, gamma, tau, plus);
        probe[j] = state[j]! - h;
        rhsDoubleActuated(probe, params, gamma, tau, minus);
        for (let i = 0; i < 4; i += 1) {
          const fd = ((plus[i] ?? 0) - (minus[i] ?? 0)) / (2 * h);
          expect(Math.abs((jac[i * 4 + j] ?? 0) - fd)).toBeLessThan(2e-5);
        }
      }
    }
  });

  test('reduces to jacobianDouble semantics at zero torque (torque term adds nothing)', () => {
    const state = new Float64Array([1.1, -0.7, 0.4, -0.9]);
    const withTau = new Float64Array(16);
    const zeroTau = new Float64Array(16);
    jacobianDoubleActuated(state, params, 0.1, [0, 0], zeroTau);
    jacobianDoubleActuated(state, params, 0.1, [1e-300, 0], withTau);
    for (let i = 0; i < 16; i += 1) expect(Math.abs((withTau[i] ?? 0) - (zeroTau[i] ?? 0))).toBeLessThan(1e-12);
  });
});

describe('analytic RK4 step-map derivatives (chain rule through the stages)', () => {
  test('agree with finite differences of the actual step map for full and acrobot modes', () => {
    const rng = mulberry32(0xfeed);
    for (const mode of ['full', 'acrobot'] as const) {
      const dt = 0.02;
      const system = makeDoublePendulumControlledSystem(params, 0.05, mode);
      const derivatives = makeRk4StepDerivatives(system, dt);
      const stepMap = makeDoublePendulumStepMap(params, 0.05, dt, mode);
      const m = system.m;

      const x = new Float64Array([rng() * 4 - 2, rng() * 4 - 2, rng() * 2 - 1, rng() * 2 - 1]);
      const u = Array.from({ length: m }, () => rng() * 6 - 3);
      const fx = matZeros(4, 4);
      const fu = matZeros(4, m);
      derivatives(x, u, fx, fu);

      const h = 1e-6;
      const plus = new Float64Array(4);
      const minus = new Float64Array(4);
      const probe = new Float64Array(4);
      for (let j = 0; j < 4; j += 1) {
        probe.set(x);
        probe[j] = x[j]! + h;
        stepMap(probe, u, plus);
        probe[j] = x[j]! - h;
        stepMap(probe, u, minus);
        for (let i = 0; i < 4; i += 1) {
          const fd = ((plus[i] ?? 0) - (minus[i] ?? 0)) / (2 * h);
          expect(Math.abs((fx[i]![j] ?? 0) - fd), `${mode} fx[${i}][${j}]`).toBeLessThan(1e-6);
        }
      }
      const uProbe = u.slice();
      for (let c = 0; c < m; c += 1) {
        uProbe[c] = u[c]! + h;
        stepMap(x, uProbe, plus);
        uProbe[c] = u[c]! - h;
        stepMap(x, uProbe, minus);
        uProbe[c] = u[c]!;
        for (let i = 0; i < 4; i += 1) {
          const fd = ((plus[i] ?? 0) - (minus[i] ?? 0)) / (2 * h);
          expect(Math.abs((fu[i]![c] ?? 0) - fd), `${mode} fu[${i}][${c}]`).toBeLessThan(1e-6);
        }
      }
    }
  });

  test('iLQR reaches the same swing-up quality with analytic and finite-difference derivatives', () => {
    const spec = { parameters: params, gamma: 0, dt: 0.025, horizon: 120 };
    const analytic = makeDoubleSwingUpProblem(spec);
    const finiteDiff = makeDoubleSwingUpProblem(spec);
    delete finiteDiff.derivatives;
    const a = ilqrSolve(analytic, { maxIterations: 150 });
    const f = ilqrSolve(finiteDiff, { maxIterations: 150 });
    // Same problem, derivative floors 1e-16 vs ~1e-9: costs must agree closely.
    expect(Math.abs(a.cost - f.cost)).toBeLessThan(0.05 * Math.max(a.cost, f.cost));
    const xa = a.xs[a.xs.length - 1]!;
    expect(Math.abs(xa[0]! - Math.PI)).toBeLessThan(0.05);
    expect(Math.abs(xa[1]! - Math.PI)).toBeLessThan(0.05);
  }, 30_000);

  test('ilqrSolveAsync matches the synchronous result and reports progress chunks', async () => {
    const problem = makeDoubleSwingUpProblem({ parameters: params, gamma: 0, dt: 0.025, horizon: 80 });
    const progress: number[] = [];
    const asyncResult = await ilqrSolveAsync(problem, {
      maxIterations: 60,
      chunkIterations: 15,
      onProgress: (partial) => progress.push(partial.cost)
    });
    expect(progress.length).toBeGreaterThan(1);
    // Concatenated history stays non-increasing across chunk boundaries.
    for (let i = 1; i < asyncResult.costHistory.length; i += 1) {
      expect(asyncResult.costHistory[i]!).toBeLessThanOrEqual(asyncResult.costHistory[i - 1]! + 1e-12);
    }
    const sync = ilqrSolve(problem, { maxIterations: 60 });
    expect(Math.abs(asyncResult.cost - sync.cost)).toBeLessThan(0.1 * Math.max(1, sync.cost));
  }, 30_000);
});

describe('boxQpSolve (exact active-set box QP, m <= 3)', () => {
  test('returns the unconstrained optimum when it lies inside the box', () => {
    // H = I, g = [-0.5, 0.3]: optimum u = -g inside [-1, 1]^2.
    const result = boxQpSolve([[1, 0], [0, 1]], [-0.5, 0.3], [-1, -1], [1, 1]);
    expect(result).not.toBeNull();
    expect(result!.u[0]).toBeCloseTo(0.5, 12);
    expect(result!.u[1]).toBeCloseTo(-0.3, 12);
    expect(result!.free).toEqual([true, true]);
  });

  test('clamps to the correct face with KKT-consistent gradients', () => {
    // 1D: minimise ½u² - 10u on [-1, 1] → u = 1 (upper bound).
    const clamped = boxQpSolve([[1]], [-10], [-1], [1]);
    expect(clamped).not.toBeNull();
    expect(clamped!.u[0]).toBe(1);
    expect(clamped!.free).toEqual([false]);
    // 2D coupled: one dimension clamps, the free one re-optimises around it.
    const H = [[2, 0.5], [0.5, 1]];
    const g = [-8, 0.2];
    const result = boxQpSolve(H, g, [-1, -1], [1, 1]);
    expect(result).not.toBeNull();
    expect(result!.u[0]).toBe(1); // wants u0 = ~4, clamps at 1
    // Free dim: 0.5·u0 + 1·u1 + 0.2 = 0 → u1 = -0.7.
    expect(result!.u[1]).toBeCloseTo(-0.7, 12);
    expect(result!.free).toEqual([false, true]);
  });

  test('rejects a non-positive-definite Hessian', () => {
    expect(boxQpSolve([[-1]], [0.5], [-1], [1])).toBeNull();
  });

  test('box-DDP swing-up saturates cleanly at a tight torque limit', () => {
    const problem = makeDoubleSwingUpProblem({
      parameters: params,
      gamma: 0,
      dt: 0.025,
      horizon: 120,
      torqueLimit: 6
    });
    const result = ilqrSolve(problem, { maxIterations: 200 });
    for (const u of result.us) {
      for (const value of u) expect(Math.abs(value)).toBeLessThanOrEqual(6 + 1e-12);
    }
    for (let i = 1; i < result.costHistory.length; i += 1) {
      expect(result.costHistory[i]!).toBeLessThan(result.costHistory[i - 1]!);
    }
    // The optimiser must actually use the limit surface (bang segments exist).
    const saturated = result.us.filter((u) => Math.abs(Math.abs(u[0] ?? 0) - 6) < 1e-9).length;
    expect(saturated).toBeGreaterThan(0);
  }, 30_000);
});
