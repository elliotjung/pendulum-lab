import { stochasticResonanceCurve, type SrResponse } from '../../../physics/stochasticResonance';
import { fields, invalid } from '../../contracts/contract-checks';
import { success, type ContractIssue, type ContractResult } from '../../contracts/validation';
import { inspectSafeData } from '../../persistence/safe-data';

export interface FieldResonanceSettings {
  readonly amplitude: number;
  readonly driveOmega: number;
  readonly dt: number;
  readonly periods: number;
  readonly transientPeriods: number;
  readonly seed: number;
  readonly x0: number;
  readonly sigmaMin: number;
  readonly sigmaMax: number;
  readonly sigmaCount: number;
  readonly realizations: number;
}
export const FIELD_RESONANCE_MAX_WORK = 1_000_000;
export const FIELD_RESONANCE_MAX_RESPONSE_STEPS = 100_000;
export const FIELD_RESONANCE_DEFAULTS: FieldResonanceSettings = Object.freeze({
  amplitude: 0.2,
  driveOmega: 1,
  dt: 0.02,
  periods: 4,
  transientPeriods: 2,
  seed: 28,
  x0: -1,
  sigmaMin: 0,
  sigmaMax: 1.5,
  sigmaCount: 7,
  realizations: 4
});
export const fieldResonanceFields = [
  { key: 'amplitude', label: '구동 진폭 A', min: -0.38, max: 0.38 },
  { key: 'driveOmega', label: '구동 각주파수 Ω', min: 0.01, max: 10 },
  { key: 'dt', label: '적분 간격 Δτ', min: 0.0001, max: 0.05 },
  { key: 'periods', label: '측정 주기 수', min: 1, max: 100, integer: true },
  { key: 'transientPeriods', label: '버릴 과도 주기 수', min: 0, max: 100, integer: true },
  { key: 'seed', label: '기준 seed (uint32)', min: 0, max: 0xffffffff, integer: true },
  { key: 'x0', label: '초기 우물 좌표 x₀', min: -2, max: 2 },
  { key: 'sigmaMin', label: '잡음 σ 최솟값', min: 0, max: 3 },
  { key: 'sigmaMax', label: '잡음 σ 최댓값', min: 0, max: 3 },
  { key: 'sigmaCount', label: '잡음 격자 수', min: 2, max: 32, integer: true },
  { key: 'realizations', label: '잡음당 실현 수', min: 1, max: 16, integer: true }
] as const;
export interface FieldResonanceResult {
  readonly schema: 'pendulum-stochastic-resonance/v1';
  readonly algorithmVersion: 'stochastic-resonance-native-v1';
  readonly scope: 'independent-overdamped-quartic';
  readonly source: 'stochasticResonanceCurve';
  readonly settings: FieldResonanceSettings;
  readonly sigmas: readonly number[];
  readonly rows: readonly SrResponse[];
  readonly warnings: readonly string[];
}
export function fieldResonanceResponseSteps(settings: FieldResonanceSettings): number {
  const period = (2 * Math.PI) / settings.driveOmega;
  return (
    Math.max(0, Math.round((settings.transientPeriods * period) / settings.dt)) +
    Math.max(1, Math.round((settings.periods * period) / settings.dt))
  );
}
export function validateFieldResonanceSettings(input: unknown): ContractResult<FieldResonanceSettings> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  const issues: ContractIssue[] = [];
  if (
    !fields(
      safe.value,
      fieldResonanceFields.map((field) => field.key),
      [],
      '$',
      issues
    )
  )
    return { ok: false, issues };
  const value = safe.value;
  for (const field of fieldResonanceFields) {
    const number = value[field.key];
    if (
      typeof number !== 'number' ||
      !Number.isFinite(number) ||
      number < field.min ||
      number > field.max ||
      ('integer' in field && !Number.isSafeInteger(number))
    )
      invalid(
        issues,
        `$.${field.key}`,
        `${field.label}: ${field.min}–${field.max}${'integer' in field ? ' 정수' : ''} 범위가 필요합니다.`
      );
  }
  if (issues.length) return { ok: false, issues };
  const settings = value as unknown as FieldResonanceSettings;
  if (settings.sigmaMax <= settings.sigmaMin) invalid(issues, '$.sigmaMax', '잡음 최댓값은 최솟값보다 커야 합니다.');
  const steps = fieldResonanceResponseSteps(settings),
    work = steps * settings.sigmaCount * settings.realizations;
  if (
    !Number.isSafeInteger(steps) ||
    steps > FIELD_RESONANCE_MAX_RESPONSE_STEPS ||
    !Number.isSafeInteger(work) ||
    work > FIELD_RESONANCE_MAX_WORK
  )
    invalid(
      issues,
      '$',
      `응답당 ${FIELD_RESONANCE_MAX_RESPONSE_STEPS} 단계·전체 ${FIELD_RESONANCE_MAX_WORK} 적분 단계 상한을 넘었습니다. 주기·격자·실현 수를 줄이거나 Δτ를 늘리세요.`
    );
  return issues.length ? { ok: false, issues } : success(settings);
}
export const fieldResonanceSigmas = (settings: FieldResonanceSettings): number[] =>
  Array.from({ length: settings.sigmaCount }, (_, index) =>
    index === settings.sigmaCount - 1
      ? settings.sigmaMax
      : settings.sigmaMin + ((settings.sigmaMax - settings.sigmaMin) * index) / (settings.sigmaCount - 1)
  );

/** One native response is indivisible; the worker yields/cancels between responses. */
export function nativeFieldResonanceResponse(
  settings: FieldResonanceSettings,
  sigma: number,
  realization: number
): SrResponse {
  const checked = validateFieldResonanceSettings(settings);
  if (!checked.ok) throw new Error(checked.issues.map((entry) => entry.message).join(' '));
  settings = checked.value;
  if (
    !Number.isSafeInteger(realization) ||
    realization < 0 ||
    realization >= settings.realizations ||
    !fieldResonanceSigmas(settings).includes(sigma)
  )
    throw new Error('선언한 잡음 격자·실현 범위 안의 native 응답만 계산합니다.');
  const result = stochasticResonanceCurve(
    {
      amplitude: settings.amplitude,
      driveOmega: settings.driveOmega,
      dt: settings.dt,
      periods: settings.periods,
      transientPeriods: settings.transientPeriods,
      seed: (settings.seed + realization) >>> 0,
      x0: settings.x0
    },
    [sigma],
    1
  )[0]!;
  if (!Object.values(result).every(Number.isFinite))
    throw new Error('native 확률 공명 결과가 유한하지 않습니다. 설정을 줄이세요.');
  return result;
}
export function createFieldResonanceResult(
  settings: FieldResonanceSettings,
  rows: readonly SrResponse[]
): FieldResonanceResult {
  return {
    schema: 'pendulum-stochastic-resonance/v1',
    algorithmVersion: 'stochastic-resonance-native-v1',
    scope: 'independent-overdamped-quartic',
    source: 'stochasticResonanceCurve',
    settings: structuredClone(settings),
    sigmas: fieldResonanceSigmas(settings),
    rows: structuredClone(rows),
    warnings: [
      '위의 관성 진자 앙상블과 독립적인 과감쇠 사차 이중 우물 dx=(x−x³+A cos Ωτ)dτ+σdW의 native Itô Euler–Maruyama 진단입니다. 모든 수치는 정규화 값입니다.',
      '유한 잡음 격자·실현·관찰 구간의 응답입니다. 내부 최대가 나타나도 보편적인 최적 잡음이나 통계적 유의성을 인증하지 않습니다. 격자·seed·dt·관찰 기간을 바꿔 확인하세요.',
      '잡음별 실현 r은 native 기준대로 (seed+r) mod 2³²를 사용하며 같은 실현 seed를 서로 다른 σ에서 재사용합니다. 각 응답 안의 Gaussian stream을 중간 재시작하지 않습니다.'
    ]
  };
}
export function serializeFieldResonanceArtifact(result: FieldResonanceResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
