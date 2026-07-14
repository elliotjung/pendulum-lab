/**
 * Minimal, dependency-free ZIP writer/reader (STORE method, UTF-8 names) for the
 * research bundle export. Writing and parsing both live here so the export can
 * be round-trip-validated in unit tests and E2E without external libraries.
 */

export interface ZipEntryInput {
  path: string;
  data: Uint8Array;
}

export interface ZipEntryParsed {
  path: string;
  data: Uint8Array;
  crc32: number;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]!) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Deterministic content hash for per-file checksums (FNV-1a 64-bit as hex). */
export function hashBytes(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i]!;
    h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((b + i) & 0xff), 0x01000193) >>> 0;
  }
  return h2.toString(16).padStart(8, '0') + h1.toString(16).padStart(8, '0');
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = (() => {
  const lookup = new Int16Array(128).fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i += 1) lookup[BASE64_ALPHABET.charCodeAt(i)] = i;
  return lookup;
})();

/** Decode base64 without atob so the same code runs in workers, Node tests, and the page. */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[\s=]+$/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const code = clean.charCodeAt(i);
    const value = code < 128 ? BASE64_LOOKUP[code]! : -1;
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index] = (buffer >> bits) & 0xff;
      index += 1;
    }
  }
  return index === out.length ? out : out.slice(0, index);
}

/** Extract the binary payload of a `data:` URL (PNG figures captured from canvases). */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return new Uint8Array(0);
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (/;base64$/i.test(header)) return base64ToBytes(payload);
  const text = decodeURIComponent(payload);
  return textToBytes(text);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_ZIP_ENTRIES = 1_024;
const MAX_ZIP_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_ZIP_ENTRY_BYTES = 128 * 1024 * 1024;
const MAX_ZIP_PATH_BYTES = 1_024;

export function textToBytes(text: string): Uint8Array {
  return encoder.encode(text);
}

export function bytesToText(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

function safeZipPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (
    normalized.length === 0 ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    /[\u0000-\u001f\u007f]/.test(normalized) ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`zip: unsafe entry path ${JSON.stringify(path)}`);
  }
  if (textToBytes(normalized).length > MAX_ZIP_PATH_BYTES) throw new Error('zip: entry path exceeds byte budget');
  return normalized;
}

function requireRange(bytes: Uint8Array, offset: number, length: number, label: string): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > bytes.length
  ) {
    throw new Error(`zip: truncated ${label}`);
  }
}

function dosDateTime(date: Date): { time: number; dosDate: number } {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, date.getFullYear()) - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0xf) << 5) |
    (date.getDate() & 0x1f);
  return { time, dosDate };
}

class ByteWriter {
  private chunks: Uint8Array[] = [];
  private total = 0;

  get length(): number {
    return this.total;
  }

  push(bytes: Uint8Array): void {
    this.chunks.push(bytes);
    this.total += bytes.length;
  }

  u16(value: number): void {
    this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
  }

  u32(value: number): void {
    this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]));
  }

  concat(): Uint8Array {
    const out = new Uint8Array(this.total);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

/**
 * Build a ZIP archive (method 0 = STORE: archival fidelity beats compression for
 * a research bundle whose largest members are already-compressed PNGs).
 */
export function buildZip(entries: ZipEntryInput[], timestamp: Date = new Date()): Uint8Array {
  if (entries.length > MAX_ZIP_ENTRIES) throw new Error(`zip: entry count exceeds ${MAX_ZIP_ENTRIES}`);
  const { time, dosDate } = dosDateTime(timestamp);
  const writer = new ByteWriter();
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];
  const paths = new Set<string>();
  // Each STORE entry contributes one 30-byte local header, one 46-byte
  // central-directory header, and its UTF-8 name in both records. Include the
  // final 22-byte EOCD record so an archive accepted here is always within the
  // parser's whole-file budget, metadata included.
  let projectedArchiveBytes = 22;

  for (const entry of entries) {
    const path = safeZipPath(entry.path);
    const pathKey = path.toLocaleLowerCase('en-US');
    if (paths.has(pathKey)) throw new Error(`zip: duplicate entry path ${path}`);
    paths.add(pathKey);
    if (entry.data.length > MAX_ZIP_ENTRY_BYTES) throw new Error(`zip: entry ${path} exceeds byte budget`);
    const name = textToBytes(path);
    projectedArchiveBytes += 76 + name.length * 2 + entry.data.length;
    if (projectedArchiveBytes > MAX_ZIP_ARCHIVE_BYTES) {
      throw new Error('zip: archive including metadata exceeds byte budget');
    }
    const crc = crc32(entry.data);
    const offset = writer.length;
    writer.u32(0x04034b50);
    writer.u16(20); // version needed
    writer.u16(0x0800); // UTF-8 names
    writer.u16(0); // STORE
    writer.u16(time);
    writer.u16(dosDate);
    writer.u32(crc);
    writer.u32(entry.data.length);
    writer.u32(entry.data.length);
    writer.u16(name.length);
    writer.u16(0);
    writer.push(name);
    writer.push(entry.data);
    central.push({ name, crc, size: entry.data.length, offset });
  }

  const centralOffset = writer.length;
  for (const record of central) {
    writer.u32(0x02014b50);
    writer.u16(20); // made by
    writer.u16(20); // needed
    writer.u16(0x0800);
    writer.u16(0);
    writer.u16(time);
    writer.u16(dosDate);
    writer.u32(record.crc);
    writer.u32(record.size);
    writer.u32(record.size);
    writer.u16(record.name.length);
    writer.u16(0); // extra
    writer.u16(0); // comment
    writer.u16(0); // disk
    writer.u16(0); // internal attrs
    writer.u32(0); // external attrs
    writer.u32(record.offset);
    writer.push(record.name);
  }
  const centralSize = writer.length - centralOffset;

  writer.u32(0x06054b50);
  writer.u16(0);
  writer.u16(0);
  writer.u16(central.length);
  writer.u16(central.length);
  writer.u32(centralSize);
  writer.u32(centralOffset);
  writer.u16(0);
  if (writer.length !== projectedArchiveBytes || writer.length > MAX_ZIP_ARCHIVE_BYTES) {
    throw new Error('zip: archive including metadata exceeds byte budget');
  }
  return writer.concat();
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

/**
 * Parse a STORE-method ZIP produced by {@link buildZip} (also reads any
 * uncompressed archive). Throws on a missing/garbled directory or CRC mismatch,
 * so tests validate archive integrity, not just presence.
 */
export function parseZip(bytes: Uint8Array): ZipEntryParsed[] {
  if (bytes.length > MAX_ZIP_ARCHIVE_BYTES) throw new Error('zip: archive exceeds byte budget');
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    // A ZIP comment may itself contain the EOCD byte sequence. It is only a
    // record candidate when its declared comment occupies exactly the
    // remaining bytes in the file.
    if (readU32(bytes, i) === 0x06054b50 && i + 22 + readU16(bytes, i + 20) === bytes.length) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('zip: end-of-central-directory record not found');
  requireRange(bytes, eocd, 22, 'end-of-central-directory record');
  const commentLength = readU16(bytes, eocd + 20);
  requireRange(bytes, eocd + 22, commentLength, 'end-of-central-directory comment');
  if (eocd + 22 + commentLength !== bytes.length) throw new Error('zip: trailing or truncated end record');
  if (readU16(bytes, eocd + 4) !== 0 || readU16(bytes, eocd + 6) !== 0) {
    throw new Error('zip: multi-disk archives are unsupported');
  }
  const count = readU16(bytes, eocd + 10);
  if (count > MAX_ZIP_ENTRIES) throw new Error(`zip: entry count exceeds ${MAX_ZIP_ENTRIES}`);
  if (readU16(bytes, eocd + 8) !== count) throw new Error('zip: inconsistent central-directory entry count');
  const centralSize = readU32(bytes, eocd + 12);
  let cursor = readU32(bytes, eocd + 16);
  const centralEnd = cursor + centralSize;
  requireRange(bytes, cursor, centralSize, 'central directory');
  if (centralEnd > eocd) throw new Error('zip: central directory overlaps end record');
  const entries: ZipEntryParsed[] = [];
  const paths = new Set<string>();
  let totalDataBytes = 0;
  for (let i = 0; i < count; i += 1) {
    requireRange(bytes, cursor, 46, `central directory header ${i}`);
    if (readU32(bytes, cursor) !== 0x02014b50) throw new Error(`zip: bad central directory signature at entry ${i}`);
    const flags = readU16(bytes, cursor + 8);
    const method = readU16(bytes, cursor + 10);
    const crc = readU32(bytes, cursor + 16);
    const compressedSize = readU32(bytes, cursor + 20);
    const size = readU32(bytes, cursor + 24);
    const nameLength = readU16(bytes, cursor + 28);
    const extraLength = readU16(bytes, cursor + 30);
    const commentLength = readU16(bytes, cursor + 32);
    const externalAttributes = readU32(bytes, cursor + 38);
    const localOffset = readU32(bytes, cursor + 42);
    requireRange(bytes, cursor + 46, nameLength + extraLength + commentLength, `central directory entry ${i}`);
    const path = safeZipPath(bytesToText(bytes.slice(cursor + 46, cursor + 46 + nameLength)));
    const pathKey = path.toLocaleLowerCase('en-US');
    if (paths.has(pathKey)) throw new Error(`zip: duplicate entry path ${path}`);
    paths.add(pathKey);
    if ((flags & 0x0009) !== 0) throw new Error(`zip: encrypted or deferred entry rejected: ${path}`);
    if (method !== 0) throw new Error(`zip: entry ${path} uses unsupported method ${method}`);
    if (compressedSize !== size) throw new Error(`zip: STORE entry ${path} has inconsistent sizes`);
    if (size > MAX_ZIP_ENTRY_BYTES) throw new Error(`zip: entry ${path} exceeds byte budget`);
    totalDataBytes += size;
    if (totalDataBytes > MAX_ZIP_ARCHIVE_BYTES) throw new Error('zip: aggregate entry data exceeds byte budget');
    if (((externalAttributes >>> 16) & 0o170000) === 0o120000)
      throw new Error(`zip: symbolic link entry rejected: ${path}`);
    requireRange(bytes, localOffset, 30, `local header for ${path}`);
    if (readU32(bytes, localOffset) !== 0x04034b50) throw new Error(`zip: bad local header for ${path}`);
    const localFlags = readU16(bytes, localOffset + 6);
    const localMethod = readU16(bytes, localOffset + 8);
    const localCrc = readU32(bytes, localOffset + 14);
    const localCompressedSize = readU32(bytes, localOffset + 18);
    const localSize = readU32(bytes, localOffset + 22);
    if (
      localFlags !== flags ||
      localMethod !== method ||
      localCrc !== crc ||
      localCompressedSize !== compressedSize ||
      localSize !== size
    ) {
      throw new Error(`zip: local and central metadata differ for ${path}`);
    }
    const localNameLength = readU16(bytes, localOffset + 26);
    const localExtraLength = readU16(bytes, localOffset + 28);
    requireRange(bytes, localOffset + 30, localNameLength + localExtraLength, `local entry metadata for ${path}`);
    const localPath = safeZipPath(bytesToText(bytes.slice(localOffset + 30, localOffset + 30 + localNameLength)));
    if (localPath !== path) throw new Error(`zip: local and central paths differ for ${path}`);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    requireRange(bytes, dataStart, size, `entry data for ${path}`);
    if (dataStart + size > cursor) throw new Error(`zip: entry data overlaps central directory for ${path}`);
    const data = bytes.slice(dataStart, dataStart + size);
    if (crc32(data) !== crc) throw new Error(`zip: CRC mismatch for ${path}`);
    entries.push({ path, data, crc32: crc });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== centralEnd) throw new Error('zip: central directory size mismatch');
  return entries;
}

export interface BundleChecksum {
  path: string;
  bytes: number;
  crc32: string;
  hash: string;
}

/** Per-file checksum manifest rows for `manifest/checksums.json`. */
export function checksumEntries(entries: ZipEntryInput[]): BundleChecksum[] {
  return entries.map((entry) => ({
    path: entry.path,
    bytes: entry.data.length,
    crc32: crc32(entry.data).toString(16).padStart(8, '0'),
    hash: hashBytes(entry.data)
  }));
}

export interface BundleChecksumSha256 extends BundleChecksum {
  /** Cryptographic SHA-256 of the file content (hex). */
  sha256: string;
}

/** SHA-256 (hex) via WebCrypto — available in browsers and Node ≥ 16.7. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) throw new Error('WebCrypto subtle API unavailable: cannot compute SHA-256');
  const buffer =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
  const digest = await cryptoApi.subtle.digest('SHA-256', buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Per-file checksum rows including cryptographic SHA-256, for integrity
 * verification of exported archives (`sha256sum -c` compatible values).
 */
export async function checksumEntriesSha256(entries: ZipEntryInput[]): Promise<BundleChecksumSha256[]> {
  return Promise.all(
    entries.map(async (entry) => ({
      path: entry.path,
      bytes: entry.data.length,
      crc32: crc32(entry.data).toString(16).padStart(8, '0'),
      hash: hashBytes(entry.data),
      sha256: await sha256Hex(entry.data)
    }))
  );
}
