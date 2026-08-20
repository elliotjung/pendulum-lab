import {
  MAX_RESEARCH_DB_RECORD_ID_LENGTH,
  MAX_RESEARCH_DB_RECORDS,
  MAX_RESEARCH_DB_RECORDS_PER_STORE,
  RESEARCH_DB_STORES,
  type ResearchDbArchive,
  type ResearchDbStoreName
} from '../../research/researchDb';
import { scanJsonResources, type JsonResourceLimits } from './storage-json-resource-scanner';

export type StorageImportKind = 'workspace' | 'research-db';

export const MAX_WORKSPACE_IMPORT_BYTES = 8 * 1024 * 1024;
export const MAX_RESEARCH_DB_IMPORT_BYTES = 64 * 1024 * 1024;
export const MAX_STORAGE_IMPORT_ID_LENGTH = MAX_RESEARCH_DB_RECORD_ID_LENGTH;
export { MAX_RESEARCH_DB_RECORDS, MAX_RESEARCH_DB_RECORDS_PER_STORE };

interface StorageImportLimits extends JsonResourceLimits {
  bytes: number;
}

const STORAGE_IMPORT_LIMITS: Record<StorageImportKind, StorageImportLimits> = {
  workspace: {
    bytes: MAX_WORKSPACE_IMPORT_BYTES,
    depth: 64,
    nodes: 100_000,
    arrayItems: 10_000,
    objectProperties: 10_000,
    stringCodeUnits: 2 * 1024 * 1024,
    totalStringCodeUnits: 4 * 1024 * 1024,
    keyCodeUnits: 256
  },
  'research-db': {
    bytes: MAX_RESEARCH_DB_IMPORT_BYTES,
    depth: 64,
    nodes: 500_000,
    arrayItems: 25_000,
    objectProperties: 250_000,
    stringCodeUnits: 24 * 1024 * 1024,
    totalStringCodeUnits: 48 * 1024 * 1024,
    keyCodeUnits: 256
  }
};

export type StorageImportErrorCode =
  | 'IMPORT_EMPTY'
  | 'IMPORT_SIZE_LIMIT'
  | 'IMPORT_COMPRESSED_UNSUPPORTED'
  | 'IMPORT_COMPLEXITY_LIMIT'
  | 'IMPORT_DUPLICATE_KEY'
  | 'IMPORT_DANGEROUS_KEY'
  | 'IMPORT_INVALID_JSON'
  | 'IMPORT_SCHEMA_INVALID'
  | 'IMPORT_READ_FAILED'
  | 'IMPORT_PREVIEW_FAILED'
  | 'IMPORT_APPLY_FAILED'
  | 'IMPORT_CANCELLED';

export interface StorageImportDiagnostic {
  code: StorageImportErrorCode;
  kind: StorageImportKind;
  message: string;
  remediation: string;
  byteLength?: number;
}

export interface StorageImportStats {
  byteLength: number;
  nodes: number;
  maxDepth: number;
  maxArrayItems: number;
  maxObjectProperties: number;
  stringCodeUnits: number;
}

export type StorageImportResult<T> =
  { ok: true; value: T; stats: StorageImportStats } | { ok: false; diagnostic: StorageImportDiagnostic };

export interface StorageImportFileLike {
  readonly name: string;
  readonly size: number;
  readonly type?: string;
  text(): Promise<string>;
}

const COMPRESSED_FILE_EXTENSION = /\.(?:zip|gz|gzip|bz2|xz|7z|rar)$/i;
const COMPRESSED_MIME = /(?:zip|gzip|x-7z-compressed|x-rar-compressed)/i;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function diagnostic(
  kind: StorageImportKind,
  code: StorageImportErrorCode,
  message: string,
  remediation: string,
  byteLength?: number
): StorageImportDiagnostic {
  return byteLength === undefined
    ? { kind, code, message, remediation }
    : { kind, code, message, remediation, byteLength };
}

export function formatStorageImportDiagnostic(value: StorageImportDiagnostic): string {
  return `[${value.code}] ${value.message} ${value.remediation}`;
}

export function storageImportFailure(
  kind: StorageImportKind,
  code: StorageImportErrorCode,
  message: string,
  remediation: string,
  byteLength?: number
): StorageImportResult<never> {
  return {
    ok: false,
    diagnostic: diagnostic(kind, code, message, remediation, byteLength)
  };
}

/** Count UTF-8 bytes without allocating a second full-size encoded buffer. */
function boundedUtf8ByteLength(text: string, stopAfter: number): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const low = text.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
    if (bytes > stopAfter) return bytes;
  }
  return bytes;
}

function looksLikeCompressedPayload(text: string): boolean {
  if (text.length >= 4 && text.charCodeAt(0) === 0x50 && text.charCodeAt(1) === 0x4b) {
    const third = text.charCodeAt(2);
    const fourth = text.charCodeAt(3);
    if ((third === 0x03 && fourth === 0x04) || (third === 0x05 && fourth === 0x06)) return true;
  }
  return text.length >= 2 && text.charCodeAt(0) === 0x1f && text.charCodeAt(1) === 0x8b;
}

function findOversizedId(root: unknown): string | null {
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (value === null || typeof value !== 'object') continue;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (
        (key === 'id' || key.endsWith('Id')) &&
        typeof child === 'string' &&
        child.length > MAX_STORAGE_IMPORT_ID_LENGTH
      ) {
        return key;
      }
      if (child !== null && typeof child === 'object') stack.push(child);
    }
  }
  return null;
}

export function preflightStorageImportFile(
  file: Pick<StorageImportFileLike, 'name' | 'size' | 'type'>,
  kind: StorageImportKind
): StorageImportDiagnostic | null {
  const limit = STORAGE_IMPORT_LIMITS[kind].bytes;
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > limit) {
    return diagnostic(
      kind,
      'IMPORT_SIZE_LIMIT',
      `Import rejected before reading: ${formatBytes(Math.max(0, file.size))} exceeds the ${formatBytes(limit)} limit.`,
      'Export fewer records or large figures/bundles, then import the smaller uncompressed JSON file.',
      Math.max(0, file.size)
    );
  }
  if (COMPRESSED_FILE_EXTENSION.test(file.name) || (file.type && COMPRESSED_MIME.test(file.type))) {
    return diagnostic(
      kind,
      'IMPORT_COMPRESSED_UNSUPPORTED',
      'Compressed archives are not accepted by this JSON import path.',
      'Extract the archive locally and select the uncompressed Pendulum Lab .json file. ZIP expansion is never attempted.'
    );
  }
  return null;
}

export function parseStorageImportJson<T = unknown>(
  text: string,
  kind: StorageImportKind,
  knownByteLength?: number
): StorageImportResult<T> {
  const limits = STORAGE_IMPORT_LIMITS[kind];
  if (text.length === 0) {
    return {
      ok: false,
      diagnostic: diagnostic(kind, 'IMPORT_EMPTY', 'The selected file is empty.', 'Choose a Pendulum Lab JSON export.')
    };
  }
  const byteLength = knownByteLength ?? boundedUtf8ByteLength(text, limits.bytes);
  if (!Number.isSafeInteger(byteLength) || byteLength < 0 || text.length > limits.bytes || byteLength > limits.bytes) {
    return {
      ok: false,
      diagnostic: diagnostic(
        kind,
        'IMPORT_SIZE_LIMIT',
        `Import rejected before JSON.parse: ${formatBytes(Math.max(0, byteLength))} exceeds the ${formatBytes(limits.bytes)} limit.`,
        'Export fewer records or large figures/bundles, then retry with a smaller JSON file.',
        Math.max(0, byteLength)
      )
    };
  }
  if (looksLikeCompressedPayload(text)) {
    return {
      ok: false,
      diagnostic: diagnostic(
        kind,
        'IMPORT_COMPRESSED_UNSUPPORTED',
        'The selected file has a compressed-archive signature; it was not decompressed.',
        'Extract it locally and choose the uncompressed Pendulum Lab JSON file.'
      )
    };
  }
  const scan = scanJsonResources(text, limits);
  if (!scan.ok) {
    return {
      ok: false,
      diagnostic: diagnostic(
        kind,
        scan.code,
        `${scan.message}.`,
        'Reduce nesting or collection size and re-export from a trusted Pendulum Lab instance.',
        byteLength
      )
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    return {
      ok: false,
      diagnostic: diagnostic(
        kind,
        'IMPORT_INVALID_JSON',
        `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        'Select an intact, uncompressed JSON export.',
        byteLength
      )
    };
  }
  const oversizedId = findOversizedId(parsed);
  if (oversizedId) {
    return {
      ok: false,
      diagnostic: diagnostic(
        kind,
        'IMPORT_COMPLEXITY_LIMIT',
        `Identifier field ${oversizedId} exceeds the ${MAX_STORAGE_IMPORT_ID_LENGTH} character limit.`,
        'Shorten generated identifiers and export the data again.',
        byteLength
      )
    };
  }
  return { ok: true, value: parsed as T, stats: { byteLength, ...scan.stats } };
}

/** File-size preflight happens before file.text(), so rejected files are never read into memory. */
export async function readStorageImportFile<T = unknown>(
  file: StorageImportFileLike,
  kind: StorageImportKind
): Promise<StorageImportResult<T>> {
  const preflight = preflightStorageImportFile(file, kind);
  if (preflight) return { ok: false, diagnostic: preflight };
  try {
    return parseStorageImportJson<T>(await file.text(), kind, file.size);
  } catch (error) {
    return {
      ok: false,
      diagnostic: diagnostic(
        kind,
        'IMPORT_READ_FAILED',
        `The selected file could not be read: ${error instanceof Error ? error.message : String(error)}`,
        'Check file permissions and retry with a local JSON export.',
        file.size
      )
    };
  }
}

export function validateWorkspaceImportDocument(value: unknown): string[] {
  const problems: string[] = [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return ['workspace is not an object'];
  const workspace = value as Record<string, unknown>;
  if (workspace.schemaVersion !== 'pendulum-workspace/v1') problems.push('unexpected workspace schemaVersion');
  if (workspace.research === null || typeof workspace.research !== 'object' || Array.isArray(workspace.research))
    problems.push('workspace research section is missing or invalid');
  if (workspace.figureCaptions !== undefined) {
    if (
      workspace.figureCaptions === null ||
      typeof workspace.figureCaptions !== 'object' ||
      Array.isArray(workspace.figureCaptions)
    ) {
      problems.push('figureCaptions must be an object');
    } else {
      const captions = Object.entries(workspace.figureCaptions as Record<string, unknown>);
      if (captions.length > 256) problems.push('figureCaptions exceeds the 256 caption limit');
      if (captions.some(([, caption]) => typeof caption === 'string' && caption.length > 400))
        problems.push('a figure caption exceeds the 400 character limit');
    }
  }
  if (workspace.designStudy !== undefined && workspace.designStudy !== null) {
    if (typeof workspace.designStudy !== 'object' || Array.isArray(workspace.designStudy)) {
      problems.push('designStudy must be an object or null');
    } else {
      const design = workspace.designStudy as Record<string, unknown>;
      if (Array.isArray(design.variables) && design.variables.length > 4)
        problems.push('designStudy exceeds the 4 variable limit');
      if (Array.isArray(design.points) && design.points.length > 256)
        problems.push('designStudy exceeds the 256 point limit');
    }
  }
  return problems;
}

export interface ResearchDbImportPreview {
  incomingByStore: Record<ResearchDbStoreName, number>;
  existingByStore: Record<ResearchDbStoreName, number>;
  conflictsByStore: Record<ResearchDbStoreName, number>;
  incomingTotal: number;
  existingTotal: number;
  conflictTotal: number;
  mergeAdds: number;
  replaceDeletes: number;
}

export interface ResearchDbPreviewSource {
  getAllIds(name: ResearchDbStoreName, maxIds: number): Promise<string[]>;
}

function emptyStoreCounts(): Record<ResearchDbStoreName, number> {
  return Object.fromEntries(RESEARCH_DB_STORES.map((name) => [name, 0])) as Record<ResearchDbStoreName, number>;
}

export async function buildResearchDbImportPreview(
  archive: ResearchDbArchive,
  source: ResearchDbPreviewSource
): Promise<ResearchDbImportPreview> {
  const incomingByStore = emptyStoreCounts();
  const existingByStore = emptyStoreCounts();
  const conflictsByStore = emptyStoreCounts();
  let incomingTotal = 0;
  let existingTotal = 0;
  let conflictTotal = 0;
  let replaceDeletes = 0;
  for (const name of RESEARCH_DB_STORES) {
    const incoming = archive.stores[name] ?? [];
    const remainingTotal = Math.max(0, MAX_RESEARCH_DB_RECORDS - existingTotal);
    const existingLimit = Math.min(MAX_RESEARCH_DB_RECORDS_PER_STORE, remainingTotal);
    const existing = await source.getAllIds(name, existingLimit);
    if (existing.length > existingLimit) {
      throw new Error(`Research DB store ${name} exceeded the bounded preview contract`);
    }
    const incomingIds = new Set(incoming.map((record) => record.id));
    const existingIds = new Set(existing);
    const conflicts = incoming.reduce((sum, record) => sum + (existingIds.has(record.id) ? 1 : 0), 0);
    const deleted = existing.reduce((sum, id) => sum + (incomingIds.has(id) ? 0 : 1), 0);
    incomingByStore[name] = incoming.length;
    existingByStore[name] = existing.length;
    conflictsByStore[name] = conflicts;
    incomingTotal += incoming.length;
    existingTotal += existing.length;
    conflictTotal += conflicts;
    replaceDeletes += deleted;
  }
  return {
    incomingByStore,
    existingByStore,
    conflictsByStore,
    incomingTotal,
    existingTotal,
    conflictTotal,
    mergeAdds: incomingTotal - conflictTotal,
    replaceDeletes
  };
}

export function formatResearchDbImportPreview(preview: ResearchDbImportPreview, fileBytes: number): string {
  const stores = RESEARCH_DB_STORES.filter(
    (name) => preview.incomingByStore[name] > 0 || preview.existingByStore[name] > 0
  )
    .map(
      (name) =>
        `${name}: ${preview.incomingByStore[name]} incoming, ${preview.conflictsByStore[name]} overwrite, ${preview.existingByStore[name]} existing`
    )
    .join('\n');
  return [
    `Research DB import preview (${formatBytes(fileBytes)})`,
    `${preview.incomingTotal} incoming records; ${preview.existingTotal} currently stored.`,
    stores || 'No records in either database.',
    `MERGE adds ${preview.mergeAdds} and overwrites ${preview.conflictTotal}; unrelated existing records stay.`,
    `REPLACE imports ${preview.incomingTotal}, overwrites ${preview.conflictTotal}, and deletes ${preview.replaceDeletes} existing records.`
  ].join('\n');
}
