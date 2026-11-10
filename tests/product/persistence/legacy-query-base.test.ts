import { describe, expect, it } from 'vitest';
import type { ExperimentStateV1 } from '../../../src/product/contracts/experiment';
import { defaultChainConfig, toCanonicalChain } from '../../../src/product/adapters/physics/chain';
import {
  confirmLegacyLinkTransfer,
  defaultLegacyMigrationBase,
  previewLegacyMigration,
  validateLegacyMigrationBase
} from '../../../src/product/persistence/legacy-migration';
import { migrateLegacyLink, serializeLegacyLinkCompatibility } from '../../../src/product/persistence/legacy-link';
import {
  LEGACY_LINK_SESSION_PREFIX,
  loadLegacyLinkSession,
  saveLegacyLinkSession
} from '../../../src/product/persistence/legacy-link-session';

const source = '?th1=0.125&tab=lab';
function preview(base: ExperimentStateV1) {
  return previewLegacyMigration(source, { durationSeconds: 0.02, queryBase: base });
}
function storage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, text: string) => {
      data.set(key, text);
    }
  };
}

describe('S28 explicit legacy query base identity and strict options', () => {
  it.each(['double', 'compound-double', 'triple'] as const)(
    'uses a complete explicit %s default without guessing a URL family',
    (system) => {
      const base = defaultLegacyMigrationBase(system);
      expect(base.systemId).toBe(`system:${system}`);
      expect(defaultLegacyMigrationBase(`system:${system}`)).toEqual(base);
      expect(validateLegacyMigrationBase(base).ok).toBe(true);
      expect(preview(base).canonical?.systemId).toBe(base.systemId);
    }
  );
  it('keeps default double behavior and rejects unsupported family choices', () => {
    expect(defaultLegacyMigrationBase()).toEqual(defaultLegacyMigrationBase('double'));
    expect(() => defaultLegacyMigrationBase('system:chain' as 'double')).toThrow(/지원/);
    const unsupported = toCanonicalChain(defaultChainConfig('system:chain'));
    if (!unsupported.ok) throw new Error('fixture');
    const result = validateLegacyMigrationBase(unsupported.value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.code).toBe('unsupported-legacy-query-base');
    expect(preview(unsupported.value).canonical).toBeNull();
  });
  it('separates legitimate base-specific product keys and preserves every original key without overwrite', () => {
    const first = defaultLegacyMigrationBase('triple');
    const second: ExperimentStateV1 = {
      ...structuredClone(first),
      parameters: { ...first.parameters, masses: { kind: 'vector', values: [1, 2.75, 1], unit: 'kg' } }
    };
    const a = preview(first),
      b = preview(second),
      store = storage();
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/-base-[0-9a-f]+$/);
    for (const p of [a, b]) saveLegacyLinkSession(store, confirmLegacyLinkTransfer(p, p.id));
    expect([...store.data.keys()]).toEqual([LEGACY_LINK_SESSION_PREFIX + a.id, LEGACY_LINK_SESSION_PREFIX + b.id]);
    expect(loadLegacyLinkSession(store, a.canonical!)?.canonical).toEqual(a.canonical);
    expect(loadLegacyLinkSession(store, b.canonical!)?.canonical).toEqual(b.canonical);
    const before = [...store.data];
    saveLegacyLinkSession(store, confirmLegacyLinkTransfer(a, a.id));
    expect([...store.data]).toEqual(before);
    store.data.set(LEGACY_LINK_SESSION_PREFIX + a.id, 'unrelated preserved original');
    expect(() => saveLegacyLinkSession(store, confirmLegacyLinkTransfer(a, a.id))).toThrow(/덮어쓰지/);
    expect(store.getItem(LEGACY_LINK_SESSION_PREFIX + a.id)).toBe('unrelated preserved original');
  });
  it('hashes detached canonical values rather than key insertion order or caller identity', () => {
    const base = defaultLegacyMigrationBase('compound-double');
    const reordered = Object.fromEntries(Object.entries(base).reverse()) as unknown as ExperimentStateV1;
    expect(preview(reordered).id).toBe(preview(structuredClone(base)).id);
    const before = structuredClone(base);
    preview(base);
    expect(base).toEqual(before);
  });
  it('reopens original v1 envelope IDs and old product storage without rewriting either', () => {
    const base = defaultLegacyMigrationBase('triple'),
      oldId = 'legacy-v1-01234567-42';
    const linked = migrateLegacyLink(source, { sourceId: oldId, durationSeconds: 0.02, queryBase: base });
    if (!linked.ok || !linked.value.canonical) throw new Error('fixture');
    const text = serializeLegacyLinkCompatibility(linked.value.compatibility),
      store = storage();
    const original = {
      sourceText: source,
      canonical: linked.value.canonical,
      options: { sourceId: oldId, durationSeconds: 0.02, queryBase: base }
    };
    saveLegacyLinkSession(store, original);
    const before = [...store.data];
    const restored = previewLegacyMigration(text, { durationSeconds: 0.02 });
    expect(restored.compatibility).toEqual(linked.value.compatibility);
    expect(restored.canonical?.provenance?.source.id).toBe(oldId);
    expect(confirmLegacyLinkTransfer(restored, restored.id).options.sourceId).toBe(oldId);
    saveLegacyLinkSession(store, confirmLegacyLinkTransfer(restored, restored.id));
    expect(loadLegacyLinkSession(store, original.canonical)).toEqual(linked.value.compatibility);
    expect([...store.data]).toEqual(before);
    expect(serializeLegacyLinkCompatibility(restored.compatibility!)).toBe(text);
  });
  it.each(['durationSeconds', 'queryBase'])('rejects an options %s getter without evaluating it', (key) => {
    let calls = 0;
    const input = Object.defineProperty({ durationSeconds: 0.02 }, key, {
      enumerable: true,
      get() {
        calls++;
        throw new Error('must not run');
      }
    });
    const p = previewLegacyMigration(source, input);
    expect(p.status).toBe('recovery-required');
    expect(p.canonical).toBeNull();
    expect(calls).toBe(0);
  });
  it('rejects nested base accessors, toJSON and incomplete canonical input without invoking or repairing them', () => {
    let calls = 0;
    for (const base of [
      Object.defineProperty(defaultLegacyMigrationBase(), 'parameters', {
        enumerable: true,
        get() {
          calls++;
          return {};
        }
      }),
      {
        ...defaultLegacyMigrationBase(),
        toJSON() {
          calls++;
          return {};
        }
      },
      { schema: 'pendulum-experiment/v1', systemId: 'system:triple' }
    ]) {
      const p = previewLegacyMigration(source, { durationSeconds: 0.02, queryBase: base as ExperimentStateV1 });
      expect(p.status).toBe('recovery-required');
      expect(p.canonical).toBeNull();
    }
    expect(calls).toBe(0);
  });
  it.each([undefined, 0, -1, NaN, Infinity, 10000])(
    'retains the rejection contract for duration %s even with an explicit base',
    (durationSeconds) => {
      const p = previewLegacyMigration(source, { durationSeconds, queryBase: defaultLegacyMigrationBase() } as never);
      expect(p.status).toBe('recovery-required');
      expect(p.canonical).toBeNull();
    }
  );
});
