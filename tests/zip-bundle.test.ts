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

function findSignature(bytes: Uint8Array, signature: ArrayLike<number>, from = 0): number {
  outer: for (let i = from; i <= bytes.length - signature.length; i += 1) {
    for (let j = 0; j < signature.length; j += 1) if (bytes[i + j] !== signature[j]) continue outer;
    return i;
  }
  throw new Error(`signature not found: ${Array.from(signature).join(',')}`);
}

function writeU16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

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

  it.each(['../secret.txt', '/absolute.txt', 'C:/secret.txt', 'safe/../secret.txt', 'safe//file.txt'])(
    'rejects unsafe build path %j',
    (path) => {
      expect(() => buildZip([{ path, data: textToBytes('x') }])).toThrow(/unsafe entry path/);
    }
  );

  it('rejects case-insensitive duplicate build paths', () => {
    expect(() =>
      buildZip([
        { path: 'data/result.csv', data: textToBytes('a') },
        { path: 'DATA/RESULT.csv', data: textToBytes('b') }
      ])
    ).toThrow(/duplicate entry path/);
  });

  it('rejects traversal paths injected into an archive', () => {
    const zip = buildZip([{ path: 'safe', data: textToBytes('x') }]).slice();
    const safe = textToBytes('safe');
    const unsafe = textToBytes('../x');
    for (let offset = findSignature(zip, safe); offset >= 0;) {
      zip.set(unsafe, offset);
      try {
        offset = findSignature(zip, safe, offset + safe.length);
      } catch {
        break;
      }
    }
    expect(() => parseZip(zip)).toThrow(/unsafe entry path/);
  });

  it('rejects duplicate paths from a malicious central directory', () => {
    const zip = buildZip([
      { path: 'a.txt', data: textToBytes('a') },
      { path: 'b.txt', data: textToBytes('b') }
    ]).slice();
    const firstCentral = findSignature(zip, [0x50, 0x4b, 0x01, 0x02]);
    const secondCentral = findSignature(zip, [0x50, 0x4b, 0x01, 0x02], firstCentral + 4);
    zip.set(textToBytes('a.txt'), secondCentral + 46);
    expect(() => parseZip(zip)).toThrow(/duplicate entry path/);
  });

  it('rejects symbolic-link metadata instead of treating it as a file', () => {
    const zip = buildZip([{ path: 'link', data: textToBytes('target') }]).slice();
    const central = findSignature(zip, [0x50, 0x4b, 0x01, 0x02]);
    writeU32(zip, central + 38, 0o120777 << 16);
    expect(() => parseZip(zip)).toThrow(/symbolic link entry rejected/);
  });

  it('rejects oversized entry counts and truncated central metadata before allocation', () => {
    const original = buildZip([{ path: 'a.txt', data: textToBytes('a') }]);
    const tooMany = original.slice();
    const eocd = findSignature(tooMany, [0x50, 0x4b, 0x05, 0x06]);
    writeU16(tooMany, eocd + 8, 1_025);
    writeU16(tooMany, eocd + 10, 1_025);
    expect(() => parseZip(tooMany)).toThrow(/entry count exceeds/);

    const truncated = original.slice();
    const central = findSignature(truncated, [0x50, 0x4b, 0x01, 0x02]);
    writeU16(truncated, central + 28, 0xffff);
    expect(() => parseZip(truncated)).toThrow(/truncated central directory entry/);
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
