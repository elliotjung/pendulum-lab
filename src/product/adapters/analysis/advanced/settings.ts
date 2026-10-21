import type { ExperimentStateV1 } from '../../../contracts/experiment';
import { ADVANCED_DIAGNOSTIC_KINDS, type AdvancedDiagnosticKind, type AdvancedDiagnosticSettings } from './contracts';
export { advancedDiagnosticRejection } from './validation';

/** Display and validation share these bounds; model-specific cross-field limits are checked below. */
export const ADVANCED_SETTING_RANGES: Readonly<Record<string, readonly [number, number, boolean?]>> = Object.freeze({
  coordinate: [0, 255, true],
  transient: [0, 300],
  stride: [1, 1000, true],
  maxSamples: [16, 512, true],
  dimension: [1, 8, true],
  delay: [1, 128, true],
  targetRecurrenceRate: [0.001, 0.5],
  theiler: [0, 128, true],
  lMin: [2, 128, true],
  vMin: [2, 128, true],
  blocks: [2, 8, true],
  radiusCount: [8, 128, true],
  fitLowFraction: [0.0001, 0.5],
  fitHighFraction: [0.001, 0.9],
  qMin: [-2, 7],
  qMax: [-1, 8],
  qCount: [3, 17, true],
  scaleCount: [3, 12, true],
  coarseDivisor: [1.1, 16],
  fineDivisor: [2, 256],
  mapParameter: [0.001, 4],
  boxes: [2, 16, true],
  samplesPerBox: [4, 256, true],
  iterations: [10, 2000, true],
  tolerance: [1e-13, 1e-3],
  dt: [1e-5, 0.1],
  duration: [1e-5, 100],
  count: [0, 16, true],
  renormEvery: [1, 100, true],
  forwardTransient: [0, 1000, true],
  window: [2, 1000, true],
  backwardTransient: [0, 999, true],
  seed: [0, 0xffffffff, true],
  resolution: [4, 32, true],
  rangeLow: [-Math.PI, Math.PI],
  rangeHigh: [-Math.PI, Math.PI],
  percentile: [0, 0.999],
  margin: [0, 1e6],
  boxSide: [1, 16, true],
  radius: [1, 8, true],
  threshold: [0, 1],
  convergenceTolerance: [0, 1]
});

export function defaultAdvancedSettings(
  kind: AdvancedDiagnosticKind,
  experiment?: ExperimentStateV1
): AdvancedDiagnosticSettings {
  const dt = experiment?.runtime.domain === 'time' ? experiment.runtime.step.value : 0.01;
  const series = { coordinate: 0, transient: 0, stride: 1, maxSamples: 256, dimension: 2, delay: 1 };
  const grid = { resolution: 16, rangeLow: -3, rangeHigh: 3, duration: 2, dt: Math.max(0.01, dt) };
  switch (kind) {
    case 'rqa':
      return { ...series, targetRecurrenceRate: 0.1, theiler: 1, lMin: 2, vMin: 2, blocks: 4 };
    case 'recurrence-network':
      return { ...series, targetRecurrenceRate: 0.1, theiler: 1 };
    case 'correlation-dimension':
      return { ...series, radiusCount: 32, fitLowFraction: 0.01, fitHighFraction: 0.1, theiler: 1 };
    case 'multifractal':
      return { ...series, qMin: 0, qMax: 4, qCount: 5, scaleCount: 6, coarseDivisor: 2, fineDivisor: 16 };
    case 'topological-entropy':
      return { source: 'tent', mapParameter: 2, boxes: 8, samplesPerBox: 32, iterations: 1000, tolerance: 1e-10 };
    case 'transfer-operator':
      return { source: 'tent', mapParameter: 2, boxes: 8, samplesPerBox: 32 };
    case 'clv':
      return { dt, count: 0, renormEvery: 5, forwardTransient: 20, window: 40, backwardTransient: 20, seed: 40503 };
    case 'ftle':
      return { duration: 1, dt };
    case 'lcs-ridge':
      return { ...grid, resolution: 12, duration: 0.5, percentile: 0.8, margin: 0 };
    case 'basin':
    case 'uncertainty':
      return { ...grid, boxSide: 2 };
    case 'wada':
      return { ...grid, resolution: 16, radius: 2, threshold: 0.95, convergenceTolerance: 0.05 };
  }
}
export function numeric(settings: AdvancedDiagnosticSettings, key: string): number {
  const value = settings[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(`${key}: 유한한 숫자가 필요합니다.`);
  return value;
}
export function validateAdvancedSettings(
  kind: AdvancedDiagnosticKind,
  input: unknown
): asserts input is AdvancedDiagnosticSettings {
  if (!ADVANCED_DIAGNOSTIC_KINDS.includes(kind)) throw new RangeError('지원하지 않는 고급 진단입니다.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('분석 설정 객체가 필요합니다.');
  const expected = Object.keys(defaultAdvancedSettings(kind)),
    keys = Object.keys(input);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key)))
    throw new RangeError('누락되었거나 지원하지 않는 고급 분석 설정입니다.');
  const s = input as AdvancedDiagnosticSettings;
  const range = (key: string, lo: number, hi: number, integer = false) => {
    if (!(key in s)) return;
    const declared = ADVANCED_SETTING_RANGES[key];
    if (declared && !['maxSamples', 'mapParameter', 'resolution'].includes(key)) {
      lo = declared[0];
      hi = declared[1];
      integer = declared[2] ?? false;
    }
    const n = numeric(s, key);
    if (n < lo || n > hi || (integer && !Number.isSafeInteger(n)))
      throw new RangeError(`${key}: ${lo}–${hi} 범위의 ${integer ? '정수' : '수'}가 필요합니다.`);
  };
  range('coordinate', 0, 255, true);
  range('transient', 0, 300);
  range('stride', 1, 1000, true);
  range('maxSamples', 16, kind === 'recurrence-network' ? 256 : 512, true);
  range('dimension', 1, 8, true);
  range('delay', 1, 128, true);
  range('targetRecurrenceRate', 0.001, 0.5);
  range('theiler', 0, 128, true);
  range('lMin', 2, 128, true);
  range('vMin', 2, 128, true);
  range('blocks', 2, 8, true);
  range('radiusCount', 8, 128, true);
  range('fitLowFraction', 0.0001, 0.5);
  range('fitHighFraction', 0.001, 0.9);
  range('qMin', -2, 7);
  range('qMax', -1, 8);
  range('qCount', 3, 17, true);
  range('scaleCount', 3, 12, true);
  range('coarseDivisor', 1.1, 16);
  range('fineDivisor', 2, 256);
  range('mapParameter', 0.001, s.source === 'tent' ? 2 : 4);
  range('boxes', 2, 16, true);
  range('samplesPerBox', 4, 256, true);
  range('iterations', 10, 2000, true);
  range('tolerance', 1e-13, 1e-3);
  range('dt', 1e-5, 0.1);
  range('duration', 1e-5, 100);
  range('count', 0, 16, true);
  range('renormEvery', 1, 100, true);
  range('forwardTransient', 0, 1000, true);
  range('window', 2, 1000, true);
  range('backwardTransient', 0, 999, true);
  range('seed', 0, 0xffffffff, true);
  range('resolution', kind === 'wada' ? 16 : 4, 32, true);
  range('rangeLow', -Math.PI, Math.PI);
  range('rangeHigh', -Math.PI, Math.PI);
  range('percentile', 0, 0.999);
  range('margin', 0, 1e6);
  range('boxSide', 1, 16, true);
  range('radius', 1, 8, true);
  range('threshold', 0, 1);
  range('convergenceTolerance', 0, 1);
  if ('source' in s && !['tent', 'logistic'].includes(String(s.source)))
    throw new RangeError('기준 맵 source는 tent 또는 logistic이어야 합니다.');
  if ('fitLowFraction' in s && numeric(s, 'fitLowFraction') >= numeric(s, 'fitHighFraction'))
    throw new RangeError('상관합 적합 구간은 아래값보다 위값이 커야 합니다.');
  if ('qMin' in s && numeric(s, 'qMin') >= numeric(s, 'qMax')) throw new RangeError('q 범위는 엄격히 증가해야 합니다.');
  if ('coarseDivisor' in s && numeric(s, 'coarseDivisor') >= numeric(s, 'fineDivisor'))
    throw new RangeError('상자 크기 범위는 서로 달라야 합니다.');
  if ('backwardTransient' in s && numeric(s, 'backwardTransient') >= numeric(s, 'window'))
    throw new RangeError('CLV 역방향 과도 구간은 기록 window보다 작아야 합니다.');
  if ('rangeLow' in s && numeric(s, 'rangeLow') >= numeric(s, 'rangeHigh'))
    throw new RangeError('각도 구간은 엄격히 증가해야 합니다.');
  if ('boxSide' in s && numeric(s, 'boxSide') > numeric(s, 'resolution'))
    throw new RangeError('엔트로피 상자 크기는 격자 해상도 이하여야 합니다.');
}
