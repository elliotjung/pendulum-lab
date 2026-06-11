import { describe, expect, test } from 'vitest';
import { rhsDouble, energyDouble } from '../src/physics/double';
import { rhsTriple } from '../src/physics/triple';
import { energyTriple } from '../src/physics/energy';
import { createChainWorkspace, rhsChain, energyChain, type ChainParameters } from '../src/physics/nPendulum';
import { rhsSpring, energySpring, type SpringPendulumParameters } from '../src/physics/spring';
import { rhsDriven, energyDriven, DAMPED_DRIVEN_CHAOS_PRESET } from '../src/physics/driven';
import { rk4Step, leapfrogStep } from '../src/physics/integrators';

function maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < a.length; i += 1) m = Math.max(m, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  return m;
}

describe('N-pendulum generalization reduces to the existing systems', () => {
  test('rhsChain (N=2) matches rhsDouble to machine epsilon', () => {
    const params = { m1: 1.3, m2: 0.7, l1: 1.1, l2: 0.9, g: 9.81 };
    const chain: ChainParameters = { masses: [params.m1, params.m2], lengths: [params.l1, params.l2], g: params.g };
    const state = new Float64Array([0.6, -0.4, 0.3, -0.2]);
    const gamma = 0.12;
    const a = new Float64Array(4);
    const b = new Float64Array(4);
    rhsDouble(state, params, gamma, a);
    rhsChain(state, chain, gamma, b);
    expect(maxAbsDiff(a, b)).toBeLessThan(1e-12);
  });

  test('rhsChain (N=3) matches rhsTriple to machine epsilon', () => {
    const params = { m1: 1, m2: 1.4, m3: 0.6, l1: 1, l2: 1.2, l3: 0.8, g: 9.81 };
    const chain: ChainParameters = {
      masses: [params.m1, params.m2, params.m3],
      lengths: [params.l1, params.l2, params.l3],
      g: params.g
    };
    const state = new Float64Array([0.5, -0.3, 0.2, 0.1, -0.15, 0.05]);
    const gamma = 0.07;
    const a = new Float64Array(6);
    const b = new Float64Array(6);
    rhsTriple(state, params, gamma, a);
    rhsChain(state, chain, gamma, b);
    expect(maxAbsDiff(a, b)).toBeLessThan(1e-12);
  });

  test('energyChain matches energyDouble and energyTriple', () => {
    const dParams = { m1: 1.3, m2: 0.7, l1: 1.1, l2: 0.9, g: 9.81 };
    const dState = new Float64Array([0.6, -0.4, 0.3, -0.2]);
    expect(
      Math.abs(
        energyChain(dState, { masses: [dParams.m1, dParams.m2], lengths: [dParams.l1, dParams.l2], g: dParams.g }).total -
          energyDouble(dState, dParams).total
      )
    ).toBeLessThan(1e-12);

    const tParams = { m1: 1, m2: 1.4, m3: 0.6, l1: 1, l2: 1.2, l3: 0.8, g: 9.81 };
    const tState = new Float64Array([0.5, -0.3, 0.2, 0.1, -0.15, 0.05]);
    expect(
      Math.abs(
        energyChain(tState, {
          masses: [tParams.m1, tParams.m2, tParams.m3],
          lengths: [tParams.l1, tParams.l2, tParams.l3],
          g: tParams.g
        }).total - energyTriple(tState, tParams).total
      )
    ).toBeLessThan(1e-12);
  });

  test('quadruple pendulum (N=4) integrates without NaN and conserves energy (undamped RK4)', () => {
    const chain: ChainParameters = { masses: [1, 1, 1, 1], lengths: [1, 1, 1, 1], g: 9.81 };
    const rhs = (s: Float64Array, o: Float64Array) => {
      rhsChain(s, chain, 0, o);
    };
    const state = new Float64Array([0.4, 0.3, 0.2, 0.1, 0, 0, 0, 0]);
    const out = new Float64Array(8);
    const e0 = energyChain(state, chain).total;
    for (let i = 0; i < 2000; i += 1) {
      rk4Step(state, 0.001, rhs, out);
      state.set(out);
    }
    expect(Number.isFinite(state[0] ?? NaN)).toBe(true);
    const e1 = energyChain(state, chain).total;
    expect(Math.abs((e1 - e0) / e0)).toBeLessThan(1e-3);
  });

  test('rejects mismatched masses/lengths instead of silently truncating N', () => {
    expect(() => rhsChain([0, 0, 0, 0], { masses: [1, 1], lengths: [1], g: 9.81 }, 0, new Float64Array(4))).toThrow(/same length/);
    expect(() => energyChain([0, 0], { masses: [1], lengths: [], g: 9.81 })).toThrow(/same length/);
  });

  test('workspace-backed RHS matches the allocation path for N = 5', () => {
    const chain: ChainParameters = { masses: [1, 0.8, 1.2, 0.9, 1.1], lengths: [1, 0.7, 1.1, 0.9, 0.8], g: 9.81 };
    const state = new Float64Array([0.4, -0.2, 0.7, -0.5, 0.1, 0.2, -0.1, 0.3, -0.4, 0.5]);
    const a = new Float64Array(10);
    const b = new Float64Array(10);
    rhsChain(state, chain, 0.03, a);
    rhsChain(state, chain, 0.03, b, createChainWorkspace(5));
    expect(maxAbsDiff(a, b)).toBeLessThan(1e-14);
  });
});

describe('spring (elastic) pendulum', () => {
  const params: SpringPendulumParameters = { mass: 1, stiffness: 40, restLength: 1, g: 9.81 };

  test('conserves total energy under leapfrog over many steps', () => {
    const rhs = (s: Float64Array, o: Float64Array) => {
      rhsSpring(s, params, o);
    };
    const state = new Float64Array([1.3, 0.5, 0, 0]); // stretched and displaced
    const out = new Float64Array(4);
    const e0 = energySpring(state, params).total;
    let maxDrift = 0;
    for (let i = 0; i < 20000; i += 1) {
      leapfrogStep(state, 0.002, rhs, out);
      state.set(out);
      maxDrift = Math.max(maxDrift, Math.abs((energySpring(state, params).total - e0) / e0));
    }
    expect(Number.isFinite(state[0] ?? NaN)).toBe(true);
    expect(maxDrift).toBeLessThan(1e-2);
  });
});

describe('driven / damped-driven pendulum', () => {
  test('undriven damped pendulum loses energy and settles toward the bottom', () => {
    const params = { g: 9.81, length: 1, damping: 0.6, driveAmplitude: 0, driveFrequency: 0 };
    const rhs = (s: Float64Array, o: Float64Array) => {
      rhsDriven(s, params, o);
    };
    const state = new Float64Array([2.5, 0, 0]);
    const out = new Float64Array(3);
    const e0 = energyDriven(state, params).total;
    for (let i = 0; i < 20000; i += 1) {
      rk4Step(state, 0.002, rhs, out);
      state.set(out);
    }
    const e1 = energyDriven(state, params).total;
    expect(e1).toBeLessThan(e0);
    // Should be near rest at the bottom: theta ~ 0 (mod 2pi), small omega.
    expect(Math.abs(state[1] ?? 1)).toBeLessThan(0.05);
  });

  test('damped-driven chaos preset stays bounded and shows sensitive dependence', () => {
    const params = DAMPED_DRIVEN_CHAOS_PRESET;
    const rhs = (s: Float64Array, o: Float64Array) => {
      rhsDriven(s, params, o);
    };
    const a = new Float64Array([0.2, 0, 0]);
    const b = new Float64Array([0.2 + 1e-9, 0, 0]);
    const oa = new Float64Array(3);
    const ob = new Float64Array(3);
    let maxSep = 0;
    // The 1e-9 seed needs ~140 time units to grow macroscopic at this exponent.
    for (let i = 0; i < 40000; i += 1) {
      rk4Step(a, 0.005, rhs, oa);
      a.set(oa);
      rk4Step(b, 0.005, rhs, ob);
      b.set(ob);
      maxSep = Math.max(maxSep, Math.abs((a[0] ?? 0) - (b[0] ?? 0)) + Math.abs((a[1] ?? 0) - (b[1] ?? 0)));
    }
    expect(Number.isFinite(a[0] ?? NaN)).toBe(true);
    expect(Number.isFinite(b[0] ?? NaN)).toBe(true);
    // A 1e-9 perturbation grows to an order-1 separation: positive Lyapunov exponent.
    expect(maxSep).toBeGreaterThan(0.5);
  });
});
