import { sha256Hex } from '../../research/zipBundle';
import { previewLegacyWorkspace, exportLegacyWorkspaceSource } from './legacy-workspace';
import {
  LEGACY_WORKSPACE_DATABASE,
  LEGACY_WORKSPACE_SCHEMA,
  workspaceAbort,
  type LegacyWorkspacePreview,
  type LegacyWorkspaceOptions,
  type LegacyWorkspaceArchiveIndex
} from './legacy-workspace-contracts';

const request = <T>(value: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error('별도 migration 저장에 실패했습니다.'));
  });
function done(tx: IDBTransaction, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      try {
        tx.abort();
      } catch {
        /* already complete */
      }
    };
    const clean = () => signal?.removeEventListener('abort', abort);
    tx.oncomplete = () => {
      clean();
      resolve();
    };
    tx.onabort = () => {
      clean();
      reject(tx.error ?? new DOMException('채택을 취소했습니다. 기존 프로젝트는 보존됩니다.', 'AbortError'));
    };
    tx.onerror = () => {
      clean();
      reject(tx.error ?? new Error('Migration archive transaction failed.'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
/** Separate product database, opened only after an explicit list/load/adopt action. Never touches legacy stores. */
export class LegacyWorkspaceStore {
  private db: IDBDatabase | undefined;
  constructor(private readonly factory: IDBFactory | null = globalThis.indexedDB ?? null) {}
  private async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (!this.factory)
      throw new Error('이 브라우저에서는 IndexedDB 저장을 지원하지 않습니다. 원본과 project ZIP을 내려받으세요.');
    const opening = this.factory.open(LEGACY_WORKSPACE_DATABASE, 1);
    opening.onupgradeneeded = () => {
      for (const name of ['archives', 'sources'])
        if (!opening.result.objectStoreNames.contains(name)) opening.result.createObjectStore(name, { keyPath: 'id' });
    };
    const db = await request(opening);
    if (!db.objectStoreNames.contains('archives') || !db.objectStoreNames.contains('sources')) {
      db.close();
      throw new Error('Migration DB 구조가 맞지 않습니다. 자동으로 삭제하거나 재구축하지 않았습니다.');
    }
    this.db = db;
    return db;
  }
  close() {
    this.db?.close();
    this.db = undefined;
  }
  async list(): Promise<LegacyWorkspaceArchiveIndex[]> {
    const db = await this.open(),
      tx = db.transaction('archives', 'readonly'),
      completion = done(tx);
    const output = (await request(tx.objectStore('archives').getAll(undefined, 33))) as LegacyWorkspaceArchiveIndex[];
    await completion;
    if (output.length > 32)
      throw new Error('가져온 archive 목록 상한32개를 넘었습니다. 데이터를 자동 삭제하지 않았습니다.');
    return output;
  }
  async save(preview: LegacyWorkspacePreview, signal?: AbortSignal): Promise<void> {
    workspaceAbort(signal);
    const source = exportLegacyWorkspaceSource(preview);
    if ((await sha256Hex(source)) !== preview.sourceSha256) throw new Error('채택할 원본 checksum이 다릅니다.');
    workspaceAbort(signal);
    const db = await this.open(),
      tx = db.transaction(['archives', 'sources'], 'readwrite'),
      completion = done(tx, signal);
    // Attach rejection handling before the first request can abort the transaction.
    const completed = completion.then(
      () => undefined,
      (error: unknown) => {
        throw error;
      }
    );
    try {
      const store = tx.objectStore('archives'),
        count = await request(store.count()),
        existing = await request(store.getKey(preview.id));
      if (count >= 32 && existing === undefined)
        throw new Error('이 product DB는 최대32개 archive를 보관합니다. 기존 자료를 자동 삭제하지 않았습니다.');
      const index: LegacyWorkspaceArchiveIndex = {
        id: preview.id,
        sourceKind: preview.sourceKind,
        sourceBytes: preview.sourceBytes,
        sourceSha256: preview.sourceSha256,
        importedAt: preview.importedAt,
        records: preview.records.length,
        parts: preview.parts.length
      };
      tx.objectStore('sources').put({
        id: preview.id,
        schema: LEGACY_WORKSPACE_SCHEMA,
        source,
        options: preview.options
      });
      store.put(index);
      await completed;
    } catch (cause) {
      try {
        tx.abort();
      } catch {
        /* completed or aborted */
      }
      await completed.catch(() => undefined);
      throw cause;
    }
  }
  async load(id: string, signal?: AbortSignal): Promise<LegacyWorkspacePreview> {
    workspaceAbort(signal);
    if (!/^legacy-migration-[a-f0-9]{24}-[a-f0-9]{12}$/.test(id))
      throw new Error('알 수 없는 migration archive ID입니다.');
    const db = await this.open(),
      tx = db.transaction(['archives', 'sources'], 'readonly'),
      completion = done(tx, signal);
    const [stored, index] = await Promise.all([
      request(tx.objectStore('sources').get(id)) as Promise<
        { schema?: string; source?: Uint8Array; options?: LegacyWorkspaceOptions } | undefined
      >,
      request(tx.objectStore('archives').get(id)) as Promise<LegacyWorkspaceArchiveIndex | undefined>
    ]);
    await completion;
    if (
      !stored ||
      !index ||
      stored.schema !== LEGACY_WORKSPACE_SCHEMA ||
      !(stored.source instanceof Uint8Array) ||
      !stored.options
    )
      throw new Error('저장한 원본 archive가 없거나 손상되었습니다.');
    const rebuilt = await previewLegacyWorkspace(stored.source, stored.options, signal);
    if (!rebuilt.ok) throw new Error(rebuilt.issues.map((issue) => issue.message).join(' '));
    if (
      rebuilt.value.id !== id ||
      rebuilt.value.sourceSha256 !== index.sourceSha256 ||
      rebuilt.value.sourceBytes !== index.sourceBytes
    )
      throw new Error('저장한 source archive와 checksum/index가 다릅니다.');
    return rebuilt.value;
  }
}
