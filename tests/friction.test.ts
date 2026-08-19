import { describe, expect, it } from 'vitest';
import {
  applyStribeckFriction,
  coulombFrictionForce,
  staticFrictionComplementarityStep,
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

  it('uses exact complementarity for static stick and kinetic slip', () => {
    const contact = { mass: 2, dt: 0.1, staticLimit: 1.2, dynamicMagnitude: 0.7 };
    const stuck = staticFrictionComplementarityStep(0, 0.8, contact);
    expect(stuck).toMatchObject({ mode: 'stick', frictionForce: -0.8, nextVelocity: 0, coneResidual: 0 });
    expect(stuck.momentumResidual).toBe(0);

    const slipping = staticFrictionComplementarityStep(0, 2, contact);
    expect(slipping.mode).toBe('slip');
    expect(slipping.frictionForce).toBe(-0.7);
    expect(slipping.nextVelocity).toBeCloseTo(0.065, 14);
    expect(Math.abs(slipping.momentumResidual)).toBeLessThan(1e-14);
    expect(slipping.coneResidual).toBe(0);
  });
});
