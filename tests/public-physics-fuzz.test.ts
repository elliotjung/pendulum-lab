/**
 * Deterministic hostile-input contracts for the public numerical boundary.
 *
 * This complements ordinary valid-domain property tests: each public kernel
 * below must either reject malformed input synchronously or return only finite
 * values.  The seed is fixed so a CI failure is reproducible from the report.
 */
import { describe, expect, test } from 'vitest';
import * as fc from 'fast-check';
import { createChainWorkspace, energyChain, rhsChain, type ChainParameters } from '../src/physics/nPendulum';
import {
  createSphericalChainWorkspace,
  rhsSphericalChain,
  sphericalChainEnergy,
  type SphericalChainParams
} from '../src/physics/sphericalChain';
import { rhsDouble } from '../src/physics/double';
import { rhsTriple } from '../src/physics/triple';
import { rhsDriven } from '../src/physics/driven';
import { rhsSpring } from '../src/physics/spring';
import { rhsDuffing } from '../src/physics/duffing';
import { rhsVanDerPol } from '../src/physics/vanDerPol';
import { rhsKapitza } from '../src/physics/kapitza';
import {
  magneticPendulumBasinGrid,
  magneticPendulumSettle,
  rhsMagneticPendulum
} from '../src/physics/magneticPendulum';
import { rhsPendulumNetwork } from '../src/physics/pendulumNetwork';
import { rhsKuramoto } from '../src/physics/kuramoto';
import { dop853Step, rk4Step, step } from '../src/physics/integrators';
import { rkf45Step } from '../src/physics/embeddedIntegrators';
import { trBdf2Step } from '../src/physics/stiff';
import { integrateAdaptive } from '../src/physics/adaptive';
import { buildRhs, jacobianTrustForSpec, type SystemSpec } from '../src/physics/systemSpec';
import { PhysicsEvaluationError } from '../src/physics/errors';

const SEED = 0x22f00d;
const hostileScalar = fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY);
const finiteScalar = fc.double({ min: -4, max: 4, noNaN: true, noDefaultInfinity: true });

const doubleParams = { m1: 1, m2: 0.8, l1: 1.1, l2: 0.9, g: 9.81 };
const chainParams: ChainParameters = { masses: [1, 0.8], lengths: [1.1, 0.9], g: 9.81 };
const sphericalParams: SphericalChainParams = {
  masses: [1, 0.8],
  lengths: [1.1, 0.9],
  g: 9.81,
  damping: 0.02
};

function isFiniteArray(values: ArrayLike<number>): boolean {
  return Array.from(values).every(Number.isFinite);
}

function expectRejected(action: () => unknown): void {
  expect(action).toThrow();
}

/** Stable inventory: adding a public solver/kernel requires adding it here. */
const PUBLIC_BOUNDARY_INVENTORY = Object.freeze({
  planarAndChain: ['rhsDouble', 'rhsTriple', 'rhsChain', 'energyChain', 'rhsSphericalChain', 'sphericalChainEnergy'],
  canonicalModels: ['rhsDriven', 'rhsSpring', 'rhsDuffing', 'rhsVanDerPol', 'rhsKapitza', 'rhsMagneticPendulum'],
  networkModels: ['rhsPendulumNetwork', 'rhsKuramoto'],
  directSteppers: ['step', 'rk4Step', 'rkf45Step', 'dop853Step', 'trBdf2Step', 'integrateAdaptive'],
  boundedSearches: ['magneticPendulumSettle', 'magneticPendulumBasinGrid'],
  factoriesAndTangent: ['createChainWorkspace', 'createSphericalChainWorkspace', 'buildRhs', 'jacobianTrustForSpec']
});

describe('public physics hostile-input fuzzing', () => {
  test('keeps the public boundary inventory deliberate', () => {
    expect(Object.values(PUBLIC_BOUNDARY_INVENTORY).flat()).toHaveLength(26);
  });

  test('rejects NaN and infinities at planar/chain RHS and energy boundaries without touching output', () => {
    fc.assert(
      fc.property(hostileScalar, (poison) => {
        const sentinel = new Float64Array([101, 102, 103, 104]);
        expectRejected(() => rhsDouble([poison, 0, 0, 0], doubleParams, 0, sentinel));
        expect([...sentinel]).toEqual([101, 102, 103, 104]);

        const chainOut = new Float64Array([201, 202, 203, 204]);
        expectRejected(() => rhsChain([0, poison, 0, 0], chainParams, 0, chainOut));
        expect([...chainOut]).toEqual([201, 202, 203, 204]);
        expectRejected(() => energyChain([0, 0, poison, 0], chainParams));

        const sphericalOut = new Float64Array(8).fill(301);
        expectRejected(() => rhsSphericalChain([0.6, 0, poison, 0, 0, 0, 0, 0], sphericalParams, sphericalOut));
        expect([...sphericalOut]).toEqual(new Array(8).fill(301));
        expectRejected(() => sphericalChainEnergy([0.6, 0, 0.7, 0, poison, 0, 0, 0], sphericalParams));
      }),
      { seed: SEED, numRuns: 30 }
    );
  });

  test('rejects negative masses, dimensions, short buffers, and unbounded allocations', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 0, noNaN: true }), (mass) => {
        expectRejected(() => rhsDouble([0, 0, 0, 0], { ...doubleParams, m1: mass }, 0, new Float64Array(4)));
        expectRejected(() =>
          rhsTriple([0, 0, 0, 0, 0, 0], { ...doubleParams, m3: mass, l3: 1 }, 0, new Float64Array(6))
        );
        expectRejected(() => rhsChain([0, 0, 0, 0], { ...chainParams, masses: [mass, 1] }, 0, new Float64Array(4)));
        expectRejected(() =>
          rhsSphericalChain(new Float64Array(8), { ...sphericalParams, masses: [mass, 1] }, new Float64Array(8))
        );
      }),
      { seed: SEED + 1, numRuns: 40 }
    );

    expectRejected(() => rhsChain(new Float64Array(3), chainParams, 0, new Float64Array(4)));
    expectRejected(() => rhsSphericalChain(new Float64Array(7), sphericalParams, new Float64Array(8)));
    expectRejected(() => rhsChain(new Float64Array(4), chainParams, 0, new Float64Array(3)));
    expectRejected(() => createChainWorkspace(Number.MAX_SAFE_INTEGER));
    expectRejected(() => createSphericalChainWorkspace(Number.POSITIVE_INFINITY));
  });

  test('never emits non-finite output for randomized valid public RHS calls', () => {
    fc.assert(
      fc.property(finiteScalar, finiteScalar, finiteScalar, finiteScalar, (a, b, c, d) => {
        const doubleOut = new Float64Array(4);
        rhsDouble([a, b, c, d], doubleParams, 0.1, doubleOut);
        expect(isFiniteArray(doubleOut)).toBe(true);

        const tripleOut = new Float64Array(6);
        rhsTriple([a, b, c, d, a / 2, b / 2], { ...doubleParams, m3: 0.6, l3: 0.8 }, 0.1, tripleOut);
        expect(isFiniteArray(tripleOut)).toBe(true);

        const chainOut = new Float64Array(4);
        rhsChain([a, b, c, d], chainParams, 0.1, chainOut);
        expect(isFiniteArray(chainOut)).toBe(true);

        const sphericalOut = new Float64Array(8);
        rhsSphericalChain(
          [0.5 + Math.abs(a % 2), b, 0.5 + Math.abs(c % 2), d, a / 3, b / 3, c / 3, d / 3],
          sphericalParams,
          sphericalOut
        );
        expect(isFiniteArray(sphericalOut)).toBe(true);
      }),
      { seed: SEED + 2, numRuns: 80 }
    );
  });

  test('rejects hostile scalar state/configuration input across single-system and network public RHS calls', () => {
    fc.assert(
      fc.property(hostileScalar, (poison) => {
        expectRejected(() =>
          rhsDriven(
            [poison, 0, 0],
            { g: 1, length: 1, damping: 0, driveAmplitude: 1, driveFrequency: 1 },
            new Float64Array(3)
          )
        );
        expectRejected(() =>
          rhsSpring([0, poison, 0, 0], { mass: 1, stiffness: 2, restLength: 1, g: 9.81 }, new Float64Array(4))
        );
        expectRejected(() =>
          rhsDuffing(
            [0, poison, 0],
            { damping: 0.1, linearStiffness: -1, cubicStiffness: 1, driveAmplitude: 0.2, driveFrequency: 1 },
            new Float64Array(3)
          )
        );
        expectRejected(() => rhsVanDerPol([0, poison], { mu: 1 }, new Float64Array(2)));
        expectRejected(() =>
          rhsKapitza(
            [0, poison, 0],
            { g: 9.81, length: 1, driveAmplitude: 0.2, driveFrequency: 20, damping: 0 },
            new Float64Array(3)
          )
        );
        expectRejected(() =>
          rhsMagneticPendulum(
            [0, poison, 0, 0],
            { magnets: [{ x: 0, y: 0, strength: 1 }], restoring: 1, damping: 0.1, height: 0.2 },
            new Float64Array(4)
          )
        );
        expectRejected(() =>
          rhsPendulumNetwork(
            [0, poison, 0, 0],
            { masses: [1, 1], lengths: [1, 1], g: 9.81, coupling: [0, 1, 1, 0] },
            new Float64Array(4)
          )
        );
        expectRejected(() =>
          rhsKuramoto([0, poison], { naturalFrequencies: [1, 1], coupling: 0.5 }, new Float64Array(2))
        );
      }),
      { seed: SEED + 3, numRuns: 30 }
    );
  });

  test('direct solver entry points reject malformed state, non-finite dt, dimensions, and options before mutation', () => {
    const rhs = (state: Float64Array, out: Float64Array): void => {
      out[0] = state[1]!;
      out[1] = -state[0]!;
    };
    const valid = new Float64Array([1, 0]);
    const badDts = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (const dt of badDts) {
      expectRejected(() => rk4Step(valid, dt, rhs, new Float64Array(2)));
      expectRejected(() => rkf45Step(valid, dt, rhs, new Float64Array(2)));
      expectRejected(() => dop853Step(valid, dt, rhs, new Float64Array(2)));
      expectRejected(() => trBdf2Step(valid, dt, rhs, new Float64Array(2)));
    }
    let zeroRhsCalls = 0;
    const zeroRhs = (_state: Float64Array, _out: Float64Array): void => {
      zeroRhsCalls += 1;
    };
    const zeroStepRunners: ReadonlyArray<(out: Float64Array) => void> = [
      (out) => rk4Step(valid, 0, zeroRhs, out),
      (out) => rkf45Step(valid, 0, zeroRhs, out),
      (out) => dop853Step(valid, 0, zeroRhs, out),
      (out) => trBdf2Step(valid, 0, zeroRhs, out),
      (out) => step('rk4', valid, 0, zeroRhs, out)
    ];
    for (const runZeroStep of zeroStepRunners) {
      const out = new Float64Array([Number.NaN, Number.NaN]);
      runZeroStep(out);
      expect(Array.from(out)).toEqual(Array.from(valid));
    }
    expect(zeroRhsCalls).toBe(0);
    expectRejected(() => step('rk4', new Float64Array([Number.NaN, 0]), 0.01, rhs, new Float64Array(2)));
    expectRejected(() => rk4Step(valid, 0.01, rhs, new Float64Array(1)));
    expectRejected(() => step('rk4', valid, 0.01, rhs, new Float64Array(2), { tolerance: Number.NaN }));
    expectRejected(() => step('rk4', valid, 0.01, rhs, new Float64Array(2), { errorComponents: new Float64Array(1) }));
    expectRejected(() => integrateAdaptive(valid, 1, rhs, { minDt: 1, maxDt: 0.5 }));
  });

  test('bounded public search APIs reject configurations that could otherwise loop or allocate indefinitely', () => {
    const params = { magnets: [{ x: 0, y: 0, strength: 1 }], restoring: 1, damping: 0.1, height: 0.2 };
    expectRejected(() => magneticPendulumSettle(params, 0, 0, { maxSteps: Number.POSITIVE_INFINITY }));
    expectRejected(() => magneticPendulumBasinGrid(params, { n: Number.POSITIVE_INFINITY }));
  });

  test('model-specific Jacobian provenance is explicit and consistent with the returned RHS', () => {
    const specs: Array<[SystemSpec, 'analytic-model' | 'automatic-differentiation' | 'central-difference']> = [
      [{ kind: 'double', ...doubleParams }, 'analytic-model'],
      [{ kind: 'triple', ...doubleParams, m3: 0.6, l3: 0.8 }, 'automatic-differentiation'],
      [
        { kind: 'chain', masses: [...chainParams.masses], lengths: [...chainParams.lengths], g: chainParams.g },
        'automatic-differentiation'
      ],
      [{ kind: 'driven', g: 1, length: 1, damping: 0.1, driveAmplitude: 1, driveFrequency: 1 }, 'analytic-model'],
      [{ kind: 'spring', mass: 1, stiffness: 2, restLength: 1, g: 9.81 }, 'central-difference'],
      [
        {
          kind: 'spherical-chain',
          masses: [...sphericalParams.masses],
          lengths: [...sphericalParams.lengths],
          g: sphericalParams.g,
          damping: sphericalParams.damping
        },
        'automatic-differentiation'
      ]
    ];
    for (const [spec, provenance] of specs) {
      const rhs = buildRhs(spec);
      const trust = jacobianTrustForSpec(spec);
      expect(trust.provenance).toBe(provenance);
      expect(trust.confidence).toBe(provenance === 'central-difference' ? 'numerical-fallback' : 'model-validated');
      expect(rhs.jacobianProvenance ?? 'central-difference').toBe(provenance);
    }
  });

  test('structured physics errors retain machine-readable codes at hardened boundaries', () => {
    try {
      rhsChain(new Float64Array(4), { masses: [-1, 1], lengths: [1, 1], g: 9.81 }, 0, new Float64Array(4));
      throw new Error('expected validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(PhysicsEvaluationError);
      expect((error as PhysicsEvaluationError).code).toBe('INVALID_PARAMETER');
    }
  });
});
