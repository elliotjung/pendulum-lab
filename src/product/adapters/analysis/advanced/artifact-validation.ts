import {
  ADVANCED_DIAGNOSTIC_KINDS,
  ADVANCED_DIAGNOSTIC_LIMITS as limits,
  ADVANCED_DIAGNOSTIC_VERSION,
  type AdvancedDiagnosticArtifact,
  type AdvancedDiagnosticRequest,
  type AdvancedDiagnosticResult
} from './contracts';
import { advancedSignal, validateAdvancedDiagnosticRequest } from './validation';
import { createDiagnosticFlow, createDiagnosticSeries } from '../core/source';
import { readDiagnosticConfiguration } from '../core/source-config';
import { closedRecord, validateArtifactData } from '../core/artifact-validation';
import { advancedResultSignature } from './result';
import { canonicalJson, type JsonValue } from '../../../persistence/safe-data';
import { validateAdvancedDetailShape } from './artifact-detail-validation';

/** Plain-data validation runs before all property reads in the semantic validators. */
export function validateAdvancedRequestData(input: unknown): asserts input is AdvancedDiagnosticRequest {
  validateArtifactData(input);
  closedRecord(input, ['id', 'kind', 'experiment', 'series', 'settings'], [], '고급 분석 요청');
  closedRecord(
    input.series,
    ['axisUnit', 'labels', 'units', 'times', 'states', 'warnings'],
    ['energy', 'energyUnit'],
    '고급 분석 관측'
  );
}

export function validateAdvancedSourceMetadata(request: AdvancedDiagnosticRequest): void {
  const metadata = createDiagnosticSeries(request.experiment, []);
  const series = request.series;
  if (
    series.axisUnit !== metadata.axisUnit ||
    JSON.stringify(series.labels) !== JSON.stringify(metadata.labels) ||
    JSON.stringify(series.units) !== JSON.stringify(metadata.units) ||
    series.energyUnit !== metadata.energyUnit ||
    (series.energy !== undefined) !== (metadata.energy !== undefined)
  )
    throw new RangeError('artifact 관측 좌표·단위·에너지 의미가 저장된 native 모델과 다릅니다. 원본을 보존하세요.');
}

export function validateAdvancedDiagnosticResult(
  input: unknown,
  request?: AdvancedDiagnosticRequest
): asserts input is AdvancedDiagnosticResult {
  validateArtifactData(input);
  closedRecord(
    input,
    ['kind', 'summary', 'columns', 'units', 'rows', 'details', 'warnings', 'method'],
    [],
    '고급 분석 결과'
  );
  const strings = (value: unknown, maximum: number, nonempty = false) =>
    Array.isArray(value) &&
    value.length <= maximum &&
    value.every((v) => typeof v === 'string' && v.length <= 2000 && (!nonempty || v.length > 0));
  if (
    !ADVANCED_DIAGNOSTIC_KINDS.includes(input.kind as AdvancedDiagnosticResult['kind']) ||
    typeof input.summary !== 'string' ||
    !input.summary ||
    typeof input.method !== 'string' ||
    !input.method ||
    !strings(input.columns, 256, true) ||
    !(input.columns as string[]).length ||
    !strings(input.units, 256, true) ||
    !strings(input.warnings, 128, true)
  )
    throw new RangeError('고급 분석 결과 종류·이름·단위·경고가 유효하지 않습니다.');
  const columns = input.columns as string[];
  if (
    columns.length !== (input.units as string[]).length ||
    !Array.isArray(input.rows) ||
    input.rows.length > limits.samples ||
    input.rows.some((row) => !Array.isArray(row) || row.length !== columns.length || !row.every(Number.isFinite))
  )
    throw new RangeError('고급 분석 결과의 표본·좌표·단위가 일치하지 않습니다.');
  if (request) {
    if (input.kind !== request.kind) throw new RangeError('요청과 결과 분석 종류가 다릅니다.');
    const signature = advancedResultSignature(request);
    if (
      JSON.stringify(input.columns) !== JSON.stringify(signature.columns) ||
      JSON.stringify(input.units) !== JSON.stringify(signature.units) ||
      input.method !== signature.method
    )
      throw new RangeError('고급 분석 결과의 좌표·단위·계산 방법이 알고리즘 계약과 다릅니다.');
    validateResultSource(input as unknown as AdvancedDiagnosticResult, request);
    validateAdvancedDetailShape(input as unknown as AdvancedDiagnosticResult, request);
  }
}

/** Derived source metadata cannot relabel a benchmark or a from-rest scan as the current trajectory. */
function validateResultSource(result: AdvancedDiagnosticResult, request: AdvancedDiagnosticRequest): void {
  const details = result.details;
  if (!details || typeof details !== 'object' || Array.isArray(details))
    throw new RangeError('고급 분석 결과에 명시적 source 계보가 필요합니다.');
  const s = request.settings;
  let key: string;
  let expected: unknown;
  if (['rqa', 'recurrence-network', 'correlation-dimension', 'multifractal'].includes(request.kind)) {
    const signal = advancedSignal(request);
    key = 'source';
    expected = {
      coordinate: s.coordinate,
      label: request.series.labels[Number(s.coordinate)],
      unit: request.series.units[Number(s.coordinate)],
      selectedTimes: signal.times,
      dimension: s.dimension,
      delay: s.delay,
      samples: signal.values.length
    };
  } else if (['topological-entropy', 'transfer-operator'].includes(request.kind)) {
    key = 'source';
    expected = {
      kind: 'independent-scalar-benchmark',
      name: s.source,
      parameter: s.mapParameter,
      domain: [0, 1],
      formula: s.source === 'tent' ? 'p*min(x,1-x)' : 'p*x*(1-x)',
      physicalExperimentUsed: false
    };
  } else if (['lcs-ridge', 'basin', 'uncertainty', 'wada'].includes(request.kind)) {
    const source = readDiagnosticConfiguration(request.experiment);
    if (source.family !== 'planar') throw new RangeError('격자 source 모델이 유효하지 않습니다.');
    key = 'scan';
    expected = {
      kind: 'independent-from-rest-grid',
      physicalParameters: source.config.parameters,
      gamma: 0,
      angleRange: [s.rangeLow, s.rangeHigh],
      initialVelocities: [0, 0],
      currentInitialConditionsUsed: false,
      dt: s.dt,
      duration: s.duration
    };
  } else {
    const flow = createDiagnosticFlow(request.experiment);
    if (details.timeUnit !== flow.timeUnit || canonicalJson(details.initial!) !== canonicalJson(flow.initial))
      throw new RangeError('접선 결과의 초기 상태·시간 단위가 native 모델과 다릅니다.');
    return;
  }
  if (details[key] === undefined || canonicalJson(details[key]!) !== canonicalJson(expected as JsonValue))
    throw new RangeError('고급 분석 source 계보가 저장된 입력·설정과 다릅니다.');
}

export function validateAdvancedDiagnosticArtifact(input: unknown): asserts input is AdvancedDiagnosticArtifact {
  validateArtifactData(input);
  closedRecord(
    input,
    ['schema', 'algorithmVersion', 'artifactId', 'inputRunId', 'createdAt', 'request', 'result'],
    [],
    '고급 분석 artifact'
  );
  if (input.schema !== 'pendulum-advanced-diagnostic/v1' || input.algorithmVersion !== ADVANCED_DIAGNOSTIC_VERSION)
    throw new RangeError('지원하지 않는 고급 분석 artifact·알고리즘 버전입니다. 원본을 보존하세요.');
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
  validateAdvancedRequestData(input.request);
  const artifact = input as unknown as AdvancedDiagnosticArtifact;
  validateAdvancedDiagnosticRequest(artifact.request);
  validateAdvancedDiagnosticResult(artifact.result, artifact.request);
  validateAdvancedSourceMetadata(artifact.request);
}
