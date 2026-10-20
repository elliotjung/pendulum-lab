import type { JsonValue } from '../../../persistence/safe-data';
import type { CoreDiagnosticKind, CoreDiagnosticResult } from './contracts';
/** Native optional metadata is omitted; non-finite numerical failures are never hidden. */
export function diagnosticJson(value: unknown): JsonValue {
  const ancestors = new Set<object>();
  let nodes = 0;
  function visit(input: unknown, depth: number): JsonValue {
    if (++nodes > 2_500_000 || depth > 32) throw new RangeError('분석 결과 구조 예산을 넘었습니다.');
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number') {
      if (!Number.isFinite(input))
        throw new RangeError('분석 결과에 유한하지 않은 값이 있습니다. 기간과 시간 간격을 확인하세요.');
      return Object.is(input, -0) ? 0 : input;
    }
    if (!input || typeof input !== 'object' || ancestors.has(input))
      throw new TypeError('분석 결과가 직렬화 가능한 일반 데이터가 아닙니다.');
    if (ArrayBuffer.isView(input) && !(input instanceof DataView))
      return Array.from(input as unknown as ArrayLike<number>, (v) => visit(v, depth + 1));
    const array = Array.isArray(input),
      prototype = Object.getPrototypeOf(input),
      descriptors = Object.getOwnPropertyDescriptors(input);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
      throw new TypeError('분석 결과는 일반 객체·배열이어야 합니다.');
    ancestors.add(input);
    const output: JsonValue[] | Record<string, JsonValue> = array ? [] : {};
    for (const key of Reflect.ownKeys(descriptors)) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key))
        throw new TypeError('지원하지 않는 분석 데이터 키입니다.');
      const descriptor = descriptors[key]!;
      if (!('value' in descriptor) || !descriptor.enumerable)
        throw new TypeError('분석 데이터의 getter·숨은 속성을 허용하지 않습니다.');
      if (descriptor.value === undefined && !array) continue;
      Object.defineProperty(output, key, {
        value: visit(descriptor.value, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
    if (array && (output as JsonValue[]).length !== input.length)
      throw new TypeError('분석 데이터는 조밀 배열이어야 합니다.');
    ancestors.delete(input);
    return output;
  }
  return visit(value, 0);
}
export function diagnosticResult(
  kind: CoreDiagnosticKind,
  summary: string,
  columns: string[],
  units: string[],
  rows: number[][],
  details: unknown,
  warnings: string[],
  method: string
): CoreDiagnosticResult {
  if (
    columns.length !== units.length ||
    rows.some((row) => row.length !== columns.length || !row.every(Number.isFinite))
  )
    throw new RangeError('분석 출력의 좌표·단위 또는 유한성 검증에 실패했습니다.');
  return {
    kind,
    summary,
    columns,
    units,
    rows: rows.map((row) => row.map((n) => (Object.is(n, -0) ? 0 : n))),
    details: diagnosticJson(details),
    warnings: [...new Set(warnings)],
    method
  };
}
