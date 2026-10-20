import type { ExperimentStateV1 } from '../../../contracts/experiment';
import { CORE_DIAGNOSTIC_KINDS, type CoreDiagnosticKind, type CoreDiagnosticSettings } from './contracts';
export { coreDiagnosticRejection } from './validation';

export function defaultCoreSettings(kind: CoreDiagnosticKind, experiment?: ExperimentStateV1): CoreDiagnosticSettings {
  const duration = experiment?.runtime.domain === 'time' ? Math.min(10, experiment.runtime.duration.value) : 10;
  switch (kind) {
    case 'state-time':
      return { coordinate: 0 };
    case 'energy':
      return {};
    case 'phase':
      return { coordinate: 0, phaseCoordinate: 1 };
    case 'fft':
      return { coordinate: 0, transient: 0, window: 'hann' };
    case 'naff':
      return { coordinate: 0, transient: 0, terms: 3, refineIterations: 80 };
    case 'poincare':
      return { duration, coordinate: 0, sectionValue: 0, direction: 'both', transientCrossings: 0, maxPoints: 512 };
    case 'lyapunov':
      return {
        duration,
        transient: 0,
        renormEvery:
          experiment?.runtime.domain === 'time'
            ? Math.min(10, Math.ceil(duration / experiment.runtime.step.value))
            : 10,
        seed: 40503,
        count: 0
      };
    case 'sali':
    case 'fli':
      return { duration, transient: 0, seed: 40503, sampleEvery: 10 };
    case 'zero-one':
      return { coordinate: 0, transient: 0, stride: 1, cSamples: 32, ncutFraction: 0.1, seed: 257 };
    case 'shadowing':
      return { duration, threshold: 0.001, referenceRatio: 8, sampleEvery: 10 };
  }
}
export function numeric(settings: CoreDiagnosticSettings, key: string): number {
  const value = settings[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(`${key}: 유한한 숫자가 필요합니다.`);
  return value;
}
export function validateCoreSettings(
  kind: CoreDiagnosticKind,
  input: unknown
): asserts input is CoreDiagnosticSettings {
  if (!CORE_DIAGNOSTIC_KINDS.includes(kind)) throw new RangeError('지원하지 않는 핵심 진단입니다.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('분석 설정 객체가 필요합니다.');
  const expected = Object.keys(defaultCoreSettings(kind));
  const keys = Object.keys(input);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key)))
    throw new RangeError('누락되었거나 지원하지 않는 분석 설정입니다. 원본을 보존하세요.');
  const settings = input as CoreDiagnosticSettings;
  const range = (key: string, min: number, max: number, integer = false) => {
    if (!(key in settings)) return;
    const value = numeric(settings, key);
    if (value < min || value > max || (integer && !Number.isSafeInteger(value)))
      throw new RangeError(`${key}: ${min}–${max} 범위의 ${integer ? '정수' : '수'}가 필요합니다.`);
  };
  range('coordinate', 0, 255, true);
  range('phaseCoordinate', 0, 255, true);
  range('duration', 1e-6, 300);
  range('transient', 0, 300);
  range('terms', 1, 16, true);
  range('refineIterations', 8, 128, true);
  range('renormEvery', 1, 10000, true);
  range('seed', 0, 0xffffffff, true);
  range('count', 0, 32, true);
  range('sampleEvery', 1, 10000, true);
  range('transientCrossings', 0, 4096, true);
  range('maxPoints', 1, 4096, true);
  range('sectionValue', -1e6, 1e6);
  range('stride', 1, 1000, true);
  range('cSamples', 1, 100, true);
  range('ncutFraction', 0.01, 0.5);
  range('threshold', 1e-12, 1e6);
  range('referenceRatio', 2, 32, true);
  if ('direction' in settings && !['rising', 'falling', 'both'].includes(String(settings.direction)))
    throw new RangeError('단면 방향은 rising, falling 또는 both여야 합니다.');
  if ('window' in settings && !['hann', 'none'].includes(String(settings.window)))
    throw new RangeError('창 함수는 hann 또는 none이어야 합니다.');
}
