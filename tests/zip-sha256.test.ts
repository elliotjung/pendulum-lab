import { describe, expect, it } from 'vitest';
import { buildZip, checksumEntriesSha256, parseZip, sha256Hex, textToBytes, type ZipEntryParsed } from '../src/research/zipBundle';

describe('ZIP SHA-256 checksums', () => {
  it('sha256Hex matches a known test vector', async () => {
    // SHA-256("abc") — FIPS 180-2 appendix B.1 test vector.
    const hash = await sha256Hex(textToBytes('abc'));
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('sha256Hex of the empty input matches the canonical digest', async () => {
    const hash = await sha256Hex(new Uint8Array(0));
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('checksumEntriesSha256 emits sha256 alongside crc32 + fnv for every entry', async () => {
    const entries = [
      { path: 'a.txt', data: textToBytes('alpha') },
      { path: 'b.txt', data: textToBytes('beta') }
    ];
    const rows = await checksumEntriesSha256(entries);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(row.crc32).toMatch(/^[0-9a-f]{8}$/);
      expect(row.hash.length).toBeGreaterThan(0);
      expect(row.bytes).toBeGreaterThan(0);
    }
    expect(rows[0]!.sha256).not.toBe(rows[1]!.sha256);
  });

  it('checksums survive a zip round-trip (content-addressed integrity)', async () => {
    const entries = [{ path: 'data/x.csv', data: textToBytes('t,x\n0,1\n') }];
    const before = await checksumEntriesSha256(entries);
    const zip = buildZip(entries);
    const restored = parseZip(zip);
    const after = await checksumEntriesSha256(restored.map((e: ZipEntryParsed) => ({ path: e.path, data: e.data })));
    expect(after[0]!.sha256).toBe(before[0]!.sha256);
  });
});
