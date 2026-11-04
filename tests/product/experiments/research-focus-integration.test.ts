import { describe, expect, it } from 'vitest';
import { executeResearchFocus } from '../../../src/product/experiments/research-focus-science';
import { researchPresetFields } from '../../../src/product/experiments/research-focus-definitions';
import { validateResearchResult } from '../../../src/product/experiments/research-focus-validation';

const ids = [
  ...Array.from({ length: 10 }, (_, i) => `4.${i + 1}`),
  ...Array.from({ length: 13 }, (_, i) => `5.${i + 1}`)
];
describe('S26 real adapters through the worker contract', () => {
  it.each(ids)('%s returns finite bounded native results and exact input lineage', (unitId) => {
    const fields = researchPresetFields(unitId),
      progress: number[] = [];
    const result = executeResearchFocus(unitId, fields, (value) => progress.push(value));
    expect(validateResearchResult(result, { id: `fixture_${unitId.replace('.', '_')}`, unitId, fields })).toEqual(
      result
    );
    expect(result.canonical.provenance?.source.id).toBe(`learn:course-${unitId[0]}:${unitId}:v1`);
    expect(result.charts.length + result.tables.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(progress.every((v, i) => Number.isFinite(v) && v >= 0 && v <= 1 && (i === 0 || v >= progress[i - 1]!))).toBe(
      true
    );
  });
});
