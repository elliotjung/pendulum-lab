import { canonicalJson, type JsonValue } from '../../../persistence/safe-data';
import { DATA_DRIVEN_LIMITS } from './contracts';

/** Bounded, inert JSON. Inspect descriptors before reading values or invoking user code. */
export function modelData(input: unknown): JsonValue {
  const active = new Set<object>();
  let nodes = 0;
  function visit(value: unknown, depth: number): JsonValue {
    if (++nodes > DATA_DRIVEN_LIMITS.nodes || depth > 32) throw new Error('모델 파일의 구조 한도를 넘었습니다.');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value === 0 ? 0 : value;
    if (typeof value === 'string' && value.length <= DATA_DRIVEN_LIMITS.bytes) return value;
    if (!value || typeof value !== 'object' || active.has(value)) throw new Error('유한한 JSON 데이터만 허용합니다.');
    const array = Array.isArray(value),
      proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null)
      throw new Error('일반 데이터 객체만 허용합니다.');
    const descriptors = Object.getOwnPropertyDescriptors(value),
      keys = Reflect.ownKeys(descriptors);
    const length = array ? (descriptors.length?.value as number) : 0;
    if (
      array
        ? !Number.isSafeInteger(length) || length > DATA_DRIVEN_LIMITS.array || keys.length !== length + 1
        : keys.length > 128
    )
      throw new Error('모델 배열·객체 한도를 넘었습니다.');
    active.add(value);
    const result: JsonValue[] | Record<string, JsonValue> = array ? [] : {};
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key))
        throw new Error('안전하지 않은 데이터 키입니다.');
      const descriptor = descriptors[key]!;
      if (
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))
      )
        throw new Error('접근자·숨김·희소 데이터는 허용하지 않습니다.');
      Object.defineProperty(result, key, {
        value: visit(descriptor.value, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
    active.delete(value);
    return result;
  }
  const result = visit(input, 0);
  if (new TextEncoder().encode(JSON.stringify(result)).length > DATA_DRIVEN_LIMITS.bytes)
    throw new Error('모델 파일은 최대 16 MiB입니다.');
  return result;
}
export const modelJson = (value: unknown): string => canonicalJson(modelData(value));
export async function modelDigest(value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(modelJson(value)));
  return Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, '0')).join('');
}
export function freezeModelData<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeModelData(child);
    Object.freeze(value);
  }
  return value;
}
export function parseModelJson(text: string): unknown {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > DATA_DRIVEN_LIMITS.bytes)
    throw new Error('모델 파일은 최대 16 MiB입니다.');
  return modelData(JSON.parse(text));
}
