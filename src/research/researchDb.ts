/**
 * IndexedDB-backed long-term research store. localStorage remains the small,
 * synchronous resume cache; everything that can grow (experiments, run log,
 * parameter studies and their results, captured figures, exported bundles)
 * lives here, with explicit schema versioning, quota inspection, corruption
 * recovery, and a portable full-database archive format.
 */

export const RESEARCH_DB_NAME = 'pendulum-lab-research';
export const RESEARCH_DB_VERSION = 1;
export const RESEARCH_DB_SCHEMA_VERSION = 'pendulum-research-db/v1';

export const RESEARCH_DB_STORES = [
  'experiments',
  'runLog',
  'parameterStudies',
  'studyResults',
  'figures',
  'bundles',
  'settings'
] as const;

export type ResearchDbStoreName = (typeof RESEARCH_DB_STORES)[number];

/** User-created, potentially large stores eligible for age-based cleanup. */
export const RESEARCH_DB_CONTENT_STORES: readonly ResearchDbStoreName[] = [
  'experiments', 'runLog', 'parameterStudies', 'studyResults', 'figures', 'bundles'
];

export interface ResearchDbRecord {
  id: string;
  updatedAt: string;
  payload: unknown;
}

export interface ResearchDbArchive {
  schemaVersion: typeof RESEARCH_DB_SCHEMA_VERSION;
  exportedAt: string;
  stores: Record<ResearchDbStoreName, ResearchDbRecord[]>;
}

export interface ResearchDbQuota {
  usageBytes: number;
  quotaBytes: number;
  usageFraction: number;
}

export interface ResearchDbCleanupSummary {
  cutoff: string;
  total: number;
  byStore: Partial<Record<ResearchDbStoreName, number>>;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });
}

export class ResearchDb {
  private db: IDBDatabase | null = null;
  /** Number of times the database had to be deleted and recreated after corruption. */
  recoveries = 0;

  constructor(
    private readonly factory: IDBFactory | null = typeof indexedDB === 'undefined' ? null : indexedDB,
    private readonly name = RESEARCH_DB_NAME
  ) {}

  available(): boolean {
    return this.factory !== null;
  }

  /** Open the database, recreating it from scratch if the stored data is corrupted. */
  async open(): Promise<void> {
    if (this.db || !this.factory) return;
    try {
      this.db = await this.openOnce();
    } catch {
      // Corruption recovery: a database that cannot even open is useless —
      // delete and recreate empty rather than leaving research storage dead.
      this.recoveries += 1;
      await requestToPromise(this.factory.deleteDatabase(this.name) as IDBRequest<unknown>).catch(() => undefined);
      this.db = await this.openOnce();
    }
  }

  private openOnce(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.factory!.open(this.name, RESEARCH_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of RESEARCH_DB_STORES) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // A database missing expected stores (e.g. created by a broken run) is
        // treated as corrupted so open() rebuilds it.
        const missing = RESEARCH_DB_STORES.some((store) => !db.objectStoreNames.contains(store));
        if (missing) {
          db.close();
          reject(new Error('research db is missing object stores'));
          return;
        }
        resolve(db);
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
      request.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });
  }

  private async store(name: ResearchDbStoreName, mode: IDBTransactionMode): Promise<{ store: IDBObjectStore; done: Promise<void> }> {
    await this.open();
    if (!this.db) throw new Error('IndexedDB unavailable');
    const tx = this.db.transaction(name, mode);
    return { store: tx.objectStore(name), done: transactionDone(tx) };
  }

  async put(name: ResearchDbStoreName, id: string, payload: unknown): Promise<void> {
    const { store, done } = await this.store(name, 'readwrite');
    const record: ResearchDbRecord = { id, updatedAt: new Date().toISOString(), payload };
    store.put(record);
    await done;
  }

  async putMany(name: ResearchDbStoreName, records: { id: string; payload: unknown }[]): Promise<void> {
    const { store, done } = await this.store(name, 'readwrite');
    const updatedAt = new Date().toISOString();
    for (const { id, payload } of records) store.put({ id, updatedAt, payload } satisfies ResearchDbRecord);
    await done;
  }

  async get(name: ResearchDbStoreName, id: string): Promise<ResearchDbRecord | undefined> {
    const { store } = await this.store(name, 'readonly');
    return requestToPromise(store.get(id) as IDBRequest<ResearchDbRecord | undefined>);
  }

  async getAll(name: ResearchDbStoreName): Promise<ResearchDbRecord[]> {
    const { store } = await this.store(name, 'readonly');
    const records = await requestToPromise(store.getAll() as IDBRequest<ResearchDbRecord[]>);
    return records.sort((a, b) => a.id.localeCompare(b.id));
  }

  async delete(name: ResearchDbStoreName, id: string): Promise<void> {
    const { store, done } = await this.store(name, 'readwrite');
    store.delete(id);
    await done;
  }

  async clear(name: ResearchDbStoreName): Promise<void> {
    const { store, done } = await this.store(name, 'readwrite');
    store.clear();
    await done;
  }

  async count(name: ResearchDbStoreName): Promise<number> {
    const { store } = await this.store(name, 'readonly');
    return requestToPromise(store.count());
  }

  async counts(): Promise<Record<ResearchDbStoreName, number>> {
    const out = {} as Record<ResearchDbStoreName, number>;
    for (const name of RESEARCH_DB_STORES) out[name] = await this.count(name);
    return out;
  }

  /** Count records older than an ISO cutoff without mutating the archive. */
  async countOlderThan(
    cutoff: string,
    stores: readonly ResearchDbStoreName[] = RESEARCH_DB_CONTENT_STORES
  ): Promise<ResearchDbCleanupSummary> {
    const cutoffMs = Date.parse(cutoff);
    if (!Number.isFinite(cutoffMs)) throw new Error('invalid cleanup cutoff');
    const byStore: Partial<Record<ResearchDbStoreName, number>> = {};
    let total = 0;
    for (const name of stores) {
      const records = await this.getAll(name);
      const count = records.filter((record) => {
        const updated = Date.parse(record.updatedAt);
        return Number.isFinite(updated) && updated < cutoffMs;
      }).length;
      byStore[name] = count;
      total += count;
    }
    return { cutoff: new Date(cutoffMs).toISOString(), total, byStore };
  }

  /** Delete only records older than the cutoff; settings are excluded by default. */
  async deleteOlderThan(
    cutoff: string,
    stores: readonly ResearchDbStoreName[] = RESEARCH_DB_CONTENT_STORES
  ): Promise<ResearchDbCleanupSummary> {
    const preview = await this.countOlderThan(cutoff, stores);
    if (preview.total === 0) return preview;
    for (const name of stores) {
      const records = await this.getAll(name);
      const cutoffMs = Date.parse(preview.cutoff);
      for (const record of records) {
        const updated = Date.parse(record.updatedAt);
        if (Number.isFinite(updated) && updated < cutoffMs) await this.delete(name, record.id);
      }
    }
    return preview;
  }

  /** Export every store as a portable JSON archive. */
  async exportArchive(): Promise<ResearchDbArchive> {
    const stores = {} as Record<ResearchDbStoreName, ResearchDbRecord[]>;
    for (const name of RESEARCH_DB_STORES) stores[name] = await this.getAll(name);
    return { schemaVersion: RESEARCH_DB_SCHEMA_VERSION, exportedAt: new Date().toISOString(), stores };
  }

  /** Import an archive. `replace` clears stores first; `merge` upserts by id. */
  async importArchive(archive: ResearchDbArchive, mode: 'replace' | 'merge' = 'merge'): Promise<{ imported: number }> {
    const validation = validateResearchDbArchive(archive);
    if (!validation.ok) throw new Error(`invalid archive: ${validation.problems.join('; ')}`);
    await this.open();
    if (!this.db) throw new Error('IndexedDB unavailable');
    let imported = 0;
    // A single transaction over every store, so the whole import is atomic. A
    // `replace` previously cleared each store in its own transaction and then
    // refilled it in another — an interruption (tab close, quota/clone error)
    // between the two left a store cleared-but-empty (silent data loss). Now any
    // failure aborts the one transaction and the prior data is rolled back intact.
    const tx = this.db.transaction([...RESEARCH_DB_STORES], 'readwrite');
    const done = transactionDone(tx);
    try {
      for (const name of RESEARCH_DB_STORES) {
        const store = tx.objectStore(name);
        if (mode === 'replace') store.clear();
        for (const record of archive.stores[name] ?? []) {
          store.put(record);
          imported += 1;
        }
      }
    } catch (error) {
      // A synchronous failure while queuing aborts the whole transaction, so a
      // `replace` can never leave a store cleared-but-not-refilled. Asynchronous
      // request failures abort the transaction the same way (rejecting `done`).
      try {
        tx.abort();
      } catch {
        // The transaction is already aborting/inactive; the abort is in flight.
      }
      throw error;
    }
    await done;
    return { imported };
  }

  /** Best-effort origin storage quota (null when the Storage API is unavailable). */
  async estimateQuota(): Promise<ResearchDbQuota | null> {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
    try {
      const estimate = await navigator.storage.estimate();
      const usageBytes = estimate.usage ?? 0;
      const quotaBytes = estimate.quota ?? 0;
      return { usageBytes, quotaBytes, usageFraction: quotaBytes > 0 ? usageBytes / quotaBytes : 0 };
    } catch {
      return null;
    }
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  /** Delete the database entirely (used by tests and explicit user reset). */
  async destroy(): Promise<void> {
    this.close();
    if (!this.factory) return;
    await requestToPromise(this.factory.deleteDatabase(this.name) as IDBRequest<unknown>).catch(() => undefined);
  }
}

export function validateResearchDbArchive(value: unknown): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (typeof value !== 'object' || value === null) return { ok: false, problems: ['archive is not an object'] };
  const archive = value as Partial<ResearchDbArchive>;
  if (archive.schemaVersion !== RESEARCH_DB_SCHEMA_VERSION) problems.push(`unexpected schemaVersion ${String(archive.schemaVersion)}`);
  if (typeof archive.stores !== 'object' || archive.stores === null) {
    problems.push('missing stores');
    return { ok: false, problems };
  }
  for (const name of RESEARCH_DB_STORES) {
    const records = (archive.stores as Record<string, unknown>)[name];
    if (records === undefined) continue;
    if (!Array.isArray(records)) {
      problems.push(`store ${name} is not an array`);
      continue;
    }
    for (const record of records) {
      const rec = record as Partial<ResearchDbRecord>;
      if (typeof rec?.id !== 'string' || rec.id.length === 0) {
        problems.push(`store ${name} has a record without an id`);
        break;
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

const MIGRATION_FLAG_ID = 'migrated-from-localstorage-v2';

/**
 * One-time migration of the localStorage research-workbench/v2 payload into
 * IndexedDB. Idempotent: a settings flag records the completed migration, and
 * unparseable/corrupted localStorage is reported rather than thrown.
 */
export async function migrateFromLocalStorageV2(
  db: ResearchDb,
  rawPayload: string | null
): Promise<{ migrated: boolean; entries: number; reason: string }> {
  if (!db.available()) return { migrated: false, entries: 0, reason: 'indexeddb unavailable' };
  const flag = await db.get('settings', MIGRATION_FLAG_ID);
  if (flag) return { migrated: false, entries: 0, reason: 'already migrated' };
  if (!rawPayload) {
    await db.put('settings', MIGRATION_FLAG_ID, { at: new Date().toISOString(), source: 'empty' });
    return { migrated: false, entries: 0, reason: 'no localStorage payload' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPayload);
  } catch (error) {
    await db.put('settings', MIGRATION_FLAG_ID, { at: new Date().toISOString(), source: 'corrupted' });
    return { migrated: false, entries: 0, reason: `corrupted localStorage payload (${error instanceof Error ? error.message : 'parse error'})` };
  }
  const source = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;
  let entries = 0;
  const experiments = Array.isArray(source.experiments) ? source.experiments : [];
  if (experiments.length > 0) {
    await db.putMany('experiments', experiments.map((experiment, index) => ({
      id: typeof (experiment as { id?: unknown })?.id === 'string' ? (experiment as { id: string }).id : `migrated-exp-${index}`,
      payload: experiment
    })));
    entries += experiments.length;
  }
  const runLog = Array.isArray(source.runLog) ? source.runLog : [];
  if (runLog.length > 0) {
    await db.putMany('runLog', runLog.map((entry, index) => ({
      id: typeof (entry as { id?: unknown })?.id === 'string' ? (entry as { id: string }).id : `migrated-run-${index}`,
      payload: entry
    })));
    entries += runLog.length;
  }
  if (source.parameterStudy && typeof source.parameterStudy === 'object') {
    const study = source.parameterStudy as { id?: unknown };
    await db.put('parameterStudies', typeof study.id === 'string' ? study.id : 'migrated-study', source.parameterStudy);
    entries += 1;
  }
  if (source.batchCheckpoint && typeof source.batchCheckpoint === 'object') {
    await db.put('settings', 'batch-checkpoint', source.batchCheckpoint);
    entries += 1;
  }
  if (Array.isArray(source.comparisonRows) && source.comparisonRows.length > 0) {
    await db.put('settings', 'comparison-rows', source.comparisonRows);
    entries += source.comparisonRows.length;
  }
  await db.put('settings', MIGRATION_FLAG_ID, { at: new Date().toISOString(), source: 'localStorage-v2', entries });
  return { migrated: entries > 0, entries, reason: entries > 0 ? 'migrated localStorage v2 payload' : 'empty localStorage payload' };
}
