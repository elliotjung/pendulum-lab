import {
  EXPANSION_MODEL_IDS,
  type ExpansionSuiteConfig,
  type ExpansionSuiteResult
} from '../../../physics/expandedModels-types';
import {
  createExpansionSystem,
  expansionModelDefinition,
  DEFAULT_EXPANSION_METHODS
} from '../../../physics/expandedModels-factory';
import { integratorRegistry } from '../../../physics/integratorRegistry';
import type { IntegratorId } from '../../../types/domain';
import { batchData, batchHash, closed, stableBatchJson } from './safe';
import { scanJsonResources } from '../../../app/parity/storage-json-resource-scanner';
import type { JsonValue } from '../../persistence/safe-data';
import { runExpansionSuite } from '../../../physics/expandedModels-runners';

export const LEGACY_EXPANSION_LIMITS = Object.freeze({ bytes: 16 * 1024 * 1024, work: 32_000_000 });
export interface LegacyExpansionRequest {
  readonly schema: 'pendulum-legacy-expansion-request/v1';
  readonly id: string;
  readonly config: ExpansionSuiteConfig;
  readonly includeLyapunov: boolean;
  readonly sourceText: string | null;
  readonly resolved: {
    readonly methods: readonly IntegratorId[];
    readonly dt: number;
    readonly requestedHorizon: number;
    readonly steps: number;
    readonly effectiveDuration: number;
    readonly sampleLimit: number;
    readonly sampleStride: number;
    readonly bifurcationColumns: number;
    readonly bifurcationSteps: number;
    readonly ghostSteps: number;
    readonly ghostEpsilon: number;
    readonly estimatedWork: number;
    readonly parameters: Readonly<Record<string, number>>;
    readonly initialState: readonly number[];
    readonly lyapunov: { readonly dt: number; readonly horizon: number; readonly steps: number } | null;
  };
}
export interface LegacyExpansionArchive {
  readonly schema: 'pendulum-legacy-expansion/v1';
  readonly request: LegacyExpansionRequest;
  readonly result: JsonValue;
  readonly resultSha256: string;
}
export function buildLegacyExpansionRequest(
  input: ExpansionSuiteConfig,
  options: { includeLyapunov?: boolean; sourceText?: string } = {}
): LegacyExpansionRequest {
  const config = batchData(input) as unknown as ExpansionSuiteConfig;
  if (!config || typeof config !== 'object' || Array.isArray(config))
    throw new Error('확장 모델 설정 객체가 필요합니다.');
  closed(config, [
    'model',
    'methods',
    'parameterOverrides',
    'initialState',
    'dt',
    'horizon',
    'sampleLimit',
    'ghostEpsilon',
    'bifurcationColumns'
  ]);
  if (!EXPANSION_MODEL_IDS.includes(config.model)) throw new Error('지원하는 기존 확장 모델 ID가 필요합니다.');
  const definition = expansionModelDefinition(config.model);
  const methods = config.methods === undefined ? [...DEFAULT_EXPANSION_METHODS] : [...config.methods];
  if (
    !methods.length ||
    methods.length > 16 ||
    new Set(methods).size !== methods.length ||
    methods.some((method) => !Object.hasOwn(integratorRegistry, method))
  )
    throw new Error('기존 적분기1–16개를 중복 없이 지정하세요.');
  const dt = config.dt ?? definition.defaultDt,
    horizon = config.horizon ?? definition.defaultHorizon;
  if (typeof dt !== 'number' || dt < 1e-6 || dt > 0.05 || typeof horizon !== 'number' || horizon <= 0 || horizon > 300)
    throw new Error('dt는0.000001–0.05, horizon은0보다 크고300 이하여야 합니다.');
  for (const key of ['sampleLimit', 'bifurcationColumns'] as const)
    if (config[key] !== undefined && (!Number.isSafeInteger(config[key]) || config[key]! < 1 || config[key]! > 100_000))
      throw new Error(`${key}는1–100000 정수여야 합니다. native 범위 적용을 아래에 표시합니다.`);
  if (
    config.ghostEpsilon !== undefined &&
    (typeof config.ghostEpsilon !== 'number' || config.ghostEpsilon <= 0 || config.ghostEpsilon > 1)
  )
    throw new Error('ghostEpsilon은0보다 크고1 이하여야 합니다.');
  const overrides = config.parameterOverrides ?? {};
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides))
    throw new Error('물성 객체가 필요합니다.');
  for (const [key, value] of Object.entries(overrides)) {
    if (
      (!Object.hasOwn(definition.defaultParameters, key) &&
        !(config.model === 'chain' && /^(?:mass|length)[1-8]$/.test(key))) ||
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      Math.abs(value) > 1000
    )
      throw new Error(`정의되지 않거나 범위를 넘는 물성: ${key}`);
    if (key === 'links' && (!Number.isSafeInteger(value) || value < 2 || value > 8))
      throw new Error('links는2–8 정수여야 합니다.');
    if (/^(?:(?:mass|length)[1-8]?|[ml][1-8]?)$/.test(key) && value <= 0) throw new Error(`${key}는 양수여야 합니다.`);
  }
  if (
    config.initialState !== undefined &&
    (!Array.isArray(config.initialState) ||
      config.initialState.length !== definition.dimension ||
      config.initialState.some(
        (value) => typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e6
      ))
  )
    throw new Error('확장 모델의 정확한 유한 초기 상태 차원이 필요합니다.');
  if (options.includeLyapunov !== undefined && typeof options.includeLyapunov !== 'boolean')
    throw new Error('Lyapunov 옵션은 boolean이어야 합니다.');
  if (options.sourceText !== undefined && (typeof options.sourceText !== 'string' || options.sourceText.length > 32768))
    throw new Error('원본 링크는 최대32768자입니다.');
  const system = createExpansionSystem(config.model, overrides, config.initialState);
  const steps = Math.max(10, Math.min(80_000, Math.round(horizon / dt)));
  const sampleLimit = Math.max(24, Math.min(600, config.sampleLimit ?? 240));
  const bifurcationColumns = Math.max(4, Math.min(32, config.bifurcationColumns ?? 12));
  const bifurcationSteps = Math.max(100, Math.min(5000, Math.round((horizon * 0.7) / dt)));
  const ghostSteps = Math.min(steps, Math.round(18 / dt));
  const includeLyapunov = options.includeLyapunov ?? false;
  const lyapunovDt = Math.max(0.0001, Math.min(0.02, dt));
  const lyapunovHorizon = Math.max(4, Math.min(horizon, 24));
  const lyapunovSteps = Math.max(200, Math.min(60_000, Math.round(lyapunovHorizon / lyapunovDt)));
  const dimension = definition.dimension;
  const dense = config.model === 'chain' ? Math.max(1, Math.ceil(dimension / 4) ** 2) : 1;
  const estimatedWork =
    dimension *
    dense *
    (steps * methods.length +
      ghostSteps * 2 +
      bifurcationColumns * bifurcationSteps +
      (includeLyapunov ? lyapunovSteps * (dimension + 1) : 0));
  if (estimatedWork > LEGACY_EXPANSION_LIMITS.work)
    throw new Error(
      '전체 native suite 작업이32000000 상태·단계 한도를 넘습니다. 원본은 보존하고 실행할 기간을 명시적으로 다시 선택하세요.'
    );
  const request = {
    schema: 'pendulum-legacy-expansion-request/v1' as const,
    config,
    includeLyapunov,
    sourceText: options.sourceText ?? null,
    resolved: {
      methods,
      dt,
      requestedHorizon: horizon,
      steps,
      effectiveDuration: steps * dt,
      sampleLimit,
      sampleStride: Math.max(1, Math.floor(steps / sampleLimit)),
      bifurcationColumns,
      bifurcationSteps,
      ghostSteps,
      ghostEpsilon: config.ghostEpsilon ?? 1e-5,
      estimatedWork,
      parameters: system.parameters,
      initialState: Array.from(system.initialState),
      lyapunov: includeLyapunov ? { dt: lyapunovDt, horizon: lyapunovHorizon, steps: lyapunovSteps } : null
    }
  };
  return { ...request, id: `legacy-expansion-${batchHash(request)}` };
}

/** Tagged IEEE special values preserve unstable native outputs exactly instead of JSON's null coercion. */
export function encodeLegacyExpansionResult(result: ExpansionSuiteResult): JsonValue {
  let nodes = 0;
  const active = new Set<object>();
  function encode(value: unknown, depth: number): JsonValue {
    if (++nodes > 1_000_000 || depth > 32) throw new Error('native 출력 구조 한도를 넘었습니다.');
    if (typeof value === 'number')
      return !Number.isFinite(value) || Object.is(value, -0)
        ? { $nativeNumber: Object.is(value, -0) ? '-0' : String(value) }
        : value;
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value !== 'object' || active.has(value))
      throw new Error('native 출력에는 순환·함수·undefined를 저장할 수 없습니다.');
    const array = Array.isArray(value),
      prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
      throw new Error('native 출력은 일반 데이터여야 합니다.');
    const descriptors = Object.getOwnPropertyDescriptors(value),
      keys = Reflect.ownKeys(descriptors);
    const length = array ? (descriptors.length?.value as number) : 0;
    if (array ? !Number.isSafeInteger(length) || length > 8192 || keys.length !== length + 1 : keys.length > 512)
      throw new Error('native 출력 배열·객체 한도를 넘었습니다.');
    const copy: JsonValue[] | Record<string, JsonValue> = array ? [] : {};
    active.add(value);
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype', '$nativeNumber'].includes(key))
        throw new Error('native 출력 키가 올바르지 않습니다.');
      const descriptor = descriptors[key]!;
      if (
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))
      )
        throw new Error('native 출력 접근자·숨김·희소 데이터는 허용하지 않습니다.');
      Object.defineProperty(copy, key, {
        value: encode(descriptor.value, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
    active.delete(value);
    return copy;
  }
  return batchData(encode(result, 0));
}
export function decodeLegacyExpansionResult(encoded: JsonValue): ExpansionSuiteResult {
  const text = stableBatchJson(encoded);
  return JSON.parse(text, (_key, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, '$nativeNumber')) {
      const record = value as Record<string, unknown>;
      if (
        Object.keys(record).length !== 1 ||
        !['-0', 'NaN', 'Infinity', '-Infinity'].includes(String(record.$nativeNumber))
      )
        throw new Error('native 숫자 태그가 올바르지 않습니다.');
      return record.$nativeNumber === '-0' ? -0 : Number(record.$nativeNumber);
    }
    return value;
  }) as ExpansionSuiteResult;
}
function verifyResult(result: ExpansionSuiteResult, request: LegacyExpansionRequest) {
  if (
    !result ||
    result.schemaVersion !== 'pendulum-expansion-suite/v1' ||
    result.model !== request.config.model ||
    stableBatchJson(result.methods) !== stableBatchJson(request.resolved.methods) ||
    result.dt !== request.resolved.dt ||
    result.horizon !== request.resolved.requestedHorizon ||
    stableBatchJson(result.parameters) !== stableBatchJson(request.resolved.parameters) ||
    stableBatchJson(result.initialState) !== stableBatchJson(request.resolved.initialState) ||
    result.referenceMethod !== request.resolved.methods[0] ||
    !Array.isArray(result.rows) ||
    result.rows.length !== request.resolved.methods.length ||
    result.rows.some(
      (row, index) =>
        row.method !== request.resolved.methods[index] ||
        !Number.isSafeInteger(row.completedSteps) ||
        row.completedSteps < 1 ||
        row.completedSteps > request.resolved.steps ||
        !Array.isArray(row.finalState) ||
        row.finalState.length !== request.resolved.initialState.length ||
        !Array.isArray(row.samples)
    ) ||
    (result.lyapunov !== undefined) !== request.includeLyapunov ||
    !result.phaseHeatmap ||
    !Array.isArray(result.ghost) ||
    !Array.isArray(result.bifurcation) ||
    result.bifurcation.length !== request.resolved.bifurcationColumns ||
    !Array.isArray(result.replay) ||
    !result.summary ||
    !result.methods.includes(result.summary.bestMethod) ||
    !result.manifest ||
    result.manifest.schemaVersion !== 'pendulum-expansion-manifest/v1' ||
    !Number.isFinite(Date.parse(result.generatedAt))
  )
    throw new Error('native suite 결과의 설정·방법 순서·출력·계보가 맞지 않습니다.');
  closed(result, [
    'schemaVersion',
    'generatedAt',
    'model',
    'modelLabel',
    'family',
    'conservative',
    'parameters',
    'initialState',
    'methods',
    'referenceMethod',
    'dt',
    'horizon',
    'rows',
    'phaseHeatmap',
    'ghost',
    'lyapunov',
    'bifurcation',
    'replay',
    'summary',
    'manifest'
  ]);
  const numbers = (value: unknown): value is number[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'number');
  const point = (value: unknown): boolean => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    closed(value, ['x', 'y']);
    const p = value as { x?: unknown; y?: unknown };
    return typeof p.x === 'number' && typeof p.y === 'number';
  };
  const coordinates = (value: unknown): boolean => Array.isArray(value) && value.length <= 512 && value.every(point);
  if (
    typeof result.modelLabel !== 'string' ||
    typeof result.family !== 'string' ||
    typeof result.conservative !== 'boolean'
  )
    throw new Error('native 모델 설명이 올바르지 않습니다.');
  for (const row of result.rows) {
    closed(row, [
      'method',
      'stable',
      'completedSteps',
      'elapsedMs',
      'stepsPerMs',
      'energyDrift',
      'energySpan',
      'referenceDivergence',
      'maxAbsState',
      'embeddedError',
      'finalState',
      'samples'
    ]);
    if (
      typeof row.stable !== 'boolean' ||
      (row.stable && row.completedSteps !== request.resolved.steps) ||
      !['elapsedMs', 'stepsPerMs', 'energyDrift', 'energySpan', 'referenceDivergence', 'maxAbsState'].every(
        (key) => typeof (row as unknown as Record<string, unknown>)[key] === 'number'
      ) ||
      (row.embeddedError !== null && typeof row.embeddedError !== 'number') ||
      !numbers(row.finalState)
    )
      throw new Error('native 방법별 수치 출력 형식이 맞지 않습니다.');
    let previous = -Infinity;
    for (const sample of row.samples) {
      if (!sample || typeof sample !== 'object') throw new Error('native 표본 객체가 필요합니다.');
      closed(sample, ['time', 'state', 'energy', 'phase', 'coordinates']);
      if (
        !Number.isFinite(sample.time) ||
        sample.time <= previous ||
        sample.time > row.completedSteps * result.dt + 1e-10 ||
        !numbers(sample.state) ||
        sample.state.length !== request.resolved.initialState.length ||
        typeof sample.energy !== 'number' ||
        !point(sample.phase) ||
        !coordinates(sample.coordinates)
      )
        throw new Error('native 표본의 시간·상태·좌표 형식이 맞지 않습니다.');
      previous = sample.time;
    }
  }
  const heat = result.phaseHeatmap;
  closed(heat, ['xMin', 'xMax', 'yMin', 'yMax', 'bins', 'counts', 'maxCount']);
  if (
    heat.bins !== 36 ||
    ![heat.xMin, heat.xMax, heat.yMin, heat.yMax, heat.maxCount].every(Number.isFinite) ||
    !Array.isArray(heat.counts) ||
    heat.counts.length !== 36 ||
    heat.counts.some(
      (row) => !numbers(row) || row.length !== 36 || row.some((count) => !Number.isSafeInteger(count) || count < 0)
    )
  )
    throw new Error('native heatmap 차원·계수가 올바르지 않습니다.');
  for (const frame of result.ghost) {
    if (!frame || typeof frame !== 'object') throw new Error('native ghost 프레임이 필요합니다.');
    closed(frame, ['time', 'divergence', 'base', 'ghost']);
    if (
      !Number.isFinite(frame.time) ||
      typeof frame.divergence !== 'number' ||
      !coordinates(frame.base) ||
      !coordinates(frame.ghost)
    )
      throw new Error('native ghost 출력 형식이 맞지 않습니다.');
  }
  for (const column of result.bifurcation) {
    if (!column || typeof column !== 'object') throw new Error('native 분기 열이 필요합니다.');
    closed(column, ['parameter', 'values']);
    if (!Number.isFinite(column.parameter) || !numbers(column.values))
      throw new Error('native 분기 출력 형식이 맞지 않습니다.');
  }
  if (!result.replay.every(coordinates)) throw new Error('native replay 좌표가 올바르지 않습니다.');
  closed(result.summary, ['bestMethod', 'bestScore', 'stableMethods', 'maxGhostDivergence', 'energyShellSpan']);
  if (
    ![result.summary.bestScore, result.summary.maxGhostDivergence, result.summary.energyShellSpan].every(
      (value) => typeof value === 'number'
    ) ||
    result.summary.stableMethods !== result.rows.filter((row) => row.stable).length
  )
    throw new Error('native 전체 요약이 개별 방법 결과와 맞지 않습니다.');
  closed(result.manifest, ['schemaVersion', 'hash', 'shareHash', 'createdAt']);
  if (
    typeof result.manifest.hash !== 'string' ||
    typeof result.manifest.shareHash !== 'string' ||
    result.manifest.createdAt !== result.generatedAt
  )
    throw new Error('native manifest 시간·출처가 맞지 않습니다.');
  if (result.lyapunov) {
    const profile = result.lyapunov;
    if (
      !numbers(profile.spectrum) ||
      profile.spectrum.length !== request.resolved.initialState.length ||
      !numbers(profile.blockStdError) ||
      profile.blockStdError.length !== profile.spectrum.length ||
      !profile.settings ||
      profile.settings.dt !== request.resolved.lyapunov?.dt ||
      profile.settings.steps !== request.resolved.lyapunov.steps ||
      !Array.isArray(profile.timeline) ||
      profile.timeline.some(
        (sample) =>
          !sample || ![sample.time, sample.leading, sample.secondary].every((value) => typeof value === 'number')
      )
    )
      throw new Error('native Lyapunov 스펙트럼·관측 설정이 맞지 않습니다.');
  }
}
async function checksum(request: LegacyExpansionRequest, result: JsonValue): Promise<string> {
  const bytes = new TextEncoder().encode(stableBatchJson({ request, result }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}
export async function archiveLegacyExpansion(
  request: LegacyExpansionRequest,
  result: ExpansionSuiteResult
): Promise<LegacyExpansionArchive> {
  const rebuilt = buildLegacyExpansionRequest(request.config, {
    includeLyapunov: request.includeLyapunov,
    ...(request.sourceText === null ? {} : { sourceText: request.sourceText })
  });
  if (stableBatchJson(rebuilt) !== stableBatchJson(request)) throw new Error('확장 모델 요청 계보가 달라졌습니다.');
  const encoded = encodeLegacyExpansionResult(result);
  verifyResult(decodeLegacyExpansionResult(encoded), rebuilt);
  const archive: LegacyExpansionArchive = {
    schema: 'pendulum-legacy-expansion/v1',
    request: rebuilt,
    result: encoded,
    resultSha256: await checksum(rebuilt, encoded)
  };
  batchData(archive);
  return archive;
}
/** Scientific computation stays wholly in the preserved native runner. */
export async function executeLegacyExpansion(request: LegacyExpansionRequest): Promise<LegacyExpansionArchive> {
  const rebuilt = buildLegacyExpansionRequest(request.config, {
    includeLyapunov: request.includeLyapunov,
    ...(request.sourceText === null ? {} : { sourceText: request.sourceText })
  });
  if (stableBatchJson(rebuilt) !== stableBatchJson(request))
    throw new Error('native suite 요청의 입력 계보가 달라졌습니다.');
  return archiveLegacyExpansion(
    rebuilt,
    runExpansionSuite(rebuilt.config, { includeLyapunov: rebuilt.includeLyapunov })
  );
}
export async function parseLegacyExpansion(text: string): Promise<LegacyExpansionArchive> {
  if (new TextEncoder().encode(text).length > LEGACY_EXPANSION_LIMITS.bytes)
    throw new Error('확장 suite 파일은 최대16MiB입니다.');
  const scan = scanJsonResources(text, {
    depth: 32,
    nodes: 1_000_000,
    arrayItems: 8192,
    objectProperties: 512,
    stringCodeUnits: 32768,
    totalStringCodeUnits: LEGACY_EXPANSION_LIMITS.bytes,
    keyCodeUnits: 256
  });
  if (!scan.ok) throw new Error(scan.message);
  const archive = batchData(JSON.parse(text) as unknown) as unknown as LegacyExpansionArchive;
  if (!archive || typeof archive !== 'object' || Array.isArray(archive))
    throw new Error('suite archive 객체가 필요합니다.');
  closed(archive, ['schema', 'request', 'result', 'resultSha256']);
  if (archive.schema !== 'pendulum-legacy-expansion/v1' || !archive.request)
    throw new Error('지원하지 않는 확장 suite 버전입니다.');
  const checked = await archiveLegacyExpansion(archive.request, decodeLegacyExpansionResult(archive.result));
  if (checked.resultSha256 !== archive.resultSha256)
    throw new Error('확장 suite SHA-256 checksum이 맞지 않습니다. 수치 인증을 의미하지는 않습니다.');
  return checked;
}
