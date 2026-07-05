import { describe, expect, test } from 'vitest';
import { jacobianDouble, rhsDouble } from '../src/physics/double';
import {
  createChainJacobianWorkspace,
  createSphericalChainJacobianWorkspace,
  jacobianChain,
  jacobianDriven,
  jacobianSphericalChain
} from '../src/physics/jacobians';
import { createChainWorkspace, rhsChain, type ChainParameters } from '../src/physics/nPendulum';
import { DAMPED_DRIVEN_CHAOS_PRESET, rhsDriven } from '../src/physics/driven';
import {
  createSphericalChainWorkspace,
  rhsSphericalChain,
  type SphericalChainParams
} from '../src/physics/sphericalChain';
import { mulberry32, numericalJacobian } from '../src/chaos/variational';
import type { Derivative } from '../src/physics/types';

/**
 * Oracle-independence contract table: for each system the analytic
 * (hand-derived), autodiff (dual-number assembly), and finite-difference
 * (central O(h^2)) Jacobian routes are compared pairwise on a shared set of
 * seeded random states. Three independent derivations of the same tangent
 * agreeing to their respective error floors is the strongest cheap evidence
 * that none of them is transcribed wrong.
 *
 * Thresholds are measured (2026-07-04 probe, 100-200 seeded states each) and
 * pinned with >=20x margin:
 * - double rhs(double vs chain n=2)  measured 1.07e-14
 * - double analytic vs AD            measured 1.78e-14
 * - double analytic/AD vs FD         measured 7.82e-9
 * - chain n=3 AD vs FD               measured 1.27e-8
 * - driven analytic vs FD            measured 1.81e-10
 * - spherical chain n=2 AD vs FD     measured 6.22e-9
 *
 * The FD floor (~1e-8 here) is why finite differencing is the reference of
 * last resort: the N-chain GPU Jacobian-tape comparisons must budget for this
 * scale when interpreting tape-vs-CPU diffs, and analytic/AD tapes are the
 * route to tighter GPU gates before any N>3 expansion.
 */

interface JacobianRoutes {
  analytic?: (state: Float64Array, jac: Float64Array) => void;
  autodiff?: (state: Float64Array, jac: Float64Array) => void;
  rhs: Derivative;
}

interface ContractRow {
  system: string;
  dimension: number;
  trials: number;
  sampleState: (rand: () => number) => Float64Array;
  routes: JacobianRoutes;
  tolerances: { analyticVsAutodiff?: number; analyticVsFd?: number; autodiffVsFd?: number };
}

function finiteDifferenceJacobian(rhs: Derivative, state: Float64Array): Float64Array {
  const n = state.length;
  const jac = new Float64Array(n * n);
  numericalJacobian(rhs, state, n, jac, new Float64Array(n), new Float64Array(n), new Float64Array(n));
  return jac;
}

function maxAbsDiff(a: Float64Array, b: Float64Array): number {
  let max = 0;
  for (let i = 0; i < a.length; i += 1) max = Math.max(max, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  return max;
}

const doubleParams = { m1: 1.3, m2: 0.7, l1: 1.1, l2: 0.8, g: 9.81 };
const doubleGamma = 0.15;
const doubleAsChain: ChainParameters = { masses: [doubleParams.m1, doubleParams.m2], lengths: [doubleParams.l1, doubleParams.l2], g: doubleParams.g };
const doubleChainWorkspace = createChainWorkspace(2);
const doubleJacWorkspace = createChainJacobianWorkspace(2);

const chain3: ChainParameters = { masses: [1, 0.8, 0.6], lengths: [1, 0.9, 0.7], g: 9.81 };
const chain3Workspace = createChainWorkspace(3);
const chain3JacWorkspace = createChainJacobianWorkspace(3);

const drivenParams = DAMPED_DRIVEN_CHAOS_PRESET;

const spherical2: SphericalChainParams = { masses: [1, 0.7], lengths: [1, 0.8], g: 9.81, damping: 0.02 };
const spherical2Workspace = createSphericalChainWorkspace(2);
const spherical2JacWorkspace = createSphericalChainJacobianWorkspace(2);

function planarState(n: number, thetaScale: number, omegaScale: number, rand: () => number): Float64Array {
  const state = new Float64Array(2 * n);
  for (let i = 0; i < n; i += 1) state[i] = (rand() * 2 - 1) * thetaScale;
  for (let i = 0; i < n; i += 1) state[n + i] = (rand() * 2 - 1) * omegaScale;
  return state;
}

const CONTRACT_TABLE: ContractRow[] = [
  {
    system: 'double pendulum (analytic + AD-as-2-chain + FD, damped)',
    dimension: 4,
    trials: 200,
    sampleState: (rand) => planarState(2, Math.PI, 3, rand),
    routes: {
      analytic: (state, jac) => { jacobianDouble(state, doubleParams, doubleGamma, jac); },
      autodiff: (state, jac) => { jacobianChain(state, doubleAsChain, doubleGamma, jac, doubleJacWorkspace); },
      rhs: (state, out) => { rhsDouble(state, doubleParams, doubleGamma, out); }
    },
    tolerances: { analyticVsAutodiff: 1e-12, analyticVsFd: 5e-7, autodiffVsFd: 5e-7 }
  },
  {
    system: 'planar 3-chain (AD + FD, damped)',
    dimension: 6,
    trials: 100,
    sampleState: (rand) => planarState(3, Math.PI, 2, rand),
    routes: {
      autodiff: (state, jac) => { jacobianChain(state, chain3, 0.05, jac, chain3JacWorkspace); },
      rhs: (state, out) => { rhsChain(state, chain3, 0.05, out, chain3Workspace); }
    },
    tolerances: { autodiffVsFd: 5e-7 }
  },
  {
    system: 'damped driven pendulum (analytic + FD)',
    dimension: 3,
    trials: 100,
    sampleState: (rand) => new Float64Array([(rand() * 2 - 1) * Math.PI, (rand() * 2 - 1) * 2, rand() * 2 * Math.PI]),
    routes: {
      analytic: (state, jac) => { jacobianDriven(state, drivenParams, jac); },
      rhs: (state, out) => { rhsDriven(state, drivenParams, out); }
    },
    tolerances: { analyticVsFd: 5e-9 }
  },
  {
    system: 'spherical 2-chain (AD + FD, away from poles)',
    dimension: 8,
    trials: 100,
    sampleState: (rand) => {
      const state = new Float64Array(8);
      for (let i = 0; i < 2; i += 1) {
        state[2 * i] = 0.4 + rand() * 1.8;
        state[2 * i + 1] = rand() * 2 * Math.PI;
        state[4 + 2 * i] = (rand() * 2 - 1) * 1.5;
        state[4 + 2 * i + 1] = (rand() * 2 - 1) * 1.5;
      }
      return state;
    },
    routes: {
      autodiff: (state, jac) => { jacobianSphericalChain(state, spherical2, jac, spherical2JacWorkspace); },
      rhs: (state, out) => { rhsSphericalChain(state, spherical2, out, spherical2Workspace); }
    },
    tolerances: { autodiffVsFd: 5e-7 }
  }
];

describe('jacobian oracle-independence contract table', () => {
  test('the double-pendulum and 2-chain vector fields coincide (route precondition)', () => {
    const rand = mulberry32(20260704);
    let worst = 0;
    for (let trial = 0; trial < 200; trial += 1) {
      const state = planarState(2, Math.PI, 3, rand);
      const a = new Float64Array(4);
      const b = new Float64Array(4);
      rhsDouble(state, doubleParams, doubleGamma, a);
      rhsChain(state, doubleAsChain, doubleGamma, b, doubleChainWorkspace);
      worst = Math.max(worst, maxAbsDiff(a, b));
    }
    expect(worst).toBeLessThan(1e-12);
  });

  test.each(CONTRACT_TABLE.map((row) => [row.system, row] as const))('%s', (_name, row) => {
    const rand = mulberry32(20260704);
    const n = row.dimension;
    let worstAnalyticAd = 0;
    let worstAnalyticFd = 0;
    let worstAdFd = 0;
    for (let trial = 0; trial < row.trials; trial += 1) {
      const state = row.sampleState(rand);
      const fd = finiteDifferenceJacobian(row.routes.rhs, state);
      let analytic: Float64Array | null = null;
      let autodiff: Float64Array | null = null;
      if (row.routes.analytic) {
        analytic = new Float64Array(n * n);
        row.routes.analytic(state, analytic);
      }
      if (row.routes.autodiff) {
        autodiff = new Float64Array(n * n);
        row.routes.autodiff(state, autodiff);
      }
      if (analytic && autodiff) worstAnalyticAd = Math.max(worstAnalyticAd, maxAbsDiff(analytic, autodiff));
      if (analytic) worstAnalyticFd = Math.max(worstAnalyticFd, maxAbsDiff(analytic, fd));
      if (autodiff) worstAdFd = Math.max(worstAdFd, maxAbsDiff(autodiff, fd));
    }
    if (row.tolerances.analyticVsAutodiff !== undefined) expect(worstAnalyticAd).toBeLessThan(row.tolerances.analyticVsAutodiff);
    if (row.tolerances.analyticVsFd !== undefined) expect(worstAnalyticFd).toBeLessThan(row.tolerances.analyticVsFd);
    if (row.tolerances.autodiffVsFd !== undefined) expect(worstAdFd).toBeLessThan(row.tolerances.autodiffVsFd);
  });
});
