import { describe, expect, it } from 'vitest';
import {
  NONLINEAR_SYSTEM_IDS,
  defaultNonlinearConfig,
  createNonlinearSimulation,
  type NonlinearConfig
} from '../../../src/product/adapters/physics/nonlinear';
import { applyNonlinearDraft } from '../../../src/product/lab/views/nonlinear-inspector';

function values(config: NonlinearConfig): Record<string, number> {
  return {
    ...config.parameters,
    ...Object.fromEntries(config.initialState.map((value, i) => [`state-${i}`, value])),
    duration: config.duration,
    step: config.step,
    sampleEvery: config.sampleEvery ?? 1,
    'history-theta': config.history?.state[0] ?? 0,
    'history-omega': config.history?.state[1] ?? 0
  };
}
describe('S14 atomic model-specific edits and history retention', () => {
  it.each(NONLINEAR_SYSTEM_IDS)('%s applies one complete draft without aliases', (id) => {
    const current = defaultNonlinearConfig(id),
      before = structuredClone(current),
      draft = values(current);
    const result = applyNonlinearDraft(current, draft, current.history?.kind);
    expect(result).toEqual(current);
    expect(current).toEqual(before);
    draft['state-0'] = 99;
    expect(result.initialState[0]).toBe(current.initialState[0]);
  });
  it('rejects incomplete drafts and crossed friction limits atomically', () => {
    const config = defaultNonlinearConfig('system:friction'),
      before = structuredClone(config);
    expect(() => applyNonlinearDraft(config, { ...values(config), dynamicFriction: 99 })).toThrow();
    expect(() => applyNonlinearDraft(config, { ...values(config), step: 0 })).toThrow();
    expect(() => applyNonlinearDraft(config, {})).toThrow();
    expect(config).toEqual(before);
  });
  it('preserves full delay state for runtime edits and initializes new history for state/plant edits', () => {
    const simulation = createNonlinearSimulation(defaultNonlinearConfig('system:pyragas'));
    for (let i = 0; i < 120; i++) simulation.step();
    const current = simulation.serialize(),
      draft = values(current);
    const runtime = applyNonlinearDraft(current, { ...draft, duration: 2 }, current.history?.kind);
    expect(runtime.delayState).toEqual(current.delayState);
    expect(runtime.startTime).toBe(current.startTime);
    for (const patch of [{ 'state-0': 0.1 }, { feedbackGain: 0.2 }, { 'history-omega': 0.2 }]) {
      const changed = applyNonlinearDraft(current, { ...draft, ...patch }, 'linear');
      expect(changed.delayState).toBeUndefined();
      expect(current.delayState).toBeDefined();
    }
  });
});
