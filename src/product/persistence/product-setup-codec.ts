import { MAX_SHARE_TOKEN_LENGTH } from '../contracts/routes';
import { failure, success, type ContractResult } from '../contracts/validation';
import { encodeBase64UrlText, decodeBase64UrlText } from '../../app/base64UrlText';
import { parseContractJson } from './json';
import { canonicalJson, type JsonValue } from './safe-data';
import { serializeProductSetup, parseProductSetup, type ProductSetupV1 } from './product-setup';
import { shareChecksum } from './share';

const PREFIX = 'ps1.';
const MAX_BYTES = Math.floor(((MAX_SHARE_TOKEN_LENGTH - PREFIX.length) * 3) / 4);
const oversized = () =>
  failure('share-too-large', '$', '전체 설정이 URL 한도를 넘습니다. 전체 설정 JSON 파일로 보존하세요.', 'export-file');

/** Versioned public control sharing; pe1 canonical links remain unchanged. CRC
 * detects accidental damage and makes no authenticity or scientific claim. */
export function encodeProductSetupToken(input: unknown): ContractResult<string> {
  const serialized = serializeProductSetup(input);
  if (!serialized.ok) return serialized;
  const setup = JSON.parse(serialized.value) as JsonValue;
  const wire = canonicalJson({ v: 1, s: setup, c: shareChecksum(serialized.value) });
  if (new TextEncoder().encode(wire).length > MAX_BYTES) return oversized();
  const token = PREFIX + encodeBase64UrlText(wire);
  return token.length > MAX_SHARE_TOKEN_LENGTH ? oversized() : success(token);
}

export function decodeProductSetupToken(input: unknown): ContractResult<ProductSetupV1> {
  if (typeof input !== 'string')
    return failure('invalid-share', '$', '전체 설정 토큰 문자열이 필요합니다.', 'keep-original');
  if (input.length > MAX_SHARE_TOKEN_LENGTH) return oversized();
  if (!input.startsWith(PREFIX))
    return failure('unsupported-version', '$', '지원하는 전체 설정 공유 버전이 아닙니다.', 'use-supported-version');
  const payload = input.slice(PREFIX.length);
  let text: string;
  try {
    text = decodeBase64UrlText(payload);
    if (new TextEncoder().encode(text).length > MAX_BYTES || encodeBase64UrlText(text) !== payload)
      throw new Error('noncanonical');
  } catch {
    return failure('invalid-share', '$', 'base64url 또는 UTF-8 전체 설정이 올바르지 않습니다.', 'keep-original');
  }
  const parsed = parseContractJson(text);
  if (!parsed.ok) return parsed;
  const envelope = parsed.value;
  if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope))
    return failure('invalid-share', '$', '전체 설정 envelope 객체가 필요합니다.', 'keep-original');
  if (envelope.v !== 1)
    return failure(
      'unsupported-version',
      '$.v',
      '지원하는 전체 설정 envelope 버전이 아닙니다.',
      'use-supported-version'
    );
  if (Object.keys(envelope).sort().join(',') !== 'c,s,v')
    return failure('unknown-field', '$', '전체 설정 envelope에 알 수 없거나 누락된 필드가 있습니다.', 'keep-original');
  if (typeof envelope.c !== 'string' || !/^[0-9a-f]{8}$/.test(envelope.c))
    return failure('invalid-share', '$.c', '전체 설정 checksum이 올바르지 않습니다.', 'keep-original');
  const setup = canonicalJson(envelope.s!);
  if (shareChecksum(setup) !== envelope.c)
    return failure(
      'damaged-share',
      '$.c',
      '전체 설정이 바뀌었거나 손상되었습니다. 원본을 복구하세요.',
      'keep-original'
    );
  return parseProductSetup(setup);
}
