import { describe, expect, it } from 'vitest';
import unit from '../../../content/learn/course-1/1.1';
import { defaultPlanarConfig, fromCanonicalPlanar } from '../../../src/product/adapters/physics/planar';
import { decodeShareToken } from '../../../src/product/persistence/share';
import { parseProductRoute } from '../../../src/product/contracts/routes';
import {
  focusCanonical,
  focusLabHref,
  focusSource,
  focusStorageKey,
  loadFocusConfig,
  saveFocusConfig
} from '../../../src/product/experiments/transfer';

const config = {
  ...defaultPlanarConfig('system:double'),
  initialState: [0.4, -0.7, 0.2, 0.1] as const,
  analyses: [{ id: 'analysis:energy' as const, algorithmVersion: 'planar-analysis-v1', settings: {} }],
  seed: { value: '42', generator: 'test', generatorVersion: 'v1' },
  provenance: {
    createdByVersion: 'v1',
    source: { kind: 'manual' as const },
    parentExperimentIds: ['parent-1'],
    sourceUnits: { 'initialConditions.theta1': 'deg' as const }
  }
};
function storage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    }
  };
}
describe('Focus canonical transfer and isolated session', () => {
  it('round trips values, units, analyses, seed and source through the unchanged share/route contract', () => {
    const original = structuredClone(config);
    const route = parseProductRoute(focusLabHref(unit, config));
    expect(route.ok).toBe(true);
    if (!route.ok || route.value.kind !== 'lab-system') throw new Error('route');
    const decoded = decodeShareToken(route.value.stateToken);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error('share');
    expect(decoded.value).toEqual(focusCanonical(unit, config));
    const restored = fromCanonicalPlanar(decoded.value);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error('planar');
    expect(restored.value.initialState).toEqual(config.initialState);
    expect(restored.value.analyses).toEqual(config.analyses);
    expect(restored.value.seed).toEqual(config.seed);
    expect(restored.value.provenance?.sourceUnits).toEqual(config.provenance.sourceUnits);
    expect(restored.value.provenance?.parentExperimentIds).toEqual(config.provenance.parentExperimentIds);
    expect(focusSource(decoded.value)).toEqual({
      unitId: '1.1',
      version: unit.contentVersion,
      href: '#/learn/course-1/1.1'
    });
    expect(config).toEqual(original);
  });
  it('restores per-unit sessions without touching legacy or progress keys', () => {
    const target = storage();
    target.setItem('legacy', 'unchanged');
    expect(loadFocusConfig(target, unit)).toBeNull();
    saveFocusConfig(target, unit, config);
    expect(loadFocusConfig(target, unit)?.initialState).toEqual(config.initialState);
    expect([...target.data.keys()]).toEqual(['legacy', focusStorageKey(unit)]);
    expect(target.getItem('legacy')).toBe('unchanged');
  });
  it.each(['not json', '{"schema":"future"}', 'x'.repeat(65537), '{"__proto__":{}}'])(
    'preserves malformed/oversize/future data',
    (raw) => {
      const target = storage();
      target.setItem(focusStorageKey(unit), raw);
      expect(() => loadFocusConfig(target, unit)).toThrow();
      expect(target.getItem(focusStorageKey(unit))).toBe(raw);
    }
  );
  it('rejects an otherwise valid session from another unit or version', () => {
    const target = storage();
    saveFocusConfig(target, unit, config);
    const raw = target.getItem(focusStorageKey(unit))!;
    target.setItem(focusStorageKey(unit), raw.replace('learn:course-1:1.1:', 'learn:course-1:1.2:'));
    expect(() => loadFocusConfig(target, unit)).toThrow(/출처/);
    target.setItem(focusStorageKey(unit), raw.replace('"contentVersion":1', '"contentVersion":999'));
    expect(() => loadFocusConfig(target, unit)).toThrow(/버전/);
  });
  it('does not turn opaque or inconsistent provenance into an arbitrary link', () => {
    const state = focusCanonical(unit, config);
    for (const id of [
      'https://example.com',
      'learn:course-1:8.1:v1',
      'learn:course-1:1.9:v1',
      'learn:course-1:1.1:v0',
      'learn:course-1:1.1:v999999999999999999999'
    ]) {
      expect(
        focusSource({ ...state, provenance: { ...state.provenance!, source: { kind: 'derived', id } } })
      ).toBeNull();
    }
  });
  it('propagates unavailable storage without fallback writes', () => {
    expect(() =>
      loadFocusConfig(
        {
          getItem() {
            throw new Error('denied');
          }
        },
        unit
      )
    ).toThrow('denied');
    expect(() =>
      saveFocusConfig(
        {
          setItem() {
            throw new Error('quota');
          }
        },
        unit,
        config
      )
    ).toThrow('quota');
  });
});
