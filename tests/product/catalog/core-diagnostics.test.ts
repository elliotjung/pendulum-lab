import { describe, expect, it } from 'vitest';
import { catalog, validateCatalog } from '../../../src/product/catalog';

describe('S18 diagnostic discovery', () => {
  it('keeps the native discovery contracts and advertises isolated product execution for exactly S18', () => {
    const ids = ['energy', 'fft', 'naff', 'poincare', 'lyapunov', 'sali-fli', 'zero-one', 'shadowing'];
    const definitions = catalog.analyses.filter((entry) => entry.integrationStage === 18);
    expect(definitions.map((entry) => entry.id)).toEqual(ids.map((id) => `analysis:${id}`));
    for (const definition of definitions) {
      expect(definition.legacyBindings.length).toBeGreaterThan(0);
      expect(definition.tags).toContain('product-core-diagnostics-v1');
      expect(definition.computation.location).toBe('worker');
      expect(definition.computation.cancellable).toBe(true);
    }
    expect(catalog.analyses.find((entry) => entry.id === 'analysis:rqa')!.tags).not.toContain(
      'product-core-diagnostics-v1'
    );
    expect(validateCatalog(catalog)).toEqual([]);
  });
});
