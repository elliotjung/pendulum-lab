import {
  fromCanonicalConstraint,
  toCanonicalConstraint,
  type ConstraintConfig,
  type ConstraintEvent,
  type ConstraintSample,
  type ConstraintSystemId
} from '../../adapters/physics/constraint';
import { parseExperiment, serializeExperiment } from '../../persistence';

export const CONSTRAINT_STORAGE_PREFIX = 'pendulum-product/constraint/v1/';
export const CONSTRAINT_IMPORT_MAX_BYTES = 200_000;

/** Saves restart settings; a slack Cartesian sample is never misrepresented as angular initial conditions. */
export function serializeConstraintConfig(config: ConstraintConfig): string {
  const state = toCanonicalConstraint(config);
  if (!state.ok) throw new Error(state.issues.map((item) => item.message).join(' '));
  const serialized = serializeExperiment(state.value);
  if (!serialized.ok) throw new Error(serialized.issues.map((item) => item.message).join(' '));
  return serialized.value;
}

export function parseConstraintConfig(text: string, systemId: ConstraintSystemId): ConstraintConfig {
  if (new TextEncoder().encode(text).length > CONSTRAINT_IMPORT_MAX_BYTES)
    throw new Error('상태 파일은 200 KB 이하여야 합니다.');
  const state = parseExperiment(text);
  if (!state.ok) throw new Error(state.issues.map((item) => item.message).join(' '));
  if (state.value.systemId !== systemId)
    throw new Error('다른 시스템의 설정입니다. 해당 시스템 화면에서 파일을 열어 주세요.');
  const config = fromCanonicalConstraint(state.value);
  if (!config.ok) throw new Error(config.issues.map((item) => item.message).join(' '));
  return config.value;
}

export function saveConstraintConfig(storage: Pick<Storage, 'getItem' | 'setItem'>, config: ConstraintConfig): void {
  const key = `${CONSTRAINT_STORAGE_PREFIX}${config.systemId}`;
  const existing = storage.getItem(key);
  if (existing !== null) parseConstraintConfig(existing, config.systemId);
  storage.setItem(key, serializeConstraintConfig(config));
}

export function loadConstraintConfig(
  storage: Pick<Storage, 'getItem'>,
  systemId: ConstraintSystemId
): ConstraintConfig | null {
  const text = storage.getItem(`${CONSTRAINT_STORAGE_PREFIX}${systemId}`);
  return text === null ? null : parseConstraintConfig(text, systemId);
}

const csvState = {
  'system:spring': ['radius_m', 'theta_rad', 'radial_velocity_m_s', 'angular_velocity_rad_s'],
  'system:rope': ['x_m', 'y_m', 'vx_m_s', 'vy_m_s'],
  'system:double-string': ['x1_m', 'y1_m', 'x2_m', 'y2_m', 'vx1_m_s', 'vy1_m_s', 'vx2_m_s', 'vy2_m_s']
} as const;
const phases: Record<ConstraintSystemId, readonly string[]> = {
  'system:spring': ['elastic'],
  'system:rope': ['taut', 'slack'],
  'system:double-string': ['taut', 'outer-slack', 'full-slack']
};

/** All free text is excluded: exported cells are finite numbers or validated fixed enums. */
export function constraintTrajectoryCsv(samples: readonly ConstraintSample[], systemId: ConstraintSystemId): string {
  const columns = csvState[systemId];
  if (!columns || !samples.length) throw new Error('유효한 진자 상태 표본이 필요합니다.');
  const n = systemId === 'system:double-string' ? 2 : 1;
  const rows = [
    [
      'time_s',
      'phase',
      ...columns,
      ...Array.from({ length: n }, (_, i) => `length${i + 1}_m`),
      ...Array.from({ length: n }, (_, i) => `tension${i + 1}_N`),
      ...Array.from({ length: n }, (_, i) => `constraint_violation${i + 1}_m`),
      ...Array.from({ length: n }, (_, i) => `length_gap${i + 1}_m`),
      'kinetic_J',
      'potential_J',
      'total_J',
      'capture_loss_J'
    ].join(',')
  ];
  for (const sample of samples) {
    const values = [
      sample.time,
      ...sample.state,
      ...sample.lengths,
      ...sample.tensions,
      ...sample.constraintErrors,
      ...sample.gaps,
      sample.energy.KE,
      sample.energy.PE,
      sample.energy.total,
      sample.captureLoss
    ];
    if (
      sample.state.length !== columns.length ||
      !phases[systemId].includes(sample.phase) ||
      [sample.lengths, sample.tensions, sample.constraintErrors, sample.gaps].some((entries) => entries.length !== n) ||
      !values.every(Number.isFinite)
    )
      throw new Error('같은 시스템의 유한한 상태 데이터만 CSV로 내보낼 수 있습니다.');
    rows.push([sample.time, sample.phase, ...values.slice(1)].join(','));
  }
  return `${rows.join('\r\n')}\r\n`;
}

/** Timeline remains complete even when trajectory sampling is reduced. */
export function constraintEventsCsv(events: readonly ConstraintEvent[]): string {
  const rows = ['sequence,time_s,type,link,source,energy_loss_J,residual,residual_unit'];
  let sequence = -1;
  let time = -Infinity;
  for (const event of events) {
    if (
      !Number.isSafeInteger(event.sequence) ||
      event.sequence !== sequence + 1 ||
      ![event.time, event.energyLoss, event.residual].every(Number.isFinite) ||
      event.time < time ||
      event.energyLoss < 0 ||
      event.residual < 0 ||
      !['slack', 'capture'].includes(event.type) ||
      !['inner', 'outer', 'both'].includes(event.link) ||
      !['initial-condition', 'integration'].includes(event.source) ||
      event.residualUnit !== (event.type === 'slack' ? 'N' : 'm')
    )
      throw new Error('사건 순서·단위와 유한한 값을 확인하세요.');
    rows.push(
      [
        event.sequence,
        event.time,
        event.type,
        event.link,
        event.source,
        event.energyLoss,
        event.residual,
        event.residualUnit
      ].join(',')
    );
    sequence = event.sequence;
    time = event.time;
  }
  return `${rows.join('\r\n')}\r\n`;
}
