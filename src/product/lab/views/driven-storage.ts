import {
  fromCanonicalDriven,
  toCanonicalDriven,
  DRIVEN_SYSTEM_IDS,
  type DrivenConfig,
  type DrivenSample,
  type DrivenSystemId
} from '../../adapters/physics/driven';
import { parseExperiment, serializeExperiment } from '../../persistence';

export const DRIVEN_STORAGE_PREFIX = 'pendulum-product/driven/v1/';
export const DRIVEN_IMPORT_MAX_BYTES = 200_000;

export function serializeDrivenConfig(config: DrivenConfig): string {
  const state = toCanonicalDriven(config);
  if (!state.ok) throw new Error(state.issues.map((item) => item.message).join(' '));
  const result = serializeExperiment(state.value);
  if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' '));
  return result.value;
}

export function parseDrivenConfig(text: string, systemId: DrivenSystemId): DrivenConfig {
  if (new TextEncoder().encode(text).length > DRIVEN_IMPORT_MAX_BYTES)
    throw new Error('상태 파일은 200 KB 이하여야 합니다.');
  const state = parseExperiment(text);
  if (!state.ok) throw new Error(state.issues.map((item) => item.message).join(' '));
  if (state.value.systemId !== systemId)
    throw new Error('다른 시스템의 설정입니다. 해당 시스템 화면에서 파일을 열어 주세요.');
  const config = fromCanonicalDriven(state.value);
  if (!config.ok) throw new Error(config.issues.map((item) => item.message).join(' '));
  return config.value;
}

export function saveDrivenConfig(storage: Pick<Storage, 'getItem' | 'setItem'>, config: DrivenConfig): void {
  const key = `${DRIVEN_STORAGE_PREFIX}${config.systemId}`;
  const existing = storage.getItem(key);
  if (existing !== null) parseDrivenConfig(existing, config.systemId);
  storage.setItem(key, serializeDrivenConfig(config));
}

export function loadDrivenConfig(storage: Pick<Storage, 'getItem'>, systemId: DrivenSystemId): DrivenConfig | null {
  const text = storage.getItem(`${DRIVEN_STORAGE_PREFIX}${systemId}`);
  return text === null ? null : parseDrivenConfig(text, systemId);
}

export function drivenStateFields(systemId: DrivenSystemId): readonly (readonly [string, string, string])[] {
  if (systemId === 'system:cartpole')
    return [
      ['x', '수레 위치', 'm'],
      ['theta', '수직 위 기준 각도', 'rad'],
      ['v', '수레 속도', 'm/s'],
      ['omega', '각속도', 'rad/s']
    ];
  if (systemId === 'system:coupled')
    return [
      ['theta1', '진자 1 각도', 'rad'],
      ['theta2', '진자 2 각도', 'rad'],
      ['omega1', '진자 1 각속도', 'rad/s'],
      ['omega2', '진자 2 각속도', 'rad/s']
    ];
  return [
    ['theta', systemId === 'system:inverted' ? '수직 위 기준 각도' : '수직 아래 기준 각도', 'rad'],
    ['omega', '각속도', 'rad/s'],
    ...(systemId === 'system:driven' || systemId === 'system:parametric' ? [['psi', '진행 위상', 'rad'] as const] : [])
  ];
}

export function drivenInputUnit(systemId: DrivenSystemId): string {
  return systemId === 'system:cartpole' ? 'N' : systemId === 'system:parametric' ? '1' : 'rad/s²';
}

/** Fixed headers and finite numeric cells prevent spreadsheet formula injection. */
export function drivenTrajectoryCsv(samples: readonly DrivenSample[], systemId: DrivenSystemId): string {
  if (!DRIVEN_SYSTEM_IDS.includes(systemId) || !samples.length)
    throw new Error('유효한 구동·제어 상태 표본이 필요합니다.');
  const fields = drivenStateFields(systemId),
    n = systemId === 'system:coupled' || systemId === 'system:cartpole' ? 2 : 1;
  const inputUnit = systemId === 'system:cartpole' ? 'N' : systemId === 'system:parametric' ? '1' : 'rad_s2';
  const referenceUnit = systemId === 'system:cartpole' ? 'm' : 'rad';
  const header = [
    'time_s',
    ...fields.map(([key, , unit]) => `${key}_${unit.replace('/', '_')}`),
    ...Array.from({ length: n }, (_, i) => [`x${i + 1}_m`, `y${i + 1}_m`]).flat(),
    `forcing_${inputUnit}`,
    `control_${systemId === 'system:cartpole' ? 'N' : 'rad_s2'}`,
    `reference_${referenceUnit}`,
    `error_${referenceUnit}`,
    'diagnostic_energy_J'
  ];
  const rows = [header.join(',')];
  let previous = -Infinity;
  for (const sample of samples) {
    const values = [
      sample.time,
      ...sample.state,
      ...sample.positions.flatMap((p) => [p.x, p.y]),
      sample.forcing,
      sample.control,
      sample.reference,
      sample.error,
      sample.energy
    ];
    if (
      sample.state.length !== fields.length ||
      sample.positions.length !== n ||
      values.length !== header.length ||
      !values.every(Number.isFinite) ||
      sample.time < previous
    )
      throw new Error('동일한 시스템의 유한한 값과 시간순 표본만 CSV로 내보낼 수 있습니다.');
    rows.push(values.join(','));
    previous = sample.time;
  }
  return `${rows.join('\r\n')}\r\n`;
}
