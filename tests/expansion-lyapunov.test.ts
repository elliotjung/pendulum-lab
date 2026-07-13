import { describe, expect, test } from 'vitest';
import { expansionLyapunovProfile } from '../src/physics/expandedModels';

/**
 * The Expansion Lab Lyapunov profile must be a *true* variational/QR spectrum,
 * not the old ghost-divergence placeholder (which fabricated the secondary
 * exponent as `-leading/(dim-1)` and could only ever probe one direction).
 * These tests pin the physical signatures that only a genuine Benettin/QR
 * spectrum can satisfy: descending order, the full count of exponents, a
 * positive leading exponent for a chaotic Hamiltonian system, a sum that stays
 * near zero (phase-space volume preservation), and a running timeline whose
 * leading/secondary values converge onto the actual first two exponents.
 */
describe('expansion variational/QR Lyapunov spectrum', () => {
  test('chaotic N-link chain: positive leading exponent, full descending spectrum, ~conservative sum', () => {
    const profile = expansionLyapunovProfile({ model: 'chain', horizon: 14, dt: 0.003 });
    expect(profile.spectrum).toHaveLength(8);
    for (let i = 1; i < profile.spectrum.length; i += 1) {
      expect(profile.spectrum[i - 1]!).toBeGreaterThanOrEqual(profile.spectrum[i]! - 1e-9);
    }
    // Sensitive dependence on initial conditions: the maximal exponent is clearly positive.
    expect(profile.leadingExponent).toBeGreaterThan(0.2);
    expect(profile.leadingExponent).toBe(profile.spectrum[0]);
    // Undamped Hamiltonian flow: the spectrum sums to ~0 and is ~symplectically paired.
    expect(Math.abs(profile.sum)).toBeLessThan(0.3);
    expect(Math.abs(profile.spectrum[0]! + profile.spectrum[7]!)).toBeLessThan(0.4);
    // Kaplan–Yorke dimension sits inside the phase space and above the trivial 0.
    expect(profile.kaplanYorkeDimension).toBeGreaterThan(2);
    expect(profile.kaplanYorkeDimension).toBeLessThanOrEqual(8);
  });

  test('timeline converges onto the real first two exponents (not a fabricated ratio)', () => {
    const profile = expansionLyapunovProfile({ model: 'chain', horizon: 14, dt: 0.003 });
    expect(profile.timeline.length).toBeGreaterThan(2);
    const last = profile.timeline[profile.timeline.length - 1]!;
    expect(last.leading).toBeCloseTo(profile.spectrum[0]!, 3);
    expect(last.secondary).toBeCloseTo(profile.spectrum[1]!, 3);
    // The retired placeholder forced secondary = -leading/(dim-1); a genuine
    // second exponent of this chaotic Hamiltonian system does not obey that.
    const fabricated = -last.leading / 7;
    expect(Math.abs(last.secondary - fabricated)).toBeGreaterThan(0.05);
  });

  test('coupled Hamiltonian: full spectrum sums to ~0 with symplectic pairing', () => {
    const profile = expansionLyapunovProfile({ model: 'coupled', horizon: 18, dt: 0.006 });
    expect(profile.spectrum).toHaveLength(4);
    expect(Math.abs(profile.sum)).toBeLessThan(0.2);
    expect(Math.abs(profile.spectrum[0]! + profile.spectrum[3]!)).toBeLessThan(0.2);
  });

  test('settings travel with the estimate so a bare number is never reported alone', () => {
    const profile = expansionLyapunovProfile({ model: 'coupled', horizon: 8, dt: 0.006 });
    expect(profile.settings.count).toBe(4);
    expect(profile.settings.dt).toBeGreaterThan(0);
    expect(profile.settings.steps).toBeGreaterThan(0);
    expect(profile.settings.renormEvery).toBeGreaterThan(0);
  });

  test('every exponent reports a block-bootstrap standard error and a consistency verdict', () => {
    const profile = expansionLyapunovProfile({ model: 'chain', horizon: 14, dt: 0.003 });
    expect(profile.blockStdError).toHaveLength(profile.spectrum.length);
    expect(profile.blockStdError.every((se) => Number.isFinite(se) && se >= 0)).toBe(true);
    // The Hamiltonian self-consistency gate is reported on the conservative chain.
    expect(profile.consistency.sum).toBeCloseTo(profile.sum, 6);
    expect(profile.consistency.pairingError).toBeGreaterThanOrEqual(0);
    expect(profile.consistency.tolerances.sumTolerance).toBeGreaterThan(0);
  });

  test('driven and chain use the exact analytic Jacobian, agreeing with central differences', () => {
    // Driven pendulum (closed-form Jacobian) — agreement to high precision.
    const drivenExact = expansionLyapunovProfile({ model: 'driven', horizon: 16, dt: 0.005 });
    const drivenFd = expansionLyapunovProfile(
      { model: 'driven', horizon: 16, dt: 0.005 },
      { forceNumericalJacobian: true }
    );
    expect(drivenExact.settings.jacobian).toBe('exact');
    expect(drivenFd.settings.jacobian).toBe('central-difference');
    drivenExact.spectrum.forEach((value, i) => {
      expect(value).toBeCloseTo(drivenFd.spectrum[i]!, 3);
    });

    // Planar chain (autodiff Jacobian) — chaotic, so allow a looser but tight band.
    const chainExact = expansionLyapunovProfile({ model: 'chain', horizon: 14, dt: 0.003 });
    const chainFd = expansionLyapunovProfile(
      { model: 'chain', horizon: 14, dt: 0.003 },
      { forceNumericalJacobian: true }
    );
    expect(chainExact.settings.jacobian).toBe('exact');
    expect(Math.abs(chainExact.leadingExponent - chainFd.leadingExponent)).toBeLessThan(0.05);
    expect(Math.abs(chainExact.sum - chainFd.sum)).toBeLessThan(0.05);
  });
});
