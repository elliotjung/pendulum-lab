import {
  CORE_DIAGNOSTIC_LIMITS as limits,
  CORE_DIAGNOSTIC_VERSION,
  type CoreDiagnosticArtifact,
  type CoreDiagnosticResult
} from './contracts';
import { validateCoreDiagnosticRequest } from './validation';
import { createDiagnosticSeries } from './source';
import { coreResultSignature } from './signature';

export function closedRecord(
  input: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string
): asserts input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError(`${label}: 객체가 필요합니다.`);
  const keys = Object.keys(input);
  if (
    required.some((key) => !keys.includes(key)) ||
    keys.some((key) => !required.includes(key) && !optional.includes(key))
  )
    throw new RangeError(`${label}: 누락되었거나 지원하지 않는 필드입니다. 원본을 보존하세요.`);
}
/** Artifact observations have a separate, explicit budget; experiment/share limits stay unchanged. */
export function validateArtifactData(input: unknown): void {
  let count = 0;
  const ancestors = new Set<object>();
  function visit(value: unknown, depth: number): void {
    if (++count > 2_500_000 || depth > 32) throw new RangeError('분석 artifact 구조 예산을 초과했습니다.');
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Object.is(value, -0))
        throw new RangeError('artifact 수치는 유한하며 canonical 형식이어야 합니다.');
      return;
    }
    if (typeof value === 'string') {
      if (value.length > 8192 || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))
        throw new RangeError('artifact 문자열이 너무 길거나 올바르지 않습니다.');
      return;
    }
    if (!value || typeof value !== 'object' || ancestors.has(value))
      throw new TypeError('artifact는 순환·실행 코드 없는 일반 데이터여야 합니다.');
    const array = Array.isArray(value),
      prototype = Object.getPrototypeOf(value),
      descriptors = Object.getOwnPropertyDescriptors(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
      throw new TypeError('artifact는 일반 객체와 배열만 허용합니다.');
    const keys = Reflect.ownKeys(descriptors),
      length = array ? (descriptors.length!.value as number) : 0;
    if (array ? length > limits.scalars || keys.length !== length + 1 : keys.length > 512)
      throw new RangeError('artifact 배열·객체 예산 또는 조밀 배열 규약을 확인하세요.');
    ancestors.add(value);
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key))
        throw new TypeError('artifact에 허용하지 않는 키가 있습니다.');
      const descriptor = descriptors[key]!;
      if (
        !('value' in descriptor) ||
        !descriptor.enumerable ||
        (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))
      )
        throw new TypeError('artifact는 getter·숨은 속성·희소 배열을 허용하지 않습니다.');
      visit(descriptor.value, depth + 1);
    }
    ancestors.delete(value);
  }
  visit(input, 0);
  if (new TextEncoder().encode(JSON.stringify(input)).length > limits.artifactBytes)
    throw new RangeError(`분석 artifact는 ${limits.artifactBytes / 1024 / 1024} MiB 이하여야 합니다.`);
}
export function validateCoreDiagnosticResult(input: unknown): asserts input is CoreDiagnosticResult {
  validateArtifactData(input);
  closedRecord(
    input,
    ['kind', 'summary', 'columns', 'units', 'rows', 'details', 'warnings', 'method'],
    [],
    '분석 결과'
  );
  const strings = (value: unknown, maximum: number) =>
    Array.isArray(value) && value.length <= maximum && value.every((v) => typeof v === 'string' && v.length <= 2000);
  if (
    typeof input.summary !== 'string' ||
    typeof input.method !== 'string' ||
    !input.method ||
    !strings(input.columns, 256) ||
    !(input.columns as string[]).length ||
    !strings(input.units, 256) ||
    !strings(input.warnings, 128)
  )
    throw new RangeError('분석 결과 이름·단위·경고가 유효하지 않습니다.');
  const columns = input.columns as string[],
    units = input.units as string[];
  if (
    columns.length !== units.length ||
    !Array.isArray(input.rows) ||
    input.rows.length > limits.samples ||
    input.rows.some((row) => !Array.isArray(row) || row.length !== columns.length || !row.every(Number.isFinite))
  )
    throw new RangeError('분석 결과의 표본·좌표·단위가 일치하지 않습니다.');
}
export function validateCoreDiagnosticArtifact(input: unknown): asserts input is CoreDiagnosticArtifact {
  validateArtifactData(input);
  closedRecord(
    input,
    ['schema', 'algorithmVersion', 'artifactId', 'inputRunId', 'createdAt', 'request', 'result'],
    [],
    '분석 artifact'
  );
  if (input.schema !== 'pendulum-core-diagnostic/v1' || input.algorithmVersion !== CORE_DIAGNOSTIC_VERSION)
    throw new RangeError('지원하지 않는 분석 artifact·알고리즘 버전입니다. 원본을 보존하세요.');
  for (const key of ['artifactId', 'inputRunId'])
    if (typeof input[key] !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input[key] as string))
      throw new RangeError('artifact·입력 run 식별자가 유효하지 않습니다.');
  if (
    typeof input.createdAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.createdAt) ||
    !Number.isFinite(Date.parse(input.createdAt)) ||
    new Date(input.createdAt).toISOString() !== input.createdAt
  )
    throw new RangeError('artifact 생성 시간은 유효한 UTC ISO 시간이어야 합니다.');
  closedRecord(input.request, ['id', 'kind', 'experiment', 'series', 'settings'], [], 'artifact 요청');
  const artifact = input as unknown as CoreDiagnosticArtifact;
  closedRecord(
    artifact.request.series,
    ['axisUnit', 'labels', 'units', 'times', 'states', 'warnings'],
    ['energy', 'energyUnit'],
    'artifact 관측'
  );
  validateCoreDiagnosticRequest(artifact.request);
  validateCoreDiagnosticResult(artifact.result);
  if (artifact.result.kind !== artifact.request.kind)
    throw new RangeError('artifact의 요청과 결과 분석 종류가 다릅니다.');
  const metadata = createDiagnosticSeries(artifact.request.experiment, []),
    series = artifact.request.series;
  if (
    series.axisUnit !== metadata.axisUnit ||
    JSON.stringify(series.labels) !== JSON.stringify(metadata.labels) ||
    JSON.stringify(series.units) !== JSON.stringify(metadata.units) ||
    series.energyUnit !== metadata.energyUnit ||
    (series.energy !== undefined) !== (metadata.energy !== undefined)
  )
    throw new RangeError('artifact 관측 좌표·단위·에너지 의미가 저장된 native 모델과 다릅니다. 원본을 보존하세요.');
  const signature = coreResultSignature(artifact.request);
  if (
    JSON.stringify(artifact.result.columns) !== JSON.stringify(signature.columns) ||
    JSON.stringify(artifact.result.units) !== JSON.stringify(signature.units) ||
    artifact.result.method !== signature.method
  )
    throw new RangeError('artifact 결과의 좌표·단위·계산 방법이 알고리즘 계약과 다릅니다.');
  if (artifact.result.kind === 'shadowing') {
    const details = artifact.result.details;
    if (
      !details ||
      typeof details !== 'object' ||
      Array.isArray(details) ||
      details.nullHorizonMeaning !== 'threshold-not-exceeded-within-observation-window' ||
      ['horizon', 'possibleHorizon', 'certifiedHorizon'].some(
        (key) =>
          details[key] !== null &&
          (typeof details[key] !== 'number' ||
            details[key] < 0 ||
            details[key] > Number(artifact.request.settings.duration))
      )
    )
      throw new RangeError('shadowing horizon의 미초과 표현 또는 기간이 유효하지 않습니다.');
  }
}
