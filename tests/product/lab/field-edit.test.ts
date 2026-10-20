import { describe, expect, it } from 'vitest';
import {
  FIELD_SYSTEM_IDS,
  defaultFieldConfig,
  createFieldSimulation,
  type FieldConfig
} from '../../../src/product/adapters/physics/field';
import { applyFieldDraft } from '../../../src/product/lab/views/field-inspector';
const values = (config: FieldConfig): Record<string, number> => ({
  ...config.parameters,
  points: config.grid.points,
  length: config.grid.length,
  members: config.ensemble.members,
  step: config.step,
  duration: config.duration,
  sampleEvery: config.sampleEvery ?? 1
});
describe('S16 atomic normalized grid seed and initial data drafts', () => {
  it.each(FIELD_SYSTEM_IDS)('%s applies a complete draft without mutating caller data', (id) => {
    const config = defaultFieldConfig(id),
      before = structuredClone(config);
    const result = applyFieldDraft(
      config,
      values(config),
      JSON.stringify(config.initialState),
      config.grid.boundary,
      config.seed.value
    );
    expect(result).toEqual(config);
    expect(result).not.toBe(config);
    expect(config).toEqual(before);
  });
  it('rejects malformed, nonfinite, oversized mesh, missing values and fractional members atomically', () => {
    const config = defaultFieldConfig(),
      before = structuredClone(config);
    for (const [draft, text] of [
      [{}, '[]'],
      [{ ...values(config), members: 2.5 }, '[0.5,0]'],
      [{ ...values(config), points: 99999 }, '[0.5,0]'],
      [values(config), '[1e999,0]'],
      [values(config), '{"__proto__":{}}']
    ] as const)
      expect(() => applyFieldDraft(config, draft, text, config.grid.boundary, config.seed.value)).toThrow();
    expect(config).toEqual(before);
  });
  it('retains SG previous time level only with the same mesh initial data and dt', () => {
    const run = createFieldSimulation({ ...defaultFieldConfig('system:sine-gordon'), duration: 0.02 });
    run.step();
    const config = run.restartConfig(),
      exact = applyFieldDraft(
        config,
        values(config),
        JSON.stringify(config.initialState),
        config.grid.boundary,
        config.seed.value
      );
    expect(exact.previousField).toEqual(config.previousField);
    const changed = applyFieldDraft(
      config,
      { ...values(config), step: config.step / 2 },
      JSON.stringify(config.initialState),
      config.grid.boundary,
      config.seed.value
    );
    expect(changed.previousField).toBeUndefined();
    expect(config.previousField).toBeDefined();
  });
});
