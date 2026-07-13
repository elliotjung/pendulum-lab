import { describe, expect, test } from 'vitest';
import {
  findPeriodicOrbit,
  mapJacobianFD,
  ogyAnalyze,
  simulateOgyControl,
  type MapFn,
  type ParametrizedMapFn,
  type OgySpec
} from '../src/chaos/chaosControl';

/**
 * UPO detection and OGY chaos control on the Hénon map (a=1.4, b=0.3). The
 * fixed point and a genuine period-2 orbit are located by Newton shooting; the
 * fixed point is shown to be a saddle and then *stabilised* by OGY with small
 * parameter nudges, while the uncontrolled orbit escapes.
 */

const B = 0.3;
const A0 = 1.4;
const henon: MapFn = (x, out) => {
  out[0] = 1 - A0 * x[0]! * x[0]! + x[1]!;
  out[1] = B * x[0]!;
};
const henonParam: ParametrizedMapFn = (x, a, out) => {
  out[0] = 1 - a * x[0]! * x[0]! + x[1]!;
  out[1] = B * x[0]!;
};

describe('UPO detection (Newton shooting)', () => {
  test('locates the Hénon fixed point', () => {
    const result = findPeriodicOrbit(henon, [0.5, 0.1], 1);
    expect(result.converged).toBe(true);
    expect(result.residual).toBeLessThan(1e-10);
    expect(result.point[0]).toBeCloseTo(0.63135, 4);
    expect(result.point[1]).toBeCloseTo(0.18941, 4);
    const image: number[] = [0, 0];
    henon(result.point, image);
    expect(image[0]).toBeCloseTo(result.point[0]!, 10);
    expect(image[1]).toBeCloseTo(result.point[1]!, 10);
  });

  test('locates a genuine period-2 orbit (F²=x but F≠x)', () => {
    const result = findPeriodicOrbit(henon, [-0.5, 0.3], 2);
    expect(result.converged).toBe(true);
    const f1: number[] = [0, 0];
    const f2: number[] = [0, 0];
    henon(result.point, f1);
    henon(f1, f2);
    // Second iterate returns to the point ...
    expect(f2[0]).toBeCloseTo(result.point[0]!, 9);
    expect(f2[1]).toBeCloseTo(result.point[1]!, 9);
    // ... but the first iterate does not (so it is period 2, not a fixed point).
    expect(Math.hypot(f1[0]! - result.point[0]!, f1[1]! - result.point[1]!)).toBeGreaterThan(0.5);
  });
});

describe('OGY control', () => {
  function buildSpec(): OgySpec {
    const fp = findPeriodicOrbit(henon, [0.5, 0.1], 1).point;
    const jac = mapJacobianFD(henon, fp);
    return {
      fixedPoint: fp,
      jacobian: [
        [jac[0]![0]!, jac[0]![1]!],
        [jac[1]![0]!, jac[1]![1]!]
      ],
      parameterSensitivity: [-fp[0]! * fp[0]!, 0]
    };
  }

  test('the fixed point is a saddle with the expected eigenvalues', () => {
    const analysis = ogyAnalyze(buildSpec());
    expect(analysis.unstableEigenvalue).toBeCloseTo(-1.9237, 3);
    expect(analysis.stableEigenvalue).toBeCloseTo(0.1559, 3);
    expect(Math.abs(analysis.unstableEigenvalue)).toBeGreaterThan(1);
    expect(Math.abs(analysis.stableEigenvalue)).toBeLessThan(1);
  });

  test('OGY stabilises the UPO with small control; uncontrolled it escapes', () => {
    const spec = buildSpec();
    const start = [spec.fixedPoint[0]! + 0.01, spec.fixedPoint[1]!];
    const controlled = simulateOgyControl(
      henonParam,
      spec,
      { nominalParameter: A0, maxDelta: 0.05, region: 0.05, steps: 3000 },
      start
    );
    expect(controlled.captured).toBe(true);
    expect(controlled.settledDeviation).toBeLessThan(1e-6); // driven onto the UPO
    expect(controlled.maxControl).toBeGreaterThan(0); // control actually acted
    expect(controlled.maxControl).toBeLessThanOrEqual(0.05); // within authority

    const free = simulateOgyControl(
      henonParam,
      spec,
      { nominalParameter: A0, maxDelta: 0, region: 0.05, steps: 3000 },
      start
    );
    expect(free.captured).toBe(false); // no control ⇒ repelled along the unstable manifold
  });

  test('ogyAnalyze rejects non-saddle fixed points', () => {
    // Both eigenvalues stable.
    expect(() =>
      ogyAnalyze({
        fixedPoint: [0, 0],
        jacobian: [
          [0.5, 0],
          [0, 0.3]
        ],
        parameterSensitivity: [1, 0]
      })
    ).toThrow(/saddle/);
    // Complex eigenvalues (rotation).
    expect(() =>
      ogyAnalyze({
        fixedPoint: [0, 0],
        jacobian: [
          [0, 1],
          [-1, 0]
        ],
        parameterSensitivity: [1, 0]
      })
    ).toThrow(/saddle/);
  });
});
