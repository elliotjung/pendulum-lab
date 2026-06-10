import { describe, expect, test } from 'vitest';
import {
  ellipticK,
  pendulumPeriodElliptic,
  measurePendulumPeriod,
  measurePeriodDoublingOnset,
  melnikovCriticalAmplitudeNumeric,
  runLiteratureAnchors
} from '../src/validation/literatureAnchors';
import { melnikovCriticalAmplitude } from '../src/chaos/index';

/**
 * Literature anchors pin engine output to numbers that exist *outside* the
 * codebase (textbook closed forms and published onsets), complementing the
 * self-consistency checks elsewhere in the suite.
 */

describe('elliptic integral and pendulum period', () => {
  test('K(0) = π/2 and the Legendre value K(1/√2) ≈ 1.85407467730137', () => {
    expect(ellipticK(0)).toBeCloseTo(Math.PI / 2, 14);
    expect(ellipticK(Math.SQRT1_2)).toBeCloseTo(1.854074677301372, 13);
  });

  test('small-amplitude limit recovers T → 2π/ω₀', () => {
    expect(pendulumPeriodElliptic(1e-6, 1)).toBeCloseTo(2 * Math.PI, 9);
  });

  test('measured RK4 period at θ₀ = 2 matches 4K(sin 1) to 1e-6', () => {
    const published = pendulumPeriodElliptic(2, 1);
    const computed = measurePendulumPeriod(2);
    expect(Math.abs(computed - published)).toBeLessThan(1e-6);
  });
});

describe('Melnikov quadrature anchor', () => {
  test('quadrature-based A_c matches the closed form to 1e-8', () => {
    const p = { g: 1, length: 1, damping: 0.5, driveAmplitude: 1.15, driveFrequency: 2 / 3 };
    expect(Math.abs(melnikovCriticalAmplitudeNumeric(p) - melnikovCriticalAmplitude(p))).toBeLessThan(1e-8);
  });
});

describe('period-doubling onset', () => {
  test('the Floquet −1 crossing lands at the literature A_PD ≈ 1.0663', () => {
    const pd = measurePeriodDoublingOnset();
    expect(pd.converged).toBe(true);
    expect(Math.abs(pd.onset - 1.0663)).toBeLessThan(5e-3);
  });
});

describe('full anchor report', () => {
  test('every anchor and structural check passes', () => {
    const report = runLiteratureAnchors();
    for (const anchor of report.anchors) {
      expect(anchor.pass, `${anchor.id}: computed ${anchor.computed} vs published ${anchor.published}`).toBe(true);
    }
    for (const check of report.checks) {
      expect(check.pass, `${check.id}: ${check.detail}`).toBe(true);
    }
    expect(report.allPass).toBe(true);
    expect(report.anchors.length).toBeGreaterThanOrEqual(5);
    expect(report.checks.length).toBeGreaterThanOrEqual(2);
  });
});
