import { describe, expect, it } from 'vitest';
import { catalog, validateCatalog } from '../../../src/product/catalog';
import { ADVANCED_DIAGNOSTIC_KINDS } from '../../../src/product/adapters/analysis/advanced/contracts';

describe('S19 advanced diagnostic discovery', () => {
  it('advertises isolated worker execution while retaining native input and binding contracts', () => {
    const definitions = catalog.analyses.filter((entry) => entry.integrationStage === 19);
    expect(definitions).toHaveLength(11);
    for (const definition of definitions) {
      expect(definition.tags).toContain('product-advanced-diagnostics-v1');
      expect(definition.computation.location).toBe('worker');
      expect(definition.computation.cancellable).toBe(true);
      expect(definition.legacyBindings.length).toBeGreaterThan(0);
      expect(definition.inputs.length).toBeGreaterThan(0);
      expect(definition.limitations.length).toBeGreaterThan(0);
      expect(definition.computation.cost.ko.length).toBeGreaterThan(10);
    }
    expect(definitions.map((entry) => entry.id)).toEqual(
      ADVANCED_DIAGNOSTIC_KINDS.filter((kind) => kind !== 'uncertainty').map((kind) => `analysis:${kind}`)
    );
    expect(catalog.analyses.find((entry) => entry.id === 'analysis:basin')!.tags).toContain('불확실성');
    expect(catalog.analyses.filter((entry) => entry.tags.includes('product-core-diagnostics-v1'))).toHaveLength(8);
    expect(validateCatalog(catalog)).toEqual([]);
  });
});
