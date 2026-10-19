import {
  fromCanonicalNonlinear,
  toCanonicalNonlinear,
  NONLINEAR_SYSTEM_IDS,
  nonlinearStateFields,
  type NonlinearConfig,
  type NonlinearSample,
  type NonlinearSystemId
} from '../../adapters/physics/nonlinear';
import { parseExperiment, serializeExperiment } from '../../persistence';

export const NONLINEAR_STORAGE_PREFIX = 'pendulum-product/nonlinear/v1/';
export const NONLINEAR_IMPORT_MAX_BYTES = 256 * 1024;

export function serializeNonlinearConfig(config: NonlinearConfig): string {
  const state = toCanonicalNonlinear(config);
  if (!state.ok) throw new Error(state.issues.map((item) => item.message).join(' '));
  const result = serializeExperiment(state.value);
  if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' '));
  return result.value;
}

export function parseNonlinearConfig(text: string, systemId: NonlinearSystemId): NonlinearConfig {
  if (new TextEncoder().encode(text).length > NONLINEAR_IMPORT_MAX_BYTES)
    throw new Error('상태 파일은 256 KiB 이하여야 합니다.');
  const state = parseExperiment(text);
  if (!state.ok) throw new Error(state.issues.map((item) => item.message).join(' '));
  if (state.value.systemId !== systemId)
    throw new Error('다른 시스템의 설정입니다. 해당 시스템 화면에서 파일을 열어 주세요.');
  const config = fromCanonicalNonlinear(state.value);
  if (!config.ok) throw new Error(config.issues.map((item) => item.message).join(' '));
  return config.value;
}

export function saveNonlinearConfig(storage: Pick<Storage, 'getItem' | 'setItem'>, config: NonlinearConfig): void {
  const key = `${NONLINEAR_STORAGE_PREFIX}${config.systemId}`;
  const existing = storage.getItem(key);
  if (existing !== null) parseNonlinearConfig(existing, config.systemId);
  storage.setItem(key, serializeNonlinearConfig(config));
}

export function loadNonlinearConfig(
  storage: Pick<Storage, 'getItem'>,
  systemId: NonlinearSystemId
): NonlinearConfig | null {
  const text = storage.getItem(`${NONLINEAR_STORAGE_PREFIX}${systemId}`);
  return text === null ? null : parseNonlinearConfig(text, systemId);
}

export const nonlinearIsNormalized = (id: NonlinearSystemId): boolean =>
  ['system:duffing', 'system:van-der-pol', 'system:mathieu'].includes(id);
export const nonlinearTimeLabel = (id: NonlinearSystemId): string =>
  nonlinearIsNormalized(id) ? '정규화 시간 τ' : 't (s)';

/** Only fixed headers and finite numeric cells are admitted to spreadsheet exports. */
export function nonlinearTrajectoryCsv(samples: readonly NonlinearSample[], systemId: NonlinearSystemId): string {
  if (!(NONLINEAR_SYSTEM_IDS as readonly string[]).includes(systemId) || !samples.length)
    throw new Error('유효한 비선형 상태 표본이 필요합니다.');
  const fields = nonlinearStateFields(systemId),
    normalized = nonlinearIsNormalized(systemId);
  const token = (unit: string) => unit.replace(/[^a-zA-Z0-9]+/g, '_');
  const forcingHeaders: Record<NonlinearSystemId, string> = {
    'system:duffing': 'drive_acceleration_normalized',
    'system:van-der-pol': 'nonlinear_damping_acceleration_normalized',
    'system:kapitza': 'pivot_displacement_m',
    'system:mathieu': 'restoring_modulation_normalized',
    'system:friction': 'drive_force_N',
    'system:pyragas': 'drive_angular_acceleration_rad_s2'
  };
  const header = [
    normalized ? 'time_normalized' : 'time_s',
    ...fields.map(
      (field) => `${field.key}_${normalized && field.canonicalUnit === '1' ? 'normalized' : token(field.canonicalUnit)}`
    ),
    `diagnostic_energy_${normalized ? 'normalized' : systemId === 'system:friction' ? 'J' : 'm2_s2'}`,
    forcingHeaders[systemId],
    'pyragas_feedback_rad_s2',
    'friction_force_N',
    'mode_stick_0_slip_1_smooth_2',
    'momentum_residual_N',
    'cone_residual_N',
    ...(systemId === 'system:mathieu' ? ['spectral_radius', 'determinant_drift', 'stable_1_unstable_0'] : [])
  ];
  const rows = [header.join(',')];
  let previous = -Infinity;
  for (const sample of samples) {
    const values = [
      sample.time,
      ...sample.state,
      sample.energy,
      sample.forcing,
      sample.feedback,
      sample.frictionForce,
      { stick: 0, slip: 1, smooth: 2 }[sample.mode],
      sample.momentumResidual,
      sample.coneResidual,
      ...(systemId === 'system:mathieu'
        ? [
            sample.stability?.spectralRadius,
            sample.stability?.determinantDrift,
            sample.stability ? Number(sample.stability.stable) : undefined
          ]
        : [])
    ];
    if (
      sample.state.length !== fields.length ||
      values.length !== header.length ||
      !values.every((value) => typeof value === 'number' && Number.isFinite(value)) ||
      sample.time < previous
    )
      throw new Error('동일한 모델의 유한한 값과 시간순 표본만 CSV로 내보낼 수 있습니다.');
    rows.push(values.join(','));
    previous = sample.time;
  }
  return `${rows.join('\r\n')}\r\n`;
}
