/** Synthetic validator fixtures only, never real S28 certificates. */
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { evidenceHash } from '../../../scripts/redesign/parity-capture';
import { extractEmbeddedArtifact } from '../../../scripts/redesign/parity-artifacts';
import {
  decodeEmbeddedAttachment,
  parseRunnerReport,
  MAX_EMBEDDED_ATTACHMENT_BYTES
} from '../../../scripts/redesign/parity-runner-report';
import { validateParityCertificates } from '../../../scripts/redesign/parity-certificate';
import { cleanEvidenceFixtures, evidenceFixture } from './evidence-fixtures';
afterEach(cleanEvidenceFixtures);
function fixture() {
  const f = evidenceFixture(),
    raw = '{"schema":"synthetic-export/v1","value":4}\n';
  const attachment = {
    name: 'actual-inline-export',
    contentType: 'application/json',
    body: Buffer.from(raw).toString('base64')
  };
  function setAttachments(items: unknown[]) {
    f.rewriteReport('browser', (report) => {
      const suites = report.suites as { suites: { specs: { tests: { results: Record<string, unknown>[] }[] }[] }[] }[];
      Reflect.set(suites[0]!.suites[0]!.specs[0]!.tests[0]!.results[0]!, 'attachments', items);
    });
  }
  setAttachments([attachment]);
  const reference = f.bundle.captures.find((item) => item.id === 'browser')!;
  const item = f.bundle.rows[0]!.evidence.find((binding) => binding.facet === 'export')!;
  const identity = { file: item.file, title: item.title, project: item.project };
  return { ...f, raw, attachment, reference, item, identity, setAttachments };
}
describe('S28 exact executed embedded attachment bytes', () => {
  it('decodes canonical UTF8/binary data exactly and permits an explicit smaller byte bound', () => {
    for (const bytes of [Buffer.from('원본 θ 1.2345678901234567'), Buffer.from([0, 255, 128, 17]), Buffer.alloc(0)])
      expect(decodeEmbeddedAttachment(bytes.toString('base64'))).toEqual(bytes);
    expect(() => decodeEmbeddedAttachment(Buffer.from([1, 2, 3, 4]).toString('base64'), 3)).toThrow('bounded');
    expect(() => decodeEmbeddedAttachment('', MAX_EMBEDDED_ATTACHMENT_BYTES + 1)).toThrow('bound');
  });
  it.each([null, 2, {}, 'Zg', 'Zg=', 'Zh==', 'Zg==\n', '_w==', 'Zg===', 'Zg==AAAA'])(
    'rejects noncanonical embedded base64 %j',
    (body) => {
      expect(() => decodeEmbeddedAttachment(body)).toThrow();
    }
  );
  it('records digest/byte metadata from the exact passed case, not an invented output path', () => {
    const f = fixture(),
      parsed = parseRunnerReport(f.root, 'playwright', f.read('tmp/browser-report.json'));
    expect(parsed.errors).toEqual([]);
    expect(parsed.cases[0]!.attachments).toEqual([
      {
        name: f.attachment.name,
        contentType: 'application/json',
        embeddedSha256: evidenceHash(f.raw),
        embeddedBytes: Buffer.byteLength(f.raw)
      }
    ]);
    expect(parsed.cases[0]!.attachments[0]!.path).toBeUndefined();
  });
  it('extracts real unchanged report bytes and bridges the retained artifact to the exact named attachment', () => {
    const f = fixture();
    const retained = extractEmbeddedArtifact(f.root, f.reference, f.identity, f.attachment.name, 'tmp/extracted.json');
    expect(readFileSync(path.join(f.root, retained.path), 'utf8')).toBe(f.raw);
    Reflect.set(f.item, 'exported', {
      schemaOrMime: 'synthetic-export/v1',
      assertionOnly: false,
      retained,
      embeddedAttachmentName: f.attachment.name
    });
    expect(validateParityCertificates(f.root, f.bundle, f.policy).valid).toBe(true);
    expect(() =>
      extractEmbeddedArtifact(f.root, f.reference, f.identity, f.attachment.name, 'tmp/extracted.json')
    ).toThrow('overwrite');
  });
  it('allows duplicate unclaimed diagnostic names while the claimed embedded export stays unique', () => {
    const f = fixture();
    f.write('tmp/diagnostic-a.txt', 'first');
    f.write('tmp/diagnostic-b.txt', 'second');
    f.setAttachments([
      f.attachment,
      { name: 'diagnostic', path: path.join(f.root, 'tmp/diagnostic-a.txt') },
      { name: 'diagnostic', path: path.join(f.root, 'tmp/diagnostic-b.txt') }
    ]);
    expect(parseRunnerReport(f.root, 'playwright', f.read('tmp/browser-report.json')).errors).toEqual([]);
    const retained = extractEmbeddedArtifact(
      f.root,
      f.reference,
      f.identity,
      f.attachment.name,
      'tmp/unique-export.json'
    );
    Reflect.set(f.item, 'exported', {
      schemaOrMime: 'synthetic-export/v1',
      assertionOnly: false,
      retained,
      embeddedAttachmentName: f.attachment.name
    });
    expect(validateParityCertificates(f.root, f.bundle, f.policy).valid).toBe(true);
  });
  it.each([
    'wrong-name',
    'wrong-digest',
    'changed-file',
    'duplicate-name',
    'invalid-base64',
    'path-and-body',
    'no-bridge',
    'no-retained'
  ] as const)('rejects a %s portable artifact claim', (kind) => {
    const f = fixture();
    f.write('tmp/retained.json', f.raw);
    const exported = {
      schemaOrMime: 'synthetic-export/v1',
      assertionOnly: false,
      retained: { path: 'tmp/retained.json', sha256: evidenceHash(f.raw) },
      embeddedAttachmentName: f.attachment.name
    };
    if (kind === 'wrong-name') exported.embeddedAttachmentName = 'not-attached';
    if (kind === 'wrong-digest') exported.retained.sha256 = '0'.repeat(64);
    if (kind === 'changed-file') f.write('tmp/retained.json', 'changed retained bytes');
    if (kind === 'duplicate-name') f.setAttachments([f.attachment, { ...f.attachment }]);
    if (kind === 'invalid-base64') f.setAttachments([{ ...f.attachment, body: 'Zh==' }]);
    if (kind === 'path-and-body') f.setAttachments([{ ...f.attachment, path: path.join(f.root, 'tmp/export.json') }]);
    if (kind === 'no-bridge') Reflect.deleteProperty(exported, 'embeddedAttachmentName');
    if (kind === 'no-retained') {
      Reflect.deleteProperty(exported, 'retained');
      Reflect.set(exported, 'assertionOnly', true);
    }
    Reflect.set(f.item, 'exported', exported);
    expect(validateParityCertificates(f.root, f.bundle, f.policy).valid).toBe(false);
  });
  it('refuses changed report/capture identities, a wrong case, and output/source traversal', () => {
    const f = fixture();
    expect(() =>
      extractEmbeddedArtifact(
        f.root,
        { ...f.reference, sha256: '0'.repeat(64) },
        f.identity,
        f.attachment.name,
        'tmp/out.json'
      )
    ).toThrow('SHA-256');
    expect(() =>
      extractEmbeddedArtifact(
        f.root,
        f.reference,
        { ...f.identity, title: 'wrong case' },
        f.attachment.name,
        'tmp/out.json'
      )
    ).toThrow('Exact passed case');
    for (const output of ['src/overwritten.ts', 'tmp/../escape.json'])
      expect(() => extractEmbeddedArtifact(f.root, f.reference, f.identity, f.attachment.name, output)).toThrow();
    f.write('tmp/browser-report.json', '{}');
    expect(() => extractEmbeddedArtifact(f.root, f.reference, f.identity, f.attachment.name, 'tmp/out.json')).toThrow(
      'report SHA-256'
    );
    expect(existsSync(path.join(f.root, 'tmp/out.json'))).toBe(false);
  });
});
