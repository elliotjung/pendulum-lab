import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { ResearchDb, RESEARCH_DB_STORES } from '../../../src/research/researchDb';
import { textToBytes } from '../../../src/research/zipBundle';
import {
  previewLegacyWorkspace,
  exportLegacyWorkspaceSource,
  LEGACY_WORKSPACE_DATABASE
} from '../../../src/product/persistence/legacy-workspace';
import { LegacyWorkspaceStore } from '../../../src/product/persistence/legacy-workspace-store';
import { nativeArchive, nativeWorkspace, workspaceOptions } from './legacy-workspace-fixtures';
const stores: LegacyWorkspaceStore[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const store of stores.splice(0)) store.close();
});
async function fixture(source = nativeWorkspace()) {
  const bytes = textToBytes(JSON.stringify(source));
  const result = await previewLegacyWorkspace(bytes, workspaceOptions);
  if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join(' '));
  return result.value;
}
describe('separate product workspace adoption store', () => {
  it('does not open databases during pure preview and durably reconstructs all parts from exact source on reload', async () => {
    const factory = new IDBFactory(),
      open = vi.spyOn(factory, 'open');
    const preview = await fixture(nativeWorkspace(100));
    expect(open).not.toHaveBeenCalled();
    const store = new LegacyWorkspaceStore(factory);
    stores.push(store);
    await store.save(preview);
    expect(open).toHaveBeenCalledWith(LEGACY_WORKSPACE_DATABASE, 1);
    expect((await store.list())[0]).toMatchObject({
      id: preview.id,
      records: preview.records.length,
      parts: preview.parts.length,
      sourceSha256: preview.sourceSha256
    });
    store.close();
    const reopened = new LegacyWorkspaceStore(factory);
    stores.push(reopened);
    const restored = await reopened.load(preview.id);
    expect(exportLegacyWorkspaceSource(restored)).toEqual(exportLegacyWorkspaceSource(preview));
    expect(restored.records).toEqual(preview.records);
    expect(restored.parts).toEqual(preview.parts);
  });

  it('uses real native ResearchDb writer archives without opening or overwriting that legacy DB during migration/adoption', async () => {
    const factory = new IDBFactory(),
      native = new ResearchDb(factory, 'pendulum-lab-research');
    const input = nativeArchive();
    await native.importArchive(input, 'replace');
    const before = await native.exportArchive();
    const result = await previewLegacyWorkspace(textToBytes(JSON.stringify(before)), {
      ...workspaceOptions,
      kind: 'research-db'
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('fixture');
    const spy = vi.spyOn(factory, 'open');
    const store = new LegacyWorkspaceStore(factory);
    stores.push(store);
    await store.save(result.value);
    await store.load(result.value.id);
    expect(spy.mock.calls.every(([name]) => name === LEGACY_WORKSPACE_DATABASE)).toBe(true);
    for (const name of RESEARCH_DB_STORES)
      expect((await native.exportArchive()).stores[name]).toEqual(before.stores[name]);
    native.close();
  });

  it('atomically retains neither an index nor partial source after a quota/write failure', async () => {
    const factory = new IDBFactory(),
      store = new LegacyWorkspaceStore(factory);
    stores.push(store);
    const preview = await fixture();
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey
    ) {
      if (this.name === 'sources') throw new DOMException('test quota failure', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(store.save(preview)).rejects.toThrow('quota');
    expect(await store.list()).toEqual([]);
    vi.restoreAllMocks();
    await expect(store.load(preview.id)).rejects.toThrow('없거나');
    await store.save(preview);
    expect(await store.list()).toHaveLength(1);
  });

  it('rejects cancellation and unknown IDs without creating an archive or changing existing records', async () => {
    const store = new LegacyWorkspaceStore(new IDBFactory());
    stores.push(store);
    const preview = await fixture(),
      controller = new AbortController();
    controller.abort();
    await expect(store.save(preview, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(await store.list()).toEqual([]);
    await expect(store.load('../legacy-db')).rejects.toThrow('ID');
    await expect(new LegacyWorkspaceStore(null).list()).rejects.toThrow('IndexedDB');
  });
});
