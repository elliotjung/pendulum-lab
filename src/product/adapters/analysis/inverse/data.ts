import { canonicalJson, type JsonValue } from '../../../persistence/safe-data';
import { INVERSE_LIMITS } from './contracts';

/** Observation originals may contain long CSV text; canonical experiment/share limits stay unchanged. */
export function inverseData(input: unknown): JsonValue {
  const ancestors = new Set<object>();
  let nodes = 0;
  function visit(value: unknown, depth: number): JsonValue {
    if (++nodes > 250_000 || depth > 32) throw new Error('역문제 파일의 구조 한도를 넘었습니다.');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
    if (typeof value === 'string' && value.length <= INVERSE_LIMITS.artifactBytes) return value;
    if (!value || typeof value !== 'object' || ancestors.has(value))
      throw new Error('유한한 JSON 데이터만 허용합니다.');
    const array = Array.isArray(value),
      proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null)
      throw new Error('일반 데이터 객체만 허용합니다.');
    const descriptors = Object.getOwnPropertyDescriptors(value),
      keys = Reflect.ownKeys(descriptors);
    const length = array ? (descriptors.length?.value as number) : 0;
    if (array ? !Number.isSafeInteger(length) || length > 16384 || keys.length !== length + 1 : keys.length > 128)
      throw new Error('배열·객체 한도를 넘었습니다.');
    ancestors.add(value);
    const out: JsonValue[] | Record<string, JsonValue> = array ? [] : {};
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || ['constructor', 'prototype', '__proto__'].includes(key))
        throw new Error('안전하지 않은 키입니다.');
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
        writable: true,
        configurable: true
      });
    }
    ancestors.delete(value);
    return out;
  }
  const result = visit(input, 0);
  if (new TextEncoder().encode(JSON.stringify(result)).length > INVERSE_LIMITS.artifactBytes)
    throw new Error('역문제 파일은 최대 24 MiB입니다.');
  return result;
}
/** Public deterministic identity; does not authenticate external numerical values. */
export function inverseHash(input: unknown): string {
  const text = canonicalJson(inverseData(input));
  let a = 2166136261,
    b = 2246822507;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 3266489909);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
export function finiteData<T>(input: T): T {
  // Native covariance can be unavailable. Preserve that distinction as null rather than claiming zero uncertainty.
  return JSON.parse(
    JSON.stringify(input, (_key, value: unknown) =>
      typeof value === 'number' && !Number.isFinite(value) ? null : value
    )
  ) as T;
}
export function freezeInverseData<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) freezeInverseData(entry);
    Object.freeze(value);
  }
  return value;
}
