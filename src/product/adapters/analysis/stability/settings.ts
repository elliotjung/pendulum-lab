import type { ExperimentStateV1 } from '../../../contracts/experiment';
import { validateArtifactData } from '../core/artifact-validation';
import { STABILITY_KINDS, type StabilityKind, type StabilitySettings } from './contracts';
import { validateStabilityRequest } from './validation';

export const STABILITY_PARAMETERS = ['forcingAmplitude', 'forcingFrequency', 'damping'] as const;
export const STABILITY_SOURCES: Readonly<Record<StabilityKind, readonly string[]>> = Object.freeze({
  'fixed-point': ['current-driven'],
  'periodic-shooting': ['current-driven'],
  floquet: ['current-driven', 'linear-oscillator'],
  melnikov: ['current-driven'],
  continuation: ['current-driven'],
  'pseudo-arclength': ['fold-normal-form'],
  'branch-switch': ['pitchfork-normal-form', 'current-driven'],
  'neimark-sacker': ['delayed-logistic'],
  torus: ['delayed-logistic'],
  'arnold-tongue': ['sine-circle'],
  'codim-two': ['current-driven']
});
export const STABILITY_SETTING_RANGES: Readonly<Record<string, readonly [number, number, boolean?]>> = Object.freeze({
  guess0: [-100, 100],
  guess1: [-100, 100],
  tolerance: [1e-12, 1e-4],
  maxIterations: [1, 40, true],
  stepsPerPeriod: [32, 2048, true],
  period: [1, 8, true],
  points: [2, 128, true],
  start: [-100, 100],
  end: [-100, 100],
  ds: [0.001, 0.2],
  steps: [1, 128, true],
  direction: [-1, 1, true],
  epsilon: [0.001, 0.4],
  criticalTolerance: [0.01, 0.5],
  phaseCount: [9, 257, true],
  intervals: [128, 8192, true],
  linearFrequency: [0.01, 20],
  linearDamping: [0, 10],
  initialAmplitude: [0.001, 0.5],
  collocation: [9, 33, true],
  coupling: [0, 1],
  iterations: [500, 20000, true],
  transient: [0, 5000, true],
  lockingTolerance: [1e-6, 0.01],
  xLow: [0, 1000],
  xHigh: [0, 1000],
  yLow: [0, 1000],
  yHigh: [0, 1000],
  resolution: [4, 16, true],
  lyapunovSteps: [500, 4000, true],
  dt: [0.00001, 0.05],
  neutralBand: [0, 0.1]
});

/** Sources are explicit; changing source replaces the settings instead of retaining ignored controls. */
export function defaultStabilitySettings(
  kind: StabilityKind,
  experiment?: ExperimentStateV1,
  source = STABILITY_SOURCES[kind]?.[0]
): StabilitySettings {
  const scalar = (name: string, fallback: number, initial = false) => {
    const q = (initial ? experiment?.initialConditions : experiment?.parameters)?.[name];
    return q?.kind === 'scalar' && Number.isFinite(q.value) ? q.value : fallback;
  };
  const guess = { guess0: scalar('theta', 0, true), guess1: scalar('omega', 0, true) };
  const shoot = {
    source: source ?? 'current-driven',
    ...guess,
    tolerance: 1e-8,
    maxIterations: 20,
    stepsPerPeriod: 256
  };
  switch (kind) {
    case 'fixed-point':
      return { ...shoot, period: 1 };
    case 'periodic-shooting':
      return { ...shoot, period: 1 };
    case 'floquet':
      return source === 'linear-oscillator'
        ? { source, period: 2 * Math.PI, linearFrequency: 1, linearDamping: 0.2, stepsPerPeriod: 256 }
        : { ...shoot, period: 1 };
    case 'melnikov':
      return { source: 'current-driven', phaseCount: 65, intervals: 2048 };
    case 'continuation':
      return { ...shoot, period: 1, parameter: 'forcingAmplitude', start: 0.2, end: 0.6, points: 9 };
    case 'pseudo-arclength':
      return {
        source: 'fold-normal-form',
        guess0: 1,
        start: 1,
        ds: 0.05,
        steps: 90,
        direction: -1,
        tolerance: 1e-9,
        maxIterations: 20
      };
    case 'branch-switch':
      return source === 'current-driven'
        ? { ...shoot, epsilon: 0.05, criticalTolerance: 0.3 }
        : {
            source: 'pitchfork-normal-form',
            start: 0.02,
            end: 0.3,
            points: 15,
            epsilon: 0.12,
            tolerance: 1e-9,
            maxIterations: 20
          };
    case 'neimark-sacker':
      return {
        source: 'delayed-logistic',
        start: 1.9,
        end: 2.05,
        points: 16,
        tolerance: 1e-9,
        maxIterations: 20
      };
    case 'torus':
      return {
        source: 'delayed-logistic',
        start: 2.03,
        end: 2.01,
        points: 3,
        initialAmplitude: 0.24,
        collocation: 21,
        tolerance: 1e-8,
        maxIterations: 30
      };
    case 'arnold-tongue':
      return {
        source: 'sine-circle',
        start: 0.4,
        end: 0.6,
        points: 41,
        coupling: 1,
        iterations: 4000,
        transient: 1000,
        lockingTolerance: 0.0005
      };
    case 'codim-two':
      return {
        source: 'current-driven',
        xParameter: 'forcingAmplitude',
        yParameter: 'damping',
        xLow: 0.2,
        xHigh: 1.3,
        yLow: 0.1,
        yHigh: 0.6,
        resolution: 6,
        lyapunovSteps: 500,
        dt: 0.01,
        neutralBand: 0.005
      };
  }
}
export function numeric(s: StabilitySettings, key: string): number {
  const v = s[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new RangeError(`${key}: 유한한 숫자가 필요합니다.`);
  return v;
}
export function validateStabilitySettings(kind: StabilityKind, input: unknown): asserts input is StabilitySettings {
  validateArtifactData(input);
  if (!STABILITY_KINDS.includes(kind)) throw new RangeError('지원하지 않는 안정성 도구입니다.');
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('안정성 설정 객체가 필요합니다.');
  const s = input as StabilitySettings;
  if (typeof s.source !== 'string' || !STABILITY_SOURCES[kind].includes(s.source))
    throw new RangeError('선택한 도구에 지원하지 않는 source입니다.');
  const expected = Object.keys(defaultStabilitySettings(kind, undefined, s.source));
  const keys = Object.keys(s);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key)))
    throw new RangeError('누락되었거나 지원하지 않는 안정성 설정입니다.');
  for (const key of keys) {
    if (key === 'source') continue;
    if (['parameter', 'xParameter', 'yParameter'].includes(key)) {
      if (!(STABILITY_PARAMETERS as readonly unknown[]).includes(s[key]))
        throw new RangeError(`${key}: 지원하는 매개변수가 아닙니다.`);
      continue;
    }
    const v = numeric(s, key);
    const r = STABILITY_SETTING_RANGES[key];
    if (!r) throw new RangeError(`지원하지 않는 설정: ${key}`);
    // A linear flow's period is measured in seconds, not map multiplicity.
    const lo = key === 'period' && s.source === 'linear-oscillator' ? 0.001 : r[0];
    const hi = key === 'period' && s.source === 'linear-oscillator' ? 50 : r[1];
    const integer = key === 'period' && s.source === 'linear-oscillator' ? false : r[2];
    if (v < lo || v > hi || (integer && !Number.isSafeInteger(v)))
      throw new RangeError(`${key}: ${lo}–${hi} 범위의 ${integer ? '정수' : '수'}가 필요합니다.`);
  }
  if (kind === 'fixed-point' && s.period !== 1) throw new RangeError('고정점 도구는 period=1 전용입니다.');
  if ('direction' in s && s.direction !== 1 && s.direction !== -1)
    throw new RangeError('direction은 −1 또는 +1이어야 합니다.');
  if ('intervals' in s && numeric(s, 'intervals') % 2)
    throw new RangeError('Simpson 적분 intervals는 짝수여야 합니다.');
  if ('collocation' in s && numeric(s, 'collocation') % 2 === 0) throw new RangeError('collocation은 홀수여야 합니다.');
  if ('start' in s && 'end' in s && numeric(s, 'start') === numeric(s, 'end'))
    throw new RangeError('시작과 끝 매개변수는 서로 달라야 합니다.');
  if (['neimark-sacker', 'torus'].includes(kind)) {
    const lo = Math.min(numeric(s, 'start'), numeric(s, 'end')),
      hi = Math.max(numeric(s, 'start'), numeric(s, 'end'));
    if (lo < 1.5 || hi > 2.1 || (kind === 'torus' && lo <= 2))
      throw new RangeError('delayed-logistic 기준 맵은 1.5≤a≤2.1, 불변 원은 2<a≤2.1 범위입니다.');
  }
  if (
    kind === 'branch-switch' &&
    s.source === 'pitchfork-normal-form' &&
    (numeric(s, 'start') <= 0 || numeric(s, 'end') <= 0 || Math.max(numeric(s, 'start'), numeric(s, 'end')) > 1)
  )
    throw new RangeError('pitchfork 가지 추적은 0<λ≤1 범위입니다.');
  if (
    kind === 'arnold-tongue' &&
    (numeric(s, 'start') < 0 || numeric(s, 'end') > 1 || numeric(s, 'start') > numeric(s, 'end'))
  )
    throw new RangeError('원형 맵 주파수 범위는 0≤시작<끝≤1이어야 합니다.');
  if (kind === 'codim-two') {
    if (s.xParameter === s.yParameter) throw new RangeError('두 축에는 서로 다른 매개변수를 선택하세요.');
    if (numeric(s, 'xLow') >= numeric(s, 'xHigh') || numeric(s, 'yLow') >= numeric(s, 'yHigh'))
      throw new RangeError('격자의 각 범위는 엄격히 증가해야 합니다.');
  }
}
export function stabilityRejection(
  kind: StabilityKind,
  experiment: ExperimentStateV1,
  settings: StabilitySettings
): string | null {
  try {
    validateStabilityRequest({ id: 'compatibility', kind, experiment, settings });
    return null;
  } catch (cause) {
    return cause instanceof Error ? cause.message : '안정성 입력을 사용할 수 없습니다.';
  }
}
