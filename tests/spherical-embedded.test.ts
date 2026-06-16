import { describe, expect, test } from 'vitest';
import { SphericalPendulum, sphericalEnergy, sphericalLz, type SphericalState } from '../src/physics/spherical';
import {
  EmbeddedSphericalPendulum,
  angleToEmbedded,
  embeddedToAngle,
  sphericalEmbeddedEnergy,
  sphericalEmbeddedLz,
  sphericalEmbeddedRhs
} from '../src/physics/sphericalEmbedded';

/**
 * The embedded (Cartesian unit-vector) chart is the singularity-free member of
 * the S² atlas: it must (a) agree with the validated polar chart away from the
 * poles, and (b) stay accurate where the polar chart's clamp fails — a bob that
 * whips through the near-pole region. Energy and vertical angular momentum are
 * the verification anchors.
 */

const params = { l: 1, g: 9.81, damping: 0 };

describe('embedded spherical pendulum — atlas chart that covers the poles', () => {
  test('angle ↔ embedded conversion round-trips and matches the analytic E, Lz', () => {
    const s0: SphericalState = [1.0, 0.4, 0.5, 0.8];
    const back = embeddedToAngle(angleToEmbedded(s0));
    for (let i = 0; i < 4; i += 1) expect(back[i]).toBeCloseTo(s0[i]!, 12);
    const e0 = angleToEmbedded(s0);
    expect(sphericalEmbeddedEnergy(e0, params)).toBeCloseTo(sphericalEnergy(s0, params), 12);
    expect(sphericalEmbeddedLz(e0, params)).toBeCloseTo(sphericalLz(s0, params), 12);
  });

  test('the RHS keeps the state on the constraint manifold (u·ü = −|w|²)', () => {
    const s = angleToEmbedded([0.7, 0.3, 0.4, 0.9]);
    const d = sphericalEmbeddedRhs(s, params);
    // d = [u̇, ü] = [w, ü]; the acceleration's radial component must equal −|w|².
    const wSq = s[3] * s[3] + s[4] * s[4] + s[5] * s[5];
    const uDotA = s[0] * d[3] + s[1] * d[4] + s[2] * d[5]; // u · ü
    expect(uDotA).toBeCloseTo(-wSq, 12);
  });

  test('agrees with the polar chart away from the poles', () => {
    const ic: SphericalState = [1.0, 0.0, 0.0, 1.2]; // θ stays well clear of 0/π
    const angle = new SphericalPendulum(params, ic, 0.001);
    const embedded = EmbeddedSphericalPendulum.fromAngles(params, ic, 0.001);
    let maxPosDiff = 0;
    for (let i = 0; i < 1500; i += 1) {
      angle.step(0.001);
      embedded.step(0.001);
      const a = angle.position();
      const e = embedded.position();
      maxPosDiff = Math.max(maxPosDiff, Math.hypot(a.x - e.x, a.y - e.y, a.z - e.z));
    }
    expect(maxPosDiff).toBeLessThan(1e-7); // observed ≈ 2e-10
  });

  test('conserves E and Lz through a near-pole passage where the polar chart fails', () => {
    const ic: SphericalState = [1.2, 0, 0, 0.03]; // released from rest, tiny Lz → whips past the pole
    const dt = 0.002;
    const angle = new SphericalPendulum(params, ic, dt);
    const embedded = EmbeddedSphericalPendulum.fromAngles(params, ic, dt);
    let minTheta = Math.PI;
    for (let i = 0; i < 4000; i += 1) {
      angle.step(dt);
      embedded.step(dt);
      const theta = Math.acos(Math.max(-1, Math.min(1, -embedded.current()[1])));
      minTheta = Math.min(minTheta, theta);
    }
    const a = angle.diagnostics();
    const e = embedded.diagnostics();

    expect(minTheta).toBeLessThan(0.02); // the trajectory really did approach the pole (≈ 7e-3)

    // Embedded chart: machine-precision conservation and constraint.
    expect(e.energyDrift).toBeLessThan(1e-7);
    expect(e.lzDrift).toBeLessThan(1e-7);
    expect(e.unitConstraintError).toBeLessThan(1e-10);
    expect(e.tangentConstraintError).toBeLessThan(1e-10);

    // Polar chart: the clamp/stiffness wrecks conservation there (≈ 29% energy drift, or NaN).
    const polarFailed = !(a.energyDrift < 1e-2);
    expect(polarFailed).toBe(true);
  });

  test('damping dissipates energy and Lz monotonically', () => {
    const damped = new EmbeddedSphericalPendulum({ l: 1, g: 9.81, damping: 0.3 }, angleToEmbedded([1.1, 0, 0.0, 1.0]), 0.002);
    let prevEnergy = damped.diagnostics().energy;
    for (let i = 0; i < 200; i += 1) {
      damped.step(0.01);
      const energy = damped.diagnostics().energy;
      expect(energy).toBeLessThanOrEqual(prevEnergy + 1e-9);
      prevEnergy = energy;
    }
    // |Lz| has decayed from its initial value.
    expect(Math.abs(damped.diagnostics().lz)).toBeLessThan(Math.abs(sphericalEmbeddedLz(angleToEmbedded([1.1, 0, 0.0, 1.0]), params)));
  });
});
