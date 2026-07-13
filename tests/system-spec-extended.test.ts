import { describe, expect, it } from 'vitest';
import { buildRhs, energyForSpec, type SystemSpec } from '../src/physics/systemSpec';
import {
  createSphericalChainWorkspace,
  rhsSphericalChain,
  sphericalChainEnergy,
  type SphericalChainParams
} from '../src/physics/sphericalChain';
import { rhsDouble } from '../src/physics/double';
import { doubleStringEnergyFromTautState, doubleStringTautFraction } from '../src/physics/doubleString';
import { runChaosJob } from '../src/workers/chaosProtocol';

const CHAIN_PARAMS: SphericalChainParams = { masses: [1, 0.8], lengths: [1.0, 0.7], g: 9.81, damping: 0 };
const CHAIN_SPEC: Extract<SystemSpec, { kind: 'spherical-chain' }> = {
  kind: 'spherical-chain',
  masses: [1, 0.8],
  lengths: [1.0, 0.7],
  g: 9.81,
  damping: 0
};
// θ0, φ0, θ1, φ1, then rates — a genuinely 3D (non-planar) state that stays
// clear of the pole chart-regularisation over the test horizons.
const CHAIN_STATE = [0.9, 0.3, 1.4, -0.5, 0.2, 0.6, -0.1, 0.4];

const STRING_SPEC: Extract<SystemSpec, { kind: 'double-string' }> = {
  kind: 'double-string',
  m1: 1,
  m2: 1,
  l1: 1.2,
  l2: 1.0,
  g: 9.81,
  damping: 0
};

function rk4Step(rhs: (s: Float64Array, o: Float64Array) => void, state: Float64Array, h: number): void {
  const n = state.length;
  const k1 = new Float64Array(n);
  const k2 = new Float64Array(n);
  const k3 = new Float64Array(n);
  const k4 = new Float64Array(n);
  const tmp = new Float64Array(n);
  rhs(state, k1);
  for (let i = 0; i < n; i += 1) tmp[i] = state[i]! + (h / 2) * k1[i]!;
  rhs(tmp, k2);
  for (let i = 0; i < n; i += 1) tmp[i] = state[i]! + (h / 2) * k2[i]!;
  rhs(tmp, k3);
  for (let i = 0; i < n; i += 1) tmp[i] = state[i]! + h * k3[i]!;
  rhs(tmp, k4);
  for (let i = 0; i < n; i += 1) state[i] = state[i]! + (h / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!);
}

describe('SystemSpec: spherical-chain', () => {
  it('buildRhs matches rhsSphericalChain exactly', () => {
    const rhs = buildRhs(CHAIN_SPEC);
    const out = new Float64Array(8);
    rhs(Float64Array.from(CHAIN_STATE), out);
    const expected = rhsSphericalChain(
      CHAIN_STATE,
      CHAIN_PARAMS,
      new Float64Array(8),
      createSphericalChainWorkspace(2)
    );
    for (let i = 0; i < 8; i += 1) expect(out[i]).toBeCloseTo(expected[i]!, 12);
  });

  it('energyForSpec matches sphericalChainEnergy', () => {
    const viaSpec = energyForSpec(CHAIN_SPEC, CHAIN_STATE);
    const direct = sphericalChainEnergy(CHAIN_STATE, CHAIN_PARAMS);
    expect(viaSpec.total).toBeCloseTo(direct.total, 12);
    expect(viaSpec.KE).toBeCloseTo(direct.KE, 12);
  });

  it('conserves energy through the spec-built RHS (γ = 0, RK4)', () => {
    const rhs = buildRhs(CHAIN_SPEC);
    const state = Float64Array.from(CHAIN_STATE);
    const e0 = energyForSpec(CHAIN_SPEC, state).total;
    const dt = 0.001;
    for (let i = 0; i < 5000; i += 1) rk4Step(rhs, state, dt);
    const e1 = energyForSpec(CHAIN_SPEC, state).total;
    expect(Math.abs((e1 - e0) / e0)).toBeLessThan(1e-7);
  });

  it('runs the full studyPoint research job (λ_max + RQA + FTLE) on the chain', () => {
    // The chain needs a finer step than the planar default (dt 0.01 destabilises
    // RK4 over the RQA sampling horizon for energetic 3D states).
    const response = runChaosJob({
      id: 'chain-study',
      kind: 'studyPoint',
      spec: CHAIN_SPEC,
      state0: CHAIN_STATE,
      settings: {
        lyapunov: { steps: 3000, dt: 0.002 },
        rqa: { samples: 200, dt: 0.002 },
        ftleHorizon: 2,
        ftleDt: 0.002
      }
    });
    expect(response.ok).toBe(true);
    if (response.ok && response.kind === 'studyPoint') {
      expect(Number.isFinite(response.lambdaMax)).toBe(true);
      expect(Number.isFinite(response.rqaDeterminism)).toBe(true);
      expect(response.rqaDeterminism).toBeGreaterThanOrEqual(0);
      expect(response.rqaDeterminism).toBeLessThanOrEqual(1);
      expect(Number.isFinite(response.ftle)).toBe(true);
    }
  });

  it('computes a Lyapunov spectrum over the worker protocol for the chain', () => {
    const response = runChaosJob({
      id: 'chain-spectrum',
      kind: 'lyapunovSpectrum',
      spec: CHAIN_SPEC,
      state0: CHAIN_STATE,
      count: 8,
      settings: { dt: 0.002, steps: 5000, renormEvery: 10, transientSteps: 500 }
    });
    expect(response.ok).toBe(true);
    if (response.ok && response.kind === 'lyapunovSpectrum') {
      expect(response.spectrum).toHaveLength(8);
      expect(response.spectrum.every(Number.isFinite)).toBe(true);
      // Conservative system: exponent sum ≈ 0 (finite-time, so loose gate).
      expect(Math.abs(response.sum)).toBeLessThan(0.5);
    }
  });
});

describe('SystemSpec: double-string', () => {
  it('buildRhs equals the rigid double pendulum vector field on the taut chart', () => {
    const rhs = buildRhs(STRING_SPEC);
    const state = Float64Array.from([0.4, 0.7, 0.2, -0.1]);
    const out = new Float64Array(4);
    rhs(state, out);
    const expected = rhsDouble(state, { m1: 1, m2: 1, l1: 1.2, l2: 1.0, g: 9.81 }, 0, new Float64Array(4));
    for (let i = 0; i < 4; i += 1) expect(out[i]).toBeCloseTo(expected[i]!, 12);
  });

  it('applies damping in the spec-built taut vector field', () => {
    const rhs = buildRhs({ ...STRING_SPEC, damping: 0.5 });
    const state = Float64Array.from([0.4, 0.7, 0.2, -0.1]);
    const out = new Float64Array(4);
    rhs(state, out);
    const undamped = rhsDouble(state, { m1: 1, m2: 1, l1: 1.2, l2: 1.0, g: 9.81 }, 0, new Float64Array(4));
    expect(out[2]).not.toBeCloseTo(undamped[2]!, 6);
  });

  it('taut-fraction probe: small-angle release stays fully taut', () => {
    const result = doubleStringTautFraction(
      { m1: 1, m2: 1, l1: 1.2, l2: 1.0, g: 9.81, damping: 0 },
      0.3,
      0.35,
      0,
      0,
      10
    );
    expect(result.tautFraction).toBeGreaterThan(0.999);
    expect(result.slackEvents).toBe(0);
    expect(result.caveat).toContain('valid');
  });

  it('taut-fraction probe: near-inverted release reports slack phases', () => {
    // Folded near-inverted release: the outer string loses tension during the
    // fall. (A fast-whirling state, by contrast, stays taut — centripetal
    // demand keeps tension positive.)
    const result = doubleStringTautFraction(
      { m1: 1, m2: 1, l1: 1.2, l2: 1.0, g: 9.81, damping: 0 },
      2.5,
      -2.5,
      0,
      0,
      10
    );
    expect(result.slackEvents).toBeGreaterThan(0);
    expect(result.captureEvents).toBeGreaterThan(0);
    expect(result.tautFraction).toBeLessThan(1);
    expect(result.caveat).toContain('slack');
  });

  it('taut-state energy helper matches the cartesian energy', () => {
    const params = { m1: 1, m2: 1, l1: 1.2, l2: 1.0, g: 9.81, damping: 0 };
    const e = doubleStringEnergyFromTautState([0.5, 0.8, 0.1, -0.2], params);
    expect(Number.isFinite(e)).toBe(true);
    // Hand-checked: hanging at rest has energy −g(m1·l1 + m2·(l1+l2)).
    const rest = doubleStringEnergyFromTautState([0, 0, 0, 0], params);
    expect(rest).toBeCloseTo(-9.81 * (1 * 1.2 + 1 * 2.2), 10);
  });

  it('runs the studyPoint research job on the taut chart', () => {
    const response = runChaosJob({
      id: 'string-study',
      kind: 'studyPoint',
      spec: STRING_SPEC,
      state0: [0.4, 0.6, 0, 0],
      settings: { lyapunov: { steps: 3000, dt: 0.005 }, rqa: { samples: 200 }, ftleHorizon: 2 }
    });
    expect(response.ok).toBe(true);
    if (response.ok && response.kind === 'studyPoint') {
      expect(Number.isFinite(response.lambdaMax)).toBe(true);
      expect(Number.isFinite(response.ftle)).toBe(true);
    }
  });
});
