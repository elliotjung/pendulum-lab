import { describe, expect, it } from 'vitest';
import {
  NETWORK_SYSTEM_IDS,
  defaultNetworkConfig,
  resizeNetworkConfig,
  type NetworkConfig
} from '../../../src/product/adapters/physics/network';
import { applyNetworkDraft } from '../../../src/product/lab/views/network-inspector';
import { serializeNetworkTopology } from '../../../src/product/lab/views/network-storage';
const values = (config: NetworkConfig): Record<string, number> => ({
  ...config.parameters,
  step: config.step,
  duration: config.duration,
  sampleEvery: config.sampleEvery ?? 1,
  ...Object.fromEntries(Object.entries(config.basin ?? {}).map(([key, value]) => [`basin-${key}`, value]))
});
describe('S15 atomic graph and condition editing', () => {
  it.each(NETWORK_SYSTEM_IDS)('%s applies the complete native draft without aliases', (id) => {
    const current = defaultNetworkConfig(id),
      before = structuredClone(current),
      result = applyNetworkDraft(current, values(current), serializeNetworkTopology(current));
    expect(result).toEqual(current);
    expect(result).not.toBe(current);
    expect(result.graph).not.toBe(current.graph);
    expect(current).toEqual(before);
  });
  it('can change chimera radius and its required graph in one atomic draft', () => {
    const current = defaultNetworkConfig('system:chimera-exploration'),
      next = resizeNetworkConfig(current, 16, 2),
      before = structuredClone(current);
    const result = applyNetworkDraft(current, values(next), serializeNetworkTopology(next));
    expect(result).toEqual(next);
    expect(current).toEqual(before);
  });
  it('rejects incomplete drafts, graph/state mismatches and crossed basin bounds without mutation', () => {
    const current = defaultNetworkConfig(),
      before = structuredClone(current),
      text = serializeNetworkTopology(current);
    for (const draft of [{}, { ...values(current), step: 0 }, { ...values(current), 'basin-xMin': 2, 'basin-xMax': 1 }])
      expect(() => applyNetworkDraft(current, draft, text)).toThrow();
    expect(() =>
      applyNetworkDraft(current, values(current), text.replace('"initialState": [', '"initialState": [42,'))
    ).toThrow();
    expect(current).toEqual(before);
  });
});
