import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildZip,
  parseZip,
  textToBytes,
  bytesToText,
  checksumEntriesSha256,
  type ZipEntryInput
} from '../../../src/research/zipBundle';
import { addResearchArtifact, copyResearchBundle, verifyResearchBundle } from '../../../src/product/provenance/project';
import {
  buildResearchPackage,
  importResearchPackage,
  verifyResearchChecksums
} from '../../../src/product/provenance/package';
import { importLegacyResearchPackage } from '../../../src/product/provenance/compatibility';
import { bundleFixture, nativeFixture, timestamp } from './fixtures';
import { canonicalBatchFixture, canonicalModelFixture, changedCanonical, configOnlyRun } from './lineage-fixtures';

async function checkedZip(entries: ZipEntryInput[]): Promise<Uint8Array> {
  const originals = entries.filter((entry) => entry.path !== 'manifest/checksums.json');
  return buildZip([
    ...originals,
    {
      path: 'manifest/checksums.json',
      data: textToBytes(
        JSON.stringify({
          schemaVersion: 'pendulum-bundle-checksums/v2',
          generatedAt: timestamp,
          algorithm: 'sha256 + crc32 + fnv1a64',
          files: await checksumEntriesSha256(originals)
        })
      )
    }
  ]);
}
async function legacyZip(): Promise<Uint8Array> {
  return checkedZip([
    {
      path: 'manifest/submission.json',
      data: textToBytes(
        JSON.stringify({ schemaVersion: 'pendulum-submission/v10-ts', runtime: { hash: 'legacy-state' } })
      )
    },
    { path: 'manifest/provenance.json', data: textToBytes('{"schemaVersion":"pendulum-provenance/v1","nodes":[]}') },
    {
      path: 'paper/paper-pack.json',
      data: textToBytes(
        JSON.stringify({
          schemaVersion: 'pendulum-paper-pack/v2',
          currentSnapshot: { hash: 'legacy-state' },
          methodsMarkdown: '# Original methods',
          figures: []
        })
      )
    },
    { path: 'paper/notebook.ipynb', data: textToBytes('{"nbformat":4,"cells":[]}') },
    { path: 'figures/figure-01-main.png', data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) },
    { path: 'paper/untrusted.html', data: textToBytes('<script>throw new Error("never executed")</script>') }
  ]);
}
describe('S24 exact portable package and legacy compatibility', () => {
  it('round trips in a fresh bundle while preserving every native raw byte and schema/software/citations', async () => {
    let bundle = await bundleFixture();
    bundle = await addResearchArtifact(bundle, {
      runId: 'run-test',
      filename: 'native.json',
      data: nativeFixture().bytes
    });
    bundle.project.notebook.push({
      id: 'narrative',
      title: '관찰',
      text: 'θ₁ 변화 관찰',
      artifactIds: [bundle.project.artifacts.at(-1)!.id]
    });
    bundle.project.citations.push({ id: 'citation', text: '실험자의 참고 문헌', url: 'https://example.com/reference' });
    const bytes = await buildResearchPackage(bundle, {
      extraEntries: [
        { path: 'reviewer.html', data: textToBytes('<!doctype html><p>offline</p>') },
        { path: 'report.md', data: textToBytes('# 연구') }
      ]
    });
    const restored = await importResearchPackage(bytes);
    expect(restored).toEqual(bundle);
    expect(restored.files.map((file) => [...file.data])).toEqual(bundle.files.map((file) => [...file.data]));
    const entries = parseZip(bytes);
    await verifyResearchChecksums(entries);
    const marker = JSON.parse(bytesToText(entries.find((entry) => entry.path === 'manifest/package.json')!.data));
    expect(marker.software).toEqual(bundle.project.software);
    expect(marker.files).toHaveLength(entries.length);
  });
  it('preserves explicit missing source and includes an unavailable figure placeholder', async () => {
    const bundle = await bundleFixture(),
      source = bundle.project.artifacts[1]!;
    source.status = 'missing';
    source.note = '표본을 전달받지 못했습니다.';
    bundle.files.pop();
    bundle.project.figures.push({
      id: 'missing-figure',
      title: '누락 그림',
      caption: '자료가 없습니다.',
      runId: 'run-test',
      sourceArtifactId: source.id,
      xColumn: -1,
      yColumn: 0,
      theme: 'light'
    });
    const archive = await buildResearchPackage(bundle, {
      extraEntries: [
        { path: 'figures/missing-figure-unavailable.txt', data: textToBytes('Source artifact is explicitly missing.') }
      ]
    });
    expect((await importResearchPackage(archive)).project.artifacts[1]!.status).toBe('missing');
    expect(bytesToText(parseZip(archive).find((entry) => entry.path.endsWith('unavailable.txt'))!.data)).toContain(
      'missing'
    );
  });
  it('refuses checksum changes even if ZIP CRC has been validly regenerated', async () => {
    const entries = parseZip(await buildResearchPackage(await bundleFixture()));
    entries.find((entry) => entry.path.startsWith('artifacts/'))!.data[0] = 32;
    await expect(importResearchPackage(buildZip(entries))).rejects.toThrow(/checksum/);
  });
  it.each(['missing-row', 'duplicate-row', 'unknown-row', 'self-row', 'wrong-sha', 'wrong-size'])(
    'refuses non-exact checksum coverage: %s',
    async (attack) => {
      const entries = parseZip(await buildResearchPackage(await bundleFixture())),
        checksum = entries.find((entry) => entry.path === 'manifest/checksums.json')!;
      const manifest = JSON.parse(bytesToText(checksum.data));
      if (attack === 'missing-row') manifest.files.pop();
      if (attack === 'duplicate-row') manifest.files[1] = manifest.files[0];
      if (attack === 'unknown-row') manifest.files[0].path = 'other.txt';
      if (attack === 'self-row') manifest.files[0].path = 'manifest/checksums.json';
      if (attack === 'wrong-sha') manifest.files[0].sha256 = '0'.repeat(64);
      if (attack === 'wrong-size') manifest.files[0].bytes += 1;
      checksum.data = textToBytes(JSON.stringify(manifest));
      await expect(importResearchPackage(buildZip(entries))).rejects.toThrow();
    }
  );
  it('refuses unlisted package members despite a complete regenerated checksum manifest', async () => {
    const entries = parseZip(await buildResearchPackage(await bundleFixture()));
    entries.push({ path: 'hidden.txt', data: textToBytes('hidden'), crc32: 0 });
    await expect(importResearchPackage(await checkedZip(entries))).rejects.toThrow(/manifest/);
  });
  it('rejects malicious paths in imports before any external file can be used', async () => {
    const entries = parseZip(await buildResearchPackage(await bundleFixture()));
    entries.push({ path: 'CON.txt', data: textToBytes('device'), crc32: 0 });
    await expect(importResearchPackage(buildZip(entries))).rejects.toThrow(/경로/);
  });
  it.each(['../escape.txt', 'manifest/project.json', 'REVIEWER.HTML', 'figures/aux.svg'])(
    'refuses unsafe, reserved or noncanonical generated entry %s',
    async (path) => {
      await expect(
        buildResearchPackage(await bundleFixture(), { extraEntries: [{ path, data: textToBytes('x') }] })
      ).rejects.toThrow();
    }
  );
  it('refuses duplicate generated files', async () => {
    await expect(
      buildResearchPackage(await bundleFixture(), {
        extraEntries: [
          { path: 'report.md', data: textToBytes('one') },
          { path: 'report.md', data: textToBytes('two') }
        ]
      })
    ).rejects.toThrow(/중복/);
  });
  it('validates present artifact parser even if attacker recomputed all outer checksum rows', async () => {
    const bundle = await addResearchArtifact(await bundleFixture(), {
      runId: 'run-test',
      filename: 'native.json',
      data: nativeFixture().bytes
    });
    const entries = parseZip(await buildResearchPackage(bundle));
    const raw = entries.find((entry) => entry.path === bundle.project.artifacts.at(-1)!.path)!;
    const native = JSON.parse(bytesToText(raw.data));
    native.result.units[0] = 'kg';
    raw.data = textToBytes(JSON.stringify(native));
    // Leave artifact digest in project.json unchanged: the independently checked raw identity must reject first.
    await expect(importResearchPackage(await checkedZip(entries))).rejects.toThrow(/checksum/);
  });
  it('imports existing export with original whole ZIP, every original member and explicit partial status', async () => {
    const zip = await legacyZip(),
      original = parseZip(zip),
      bundle = await importLegacyResearchPackage(zip);
    expect(bundle.project.runs[0]!.status).toBe('partial');
    expect(bundle.project.runs[0]!.experiment).toBeUndefined();
    expect(bundle.project.artifacts[0]!.kind).toBe('legacy');
    expect(bundle.files[0]!.data).toEqual(zip);
    original.forEach((entry, index) => expect(bundle.files[index + 1]!.data).toEqual(entry.data));
    expect(await importResearchPackage(await buildResearchPackage(bundle))).toEqual(bundle);
  });
  it('refuses corrupted legacy checksums and unsupported paper schemas', async () => {
    const corrupt = parseZip(await legacyZip());
    corrupt.find((entry) => entry.path.endsWith('.png'))!.data[0] = 0;
    await expect(importLegacyResearchPackage(buildZip(corrupt))).rejects.toThrow(/checksum/);
    const future = parseZip(await legacyZip()),
      paper = future.find((entry) => entry.path === 'paper/paper-pack.json')!;
    paper.data = textToBytes('{"schemaVersion":"future","currentSnapshot":{},"methodsMarkdown":"#x"}');
    await expect(importLegacyResearchPackage(await checkedZip(future))).rejects.toThrow(/schema/);
  });
  it('never lets malformed new package fall back to legacy opaque mode', async () => {
    const entries = parseZip(await legacyZip());
    entries.push({ path: 'manifest/project.json', data: textToBytes('{}'), crc32: 0 });
    await expect(importLegacyResearchPackage(await checkedZip(entries))).rejects.toThrow(/우회/);
    const missingMarker = parseZip(await buildResearchPackage(await bundleFixture())).filter(
      (entry) => entry.path !== 'manifest/package.json'
    );
    const zip = await checkedZip(missingMarker);
    await expect(importResearchPackage(zip)).rejects.toThrow();
    await expect(importLegacyResearchPackage(zip)).rejects.toThrow(/우회/);
  });
  it('imports fs.readFile Buffer ZIPs in a fresh environment and exports exact native bytes again', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pendulum-s24-buffer-'));
    const filename = join(directory, 'research.zip');
    try {
      const bundle = await addResearchArtifact(await bundleFixture(), {
        runId: 'run-test',
        filename: 'native.json',
        data: nativeFixture().bytes
      });
      await writeFile(filename, await buildResearchPackage(bundle));
      const bytes = await readFile(filename);
      expect(Buffer.isBuffer(bytes)).toBe(true);
      const imported = await importResearchPackage(bytes);
      expect(imported).toEqual(bundle);
      const exported = await importResearchPackage(await buildResearchPackage(imported));
      expect(exported.files).toEqual(bundle.files);
      expect(exported.files.every((entry) => !Buffer.isBuffer(entry.data))).toBe(true);
    } finally {
      await unlink(filename).catch(() => undefined);
      await rmdir(directory);
    }
  });
  it('hashes only selected Buffer/typed-array view bytes and detaches source mutation', async () => {
    const raw = nativeFixture().bytes;
    const expected = createHash('sha256').update(raw).digest('hex');
    for (const buffer of [false, true]) {
      const storage = buffer ? Buffer.alloc(raw.length + 73, 0xa5) : new Uint8Array(raw.length + 73).fill(0x5a);
      storage.set(raw, 31);
      const view = storage.subarray(31, 31 + raw.length);
      let bundle = await addResearchArtifact(await bundleFixture(), {
        runId: 'run-test',
        filename: 'view.json',
        data: view
      });
      expect(bundle.project.artifacts.at(-1)!.sha256).toBe(expected);
      expect(bundle.files.at(-1)!.data).toEqual(raw);
      expect(bundle.files.at(-1)!.data.byteOffset).toBe(0);
      expect(bundle.files.at(-1)!.data.buffer.byteLength).toBe(raw.length);
      storage[31] = 0;
      expect(bundle.files.at(-1)!.data).toEqual(raw);
      // Verify accepts externally provided Buffer-backed raw files too.
      bundle = { ...bundle, files: bundle.files.map((file) => ({ path: file.path, data: Buffer.from(file.data) })) };
      const verified = await verifyResearchBundle(bundle),
        detached = copyResearchBundle(bundle);
      expect(verified.project.artifacts.at(-1)!.sha256).toBe(expected);
      expect(verified.files.every((file) => !Buffer.isBuffer(file.data))).toBe(true);
      bundle.files.at(-1)!.data[0] = 0;
      expect(detached.files.at(-1)!.data).toEqual(raw);
    }
  });
  it('verifies Buffer-backed member checksum rows and Buffer subarray ZIPs without prefix/suffix noise', async () => {
    const bundle = await bundleFixture();
    const extraBacking = Buffer.alloc(100, 0x61),
      extra = extraBacking.subarray(23, 42);
    const zip = await buildResearchPackage(bundle, { extraEntries: [{ path: 'report.md', data: extra }] });
    const stored = Buffer.alloc(zip.length + 97, 0x5f);
    stored.set(zip, 37);
    const archiveView = stored.subarray(37, 37 + zip.length);
    expect(await importResearchPackage(archiveView)).toEqual(bundle);
    const entries = parseZip(new Uint8Array(zip)).map((entry) => {
      const backing = Buffer.alloc(entry.data.length + 19, 0x77);
      backing.set(entry.data, 7);
      return { path: entry.path, data: backing.subarray(7, 7 + entry.data.length) };
    });
    await expect(verifyResearchChecksums(entries)).resolves.toBeUndefined();
    const manifest = JSON.parse(bytesToText(entries.find((entry) => entry.path === 'manifest/checksums.json')!.data));
    expect(manifest.files.find((file: { path: string }) => file.path === 'report.md').sha256).toBe(
      createHash('sha256').update(extra).digest('hex')
    );
  });
  it('normalizes legacy original Buffer archive and keeps its exact selected byte range', async () => {
    const zip = await legacyZip(),
      storage = Buffer.alloc(zip.length + 51, 0x6e);
    storage.set(zip, 18);
    const bundle = await importLegacyResearchPackage(storage.subarray(18, 18 + zip.length));
    expect(bundle.files[0]!.data).toEqual(zip);
    expect(bundle.project.artifacts[0]!.sha256).toBe(createHash('sha256').update(zip).digest('hex'));
    expect(await importResearchPackage(await buildResearchPackage(bundle))).toEqual(bundle);
  });
  it('rejects duplicate direct checksum-input paths before copying Buffer members', async () => {
    const entries = parseZip(new Uint8Array(await buildResearchPackage(await bundleFixture())));
    entries.push({ ...entries[0]!, data: Buffer.from(entries[0]!.data) });
    await expect(verifyResearchChecksums(entries)).rejects.toThrow(/중복/);
  });
  it.each(['batch', 'model'])(
    'rejects a false %s wrapper even after configuration and every outer checksum are correctly rewritten',
    async (kind) => {
      const native = kind === 'batch' ? canonicalBatchFixture() : await canonicalModelFixture();
      const bundle = await addResearchArtifact(await configOnlyRun(native.experiment), {
        runId: 'run-test',
        filename: `${kind}.json`,
        data: native.bytes
      });
      const entries = parseZip(await buildResearchPackage(bundle));
      const manifestEntry = entries.find((entry) => entry.path === 'manifest/project.json')!;
      const project = JSON.parse(bytesToText(manifestEntry.data)) as typeof bundle.project;
      const foreignExperiment = changedCanonical(native.experiment, 'runtime');
      project.runs[0]!.experiment = foreignExperiment;
      const configuration = project.artifacts.find((artifact) => artifact.kind === 'configuration')!;
      const configurationFile = entries.find((entry) => entry.path === configuration.path)!;
      configurationFile.data = textToBytes(JSON.stringify(foreignExperiment, null, 2));
      configuration.bytes = configurationFile.data.length;
      configuration.sha256 = createHash('sha256').update(configurationFile.data).digest('hex');
      manifestEntry.data = textToBytes(JSON.stringify(project));
      expect(entries.find((entry) => entry.path === bundle.project.artifacts.at(-1)!.path)!.data).toEqual(native.bytes);
      const forged = await checkedZip(entries);
      await expect(verifyResearchChecksums(parseZip(forged))).resolves.toBeUndefined();
      await expect(importResearchPackage(forged)).rejects.toThrow(/원본 설정과 run이 다릅니다/);
    }
  );
  it.each(['batch', 'model'])(
    'checks nested %s native result and source IDs against their exact original bytes',
    async (kind) => {
      const native = kind === 'batch' ? canonicalBatchFixture() : await canonicalModelFixture();
      const bundle = await addResearchArtifact(await configOnlyRun(native.experiment), {
        runId: 'run-test',
        filename: `${kind}.json`,
        data: native.bytes
      });
      for (const field of ['nativeId', 'nativeInputRunId'] as const) {
        const changed = structuredClone(bundle);
        changed.project.artifacts.at(-1)![field] = 'forged-native-identity';
        await expect(verifyResearchBundle(changed)).rejects.toThrow(/native schema·계보/);
      }
    }
  );
});
