import { canonicalJson, type JsonValue } from '../../persistence/safe-data';
import { BATCH_LIMITS } from './contracts';

/** Larger file envelope, with the same accessor/prototype restrictions as canonical small payloads. */
export function batchData(input: unknown): JsonValue {
  let count = 0;
  const active = new Set<object>();
  function visit(value: unknown, depth: number): JsonValue {
    if (++count > 1_000_000 || depth > 32) throw new Error('실험 파일의 구조 한도를 넘었습니다.');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
    if (typeof value === 'string' && value.length <= 16_384) return value;
    if (typeof value !== 'object' || value === null) throw new Error('실험 파일에는 유한한 JSON 데이터만 허용합니다.');
    const array = Array.isArray(value),
      proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null)
      throw new Error('일반 데이터 객체만 허용합니다.');
    if (active.has(value)) throw new Error('순환 데이터는 허용하지 않습니다.');
    active.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value),
      keys = Reflect.ownKeys(descriptors),
      length = array ? (descriptors.length?.value as number) : 0;
    if (array ? !Number.isSafeInteger(length) || length > 8192 || keys.length !== length + 1 : keys.length > 512)
      throw new Error('실험 배열·객체 한도를 넘었습니다.');
    const out: JsonValue[] | Record<string, JsonValue> = array ? [] : {};
    for (const key of keys) {
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key))
        throw new Error('안전하지 않은 데이터 키입니다.');
      if (array && key === 'length') continue;
      const descriptor = descriptors[key]!;
      if (
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))
      )
        throw new Error('접근자·숨김·희소 데이터는 허용하지 않습니다.');
      Object.defineProperty(out, key, {
        value: visit(descriptor.value, depth + 1),
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    active.delete(value);
    return out;
  }
  const result = visit(input, 0);
  if (new TextEncoder().encode(JSON.stringify(result)).length > BATCH_LIMITS.artifactBytes)
    throw new Error('실험 파일은 최대 16 MiB입니다.');
  return result;
}
export const stableBatchJson = (value: unknown): string => canonicalJson(batchData(value));
/** Stable public identity, not a cryptographic integrity/authenticity claim. */
export function batchHash(value: unknown): string {
  const text = stableBatchJson(value);
  let a = 2166136261,
    b = 2246822507;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 3266489909);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
export function closed(object: object, allowed: readonly string[]): void {
  if (Object.keys(object).some((key) => !allowed.includes(key)))
    throw new Error('지원하지 않는 설정 필드입니다. 원본을 보존하세요.');
}
