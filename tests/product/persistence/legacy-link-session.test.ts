import { describe, expect, it } from 'vitest';
import {
  previewLegacyMigration,
  confirmLegacyMigration,
  confirmLegacyLinkTransfer,
  defaultLegacyMigrationBase
} from '../../../src/product/persistence/legacy-migration';
import {
  LEGACY_LINK_SESSION_PREFIX,
  saveLegacyLinkSession,
  loadLegacyLinkSession,
  validateLegacyLinkSession
} from '../../../src/product/persistence/legacy-link-session';

const preview = () =>
  previewLegacyMigration('?th1=0.125&tab=lab&angleUnit=deg', {
    durationSeconds: 1,
    queryBase: defaultLegacyMigrationBase()
  });
describe('S28 complete legacy link handoff', () => {
  it('requires issued preview and stores only explicit, strictly revalidated full transfer', () => {
    const p = preview();
    expect(p.status).toBe('needs-transfer');
    expect(confirmLegacyMigration(p, p.id).ok).toBe(false);
    expect(() => confirmLegacyLinkTransfer(structuredClone(p), p.id)).toThrow();
    const transfer = confirmLegacyLinkTransfer(p, p.id),
      data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      }
    };
    expect(data.size).toBe(0);
    saveLegacyLinkSession(storage, transfer);
    expect(data.size).toBe(1);
    saveLegacyLinkSession(storage, transfer);
    expect(data.size).toBe(1);
    const loaded = loadLegacyLinkSession(storage, transfer.canonical)!;
    expect(loaded.sourceText).toBe(p.sourceText);
    expect(loaded.canonical).toEqual(p.canonical);
    expect(loaded.transferRequirements.length).toBeGreaterThan(0);
    expect([...data.keys()][0]).toBe(LEGACY_LINK_SESSION_PREFIX + p.id);
  });
  it('refuses corrupt source, mismatched canonical, conflicting IDs and quota without touching originals', () => {
    const p = preview(),
      transfer = confirmLegacyLinkTransfer(p, p.id);
    expect(() => validateLegacyLinkSession({ ...transfer, sourceText: '?th1=0.5' })).toThrow();
    expect(() => validateLegacyLinkSession({ ...transfer, complete: true })).toThrow();
    let reads = 0;
    const dangerous = Object.defineProperty({}, 'sourceText', {
      get() {
        reads++;
        return p.sourceText;
      },
      enumerable: true
    });
    expect(() => validateLegacyLinkSession(dangerous)).toThrow();
    expect(reads).toBe(0);
    const original = 'preserved-user-data',
      data = new Map([
        [LEGACY_LINK_SESSION_PREFIX + p.id, original],
        ['legacy-key', 'legacy-bytes']
      ]);
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      }
    };
    expect(() => saveLegacyLinkSession(storage, transfer)).toThrow();
    expect(data.get(LEGACY_LINK_SESSION_PREFIX + p.id)).toBe(original);
    expect(() => loadLegacyLinkSession(storage, transfer.canonical)).toThrow();
    expect(data.get('legacy-key')).toBe('legacy-bytes');
    expect(() =>
      saveLegacyLinkSession(
        {
          getItem: () => null,
          setItem() {
            throw new Error('quota');
          }
        },
        transfer
      )
    ).toThrow('quota');
  });

  it('reopens a full query envelope through a new preview without losing its explicit base or original source', () => {
    const p = preview();
    const file = JSON.stringify(p.compatibility);
    const restored = previewLegacyMigration(file, { durationSeconds: 1 });
    expect(restored.status).toBe('needs-transfer');
    expect(restored.compatibility).toEqual(p.compatibility);
    const transfer = confirmLegacyLinkTransfer(restored, restored.id);
    expect(transfer.sourceText).toBe(p.sourceText);
    expect(transfer.options.queryBase).toEqual(defaultLegacyMigrationBase());
    expect(validateLegacyLinkSession(transfer).compatibility).toEqual(p.compatibility);
    const conflict = previewLegacyMigration(file, { durationSeconds: 2 });
    expect(conflict.status).toBe('recovery-required');
    expect(conflict.issues[0]!.code).toBe('legacy-envelope-duration-conflict');
  });
  it('keeps a valid complete expansion suite pending for the native consumer even when its first method has no canonical projection', () => {
    const source = `#expansion=${btoa(JSON.stringify({ model: 'driven', dt: 0.005, horizon: 0.05, methods: ['gauss2', 'rk4'] }))}`;
    const p = previewLegacyMigration(source, { durationSeconds: 1 });
    expect(p.sourceKind).toBe('expansion');
    expect(p.status).toBe('needs-transfer');
    expect(p.compatibility?.sourceText).toBe(source);
    expect(p.canonical).toBeNull();
    expect(() => confirmLegacyLinkTransfer(p, p.id)).toThrow();
  });
});
