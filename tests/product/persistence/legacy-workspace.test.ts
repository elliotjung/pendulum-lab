import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { integratorRegistry } from '../../../src/physics/integratorRegistry';
import type { IntegratorId } from '../../../src/types/domain';
import { textToBytes, bytesToText } from '../../../src/research/zipBundle';
import { validateResearchDbArchive } from '../../../src/research/researchDb';
import { validateWorkspaceImportDocument } from '../../../src/app/parity/storage-import-guards';
import { fromCanonicalPlanar } from '../../../src/product/adapters/physics/planar';
import { fromCanonicalChain } from '../../../src/product/adapters/physics/chain';
import { verifyResearchBundle } from '../../../src/product/provenance/project';
import { buildResearchPackage, importResearchPackage } from '../../../src/product/provenance/package';
import {
  previewLegacyWorkspace,
  confirmLegacyWorkspace,
  exportLegacyWorkspaceSource,
  exportLegacyWorkspaceAsset,
  exportLegacyWorkspaceRecord
} from '../../../src/product/persistence/legacy-workspace';
import { LEGACY_WORKSPACE_RECORDS_PER_PART } from '../../../src/product/persistence/legacy-workspace-project';
import {
  nativeArchive,
  nativeWorkspace,
  workspaceExperiment,
  workspaceSnapshot,
  workspaceOptions,
  tinyPng
} from './legacy-workspace-fixtures';

async function preview(source: unknown, kind: 'workspace' | 'research-db' = 'workspace') {
  const original = textToBytes(JSON.stringify(source, null, 2));
  const result = await previewLegacyWorkspace(original, { ...workspaceOptions, kind });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return { original, result: result.value };
}
describe('S28 real workspace and research database record migration', () => {
  it('reads a native-writer-shaped complete workspace and converts real project/session/run/configuration records', async () => {
    const source = nativeWorkspace();
    expect(validateWorkspaceImportDocument(source)).toEqual([]);
    const { original, result } = await preview(source);
    expect(result.records.map((record) => record.kind)).toEqual(
      expect.arrayContaining([
        'project',
        'session',
        'workspace',
        'experiment',
        'run-log',
        'plan',
        'point',
        'metrics',
        'settings'
      ])
    );
    expect(result.records.filter((record) => record.canonical).length).toBeGreaterThanOrEqual(3);
    expect(result.mappings).toHaveLength(result.records.length);
    expect(result.parts.flatMap((part) => part.project.runs).every((run) => run.status !== 'completed')).toBe(true);
    expect(
      result.parts.flatMap((part) => part.project.artifacts).some((artifact) => artifact.kind === 'configuration')
    ).toBe(true);
    expect(result.parts.every((part) => part.project.figures.length === 0)).toBe(true);
    expect(
      result.records.find((record) => record.sourcePath === '$.research (storage metadata)')?.payload
    ).toMatchObject({ migrations: [], droppedEntries: 0, schemaVersion: 'pendulum-research-workbench/v4' });
    expect(result.sourceSha256).toBe(createHash('sha256').update(original).digest('hex'));
    expect(exportLegacyWorkspaceSource(result)).toEqual(original);
    for (const part of result.parts) await expect(verifyResearchBundle(part)).resolves.toEqual(part);
  });

  it.each(['double', 'compound-double', 'triple'] as const)(
    'maps all16 original %s integrator IDs with tolerance, winding, signed seed and time',
    async (system) => {
      const source = nativeWorkspace(0);
      source.research.experiments = (Object.keys(integratorRegistry) as IntegratorId[]).map((method, index) =>
        workspaceExperiment(index, workspaceSnapshot(system, method))
      );
      const { result } = await preview(source);
      const snapshots = result.records.filter((record) => record.sourcePath.startsWith('$.research.experiments['));
      expect(snapshots).toHaveLength(16);
      for (const [index, record] of snapshots.entries()) {
        expect(record.canonical, record.issues.join(' ')).not.toBeNull();
        const canonical = record.canonical!;
        expect(canonical.integrator).toMatchObject({
          id: `integrator:${Object.keys(integratorRegistry)[index]}`,
          settings: { tolerance: { kind: 'scalar', value: 1e-8, unit: '1' } }
        });
        expect(canonical.seed?.value).toBe('-42');
        const config = system === 'triple' ? fromCanonicalChain(canonical) : fromCanonicalPlanar(canonical);
        expect(config.ok).toBe(true);
        if (config.ok) {
          expect(config.value.initialState).toEqual(source.research.experiments[index]!.snapshot.state);
          expect(config.value.startTime).toBe(4.2);
        }
      }
    }
  );

  it('maps all7 native DB stores, image/ZIP bytes, joined IDs and unknown setting values without opaque-only success', async () => {
    const source = nativeArchive();
    expect(validateResearchDbArchive(source)).toEqual({ ok: true, problems: [] });
    const { original, result } = await preview(source, 'research-db');
    const kinds = result.records.map((record) => record.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'experiment',
        'run-log',
        'plan',
        'point',
        'metrics',
        'image',
        'archive',
        'settings',
        'project',
        'session'
      ])
    );
    const image = result.records.find((record) => record.kind === 'image')!;
    expect(image.asset?.mediaType).toBe('image/png');
    expect(Buffer.from(exportLegacyWorkspaceAsset(result, image.id)).toString('base64')).toBe(tinyPng);
    const zip = result.records.find((record) => record.kind === 'archive')!;
    expect(bytesToText(exportLegacyWorkspaceAsset(result, zip.id)).includes('reports/source.txt')).toBe(true);
    const metrics = result.records.find((record) => record.kind === 'metrics')!;
    expect(metrics.links).toContain(result.records.find((record) => record.sourceId === 'point-a')!.id);
    expect(result.records.find((record) => record.sourceId === 'unknown-setting')?.payload).toEqual({
      arbitrary: ['원본', 0.12345678901234567],
      nested: { flag: true }
    });
    const exported = JSON.parse(bytesToText(exportLegacyWorkspaceRecord(result, image.id)));
    expect(exported.schema).toBe('pendulum-legacy-workspace-record/v1');
    expect(exported.record.payload).toEqual(source.stores.figures[0]!.payload);
    expect(exported.record.sourceMetadata.updatedAt).toBe(source.stores.figures[0]!.updatedAt);
    expect(exportLegacyWorkspaceSource(result)).toEqual(original);
  });

  it('partitions beyond S24 bounds with every original record and real run still present exactly once', async () => {
    const { result } = await preview(nativeWorkspace(LEGACY_WORKSPACE_RECORDS_PER_PART * 3));
    expect(result.parts.length).toBeGreaterThan(3);
    const mappings = result.mappings.map((mapping) => mapping.recordId);
    expect(new Set(mappings).size).toBe(result.records.length);
    expect(result.parts.reduce((sum, part) => sum + part.project.runs.length, 0)).toBe(result.records.length);
    expect(result.records.filter((record) => record.sourcePath.startsWith('$.research.experiments['))).toHaveLength(
      144
    );
    for (const part of result.parts)
      expect(part.project.runs.length).toBeLessThanOrEqual(LEGACY_WORKSPACE_RECORDS_PER_PART);
  });

  it('round-trips a real S24 project package with recognized runnable configurations', async () => {
    const { result } = await preview(nativeWorkspace());
    const bytes = await buildResearchPackage(result.parts[0]!);
    const restored = await importResearchPackage(bytes);
    expect(restored.project).toEqual(result.parts[0]!.project);
    expect(restored.project.runs.some((run) => run.experiment)).toBe(true);
    expect(restored.files.map((file) => [...file.data])).toEqual(result.parts[0]!.files.map((file) => [...file.data]));
  });

  it('records missing external artifact references without reading paths or inventing bytes', async () => {
    const source = nativeWorkspace();
    source.research.sessions[0]!.artifactManifest = [
      {
        id: 'old-external',
        label: '원본 외부 파일',
        path: 'C:/private/external.csv',
        kind: 'dataset',
        createdAt: workspaceOptions.importedAt
      }
    ];
    const { result } = await preview(source);
    const record = result.records.find((entry) => entry.kind === 'external-reference')!;
    const mapping = result.mappings.find((entry) => entry.recordId === record.id)!;
    const artifact = result.parts
      .flatMap((part) => part.project.artifacts)
      .find((item) => item.id.startsWith('missing-') && item.runId === mapping.runId)!;
    expect(artifact.status).toBe('missing');
    expect(artifact.bytes).toBe(0);
    expect(result.parts.flatMap((part) => part.files).some((file) => file.path.includes('private'))).toBe(false);
  });

  it('marks sparse or unsupported snapshots and invalid media unresolved while retaining typed data and exact source', async () => {
    const source = nativeArchive();
    source.stores.experiments[0]!.payload = { id: 'experiment-0', name: 'sparse original' };
    source.stores.figures[0]!.payload = { id: 'figure-a', dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' };
    const { result, original } = await preview(source, 'research-db');
    expect(result.records.find((record) => record.kind === 'experiment')?.status).toBe('unresolved');
    expect(result.records.find((record) => record.kind === 'image')?.status).toBe('unresolved');
    expect(result.warnings.join(' ')).toContain('미해결');
    expect(exportLegacyWorkspaceSource(result)).toEqual(original);
  });

  it('keeps missing reference IDs and design points without saved input explicitly unresolved', async () => {
    const source = nativeWorkspace();
    source.research.runLog[0]!.experimentId = 'missing-experiment';
    const { result } = await preview(source);
    const log = result.records.find((record) => record.kind === 'run-log')!;
    expect(log.status).toBe('unresolved');
    expect(log.canonical).toBeNull();
    expect(log.issues.join(' ')).toContain('missing-experiment');
    const design = result.records.find((record) => record.sourcePath === '$.designStudy.points[0]')!;
    expect(design.status).toBe('unresolved');
    expect(design.canonical).toBeNull();
    expect(design.payload).toEqual(source.designStudy.points[0]);
  });

  it('requires issued confirmation and detects mutated binary project data before adoption', async () => {
    const { result, original } = await preview(nativeWorkspace());
    expect((await confirmLegacyWorkspace({ ...result }, result.id)).ok).toBe(false);
    expect((await confirmLegacyWorkspace(result, 'wrong-id')).ok).toBe(false);
    const confirmed = await confirmLegacyWorkspace(result, result.id);
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) {
      expect(exportLegacyWorkspaceSource(confirmed.value.preview)).toEqual(original);
      expect(confirmed.value.preview.parts).not.toBe(result.parts);
      confirmed.value.source[0] = 0;
      expect(exportLegacyWorkspaceSource(result)).toEqual(original);
    }
    result.parts[0]!.files[0]!.data[0] = 0;
    expect((await confirmLegacyWorkspace(result, result.id)).ok).toBe(false);
    expect(exportLegacyWorkspaceSource(result)).toEqual(original);
  });

  it.each([
    '{"schemaVersion":"pendulum-workspace/v1","research":{},"research":{}}',
    '{"schemaVersion":"pendulum-workspace/v1","research":{"__proto__":{}}}',
    '{"schemaVersion":"pendulum-workspace/v1","research":{"experiments":{}}}',
    '{"schemaVersion":"pendulum-workspace/v1","research":{"bad":1e400}}'
  ])('rejects ambiguous/unsafe/type-confused data without normalizing it (%#)', async (text) => {
    expect((await previewLegacyWorkspace(textToBytes(text), { ...workspaceOptions, kind: 'workspace' })).ok).toBe(
      false
    );
  });

  it('rejects duplicate native DB record IDs and unknown stores', async () => {
    const source = nativeArchive();
    source.stores.experiments.push(source.stores.experiments[0]!);
    expect(
      (await previewLegacyWorkspace(textToBytes(JSON.stringify(source)), { ...workspaceOptions, kind: 'research-db' }))
        .ok
    ).toBe(false);
    const unknown = { ...nativeArchive(), stores: { ...nativeArchive().stores, malicious: [] } };
    expect(
      (await previewLegacyWorkspace(textToBytes(JSON.stringify(unknown)), { ...workspaceOptions, kind: 'research-db' }))
        .ok
    ).toBe(false);
  });

  it('honors original8/64MiB import bounds and cancellation without fake empty success', async () => {
    const text = `${JSON.stringify(nativeWorkspace())}${' '.repeat(8 * 1024 * 1024)}`;
    expect((await previewLegacyWorkspace(textToBytes(text), { ...workspaceOptions, kind: 'workspace' })).ok).toBe(
      false
    );
    expect((await previewLegacyWorkspace(new Uint8Array(64 * 1024 * 1024 + 1), workspaceOptions)).ok).toBe(false);
    const controller = new AbortController();
    controller.abort();
    const result = await previewLegacyWorkspace(
      textToBytes(JSON.stringify(nativeWorkspace())),
      workspaceOptions,
      controller.signal
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.code).toBe('legacy-workspace-cancelled');
  });

  it('preserves BOM and all original bytes, rejects unknown export IDs, and does not evaluate option getters', async () => {
    const original = new Uint8Array([239, 187, 191, ...textToBytes(JSON.stringify(nativeWorkspace()))]);
    const result = await previewLegacyWorkspace(original, workspaceOptions);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(exportLegacyWorkspaceSource(result.value)).toEqual(original);
      expect(() => exportLegacyWorkspaceRecord(result.value, 'missing')).toThrow('ID');
      expect(() => exportLegacyWorkspaceAsset(result.value, 'missing')).toThrow();
    }
    let reads = 0;
    const unsafe = {
      ...workspaceOptions,
      get sourceId() {
        reads++;
        return 'unsafe';
      }
    };
    expect((await previewLegacyWorkspace(textToBytes(JSON.stringify(nativeWorkspace())), unsafe)).ok).toBe(false);
    expect(reads).toBe(0);
  });
});
