import { describe, expect, test } from 'vitest';
import {
  DualArena,
  dAdd,
  dAddScaled,
  dClampAbsMin,
  dConst,
  dCos,
  dMul,
  dSin,
  dVar
} from '../src/physics/autodiff';
import {
  createChainJacobianWorkspace,
  createSphericalChainJacobianWorkspace,
  jacobianChain,
  jacobianDriven,
  jacobianSphericalChain
} from '../src/physics/jacobians';
import { jacobianDouble } from '../src/physics/double';
import { createChainWorkspace, rhsChain, type ChainParameters } from '../src/physics/nPendulum';
import {
  createSphericalChainWorkspace,
  rhsSphericalChain,
  type SphericalChainParams
} from '../src/physics/sphericalChain';
import { rhsDriven, DAMPED_DRIVEN_CHAOS_PRESET } from '../src/physics/driven';
import { buildJacobian, buildRhs, type SystemSpec } from '../src/physics/systemSpec';
import { mulberry32, numericalJacobian } from '../src/chaos/variational';
import type { Derivative } from '../src/physics/types';

/** Central-difference reference Jacobian for an arbitrary Derivative. */
function centralDifference(rhs: Derivative, state: Float64Array): Float64Array {
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

describe('dual-number arithmetic', () => {
  test('propagates exact derivatives through a composite expression', () => {
    // y = sin(x0)·cos(x1) + 3·x0·x1 at (0.7, -0.4)
    const arena = new DualArena(2, 8);
    const x0 = dVar(arena.alloc(), 0.7, 0);
    const x1 = dVar(arena.alloc(), -0.4, 1);
    const s = dSin(arena.alloc(), x0);
    const c = dCos(arena.alloc(), x1);
    const lhs = dMul(arena.alloc(), s, c);
    const prod = dMul(arena.alloc(), x0, x1);
    const y = dAdd(arena.alloc(), lhs, dAddScaled(dConst(arena.alloc(), 0), prod, 3));
    expect(y[0]).toBeCloseTo(Math.sin(0.7) * Math.cos(-0.4) + 3 * 0.7 * -0.4, 14);
    expect(y[1]).toBeCloseTo(Math.cos(0.7) * Math.cos(-0.4) + 3 * -0.4, 14);
    expect(y[2]).toBeCloseTo(-Math.sin(0.7) * Math.sin(-0.4) + 3 * 0.7, 14);
  });

  test('aliasing-safe ops and clamp semantics', () => {
    const arena = new DualArena(1, 8);
    const x = dVar(arena.alloc(), 2, 0);
    dMul(x, x, x); // x ← x² in place
    expect(x[0]).toBe(4);
    expect(x[1]).toBe(4); // d(x²)/dx = 2x

    const small = dVar(arena.alloc(), 1e-12, 0);
    const clamped = dClampAbsMin(arena.alloc(), small, 1e-6);
    expect(clamped[0]).toBe(1e-6);
    expect(clamped[1]).toBe(0); // derivative of the clamp plateau

    const large = dVar(arena.alloc(), 0.5, 0);
    const passthrough = dClampAbsMin(arena.alloc(), large, 1e-6);
    expect(passthrough[0]).toBe(0.5);
    expect(passthrough[1]).toBe(1);
  });

  test('arena exhaustion fails loudly', () => {
    const arena = new DualArena(1, 1);
    arena.alloc();
    expect(() => arena.alloc()).toThrow(/capacity/);
    arena.reset();
    expect(() => arena.alloc()).not.toThrow();
  });
});

describe('jacobianChain', () => {
  test('reproduces the closed-form double-pendulum Jacobian (N = 2)', () => {
    const params: ChainParameters = { masses: [1.3, 0.6], lengths: [0.9, 1.2], g: 9.81 };
    const rng = mulberry32(0xc0de);
    const workspace = createChainJacobianWorkspace(2);
    for (let trial = 0; trial < 25; trial += 1) {
      const state = Float64Array.from({ length: 4 }, () => rng() * 6 - 3);
      const fromChain = jacobianChain(state, params, 0.07, new Float64Array(16), workspace);
      const fromDouble = jacobianDouble(state, { m1: 1.3, m2: 0.6, l1: 0.9, l2: 1.2, g: 9.81 }, 0.07, new Float64Array(16));
      expect(maxAbsDiff(fromChain, fromDouble)).toBeLessThan(1e-10);
    }
  });

  test('matches central differences for a 5-link chain', () => {
    const params: ChainParameters = { masses: [1, 0.8, 1.2, 0.5, 0.9], lengths: [1, 0.7, 0.9, 1.1, 0.6], g: 9.81 };
    const rhsWorkspace = createChainWorkspace(5);
    const rhs: Derivative = (s, o) => {
      rhsChain(s, params, 0.02, o, rhsWorkspace);
    };
    const jacWorkspace = createChainJacobianWorkspace(5);
    const rng = mulberry32(0xfeed);
    for (let trial = 0; trial < 5; trial += 1) {
      const state = Float64Array.from({ length: 10 }, () => rng() * 3 - 1.5);
      const exact = jacobianChain(state, params, 0.02, new Float64Array(100), jacWorkspace);
      const approx = centralDifference(rhs, state);
      // The CD reference has a ~1e-8 floor on entries of this magnitude.
      expect(maxAbsDiff(exact, approx)).toBeLessThan(5e-6);
    }
  });
});

describe('jacobianSphericalChain', () => {
  const PARAMS: SphericalChainParams = { masses: [1.0, 0.7], lengths: [1.0, 0.8], g: 9.81, damping: 0.04 };

  test('matches central differences for the spherical double pendulum', () => {
    const rhsWorkspace = createSphericalChainWorkspace(2);
    const rhs: Derivative = (s, o) => {
      rhsSphericalChain(s, PARAMS, o, rhsWorkspace);
    };
    const jacWorkspace = createSphericalChainJacobianWorkspace(2);
    const rng = mulberry32(0xabcd);
    for (let trial = 0; trial < 5; trial += 1) {
      const state = new Float64Array(8);
      for (let k = 0; k < 2; k += 1) {
        state[2 * k] = 0.4 + rng() * 2.0; // θ away from the poles
        state[2 * k + 1] = rng() * 6 - 3;
        state[4 + 2 * k] = rng() * 2 - 1;
        state[4 + 2 * k + 1] = rng() * 2 - 1;
      }
      const exact = jacobianSphericalChain(state, PARAMS, new Float64Array(64), jacWorkspace);
      const approx = centralDifference(rhs, state);
      expect(maxAbsDiff(exact, approx)).toBeLessThan(5e-6);
    }
  });

  test('matches central differences for a 3-link spherical chain (12-dim state)', () => {
    const params: SphericalChainParams = { masses: [1.1, 0.6, 0.9], lengths: [0.9, 1.2, 0.7], g: 9.81, damping: 0 };
    const rhsWorkspace = createSphericalChainWorkspace(3);
    const rhs: Derivative = (s, o) => {
      rhsSphericalChain(s, params, o, rhsWorkspace);
    };
    const jacWorkspace = createSphericalChainJacobianWorkspace(3);
    const rng = mulberry32(0x3d3d);
    const state = new Float64Array(12);
    for (let k = 0; k < 3; k += 1) {
      state[2 * k] = 0.5 + rng() * 1.8;
      state[2 * k + 1] = rng() * 6 - 3;
      state[6 + 2 * k] = rng() * 2 - 1;
      state[6 + 2 * k + 1] = rng() * 2 - 1;
    }
    const exact = jacobianSphericalChain(state, params, new Float64Array(144), jacWorkspace);
    const approx = centralDifference(rhs, state);
    expect(maxAbsDiff(exact, approx)).toBeLessThan(5e-6);
  });

  test('damping appears exactly on the velocity diagonal', () => {
    const state = Float64Array.from([1.1, 0.3, 0.9, -0.5, 0.2, 0.4, -0.1, 0.6]);
    const withDamping = jacobianSphericalChain(state, PARAMS, new Float64Array(64));
    const without = jacobianSphericalChain(state, { ...PARAMS, damping: 0 }, new Float64Array(64));
    for (let i = 0; i < 4; i += 1) {
      const idx = (4 + i) * 8 + (4 + i);
      expect((without[idx] ?? 0) - (withDamping[idx] ?? 0)).toBeCloseTo(PARAMS.damping, 12);
    }
  });
});

describe('jacobianDriven', () => {
  test('matches central differences', () => {
    const rhs: Derivative = (s, o) => {
      rhsDriven(s, DAMPED_DRIVEN_CHAOS_PRESET, o);
    };
    const state = Float64Array.from([0.8, -0.3, 2.1]);
    const exact = jacobianDriven(state, DAMPED_DRIVEN_CHAOS_PRESET, new Float64Array(9));
    const approx = centralDifference(rhs, state);
    expect(maxAbsDiff(exact, approx)).toBeLessThan(1e-8);
  });
});

describe('buildJacobian spec wiring', () => {
  const SPECS: SystemSpec[] = [
    { kind: 'double', m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
    { kind: 'triple', m1: 1, m2: 0.8, m3: 0.6, l1: 1, l2: 0.9, l3: 0.7, g: 9.81 },
    { kind: 'chain', masses: [1, 0.5, 0.8, 1.1], lengths: [1, 0.6, 0.9, 0.8], g: 9.81 },
    { kind: 'double-string', m1: 1, m2: 0.7, l1: 1, l2: 0.8, g: 9.81, damping: 0.05 },
    { kind: 'driven', g: 1, length: 1, damping: 0.5, driveAmplitude: 1.15, driveFrequency: 2 / 3 },
    { kind: 'spherical-chain', masses: [1, 0.8], lengths: [1, 0.7], g: 9.81, damping: 0.02 }
  ];

  test.each(SPECS.map((spec) => [spec.kind, spec] as const))(
    '%s: buildJacobian is the exact tangent of buildRhs',
    (_kind, spec) => {
      const rhs = buildRhs(spec);
      const jacobian = buildJacobian(spec);
      expect(jacobian).toBeDefined();
      const dim = spec.kind === 'driven' ? 3
        : spec.kind === 'triple' ? 6
        : spec.kind === 'chain' ? 8
        : spec.kind === 'spherical-chain' ? 8
        : 4;
      const rng = mulberry32(0x1234);
      const state = new Float64Array(dim);
      for (let i = 0; i < dim; i += 1) state[i] = 0.4 + rng() * 0.8;
      const exact = new Float64Array(dim * dim);
      jacobian!(state, exact);
      const approx = centralDifference(rhs, state);
      expect(maxAbsDiff(exact, approx)).toBeLessThan(5e-6);
    }
  );

  test('spring spec falls back to central differences (undefined)', () => {
    expect(buildJacobian({ kind: 'spring', mass: 1, stiffness: 20, restLength: 1, g: 9.81 })).toBeUndefined();
  });
});

describe('exact Jacobian inside the implicit stepper', () => {
  test('TR-BDF2 with the exact chain Jacobian matches the FD-Jacobian step', async () => {
    const { trBdf2Step } = await import('../src/physics/stiff');
    const params: ChainParameters = { masses: [1, 0.8, 1.2], lengths: [1, 0.7, 0.9], g: 9.81 };
    const rhsWorkspace = createChainWorkspace(3);
    const rhs: Derivative = (s, o) => {
      rhsChain(s, params, 0.1, o, rhsWorkspace);
    };
    const jacWorkspace = createChainJacobianWorkspace(3);
    const jacobian = (s: Float64Array, j: Float64Array): void => {
      jacobianChain(s, params, 0.1, j, jacWorkspace);
    };
    const state = Float64Array.from([0.9, -0.4, 0.6, 0.2, -0.3, 0.5]);
    const outFd = new Float64Array(6);
    const outExact = new Float64Array(6);
    const errFd = { value: 0 };
    const errExact = { value: 0 };
    trBdf2Step(state, 0.01, rhs, outFd, { previousError: errFd });
    trBdf2Step(state, 0.01, rhs, outExact, { previousError: errExact, jacobian });
    // Both converge to the same implicit solution within the Newton tolerance.
    expect(maxAbsDiff(outFd, outExact)).toBeLessThan(1e-8);
    expect(errExact.value).toBeLessThanOrEqual(1e-10);
  });
});
