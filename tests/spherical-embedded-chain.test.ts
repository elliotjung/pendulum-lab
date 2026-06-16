import { describe, expect, test } from 'vitest';
import {
  EmbeddedSphericalChain,
  angleChainToEmbedded,
  embeddedChainToAngle,
  embeddedChainEnergy,
  embeddedChainLz,
  rhsEmbeddedChain,
  createEmbeddedChainWorkspace
} from '../src/physics/sphericalEmbeddedChain';
import { EmbeddedSphericalPendulum, sphericalEmbeddedRhs, angleToEmbedded } from '../src/physics/sphericalEmbedded';
import { SphericalChain, sphericalChainEnergy, sphericalChainLz } from '../src/physics/sphericalChain';
import type { SphericalChainParams } from '../src/physics/sphericalChain';

/**
 * The embedded N-chain is the pole-singularity-free generalisation of the polar
 * `SphericalChain`. Validation anchors, mirroring the single-pendulum embedded
 * chart but now for a coupled chain:
 *   1. exact reduction to `EmbeddedSphericalPendulum` at N = 1 (RHS + trajectory),
 *   2. agreement with the polar `SphericalChain` away from the poles,
 *   3. E and L_z conservation through a near-pole passage where the polar chart's
 *      clamp wrecks conservation — the embedded chart's whole reason to exist,
 *   4. 4th-order drift shrinkage under dt-halving (a wrong RHS leaves a floor),
 *   5. the rod-constraint multiplier matrix is positive-definite everywhere (no clamp).
 */

const single: SphericalChainParams = { masses: [1], lengths: [1], g: 9.81, damping: 0 };
const double: SphericalChainParams = { masses: [1.3, 0.7], lengths: [1.1, 0.9], g: 9.81, damping: 0 };

describe('embedded spherical chain — pole-free chain dynamics', () => {
  test('N = 1 RHS matches the single embedded pendulum component-wise', () => {
    const params = { l: 1, g: 9.81, damping: 0 };
    const embeddedSingleState = angleToEmbedded([0.7, 0.3, 0.4, 0.9]);
    const chainState = Float64Array.from(embeddedSingleState); // identical layout for N = 1
    const single1 = sphericalEmbeddedRhs(embeddedSingleState, params);
    const out = new Float64Array(6);
    rhsEmbeddedChain(chainState, single, out, createEmbeddedChainWorkspace(single));
    for (let i = 0; i < 6; i += 1) expect(out[i]!).toBeCloseTo(single1[i]!, 11);
  });

  test('N = 1 trajectory matches EmbeddedSphericalPendulum to machine precision', () => {
    const paramsSingle = { l: 1, g: 9.81, damping: 0 };
    const ic = angleToEmbedded([1.2, 0, 0, 0.6]);
    const chain = new EmbeddedSphericalChain(single, ic, 0.002);
    const pendulum = new EmbeddedSphericalPendulum(paramsSingle, ic, 0.002);
    let maxDiff = 0;
    for (let i = 0; i < 1500; i += 1) {
      chain.step(0.002);
      pendulum.step(0.002);
      const cs = chain.current();
      const ps = pendulum.current();
      for (let j = 0; j < 6; j += 1) maxDiff = Math.max(maxDiff, Math.abs(cs[j]! - ps[j]!));
    }
    // The chain evaluates the RHS via the multiplier linear solve, the single pendulum via
    // its closed form; analytically equal, they differ only by ~1e-11/step round-off accrual.
    expect(maxDiff).toBeLessThan(1e-8); // observed ≈ 7e-10 over 3 s
  });

  test('angle ↔ embedded conversion round-trips and preserves E, L_z', () => {
    const polar = Float64Array.of(1.0, 0.4, 0.8, -0.3, 0.5, 0.8, -0.6, 0.7); // [θ0,φ0,θ1,φ1, θ̇0,φ̇0,θ̇1,φ̇1]
    const embedded = angleChainToEmbedded(polar, 2);
    const back = embeddedChainToAngle(embedded, 2);
    for (let i = 0; i < 8; i += 1) expect(back[i]!).toBeCloseTo(polar[i]!, 11);

    // E and L_z computed in the embedded chart must equal the polar chart's values.
    expect(embeddedChainEnergy(embedded, double).total).toBeCloseTo(sphericalChainEnergy(polar, double).total, 8);
    expect(embeddedChainLz(embedded, double)).toBeCloseTo(sphericalChainLz(polar, double), 8);
  });

  test('agrees with the polar chain away from the poles (N = 2)', () => {
    // A regular, modest-amplitude orbit with azimuthal support (θ's stay well clear of 0/π).
    // An energetic orbit is chaotic, so two correct integrations would diverge as e^{λt} — that
    // would test floating point, not the dynamics; this regime keeps the divergence in the floor.
    const polarIc = Float64Array.of(0.4, 0.0, 0.5, 0.2, 0.0, 0.3, 0.0, -0.2);
    const dt = 0.001;
    const polar = new SphericalChain(double, polarIc, { dt });
    const embedded = EmbeddedSphericalChain.fromAngles(double, polarIc, dt);
    let maxPosDiff = 0;
    for (let i = 0; i < 1500; i += 1) {
      polar.step(dt);
      embedded.step(dt);
      const a = polar.positions();
      const e = embedded.positions();
      for (let k = 0; k < a.length; k += 1) {
        maxPosDiff = Math.max(maxPosDiff, Math.hypot(a[k]!.x - e[k]!.x, a[k]!.y - e[k]!.y, a[k]!.z - e[k]!.z));
      }
    }
    expect(maxPosDiff).toBeLessThan(1e-5); // observed ≈ 1.8e-7 over 1.5 s — same dynamics, two charts
  });

  test('conserves E and L_z through a near-pole passage where the polar chain fails', () => {
    // Outer link released near vertical with tiny azimuthal velocity → whips past the pole.
    const polarIc = Float64Array.of(0.5, 0.0, 1.2, 0.0, 0.0, 0.0, 0.0, 0.03);
    const dt = 0.002;
    const embedded = EmbeddedSphericalChain.fromAngles(double, polarIc, dt);
    const polar = new SphericalChain(double, polarIc, { dt });
    let minOuterTheta = Math.PI;
    for (let i = 0; i < 4000; i += 1) {
      embedded.step(dt);
      polar.step(dt);
      const s = embedded.current();
      const outerTheta = Math.acos(Math.max(-1, Math.min(1, -s[4]!))); // u_1.y = state[4]
      minOuterTheta = Math.min(minOuterTheta, outerTheta);
    }
    const e = embedded.diagnostics();
    const a = polar.diagnostics();

    expect(minOuterTheta).toBeLessThan(0.05); // the outer link really approached the pole

    // Embedded chart: tight conservation and exact constraints.
    expect(e.energyDrift).toBeLessThan(1e-5);
    expect(e.lzDrift).toBeLessThan(1e-5);
    expect(e.unitConstraintError).toBeLessThan(1e-10);
    expect(e.tangentConstraintError).toBeLessThan(1e-10);

    // Polar chart: the |sinθ| ≥ 1e-6 clamp degrades conservation far more than the embedded chart.
    expect(a.energyDrift).toBeGreaterThan(e.energyDrift * 10);
  });

  test('conservative energy drift shrinks ~16× per dt-halving (4th order, no floor)', () => {
    const polarIc = Float64Array.of(1.0, 0.2, 1.4, 0.7, 0.3, 0.5, -0.4, 0.6);
    const drift = (dt: number): number => {
      const sim = EmbeddedSphericalChain.fromAngles(double, polarIc, dt);
      const steps = Math.round(4 / dt);
      for (let i = 0; i < steps; i += 1) sim.step(dt);
      return sim.diagnostics().energyDrift;
    };
    const coarse = drift(0.004);
    const fine = drift(0.002);
    // RK4 ⇒ error ∝ dt^4 ⇒ ratio ≈ 16. A wrong RHS would leave a dt-independent floor (ratio ≈ 1).
    expect(coarse / fine).toBeGreaterThan(8);
  });

  test('the rod-constraint multiplier matrix is positive-definite at a near-pole state', () => {
    const polarIc = Float64Array.of(1e-7, 0.0, 1.2, 0.4, 0.5, 0.9, -0.3, 0.7); // link 0 essentially at the pole
    const sim = EmbeddedSphericalChain.fromAngles(double, polarIc, 0.002);
    const diag = sim.multiplierDiagnostics();
    expect(diag.ok).toBe(true);
    expect(Number.isFinite(diag.conditionEstimate)).toBe(true);
  });

  test('damping dissipates energy monotonically', () => {
    const damped = new EmbeddedSphericalChain(
      { masses: [1.3, 0.7], lengths: [1.1, 0.9], g: 9.81, damping: 0.4 },
      angleChainToEmbedded(Float64Array.of(1.1, 0.0, 1.0, 0.3, 0.0, 1.0, 0.0, 0.5), 2),
      0.002
    );
    let prev = damped.diagnostics().energy;
    for (let i = 0; i < 200; i += 1) {
      damped.step(0.01);
      const energy = damped.diagnostics().energy;
      expect(energy).toBeLessThanOrEqual(prev + 1e-9);
      prev = energy;
    }
  });
});
