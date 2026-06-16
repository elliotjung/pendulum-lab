import { describe, expect, it } from 'vitest';
import { createDrivenStroboscopicMap, continueExpansionNSBranch } from '../src/chaos/neimarkSackerBranch';
import type { DrivenParameters } from '../src/physics/driven';

const BASE: DrivenParameters = {
  g: 1,
  length: 1,
  damping: 0.5,
  driveAmplitude: 0.3,
  driveFrequency: 2 / 3
};

describe('createDrivenStroboscopicMap', () => {
  it('is deterministic — two calls with the same state produce identical output', () => {
    const sys = createDrivenStroboscopicMap(BASE, 64);
    const s = Float64Array.of(0.3, 0.1);
    const out1 = new Float64Array(2);
    const out2 = new Float64Array(2);
    sys.map(s, 0.3, out1);
    sys.map(s, 0.3, out2);
    expect(out1[0]).toBe(out2[0]);
    expect(out1[1]).toBe(out2[1]);
  });

  it('maps a period-1 fixed point to itself (stroboscopic self-consistency)', () => {
    const sys = createDrivenStroboscopicMap(BASE, 256);
    // center() should return a point that is a fixed point of the strobe
    const c = sys.center!(0.3);
    const s = Float64Array.of(c[0], c[1]);
    const out = new Float64Array(2);
    sys.map(s, 0.3, out);
    // The orbit is periodic, so map(center) ≈ center; tolerance relaxed because
    // the Newton convergence and the RK4 discretisation introduce small residuals.
    expect(Math.abs(out[0]! - c[0])).toBeLessThan(1e-5);
    expect(Math.abs(out[1]! - c[1])).toBeLessThan(1e-5);
  });

  it('center() returns a point consistent with the map fixed-point condition', () => {
    const sys = createDrivenStroboscopicMap(BASE, 128);
    const amplitude = 0.5;
    const c = sys.center!(amplitude);
    const s = Float64Array.of(c[0], c[1]);
    const out = new Float64Array(2);
    sys.map(s, amplitude, out);
    // |F(x*) - x*| < 1e-4 (Newton residual from drivenPeriodicOrbit + RK4 snapping error)
    const residual = Math.hypot(out[0]! - c[0], out[1]! - c[1]);
    expect(residual).toBeLessThan(1e-4);
  });
});

describe('continueExpansionNSBranch', () => {
  it('returns a continuation result with the expected shape', () => {
    // Just verify the call completes and returns plausible structure;
    // deep numerical validation is in tests/neimark-sacker-torus.test.ts.
    const result = continueExpansionNSBranch(
      { ...BASE, driveAmplitude: 0.3 },
      { start: 0.3, end: 0.31, step: 0.01, initialAmplitude: 0.05, stepsPerPeriod: 64, collocation: 9 }
    );
    expect(result.points.length).toBeGreaterThan(0);
    expect(typeof result.points[0]!.rotationNumber).toBe('number');
    expect(typeof result.points[0]!.amplitude).toBe('number');
    expect(result.caveat).toBeTruthy();
  });
});
