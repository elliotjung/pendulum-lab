/**
 * IndexedDB-backed long-term research store. localStorage remains the small,
 * synchronous resume cache; everything that can grow (experiments, run log,
 * parameter studies and their results, captured figures, exported bundles)
 * lives here, with explicit schema versioning, quota inspection, corruption
 * recovery, and a portable full-database archive format.
 */

import { isCanonicalIsoTimestamp, validResearchDbPayload } from './researchDbArchiveValidation';

export const RESEARCH_DB_NAME = 'pendulum-lab-research';
export const RESEARCH_DB_VERSION = 1;
export const RESEARCH_DB_SCHEMA_VERSION = 'pendulum-research-db/v1';
/** Import caps are part of the portable archive contract, not merely UI hints. */
export const MAX_RESEARCH_DB_RECORDS_PER_STORE = 10_000;
export const MAX_RESEARCH_DB_RECORDS = 25_000;
export const MAX_RESEARCH_DB_RECORD_ID_LENGTH = 256;

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
  'experiments',
  'runLog',
  'parameterStudies',
  'studyResults',
  'figures',
  'bundles'
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

export interface ResearchDbRecoveryArchive extends ResearchDbArchive {
  recovery: {
    complete: boolean;
    missingStores: ResearchDbStoreName[];
    sourceDatabase: string;
  };
}

/**
 * Opening detected a malformed database. The database is deliberately left in
 * place so the UI can offer salvage/export before the user explicitly rebuilds
 * it; no research data is deleted as a side effect of an ordinary read.
 */
export class ResearchDbRecoveryRequiredError extends Error {
  readonly code = 'RESEARCH_DB_RECOVERY_REQUIRED';

  constructor(
    readonly databaseName: string,
    readonly originalError: unknown
  ) {
    super(`Research database "${databaseName}" requires recovery before it can be used`);
    this.name = 'ResearchDbRecoveryRequiredError';
  }
}

/** Preview key enumeration stopped before allocating an attacker-sized array. */
export class ResearchDbPreviewLimitError extends Error {
  readonly code = 'RESEARCH_DB_PREVIEW_LIMIT';

  constructor(
    readonly storeName: ResearchDbStoreName,
    readonly maxIds: number
  ) {
    super(`Research DB store ${storeName} contains more than the preview limit of ${maxIds.toLocaleString()} records`);
    this.name = 'ResearchDbPreviewLimitError';
  }
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
  private recoveryError: unknown = null;
  /** Number of explicit, user-approved rebuilds completed after corruption. */
  recoveries = 0;

  constructor(
    private readonly factory: IDBFactory | null = typeof indexedDB === 'undefined' ? null : indexedDB,
    private readonly name = RESEARCH_DB_NAME
  ) {}

  available(): boolean {
    return this.factory !== null;
  }

  /** Open the database without mutating a malformed store. */
  async open(): Promise<void> {
    if (this.db || !this.factory) return;
    try {
      this.db = await this.openOnce();
      this.recoveryError = null;
    } catch (error) {
      this.recoveryError = error;
      throw new ResearchDbRecoveryRequiredError(this.name, error);
    }
  }

  recoveryRequired(): boolean {
    return this.recoveryError !== null;
  }

  /**
   * Best-effort, read-only salvage of every expected store that can still be
   * opened. Missing stores stay empty and are named in recovery metadata.
   */
  async exportRecoverableArchive(): Promise<ResearchDbRecoveryArchive> {
    if (!this.factory) throw new Error('IndexedDB unavailable');
    this.close();
    const raw = await this.openRaw();
    try {
      const stores = Object.fromEntries(RESEARCH_DB_STORES.map((store) => [store, []])) as unknown as Record<
        ResearchDbStoreName,
        ResearchDbRecord[]
      >;
      const missingStores = RESEARCH_DB_STORES.filter((store) => !raw.objectStoreNames.contains(store));
      for (const name of RESEARCH_DB_STORES) {
        if (missingStores.includes(name)) continue;
        const tx = raw.transaction(name, 'readonly');
        const records = await requestToPromise(tx.objectStore(name).getAll() as IDBRequest<ResearchDbRecord[]>);
        stores[name] = records;
      }
      return {
        schemaVersion: RESEARCH_DB_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        stores,
        recovery: {
          complete: missingStores.length === 0,
          missingStores,
          sourceDatabase: this.name
        }
      };
    } finally {
      raw.close();
    }
  }

  /** Delete and recreate only after an explicit recovery action. */
  async rebuildAfterCorruption(): Promise<void> {
    if (!this.factory) throw new Error('IndexedDB unavailable');
    if (!this.recoveryRequired()) throw new Error('Research database is not awaiting recovery');
    this.close();
    await requestToPromise(this.factory.deleteDatabase(this.name) as IDBRequest<unknown>);
    this.db = await this.openOnce();
    this.recoveryError = null;
    this.recoveries += 1;
  }

  private openRaw(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.factory!.open(this.name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB recovery open failed'));
      request.onblocked = () => reject(new Error('IndexedDB recovery open blocked'));
    });
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

  private async store(
    name: ResearchDbStoreName,
    mode: IDBTransactionMode
  ): Promise<{ store: IDBObjectStore; done: Promise<void> }> {
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

  /** Read primary keys with a bounded cursor; never materialize an unbounded getAllKeys() result. */
  async getAllIds(name: ResearchDbStoreName, maxIds = MAX_RESEARCH_DB_RECORDS_PER_STORE): Promise<string[]> {
    if (!Number.isSafeInteger(maxIds) || maxIds < 0 || maxIds > MAX_RESEARCH_DB_RECORDS_PER_STORE) {
      throw new RangeError(`Research DB key preview limit must be between 0 and ${MAX_RESEARCH_DB_RECORDS_PER_STORE}`);
    }
    const { store } = await this.store(name, 'readonly');
    return new Promise<string[]>((resolve, reject) => {
      const ids: string[] = [];
      const request = store.openKeyCursor();
      request.onerror = () => reject(request.error ?? new Error(`IndexedDB key cursor failed for ${name}`));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(ids);
          return;
        }
        if (ids.length >= maxIds) {
          reject(new ResearchDbPreviewLimitError(name, maxIds));
          return;
        }
        if (typeof cursor.key !== 'string') {
          reject(new Error(`Research DB store ${name} contains a non-string primary key`));
          return;
        }
        ids.push(cursor.key);
        cursor.continue();
      };
    });
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
  if (archive.schemaVersion !== RESEARCH_DB_SCHEMA_VERSION)
    problems.push(`unexpected schemaVersion ${String(archive.schemaVersion)}`);
  if (typeof archive.stores !== 'object' || archive.stores === null || Array.isArray(archive.stores)) {
    problems.push('missing stores');
    return { ok: false, problems };
  }
  for (const name in archive.stores) {
    if (Object.hasOwn(archive.stores, name) && !RESEARCH_DB_STORES.includes(name as ResearchDbStoreName)) {
      problems.push('archive contains an unexpected store');
      break;
    }
  }
  let totalRecords = 0;
  for (const name of RESEARCH_DB_STORES) {
    const records = (archive.stores as Record<string, unknown>)[name];
    if (records === undefined) continue;
    if (!Array.isArray(records)) {
      problems.push(`store ${name} is not an array`);
      continue;
    }
    totalRecords += records.length;
    if (records.length > MAX_RESEARCH_DB_RECORDS_PER_STORE) {
      problems.push(`store ${name} exceeds the ${MAX_RESEARCH_DB_RECORDS_PER_STORE.toLocaleString()} record limit`);
      continue;
    }
    const ids = new Set<string>();
    for (const record of records) {
      if (typeof record !== 'object' || record === null || Array.isArray(record)) {
        problems.push(`store ${name} contains a non-object record`);
        break;
      }
      const rec = record as Partial<ResearchDbRecord>;
      if (!Object.hasOwn(record, 'id') || typeof rec.id !== 'string' || rec.id.length === 0) {
        problems.push(`store ${name} has a record without an id`);
        break;
      }
      if (rec.id.length > MAX_RESEARCH_DB_RECORD_ID_LENGTH) {
        problems.push(`store ${name} has an id longer than ${MAX_RESEARCH_DB_RECORD_ID_LENGTH} characters`);
        break;
      }
      if (ids.has(rec.id)) {
        problems.push(`store ${name} contains a duplicate record id`);
        break;
      }
      if (!Object.hasOwn(record, 'updatedAt') || !isCanonicalIsoTimestamp(rec.updatedAt)) {
        problems.push(`store ${name} has a record without a valid ISO updatedAt`);
        break;
      }
      if (!Object.hasOwn(record, 'payload')) {
        problems.push(`store ${name} has a record without a payload`);
        break;
      }
      if (!validResearchDbPayload(name, rec.id, rec.payload, MAX_RESEARCH_DB_RECORD_ID_LENGTH)) {
        problems.push(`store ${name} has a record with an invalid payload`);
        break;
      }
      ids.add(rec.id);
    }
  }
  if (totalRecords > MAX_RESEARCH_DB_RECORDS)
    problems.push(`archive exceeds the ${MAX_RESEARCH_DB_RECORDS.toLocaleString()} total record limit`);
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
    return {
      migrated: false,
      entries: 0,
      reason: `corrupted localStorage payload (${error instanceof Error ? error.message : 'parse error'})`
    };
  }
  const source = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;
  let entries = 0;
  const experiments = Array.isArray(source.experiments) ? source.experiments : [];
  if (experiments.length > 0) {
    await db.putMany(
      'experiments',
      experiments.map((experiment, index) => ({
        id:
          typeof (experiment as { id?: unknown })?.id === 'string'
            ? (experiment as { id: string }).id
            : `migrated-exp-${index}`,
        payload: experiment
      }))
    );
    entries += experiments.length;
  }
  const runLog = Array.isArray(source.runLog) ? source.runLog : [];
  if (runLog.length > 0) {
    await db.putMany(
      'runLog',
      runLog.map((entry, index) => ({
        id:
          typeof (entry as { id?: unknown })?.id === 'string' ? (entry as { id: string }).id : `migrated-run-${index}`,
        payload: entry
      }))
    );
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
  return {
    migrated: entries > 0,
    entries,
    reason: entries > 0 ? 'migrated localStorage v2 payload' : 'empty localStorage payload'
  };
}
