import { describe, expect, it } from 'vitest';
import {
  applyStribeckFriction,
  coulombFrictionForce,
  stribeckFrictionForce,
  stribeckFrictionMagnitude
} from '../src/physics/friction';

const parameters = {
  staticFriction: 1.2,
  dynamicFriction: 0.7,
  stribeckVelocity: 0.4,
  regularizationVelocity: 0.01,
  viscous: 0.08
};

describe('Coulomb + Stribeck friction', () => {
  it('is odd and never injects mechanical power', () => {
    for (const velocity of [-5, -1, -0.1, -1e-3, 0, 1e-3, 0.1, 1, 5]) {
      const force = stribeckFrictionForce(velocity, parameters);
      expect(force * velocity).toBeLessThanOrEqual(1e-15);
      expect(force).toBeCloseTo(-stribeckFrictionForce(-velocity, parameters), 13);
    }
  });

  it('decays from static to dynamic friction across the Stribeck scale', () => {
    expect(stribeckFrictionMagnitude(0, parameters)).toBeCloseTo(parameters.staticFriction, 14);
    expect(stribeckFrictionMagnitude(4, parameters)).toBeCloseTo(parameters.dynamicFriction, 12);
    expect(stribeckFrictionMagnitude(0.2, parameters)).toBeGreaterThan(stribeckFrictionMagnitude(0.8, parameters));
  });

  it('regularizes Coulomb friction continuously through zero', () => {
    const p = { magnitude: 2, regularizationVelocity: 0.02, viscous: 0.1 };
    expect(coulombFrictionForce(0, p)).toBe(0);
    expect(coulombFrictionForce(1e-8, p)).toBeCloseTo(-coulombFrictionForce(-1e-8, p), 14);
    expect(coulombFrictionForce(1, p)).toBeCloseTo(-2.1, 8);
  });

  it('applies the law component-wise and rejects nonphysical parameters', () => {
    const out = applyStribeckFriction([-1, 0, 1], parameters, new Float64Array(3));
    expect(out[0]).toBeGreaterThan(0);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeLessThan(0);
    expect(() => stribeckFrictionForce(1, { ...parameters, staticFriction: 0.2 })).toThrow(/greater/);
  });
});
