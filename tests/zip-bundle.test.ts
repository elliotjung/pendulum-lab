import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  buildZip,
  checksumEntries,
  crc32,
  dataUrlToBytes,
  hashBytes,
  parseZip,
  textToBytes,
  bytesToText
} from '../src/research/zipBundle';

describe('zip research bundle core', () => {
  it('computes the standard CRC-32 check value', () => {
    // "123456789" -> 0xCBF43926 is the canonical CRC-32 test vector.
    expect(crc32(textToBytes('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('round-trips a multi-file archive through build + parse', () => {
    const entries = [
      { path: 'manifest/submission.json', data: textToBytes('{"a":1}') },
      {
        path: 'figures/figure-01-main.png',
        data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 250])
      },
      { path: 'paper/methods.md', data: textToBytes('# Methods\nutf-8 ok: λ θ φ') }
    ];
    const zip = buildZip(entries, new Date('2026-06-10T12:00:00'));
    expect(zip[0]).toBe(0x50); // 'P'
    expect(zip[1]).toBe(0x4b); // 'K'
    const parsed = parseZip(zip);
    expect(parsed.map((entry) => entry.path)).toEqual(entries.map((entry) => entry.path));
    expect(bytesToText(parsed[2]!.data)).toContain('λ θ φ');
    expect([...parsed[1]!.data]).toEqual([...entries[1]!.data]);
  });

  it('rejects a corrupted archive (CRC mismatch)', () => {
    const zip = buildZip([{ path: 'data/x.txt', data: textToBytes('hello world content') }]);
    const corrupted = zip.slice();
    // Flip a payload byte (local header is 30 bytes + 10-byte name).
    corrupted[30 + 10 + 2] = corrupted[30 + 10 + 2]! ^ 0xff;
    expect(() => parseZip(corrupted)).toThrow(/CRC mismatch/);
  });

  it('rejects bytes with no central directory', () => {
    expect(() => parseZip(textToBytes('this is not a zip file at all, definitely'))).toThrow(
      /end-of-central-directory/
    );
  });

  it('decodes base64 and data URLs to binary', () => {
    expect([...base64ToBytes('AQIDBA==')]).toEqual([1, 2, 3, 4]);
    expect([...dataUrlToBytes('data:image/png;base64,AQIDBA==')]).toEqual([1, 2, 3, 4]);
    expect(bytesToText(dataUrlToBytes('data:text/plain,hello%20world'))).toBe('hello world');
    expect(dataUrlToBytes('no-comma').length).toBe(0);
  });

  it('produces per-file checksums covering every entry', () => {
    const entries = [
      { path: 'a.txt', data: textToBytes('aaa') },
      { path: 'b.bin', data: new Uint8Array([0, 255, 128]) }
    ];
    const sums = checksumEntries(entries);
    expect(sums).toHaveLength(2);
    expect(sums[0]!.path).toBe('a.txt');
    expect(sums[0]!.bytes).toBe(3);
    expect(sums[0]!.crc32).toMatch(/^[0-9a-f]{8}$/);
    expect(sums[0]!.hash).toMatch(/^[0-9a-f]{16}$/);
    // Hash must be content-sensitive.
    expect(hashBytes(textToBytes('aaa'))).not.toBe(hashBytes(textToBytes('aab')));
    // And deterministic.
    expect(hashBytes(textToBytes('aaa'))).toBe(hashBytes(textToBytes('aaa')));
  });
});
