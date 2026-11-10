import { describe, expect, it } from 'vitest';
import { integratorRegistry } from '../../../../src/physics/integratorRegistry';
import {
  LEGACY_ODE_INTEGRATOR_IDS,
  nativeOdeMethod,
  odeIntegratorLabel,
  odeIntegratorWarnings
} from '../../../../src/product/adapters/physics/planar-integrators';

describe('S28 lightweight native method presentation', () => {
  it.each(LEGACY_ODE_INTEGRATOR_IDS)('%s keeps the exact native name and symplectic qualification', (id) => {
    const method = nativeOdeMethod(id);
    const overrides = { rk4: 'RK4 (4차)', rk2: 'RK2 (2차)', euler: '명시적 Euler (1차)' };
    const expected = Object.hasOwn(overrides, method)
      ? overrides[method as keyof typeof overrides]
      : integratorRegistry[method].name;
    expect(odeIntegratorLabel(id)).toBe(expected);
    expect(odeIntegratorWarnings(id).some((warning) => warning.includes('심플렉틱 보장'))).toBe(
      integratorRegistry[method].symplectic !== 'no'
    );
  });
});
