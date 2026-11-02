import { EIGEN_LIMITS, type EigenOperator, type EigenSettings } from './eigen-contracts';

export const eigenRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function eigenClosed(value: object, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error('고유해석에 지원하지 않는 필드가 있습니다.');
}
/** Validate descriptors before reading user data, including direct non-JSON callers. */
export function safeEigenData(value: unknown): void {
  const active = new Set<object>();
  let count = 0;
  function visit(input: unknown, depth: number): void {
    if (++count > 500_000 || depth > 16) throw new Error('고유해석 데이터 구조 한도를 넘었습니다.');
    if (typeof input === 'number' && Number.isFinite(input)) return;
    if (typeof input === 'string' && input.length <= 1024) return;
    if (typeof input === 'boolean' || input === null) return;
    if (!input || typeof input !== 'object' || active.has(input))
      throw new Error('유한한 고유해석 데이터만 허용합니다.');
    const array = Array.isArray(input),
      proto = Object.getPrototypeOf(input),
      descriptors = Object.getOwnPropertyDescriptors(input),
      keys = Reflect.ownKeys(descriptors),
      length = array ? descriptors.length?.value : 0;
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null)
      throw new Error('고유해석에는 일반 데이터 객체만 허용합니다.');
    if (
      array
        ? !Number.isSafeInteger(length) || length > EIGEN_LIMITS.nonzeros || keys.length !== length + 1
        : keys.length > 32
    )
      throw new Error('고유해석 배열·객체 한도를 넘었습니다.');
    active.add(input);
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key))
        throw new Error('안전하지 않은 고유해석 데이터 키입니다.');
      const descriptor = descriptors[key]!;
      if (
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))
      )
        throw new Error('고유해석 접근자·숨김·희소 데이터는 허용하지 않습니다.');
      visit(descriptor.value, depth + 1);
    }
    active.delete(input);
  }
  visit(value, 0);
}
export function eigenDimension(operator: EigenOperator): number {
  return operator.kind === 'dense' ? operator.matrix.length : operator.dimension;
}
function coefficient(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= EIGEN_LIMITS.maxCoefficient &&
    (value === 0 || Math.abs(value) >= EIGEN_LIMITS.minNonzeroCoefficient)
  );
}
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
export function eigenEstimatedWork(operator: EigenOperator, settings: EigenSettings): number {
  const n = eigenDimension(operator),
    nonzeros = operator.kind === 'dense' ? n * n : operator.entries.length;
  return settings.method === 'general-eigensolver'
    ? n ** 3 * 100
    : settings.maxRestarts *
        (2 * settings.krylovDim * nonzeros + 4 * n * settings.krylovDim ** 2 + settings.krylovDim ** 3);
}
export function eigenApply(operator: EigenOperator, vector: readonly number[]): number[] {
  const n = eigenDimension(operator),
    out = new Array<number>(n).fill(0);
  if (operator.kind === 'dense') {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i]! += operator.matrix[i]![j]! * vector[j]!;
  } else {
    for (const entry of operator.entries) out[entry.row]! += entry.value * vector[entry.column]!;
  }
  return out;
}
function symmetric(operator: EigenOperator): boolean {
  const n = eigenDimension(operator);
  if (operator.kind === 'dense') {
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        if (operator.matrix[i]![j] !== operator.matrix[j]![i]) return false;
      }
    return true;
  }
  const entries = new Map(operator.entries.map((e) => [`${e.row},${e.column}`, e.value]));
  return operator.entries.every((e) => e.value === (entries.get(`${e.column},${e.row}`) ?? 0));
}
export function validateEigen(operator: EigenOperator, settings: EigenSettings): void {
  safeEigenData(operator);
  safeEigenData(settings);
  if (!eigenRecord(operator) || !eigenRecord(settings)) throw new Error('고유해석 연산자와 설정 객체가 필요합니다.');
  if (operator.kind === 'dense') {
    eigenClosed(operator, ['kind', 'matrix']);
    if (
      !Array.isArray(operator.matrix) ||
      !integer(operator.matrix.length, 2, EIGEN_LIMITS.denseDimension) ||
      operator.matrix.some(
        (row) => !Array.isArray(row) || row.length !== operator.matrix.length || !row.every(coefficient)
      )
    )
      throw new Error('조밀 연산자는 2–64차의 유한한 실수 정방 행렬이어야 합니다. 계수 범위도 확인하세요.');
  } else if (operator.kind === 'sparse') {
    eigenClosed(operator, ['kind', 'dimension', 'entries']);
    if (
      !integer(operator.dimension, 2, EIGEN_LIMITS.sparseDimension) ||
      !Array.isArray(operator.entries) ||
      operator.entries.length > EIGEN_LIMITS.nonzeros
    )
      throw new Error('희소 연산자는 최대2048차·32768개 항입니다.');
    const seen = new Set<string>();
    for (const entry of operator.entries) {
      if (!eigenRecord(entry)) throw new Error('희소 연산자 항 객체가 필요합니다.');
      eigenClosed(entry, ['row', 'column', 'value']);
      if (
        !integer(entry.row, 0, operator.dimension - 1) ||
        !integer(entry.column, 0, operator.dimension - 1) ||
        !coefficient(entry.value)
      )
        throw new Error('희소 연산자의 인덱스·계수 범위가 유효하지 않습니다.');
      const key = `${entry.row},${entry.column}`;
      if (seen.has(key)) throw new Error('희소 연산자에 중복 좌표가 있습니다. 먼저 합쳐주세요.');
      seen.add(key);
    }
  } else throw new Error('조밀 또는 희소 실수 연산자만 허용합니다.');
  eigenClosed(settings, ['method', 'k', 'krylovDim', 'maxRestarts', 'tolerance', 'seed', 'which']);
  const n = eigenDimension(operator);
  if (
    !['arnoldi', 'lanczos', 'general-eigensolver'].includes(settings.method) ||
    !integer(settings.k, 1, Math.min(n, EIGEN_LIMITS.eigenpairs)) ||
    !integer(settings.krylovDim, 2, Math.min(n, EIGEN_LIMITS.krylovDimension)) ||
    !integer(settings.maxRestarts, 1, EIGEN_LIMITS.restarts) ||
    typeof settings.tolerance !== 'number' ||
    !Number.isFinite(settings.tolerance) ||
    settings.tolerance < EIGEN_LIMITS.minTolerance ||
    settings.tolerance > EIGEN_LIMITS.maxTolerance ||
    typeof settings.seed !== 'string' ||
    !settings.seed.trim() ||
    settings.seed.length > 128 ||
    !['LA', 'SA', 'LM'].includes(settings.which)
  )
    throw new Error('고유해석 k·Krylov 차수·반복·허용오차·seed 설정을 확인하세요.');
  if (settings.method !== 'general-eigensolver' && (settings.k >= n || settings.krylovDim <= settings.k))
    throw new Error('Krylov 고유해석은 k < Krylov 차수 ≤ 연산자 차원이어야 합니다.');
  if (settings.method === 'general-eigensolver' && operator.kind !== 'dense')
    throw new Error('일반 고유값 계산은 최대64차 조밀 행렬만 지원합니다.');
  if (settings.method === 'lanczos' && !symmetric(operator))
    throw new Error('Lanczos에는 정확히 대칭인 실수 연산자가 필요합니다.');
  if (eigenEstimatedWork(operator, settings) > EIGEN_LIMITS.estimatedWork)
    throw new Error('고유해석 계산량 한도를 넘었습니다. 차수·Krylov 차수·재시작 수를 줄이세요.');
}
export function eigenSeed(text: string, n: number): number[] {
  let state = 2166136261;
  for (let i = 0; i < text.length; i++) state = Math.imul(state ^ text.charCodeAt(i), 16777619);
  state = state >>> 0 || 1;
  return Array.from({ length: n }, () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 2147483648 - 1;
  });
}
