import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAX_RESEARCH_DB_RECORDS,
  MAX_RESEARCH_DB_RECORDS_PER_STORE,
  MAX_WORKSPACE_IMPORT_BYTES,
  buildResearchDbImportPreview,
  formatResearchDbImportPreview,
  parseStorageImportJson,
  readStorageImportFile,
  validateWorkspaceImportDocument
} from '../src/app/parity/storage-import-guards';
import {
  RESEARCH_DB_SCHEMA_VERSION,
  RESEARCH_DB_STORES,
  validateResearchDbArchive,
  type ResearchDbArchive,
  type ResearchDbRecord,
  type ResearchDbStoreName
} from '../src/research/researchDb';

const VALID_UPDATED_AT = '2026-08-20T00:00:00.000Z';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/storage-import/${name}`, import.meta.url), 'utf8');
}

function emptyArchive(): ResearchDbArchive {
  return {
    schemaVersion: RESEARCH_DB_SCHEMA_VERSION,
    exportedAt: '2026-08-20T00:00:00.000Z',
    stores: Object.fromEntries(RESEARCH_DB_STORES.map((name) => [name, []])) as unknown as Record<
      ResearchDbStoreName,
      ResearchDbRecord[]
    >
  };
}

describe('storage import resource guards', () => {
  it('accepts current and sparse historical archive fixtures', () => {
    const workspace = parseStorageImportJson<Record<string, unknown>>(fixture('workspace-v1.json'), 'workspace');
    expect(workspace.ok).toBe(true);
    if (workspace.ok) expect(validateWorkspaceImportDocument(workspace.value)).toEqual([]);

    const archive = parseStorageImportJson<ResearchDbArchive>(fixture('research-db-v1.json'), 'research-db');
    expect(archive.ok).toBe(true);
    if (archive.ok) expect(validateResearchDbArchive(archive.value)).toEqual({ ok: true, problems: [] });

    const historical = parseStorageImportJson<ResearchDbArchive>(
      fixture('research-db-v1-historical.json'),
      'research-db'
    );
    expect(historical.ok).toBe(true);
    if (historical.ok) expect(validateResearchDbArchive(historical.value)).toEqual({ ok: true, problems: [] });
  });

  it('rejects an oversized file before file.text reads it', async () => {
    let reads = 0;
    const result = await readStorageImportFile(
      {
        name: 'pendulum_workspace.json',
        size: MAX_WORKSPACE_IMPORT_BYTES + 1,
        async text() {
          reads += 1;
          return '{"schemaVersion":"pendulum-workspace/v1","research":{}}';
        }
      },
      'workspace'
    );
    expect(reads).toBe(0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.code).toBe('IMPORT_SIZE_LIMIT');
      expect(result.diagnostic.message).toContain('before reading');
      expect(result.diagnostic.remediation).toContain('smaller');
    }
  });

  it('measures direct parser input in UTF-8 bytes', () => {
    const result = parseStorageImportJson('é'.repeat(Math.floor(MAX_WORKSPACE_IMPORT_BYTES / 2) + 1), 'workspace');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostic.code).toBe('IMPORT_SIZE_LIMIT');
  });

  it('never expands compressed input, including a disguised ZIP signature', async () => {
    let extensionReads = 0;
    const extension = await readStorageImportFile(
      {
        name: 'pendulum_research_db_archive.zip',
        size: 100,
        type: 'application/zip',
        async text() {
          extensionReads += 1;
          return '';
        }
      },
      'research-db'
    );
    expect(extensionReads).toBe(0);
    expect(extension.ok).toBe(false);
    if (!extension.ok) expect(extension.diagnostic.code).toBe('IMPORT_COMPRESSED_UNSUPPORTED');

    const disguised = await readStorageImportFile(
      {
        name: 'archive.json',
        size: 4,
        async text() {
          return 'PK\u0003\u0004';
        }
      },
      'research-db'
    );
    expect(disguised.ok).toBe(false);
    if (!disguised.ok) expect(disguised.diagnostic.code).toBe('IMPORT_COMPRESSED_UNSUPPORTED');
  });

  it('reports file read failures separately from JSON syntax failures', async () => {
    const result = await readStorageImportFile(
      {
        name: 'pendulum_workspace.json',
        size: 128,
        async text() {
          throw new Error('permission denied');
        }
      },
      'workspace'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.code).toBe('IMPORT_READ_FAILED');
      expect(result.diagnostic.remediation).toContain('permissions');
    }
  });

  it('rejects duplicate decoded keys before whole-document JSON.parse', () => {
    const result = parseStorageImportJson(fixture('workspace-duplicate-key.json'), 'workspace');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.code).toBe('IMPORT_DUPLICATE_KEY');
      expect(result.diagnostic.message).toContain('research');
    }
  });

  it('rejects escaped prototype-pollution keys', () => {
    const result = parseStorageImportJson(
      '{"schemaVersion":"pendulum-workspace/v1","research":{"\\u005f\\u005fproto\\u005f\\u005f":{}}}',
      'workspace'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostic.code).toBe('IMPORT_DANGEROUS_KEY');
  });

  it('bounds nesting iteratively without overflowing the call stack', () => {
    let text = 'null';
    for (let depth = 0; depth < 65; depth += 1) text = `{"child":${text}}`;
    expect(() => parseStorageImportJson(text, 'workspace')).not.toThrow();
    const result = parseStorageImportJson(text, 'workspace');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.code).toBe('IMPORT_COMPLEXITY_LIMIT');
      expect(result.diagnostic.message).toContain('depth');
    }
  });

  it('bounds array width, object width, total nodes, and individual strings', () => {
    const oversizedArray = `{"schemaVersion":"pendulum-workspace/v1","research":{},"rows":[${'0,'.repeat(10_000)}0]}`;
    const arrayResult = parseStorageImportJson(oversizedArray, 'workspace');
    expect(arrayResult.ok).toBe(false);
    if (!arrayResult.ok) expect(arrayResult.diagnostic.message).toContain('array');

    const properties = Array.from({ length: 10_001 }, (_, index) => `"p${index}":0`).join(',');
    const objectResult = parseStorageImportJson(
      `{"schemaVersion":"pendulum-workspace/v1","research":{},"wide":{${properties}}}`,
      'workspace'
    );
    expect(objectResult.ok).toBe(false);
    if (!objectResult.ok) expect(objectResult.diagnostic.message).toContain('property');

    const row = '{"a":0,"b":0,"c":0,"d":0,"e":0,"f":0,"g":0,"h":0,"i":0,"j":0}';
    const nodeResult = parseStorageImportJson(
      `{"schemaVersion":"pendulum-workspace/v1","research":{},"rows":[${Array(10_000).fill(row).join(',')}]}`,
      'workspace'
    );
    expect(nodeResult.ok).toBe(false);
    if (!nodeResult.ok) expect(nodeResult.diagnostic.message).toContain('node');

    const stringResult = parseStorageImportJson(
      `{"schemaVersion":"pendulum-workspace/v1","research":{},"blob":"${'x'.repeat(2 * 1024 * 1024 + 1)}"}`,
      'workspace'
    );
    expect(stringResult.ok).toBe(false);
    if (!stringResult.ok) expect(stringResult.diagnostic.message).toContain('string');
  });

  it('rejects overlong identifiers and invalid workspace collection limits', () => {
    const idResult = parseStorageImportJson(
      JSON.stringify({ schemaVersion: 'pendulum-workspace/v1', research: { id: 'x'.repeat(257) } }),
      'workspace'
    );
    expect(idResult.ok).toBe(false);
    if (!idResult.ok) expect(idResult.diagnostic.message).toContain('Identifier');

    expect(
      validateWorkspaceImportDocument({
        schemaVersion: 'pendulum-workspace/v1',
        research: {},
        designStudy: { variables: Array(5).fill({}), points: Array(257).fill({}) },
        figureCaptions: { figure: 'x'.repeat(401) }
      })
    ).toEqual(
      expect.arrayContaining([
        'designStudy exceeds the 4 variable limit',
        'designStudy exceeds the 256 point limit',
        'a figure caption exceeds the 400 character limit'
      ])
    );
  });

  it('enforces per-store, whole-archive, ID, and duplicate-record limits', () => {
    const perStore = emptyArchive();
    perStore.stores.experiments = Array.from({ length: MAX_RESEARCH_DB_RECORDS_PER_STORE + 1 }, (_, index) => ({
      id: `exp-${index}`,
      updatedAt: VALID_UPDATED_AT,
      payload: {}
    }));
    expect(validateResearchDbArchive(perStore).problems.join(' ')).toContain('record limit');

    const total = emptyArchive();
    for (const name of RESEARCH_DB_STORES.slice(0, 3)) {
      total.stores[name] = Array.from({ length: Math.floor(MAX_RESEARCH_DB_RECORDS / 3) + 1 }, (_, index) => ({
        id: `${name}-${index}`,
        updatedAt: VALID_UPDATED_AT,
        payload: {}
      }));
    }
    expect(validateResearchDbArchive(total).problems.join(' ')).toContain('total record limit');

    const badIds = emptyArchive();
    badIds.stores.settings = [
      { id: 'same', updatedAt: VALID_UPDATED_AT, payload: 1 },
      { id: 'same', updatedAt: VALID_UPDATED_AT, payload: 2 }
    ];
    expect(validateResearchDbArchive(badIds).problems.join(' ')).toContain('duplicate record id');
    badIds.stores.settings = [{ id: 'x'.repeat(257), updatedAt: VALID_UPDATED_AT, payload: null }];
    expect(validateResearchDbArchive(badIds).problems.join(' ')).toContain('longer than 256');

    expect(
      validateResearchDbArchive({ schemaVersion: RESEARCH_DB_SCHEMA_VERSION, stores: [] }).problems.join(' ')
    ).toContain('missing stores');
    const unexpectedStore = emptyArchive() as ResearchDbArchive & { stores: Record<string, ResearchDbRecord[]> };
    unexpectedStore.stores.surprise = [];
    expect(validateResearchDbArchive(unexpectedStore).problems.join(' ')).toContain('unexpected store');
  });

  it('requires own record fields, canonical timestamps, and a present payload', () => {
    const malformed = parseStorageImportJson<ResearchDbArchive>(
      fixture('research-db-v1-malformed-record.json'),
      'research-db'
    );
    expect(malformed.ok).toBe(true);
    if (malformed.ok)
      expect(validateResearchDbArchive(malformed.value).problems.join(' ')).toContain('without a payload');

    const inheritedId = Object.assign(Object.create({ id: 'inherited' }) as Record<string, unknown>, {
      updatedAt: VALID_UPDATED_AT,
      payload: {}
    });
    const archive = emptyArchive();
    archive.stores.experiments = [inheritedId as unknown as ResearchDbRecord];
    expect(validateResearchDbArchive(archive).problems.join(' ')).toContain('without an id');

    const inheritedUpdatedAt = Object.assign(
      Object.create({ updatedAt: VALID_UPDATED_AT }) as Record<string, unknown>,
      {
        id: 'own-id',
        payload: {}
      }
    );
    archive.stores.experiments = [inheritedUpdatedAt as unknown as ResearchDbRecord];
    expect(validateResearchDbArchive(archive).problems.join(' ')).toContain('valid ISO updatedAt');

    const inheritedPayload = Object.assign(Object.create({ payload: {} }) as Record<string, unknown>, {
      id: 'own-id',
      updatedAt: VALID_UPDATED_AT
    });
    archive.stores.experiments = [inheritedPayload as unknown as ResearchDbRecord];
    expect(validateResearchDbArchive(archive).problems.join(' ')).toContain('without a payload');

    archive.stores.experiments = [{ id: 'own-id', updatedAt: '2026-02-30', payload: {} }];
    expect(validateResearchDbArchive(archive).problems.join(' ')).toContain('valid ISO updatedAt');
  });

  it('applies minimal store-specific payload semantics without rejecting sparse history', () => {
    const malformedPayloads: Array<[ResearchDbStoreName, unknown]> = [
      ['experiments', []],
      ['runLog', { type: 42 }],
      ['parameterStudies', { points: {} }],
      ['studyResults', { results: [] }],
      ['figures', { dataUrl: 42 }],
      ['bundles', { bytes: -1 }],
      ['settings', undefined]
    ];
    for (const [name, payload] of malformedPayloads) {
      const archive = emptyArchive();
      archive.stores[name] = [{ id: `${name}-bad`, updatedAt: VALID_UPDATED_AT, payload }];
      expect(validateResearchDbArchive(archive).problems.join(' '), name).toContain('invalid payload');
    }
  });

  it('accepts the current payload families for every Research DB store', () => {
    const archive = emptyArchive();
    archive.stores.experiments = [
      {
        id: 'experiment-current',
        updatedAt: VALID_UPDATED_AT,
        payload: { id: 'experiment-current', name: 'Current experiment', tags: [], snapshot: {}, metrics: {} }
      }
    ];
    archive.stores.runLog = [
      {
        id: 'run-current',
        updatedAt: VALID_UPDATED_AT,
        payload: { id: 'run-current', type: 'export', method: 'rk4', system: 'double', metrics: {} }
      }
    ];
    archive.stores.parameterStudies = [
      {
        id: 'design:design-current',
        updatedAt: VALID_UPDATED_AT,
        payload: { id: 'design-current', variables: [], points: [] }
      }
    ];
    archive.stores.studyResults = [
      {
        id: 'study:point',
        updatedAt: VALID_UPDATED_AT,
        payload: { studyId: 'study', pointId: 'point', patch: {}, results: {} }
      }
    ];
    archive.stores.figures = [
      {
        id: 'figure-current',
        updatedAt: VALID_UPDATED_AT,
        payload: {
          id: 'figure-current',
          caption: 'Current figure',
          dataUrl: 'data:image/png;base64,AQ==',
          width: 640,
          height: 480
        }
      }
    ];
    archive.stores.bundles = [
      {
        id: 'bundle-current',
        updatedAt: VALID_UPDATED_AT,
        payload: { fileCount: 2, figureCount: 1, bytes: 3, zip: new Uint8Array([1, 2, 3]) }
      }
    ];
    archive.stores.settings = [
      { id: 'comparison-rows', updatedAt: VALID_UPDATED_AT, payload: [{ id: 'row-current' }] }
    ];
    expect(validateResearchDbArchive(archive)).toEqual({ ok: true, problems: [] });
  });

  it('calculates merge and replace impact without loading stored payloads', async () => {
    const archive = emptyArchive();
    archive.stores.experiments = [
      { id: 'existing', updatedAt: VALID_UPDATED_AT, payload: { updated: true } },
      { id: 'new', updatedAt: VALID_UPDATED_AT, payload: { added: true } }
    ];
    archive.stores.settings = [{ id: 'incoming-setting', updatedAt: VALID_UPDATED_AT, payload: true }];
    const ids: Partial<Record<ResearchDbStoreName, string[]>> = {
      experiments: ['existing', 'kept-only-on-merge'],
      settings: ['old-setting']
    };
    const requestedLimits: number[] = [];
    const preview = await buildResearchDbImportPreview(archive, {
      async getAllIds(name, maxIds) {
        requestedLimits.push(maxIds);
        return ids[name] ?? [];
      }
    });
    expect(requestedLimits.every((limit) => limit <= MAX_RESEARCH_DB_RECORDS_PER_STORE)).toBe(true);
    expect(preview.incomingTotal).toBe(3);
    expect(preview.existingTotal).toBe(3);
    expect(preview.conflictTotal).toBe(1);
    expect(preview.mergeAdds).toBe(2);
    expect(preview.replaceDeletes).toBe(2);
    const text = formatResearchDbImportPreview(preview, 2048);
    expect(text).toContain('MERGE adds 2 and overwrites 1');
    expect(text).toContain('REPLACE imports 3, overwrites 1, and deletes 2');
  });

  it('fails closed when a preview source violates its requested key cap', async () => {
    await expect(
      buildResearchDbImportPreview(emptyArchive(), {
        async getAllIds(_name, maxIds) {
          return Array.from({ length: maxIds + 1 }, (_, index) => `id-${index}`);
        }
      })
    ).rejects.toThrow('bounded preview contract');
  });

  it('returns actionable syntax diagnostics for corrupted JSON', () => {
    const result = parseStorageImportJson('{"schemaVersion":', 'workspace');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.code).toBe('IMPORT_INVALID_JSON');
      expect(result.diagnostic.remediation).toContain('intact');
    }
  });
});
