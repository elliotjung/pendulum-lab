import { describe, expect, it } from 'vitest';
import { catalog, validateCatalog } from '../../../src/product/catalog';

describe('S20 stability workflow discovery', () => {
  it('retains all thirteen native definitions and advertises worker cancellation', () => {
    const entries = catalog.analyses.filter((entry) => entry.integrationStage === 20);
    expect(entries).toHaveLength(13);
    for (const entry of entries) {
      expect(entry.tags).toContain('product-stability-workflow-v1');
      expect(entry.computation.location).toBe('worker');
      expect(entry.computation.cancellable).toBe(true);
      expect(entry.legacyBindings.length).toBeGreaterThan(0);
      expect(entry.limitations.length).toBeGreaterThan(0);
    }
    expect(validateCatalog(catalog)).toEqual([]);
  });
});
