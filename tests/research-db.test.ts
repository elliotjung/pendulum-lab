import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  migrateFromLocalStorageV2,
  ResearchDb,
  RESEARCH_DB_SCHEMA_VERSION,
  RESEARCH_DB_STORES,
  validateResearchDbArchive,
  type ResearchDbArchive
} from '../src/research/researchDb';

function freshDb(): ResearchDb {
  return new ResearchDb(new IDBFactory(), `test-db-${Math.random().toString(36).slice(2)}`);
}

describe('ResearchDb (IndexedDB store)', () => {
  it('creates all seven object stores and round-trips records', async () => {
    const db = freshDb();
    await db.open();
    await db.put('experiments', 'exp-1', { name: 'first' });
    await db.put('runLog', 'run-1', { type: 'export' });
    await db.put('figures', 'fig-1', { caption: 'fig', dataUrl: 'data:image/png;base64,AQ==' });
    expect((await db.get('experiments', 'exp-1'))?.payload).toEqual({ name: 'first' });
    expect(await db.count('runLog')).toBe(1);
    const counts = await db.counts();
    expect(Object.keys(counts).sort()).toEqual([...RESEARCH_DB_STORES].sort());
    expect(counts.experiments).toBe(1);
    expect(counts.bundles).toBe(0);
    db.close();
  });

  it('upserts, deletes, and clears', async () => {
    const db = freshDb();
    await db.put('settings', 'k', { v: 1 });
    await db.put('settings', 'k', { v: 2 });
    expect((await db.get('settings', 'k'))?.payload).toEqual({ v: 2 });
    await db.delete('settings', 'k');
    expect(await db.get('settings', 'k')).toBeUndefined();
    await db.putMany('runLog', [
      { id: 'a', payload: 1 },
      { id: 'b', payload: 2 }
    ]);
    expect(await db.count('runLog')).toBe(2);
    await db.clear('runLog');
    expect(await db.count('runLog')).toBe(0);
  });

  it('previews and deletes old content records while preserving recent work and settings', async () => {
    const db = freshDb();
    const old = '2025-01-01T00:00:00.000Z';
    const recent = '2026-07-01T00:00:00.000Z';
    const archive = {
      schemaVersion: RESEARCH_DB_SCHEMA_VERSION,
      exportedAt: recent,
      stores: Object.fromEntries(RESEARCH_DB_STORES.map((name) => [name, []]))
    } as unknown as ResearchDbArchive;
    archive.stores.experiments = [
      { id: 'old-exp', updatedAt: old, payload: { name: 'old' } },
      { id: 'recent-exp', updatedAt: recent, payload: { name: 'recent' } }
    ];
    archive.stores.figures = [{ id: 'old-figure', updatedAt: old, payload: { data: 'large' } }];
    archive.stores.settings = [{ id: 'old-setting', updatedAt: old, payload: { keep: true } }];
    await db.importArchive(archive, 'replace');

    const preview = await db.countOlderThan('2026-01-01T00:00:00.000Z');
    expect(preview.total).toBe(2);
    expect(preview.byStore.experiments).toBe(1);
    expect(preview.byStore.figures).toBe(1);
    const deleted = await db.deleteOlderThan('2026-01-01T00:00:00.000Z');
    expect(deleted.total).toBe(2);
    expect(await db.get('experiments', 'old-exp')).toBeUndefined();
    expect(await db.get('experiments', 'recent-exp')).toBeTruthy();
    expect(await db.get('settings', 'old-setting')).toBeTruthy();
  });

  it('exports and re-imports a full archive (replace and merge)', async () => {
    const db = freshDb();
    await db.put('experiments', 'exp-1', { name: 'one' });
    await db.put('parameterStudies', 'study-1', { variable: 'theta1' });
    const archive = await db.exportArchive();
    expect(archive.schemaVersion).toBe(RESEARCH_DB_SCHEMA_VERSION);
    expect(archive.stores.experiments).toHaveLength(1);

    const other = freshDb();
    await other.put('experiments', 'exp-existing', { name: 'keep-me' });
    const merged = await other.importArchive(archive, 'merge');
    expect(merged.imported).toBe(2);
    expect(await other.count('experiments')).toBe(2);

    const replaced = freshDb();
    await replaced.put('experiments', 'exp-existing', { name: 'gone' });
    await replaced.importArchive(archive, 'replace');
    expect(await replaced.count('experiments')).toBe(1);
    expect((await replaced.get('experiments', 'exp-1'))?.payload).toEqual({ name: 'one' });
  });

  it('replace import overwrites every store in one atomic transaction', async () => {
    // The replace path now clears and refills all stores inside a single
    // transaction, so it is all-or-nothing (no store left cleared-but-empty by an
    // interruption). This pins the observable contract: old ids gone, new ids in,
    // and a store omitted from the archive is emptied — all from one import call.
    const db = freshDb();
    await db.put('experiments', 'old-exp', { name: 'old' });
    await db.put('runLog', 'old-run', { type: 'old' });
    await db.put('settings', 'old-setting', { v: 0 });

    const archive = {
      schemaVersion: RESEARCH_DB_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      stores: {
        experiments: [{ id: 'new-exp', updatedAt: new Date().toISOString(), payload: { name: 'new' } }],
        runLog: [{ id: 'new-run', updatedAt: new Date().toISOString(), payload: { type: 'new' } }]
        // `settings` intentionally omitted -> emptied by replace
      }
    } as unknown as ResearchDbArchive;

    const { imported } = await db.importArchive(archive, 'replace');
    expect(imported).toBe(2);
    expect(await db.get('experiments', 'old-exp')).toBeUndefined();
    expect((await db.get('experiments', 'new-exp'))?.payload).toEqual({ name: 'new' });
    expect((await db.get('runLog', 'new-run'))?.payload).toEqual({ type: 'new' });
    expect(await db.count('settings')).toBe(0);
  });

  it('rejects malformed archives with explicit problems', async () => {
    expect(validateResearchDbArchive(null).ok).toBe(false);
    expect(validateResearchDbArchive({ schemaVersion: 'wrong', stores: {} }).ok).toBe(false);
    const badRecords = {
      schemaVersion: RESEARCH_DB_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      stores: { experiments: [{ noId: true }] }
    } as unknown as ResearchDbArchive;
    const verdict = validateResearchDbArchive(badRecords);
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join(' ')).toContain('without an id');
    await expect(freshDb().importArchive(badRecords)).rejects.toThrow(/invalid archive/);
  });

  it('reports unavailable cleanly when IndexedDB is absent', async () => {
    const db = new ResearchDb(null);
    expect(db.available()).toBe(false);
    const result = await migrateFromLocalStorageV2(db, '{}');
    expect(result.migrated).toBe(false);
    expect(result.reason).toContain('unavailable');
  });
});

describe('localStorage v2 -> IndexedDB migration', () => {
  const v2Payload = JSON.stringify({
    schemaVersion: 'pendulum-research-workbench/v2',
    experiments: [
      { id: 'exp-a', name: 'A' },
      { id: 'exp-b', name: 'B' }
    ],
    runLog: [{ id: 'run-a', type: 'export' }],
    parameterStudy: { id: 'study-a', variable: 'theta1' },
    batchCheckpoint: { id: 'batch-a', status: 'complete' },
    comparisonRows: [{ id: 'row-a' }]
  });

  it('migrates a v2 payload into the proper stores exactly once', async () => {
    const db = freshDb();
    const first = await migrateFromLocalStorageV2(db, v2Payload);
    expect(first.migrated).toBe(true);
    expect(first.entries).toBe(6);
    expect(await db.count('experiments')).toBe(2);
    expect(await db.count('runLog')).toBe(1);
    expect(await db.count('parameterStudies')).toBe(1);
    expect((await db.get('settings', 'batch-checkpoint'))?.payload).toEqual({ id: 'batch-a', status: 'complete' });

    const second = await migrateFromLocalStorageV2(db, v2Payload);
    expect(second.migrated).toBe(false);
    expect(second.reason).toBe('already migrated');
  });

  it('handles corrupted localStorage without throwing and never retries forever', async () => {
    const db = freshDb();
    const result = await migrateFromLocalStorageV2(db, '{"experiments": [BROKEN');
    expect(result.migrated).toBe(false);
    expect(result.reason).toContain('corrupted');
    // The corruption is recorded so the next load does not re-attempt.
    const again = await migrateFromLocalStorageV2(db, v2Payload);
    expect(again.reason).toBe('already migrated');
  });

  it('handles records missing ids by assigning deterministic ones', async () => {
    const db = freshDb();
    const result = await migrateFromLocalStorageV2(db, JSON.stringify({ experiments: [{ name: 'no-id' }] }));
    expect(result.migrated).toBe(true);
    expect((await db.get('experiments', 'migrated-exp-0'))?.payload).toEqual({ name: 'no-id' });
  });
});

describe('corruption recovery', () => {
  it('recreates the database when stores are missing', async () => {
    const factory = new IDBFactory();
    const name = 'recovery-db';
    // Create a database at the right version but with no object stores.
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(name, 1);
      request.onupgradeneeded = () => {
        /* intentionally create no stores */
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    const db = new ResearchDb(factory, name);
    await db.open();
    expect(db.recoveries).toBe(1);
    await db.put('experiments', 'after-recovery', { ok: true });
    expect(await db.count('experiments')).toBe(1);
  });
});
