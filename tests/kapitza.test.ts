import { describe, expect, test } from 'vitest';
import {
  rhsKapitza,
  kapitzaEffectivePotential,
  kapitzaInvertedStable,
  kapitzaInvertedFrequency,
  KAPITZA_INVERTED_PRESET,
  type KapitzaParameters
} from '../src/physics/kapitza';
import { rk4Step } from '../src/physics/integrators';

/**
 * Kapitza pendulum. The headline physics — dynamic stabilization of the
 * inverted equilibrium when a²Ω² > 2gl — is pinned both by the analytic
 * effective-potential criterion and by direct integration of the exact
 * (non-averaged) equation of motion: with a strong fast drive the inverted
 * state stays bounded near θ=π, while with no drive it falls away.
 */

/** Max |θ - π| over a run started near the inverted state. */
function maxInvertedDeviation(params: KapitzaParameters, theta0: number, dt: number, steps: number): number {
  const state = Float64Array.of(theta0, 0, 0);
  const out = new Float64Array(3);
  let maxDev = Math.abs(theta0 - Math.PI);
  for (let k = 0; k < steps; k += 1) {
    rk4Step(state, dt, (s, o) => rhsKapitza(s, params, o), out);
    state.set(out);
    maxDev = Math.max(maxDev, Math.abs(state[0]! - Math.PI));
    expect(Number.isFinite(state[0]!)).toBe(true);
  }
  return maxDev;
}

describe('Kapitza — exact dynamics', () => {
  test('no drive recovers the ordinary pendulum frequency about θ=0', () => {
    const params: KapitzaParameters = { g: 9.81, length: 1, driveAmplitude: 0, driveFrequency: 0, damping: 0 };
    // Quarter period of small oscillation = (π/2)/ω₀, ω₀ = √(g/l).
    const state = Float64Array.of(1e-3, 0, 0);
    const out = new Float64Array(3);
    let prev = state[0]!;
    let tQuarter = NaN;
    for (let k = 1; k <= 200000; k += 1) {
      rk4Step(state, 2e-4, (s, o) => rhsKapitza(s, params, o), out);
      state.set(out);
      if (prev >= 0 && state[0]! < 0) {
        tQuarter = (k - state[0]! / (state[0]! - prev)) * 2e-4;
        break;
      }
      prev = state[0]!;
    }
    expect(tQuarter).toBeCloseTo(Math.PI / 2 / Math.sqrt(9.81), 3);
  });

  test('strong fast drive stabilizes the inverted state (stays bounded near π)', () => {
    expect(kapitzaInvertedStable(KAPITZA_INVERTED_PRESET)).toBe(true);
    const dev = maxInvertedDeviation(KAPITZA_INVERTED_PRESET, Math.PI + 0.1, 1e-4, 50000); // 5 s
    expect(dev).toBeLessThan(1.0); // oscillates about π rather than toppling (would approach π)
  });

  test('without drive the inverted state falls away', () => {
    const noDrive: KapitzaParameters = { g: 9.81, length: 1, driveAmplitude: 0, driveFrequency: 0, damping: 0 };
    expect(kapitzaInvertedStable(noDrive)).toBe(false);
    const dev = maxInvertedDeviation(noDrive, Math.PI + 0.1, 1e-3, 4000); // 4 s
    expect(dev).toBeGreaterThan(1.0); // topples
  });
});

describe('Kapitza — effective potential & criterion', () => {
  test('effective potential closed forms at θ=0 and θ=π', () => {
    const p = KAPITZA_INVERTED_PRESET;
    expect(kapitzaEffectivePotential(0, p)).toBeCloseTo(-p.g / p.length, 12);
    expect(kapitzaEffectivePotential(Math.PI, p)).toBeCloseTo(p.g / p.length, 12);
  });

  test('θ=π is a local minimum of Φ_eff exactly when stable', () => {
    const p = KAPITZA_INVERTED_PRESET;
    const h = 1e-4;
    const curvature =
      (kapitzaEffectivePotential(Math.PI + h, p) -
        2 * kapitzaEffectivePotential(Math.PI, p) +
        kapitzaEffectivePotential(Math.PI - h, p)) /
      (h * h);
    expect(curvature).toBeGreaterThan(0); // local min => stable
    // Analytic curvature (a²Ω²)/(2l²) - g/l.
    const aOmega = p.driveAmplitude * p.driveFrequency;
    expect(curvature).toBeCloseTo((aOmega * aOmega) / (2 * p.length * p.length) - p.g / p.length, 4);

    const weak: KapitzaParameters = { ...p, driveFrequency: 5 }; // a²Ω² = 0.04*25 = 1 < 2gl
    expect(kapitzaInvertedStable(weak)).toBe(false);
    expect(() => kapitzaInvertedFrequency(weak)).toThrow();
  });

  test('inverted small-oscillation frequency matches the slow envelope', () => {
    const p = KAPITZA_INVERTED_PRESET;
    const omegaSlow = kapitzaInvertedFrequency(p);
    expect(omegaSlow).toBeGreaterThan(0);
    // Measure the slow period directly: time for θ to return to π after release.
    const state = Float64Array.of(Math.PI + 0.05, 0, 0);
    const out = new Float64Array(3);
    const dt = 1e-4;
    let prev = state[0]! - Math.PI;
    let firstReturn = NaN;
    for (let k = 1; k <= 400000; k += 1) {
      rk4Step(state, dt, (s, o) => rhsKapitza(s, p, o), out);
      state.set(out);
      const d = state[0]! - Math.PI;
      // Released from +0.05 at rest (a turning point): θ reaches the centre
      // (d=0) after a quarter of the slow period, (π/2)/ω_slow.
      if (prev > 0 && d <= 0) {
        firstReturn = k * dt;
        break;
      }
      prev = d;
    }
    const quarterPeriodPredicted = Math.PI / 2 / omegaSlow;
    // Slow motion is modulated by the fast wiggle; accept 20% agreement.
    expect(firstReturn).toBeGreaterThan(0.8 * quarterPeriodPredicted);
    expect(firstReturn).toBeLessThan(1.2 * quarterPeriodPredicted);
  });
});
