import type { ExperimentStateV1 } from '../contracts/experiment';
import { MAX_SHARE_TOKEN_LENGTH } from '../contracts/routes';
import { failure, success, type ContractResult } from '../contracts/validation';
import { parseContractJson } from './json';
import { parseExperiment, serializeExperiment } from './serialization';
import { canonicalJson, type JsonValue } from './safe-data';

const PREFIX = 'pe1.';
const MAX_BYTES = Math.floor(((MAX_SHARE_TOKEN_LENGTH - PREFIX.length) * 3) / 4);
const encoder = new TextEncoder();

/** Compact wire aliases are scoped to the versioned share envelope, never the canonical state. */
export interface ShareEnvelopeV1 {
  readonly v: 1;
  readonly e: ExperimentStateV1;
  /** CRC32 detects accidental damage; it is not a signature or authenticity claim. */
  readonly c: string;
}

function checksum(text: string): string {
  let crc = 0xffffffff;
  for (const byte of encoder.encode(text)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}
/** Shared only by the product's pe1/ps1 wire codecs. Kept outside the native
 * research chunk so metadata routes never load analysis/runtime modules. */
export { checksum as shareChecksum };

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** No paths, credentials, contact fields, or free-form UI text in public sharing. */
function publicData(value: JsonValue): boolean {
  if (typeof value === 'string') {
    return !/(?:^[a-z]:[\\/]|^[/\\]|file:|https?:|@|[\u0000-\u001f\u007f])/i.test(value);
  }
  if (value === null || typeof value !== 'object') return true;
  if (Array.isArray(value)) return value.every(publicData);
  return Object.entries(value).every(
    ([key, child]) =>
      !/(?:password|secret|api[-_]?key|private[-_]?key|credential|authorization|cookie|email|username|local[-_]?path|file[-_]?path|token)/i.test(
        key
      ) && publicData(child)
  );
}

export function encodeShareToken(input: unknown): ContractResult<string> {
  const serialized = serializeExperiment(input);
  if (!serialized.ok) return serialized;
  // Already validated plain JSON; no user callbacks are evaluated here.
  const experiment = JSON.parse(serialized.value) as JsonValue;
  if (!publicData(experiment))
    return failure('private-share-data', '$', 'Remove private fields or local paths before sharing.', 'keep-original');
  const envelope = canonicalJson({ v: 1, e: experiment, c: checksum(serialized.value) });
  const bytes = encoder.encode(envelope);
  if (bytes.length > MAX_BYTES)
    return failure('share-too-large', '$', 'Use experiment JSON export for this larger state.', 'export-file');
  const token = PREFIX + base64url(bytes);
  if (token.length > MAX_SHARE_TOKEN_LENGTH)
    return failure('share-too-large', '$', 'Use experiment JSON export for this larger state.', 'export-file');
  return success(token);
}

export function decodeShareToken(token: unknown): ContractResult<ExperimentStateV1> {
  if (typeof token !== 'string') return failure('invalid-share', '$', 'Expected a share token.', 'keep-original');
  if (token.length > MAX_SHARE_TOKEN_LENGTH)
    return failure('share-too-large', '$', 'Share token exceeds the limit.', 'export-file');
  if (!token.startsWith(PREFIX))
    return failure(
      'unsupported-version',
      '$',
      'Use a supported share version and preserve this token.',
      'use-supported-version'
    );
  const payload = token.slice(PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || payload.length % 4 === 1)
    return failure('invalid-share', '$', 'Malformed base64url data.', 'keep-original');
  let json: string;
  try {
    const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (payload.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.length > MAX_BYTES || base64url(bytes) !== payload) throw new Error('Noncanonical base64url.');
    json = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return failure('invalid-share', '$', 'Malformed base64url or UTF-8 data.', 'keep-original');
  }
  const parsed = parseContractJson(json);
  if (!parsed.ok) return parsed;
  const envelope = parsed.value;
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope))
    return failure('invalid-share', '$', 'Expected a share envelope.', 'keep-original');
  if (envelope.v !== 1)
    return failure('unsupported-version', '$.v', 'Unsupported share envelope version.', 'use-supported-version');
  if (Object.keys(envelope).sort().join(',') !== 'c,e,v')
    return failure('unknown-field', '$', 'Unexpected or missing share envelope fields.', 'keep-original');
  if (typeof envelope.c !== 'string' || !/^[0-9a-f]{8}$/.test(envelope.c))
    return failure('invalid-share', '$.c', 'Invalid checksum.', 'keep-original');
  const experimentJson = canonicalJson(envelope.e!);
  if (checksum(experimentJson) !== envelope.c)
    return failure(
      'damaged-share',
      '$.c',
      'Share checksum does not match; recover the original token.',
      'keep-original'
    );
  if (!publicData(envelope.e!))
    return failure('private-share-data', '$.e', 'Private fields or local paths cannot be shared.', 'keep-original');
  return parseExperiment(experimentJson);
}
