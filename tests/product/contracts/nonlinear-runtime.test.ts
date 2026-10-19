import { describe, expect, it } from 'vitest';
import { validateExperimentState } from '../../../src/product/contracts/experiment-validation';
import {
  defaultNonlinearConfig,
  toCanonicalNonlinear,
  fromCanonicalNonlinear
} from '../../../src/product/adapters/physics/nonlinear';

describe('S14 versioned diagnostic time-response wrappers', () => {
  for (const systemId of ['system:mathieu', 'system:friction'] as const) {
    it(`${systemId} transports the tested time wrapper and preserves the legacy evaluation contract`, () => {
      const canonical = toCanonicalNonlinear(defaultNonlinearConfig(systemId));
      expect(canonical.ok).toBe(true);
      if (!canonical.ok) throw new Error(JSON.stringify(canonical.issues));
      expect(canonical.value.runtime.domain).toBe('time');
      expect(validateExperimentState(canonical.value).ok).toBe(true);
      expect(fromCanonicalNonlinear(canonical.value).ok).toBe(true);
      for (const modelVersion of ['legacy', 'unversioned', 'nonlinear-model-v2', 'model-v1']) {
        const legacy = { ...canonical.value, modelVersion };
        expect(validateExperimentState(legacy).ok).toBe(false);
        expect(validateExperimentState({ ...legacy, runtime: { domain: 'evaluation' } }).ok).toBe(true);
      }
      expect(validateExperimentState({ ...canonical.value, runtime: { domain: 'evaluation' } }).ok).toBe(false);
    });
  }
  it('does not permit time runtime for unrelated diagnostic tools with the wrapper version', () => {
    const canonical = toCanonicalNonlinear(defaultNonlinearConfig('system:mathieu'));
    if (!canonical.ok) throw new Error(JSON.stringify(canonical.issues));
    expect(validateExperimentState({ ...canonical.value, systemId: 'system:lattice-fk-limit' }).ok).toBe(false);
  });
});
