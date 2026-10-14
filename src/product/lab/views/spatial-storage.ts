import {
  fromCanonicalSpatial,
  toCanonicalSpatial,
  spatialIsEmbedded,
  spatialIsChain,
  SPATIAL_SYSTEM_IDS,
  type SpatialConfig,
  type SpatialSample,
  type SpatialSystemId
} from '../../adapters/physics/spatial';
import { parseExperiment, serializeExperiment } from '../../persistence';

export const SPATIAL_STORAGE_PREFIX = 'pendulum-product/spatial/v1/';
export const SPATIAL_IMPORT_MAX_BYTES = 200_000;

/** Native 4N or 6N initial state is retained exactly; camera settings are independent. */
export function serializeSpatialConfig(config: SpatialConfig): string {
  const state = toCanonicalSpatial(config);
  if (!state.ok) throw new Error(state.issues.map((item) => item.message).join(' '));
  const result = serializeExperiment(state.value);
  if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' '));
  return result.value;
}

export function parseSpatialConfig(text: string, systemId: SpatialSystemId): SpatialConfig {
  if (new TextEncoder().encode(text).length > SPATIAL_IMPORT_MAX_BYTES)
    throw new Error('상태 파일은 200 KB 이하여야 합니다.');
  const state = parseExperiment(text);
  if (!state.ok) throw new Error(state.issues.map((item) => item.message).join(' '));
  if (state.value.systemId !== systemId)
    throw new Error('다른 시스템의 설정입니다. 해당 시스템 화면에서 파일을 열어 주세요.');
  const config = fromCanonicalSpatial(state.value);
  if (!config.ok) throw new Error(config.issues.map((item) => item.message).join(' '));
  return config.value;
}

export function saveSpatialConfig(storage: Pick<Storage, 'getItem' | 'setItem'>, config: SpatialConfig): void {
  const key = `${SPATIAL_STORAGE_PREFIX}${config.systemId}`;
  const existing = storage.getItem(key);
  if (existing !== null) parseSpatialConfig(existing, config.systemId);
  storage.setItem(key, serializeSpatialConfig(config));
}

export function loadSpatialConfig(storage: Pick<Storage, 'getItem'>, systemId: SpatialSystemId): SpatialConfig | null {
  const text = storage.getItem(`${SPATIAL_STORAGE_PREFIX}${systemId}`);
  return text === null ? null : parseSpatialConfig(text, systemId);
}

/** Only finite numbers enter data cells; headers are generated from fixed names. */
export function spatialTrajectoryCsv(samples: readonly SpatialSample[], systemId: SpatialSystemId): string {
  const n = samples[0]?.positions.length ?? 0;
  if (!SPATIAL_SYSTEM_IDS.includes(systemId) || !n || n > 16 || (!spatialIsChain(systemId) && n !== 1))
    throw new Error('유효한 공간 진자 상태 표본이 필요합니다.');
  const embedded = spatialIsEmbedded(systemId);
  const stateNames = embedded
    ? [
        ...Array.from({ length: n }, (_, i) => ['ux', 'uy', 'uz'].map((v) => `${v}${i + 1}_1`)).flat(),
        ...Array.from({ length: n }, (_, i) => ['wx', 'wy', 'wz'].map((v) => `${v}${i + 1}_s-1`)).flat()
      ]
    : [
        ...Array.from({ length: n }, (_, i) => [`theta${i + 1}_rad`, `phi${i + 1}_rad`]).flat(),
        ...Array.from({ length: n }, (_, i) => [`thetaDot${i + 1}_rad_s`, `phiDot${i + 1}_rad_s`]).flat()
      ];
  const header = [
    'time_s',
    ...stateNames,
    ...Array.from({ length: n }, (_, i) => ['x', 'y', 'z'].map((v) => `${v}${i + 1}_m`)).flat(),
    ...Array.from({ length: n }, (_, i) => ['vx', 'vy', 'vz'].map((v) => `${v}${i + 1}_m_s`)).flat(),
    'Lx_kg_m2_s',
    'Ly_kg_m2_s',
    'Lz_kg_m2_s',
    ...Array.from({ length: n }, (_, i) => `length_residual${i + 1}_m`),
    ...Array.from({ length: n }, (_, i) => `unit_residual${i + 1}_1`),
    ...Array.from({ length: n }, (_, i) => `tangent_residual${i + 1}_s-1`),
    ...Array.from({ length: n }, (_, i) => `pole_proximity${i + 1}_1`),
    'kinetic_J',
    'potential_J',
    'total_J'
  ];
  const rows = [header.join(',')];
  let previous = -Infinity;
  for (const sample of samples) {
    const arrays = [
      sample.positions,
      sample.velocities,
      sample.constraintErrors,
      sample.unitConstraintErrors,
      sample.tangentConstraintErrors,
      sample.poleProximity
    ];
    const values = [
      sample.time,
      ...sample.state,
      ...sample.positions.flatMap((p) => [p.x, p.y, p.z]),
      ...sample.velocities.flatMap((p) => [p.x, p.y, p.z]),
      sample.angularMomentum.x,
      sample.angularMomentum.y,
      sample.angularMomentum.z,
      ...sample.constraintErrors,
      ...sample.unitConstraintErrors,
      ...sample.tangentConstraintErrors,
      ...sample.poleProximity,
      sample.energy.KE,
      sample.energy.PE,
      sample.energy.total
    ];
    if (
      arrays.some((array) => array.length !== n) ||
      sample.state.length !== (embedded ? 6 : 4) * n ||
      values.length !== header.length ||
      !values.every(Number.isFinite) ||
      sample.time < previous
    )
      throw new Error('동일한 좌표계의 유한한 값과 시간순 표본만 CSV로 내보낼 수 있습니다.');
    rows.push(values.join(','));
    previous = sample.time;
  }
  return `${rows.join('\r\n')}\r\n`;
}
