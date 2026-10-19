import {
  fromCanonicalNetwork,
  toCanonicalNetwork,
  validateNetworkConfig,
  NETWORK_SYSTEM_IDS,
  type NetworkConfig,
  type NetworkSample,
  type NetworkSystemId
} from '../../adapters/physics/network';
import { parseExperiment, serializeExperiment } from '../../persistence';
import { parseContractJson } from '../../persistence/json';

export const NETWORK_STORAGE_PREFIX = 'pendulum-product/network/v1/';
export const NETWORK_IMPORT_MAX_BYTES = 256 * 1024;
export const networkIsNormalized = (id: NetworkSystemId) => id === 'system:magnetic';
export const networkTimeLabel = (id: NetworkSystemId) => (networkIsNormalized(id) ? '정규화 시간 τ' : 't (s)');

export function serializeNetworkConfig(config: NetworkConfig): string {
  const state = toCanonicalNetwork(config);
  if (!state.ok) throw new Error(state.issues.map((entry) => entry.message).join(' '));
  const serialized = serializeExperiment(state.value);
  if (!serialized.ok) throw new Error(serialized.issues.map((entry) => entry.message).join(' '));
  return serialized.value;
}
export function parseNetworkConfig(text: string, systemId: NetworkSystemId): NetworkConfig {
  checkSize(text);
  const state = parseExperiment(text);
  if (!state.ok) throw new Error(state.issues.map((entry) => entry.message).join(' '));
  if (state.value.systemId !== systemId) throw new Error('다른 시스템의 설정입니다. 해당 시스템 화면에서 열어 주세요.');
  const checked = fromCanonicalNetwork(state.value);
  if (!checked.ok) throw new Error(checked.issues.map((entry) => entry.message).join(' '));
  return checked.value;
}
function checkSize(text: string) {
  if (new TextEncoder().encode(text).length > NETWORK_IMPORT_MAX_BYTES)
    throw new Error('파일은 256 KiB 이하여야 합니다.');
}
export function saveNetworkConfig(storage: Pick<Storage, 'getItem' | 'setItem'>, config: NetworkConfig): void {
  const key = `${NETWORK_STORAGE_PREFIX}${config.systemId}`;
  const existing = storage.getItem(key);
  if (existing !== null) parseNetworkConfig(existing, config.systemId);
  storage.setItem(key, serializeNetworkConfig(config));
}
export function loadNetworkConfig(storage: Pick<Storage, 'getItem'>, systemId: NetworkSystemId): NetworkConfig | null {
  const text = storage.getItem(`${NETWORK_STORAGE_PREFIX}${systemId}`);
  return text === null ? null : parseNetworkConfig(text, systemId);
}

/** The explicit version and system prevent silently interpreting one family's graph as another. */
export function serializeNetworkTopology(config: NetworkConfig): string {
  const checked = validateNetworkConfig(config);
  if (!checked.ok) throw new Error(checked.issues.map((entry) => entry.message).join(' '));
  return JSON.stringify(
    {
      schema: 'pendulum-network-graph-file/v1',
      systemId: config.systemId,
      graph: checked.value.graph,
      initialState: checked.value.initialState
    },
    null,
    2
  );
}
export function parseNetworkTopology(text: string, current: NetworkConfig): NetworkConfig {
  checkSize(text);
  const safe = parseContractJson(text);
  if (!safe.ok || !safe.value || typeof safe.value !== 'object' || Array.isArray(safe.value))
    throw new Error('안전한 노드·간선 JSON 객체가 필요합니다.');
  const data = safe.value as Record<string, unknown>;
  if (
    Object.keys(data).sort().join(',') !== 'graph,initialState,schema,systemId' ||
    data.schema !== 'pendulum-network-graph-file/v1' ||
    data.systemId !== current.systemId
  )
    throw new Error('지원하는 같은 시스템의 graph-file/v1 파일이 필요합니다. 알 수 없는 필드를 제거하지 않았습니다.');
  const checked = validateNetworkConfig({ ...current, graph: data.graph, initialState: data.initialState });
  if (!checked.ok) throw new Error(checked.issues.map((entry) => `${entry.path}: ${entry.message}`).join(' '));
  return checked.value;
}

/** Long-form rows keep stable node IDs separate from numeric values; IDs are strictly validated. */
export function networkTrajectoryCsv(samples: readonly NetworkSample[], systemId: NetworkSystemId): string {
  if (!(NETWORK_SYSTEM_IDS as readonly string[]).includes(systemId))
    throw new Error('지원하는 네트워크 모델이 필요합니다.');
  if (!samples.length) throw new Error('기록한 표본이 필요합니다.');
  const magnetic = networkIsNormalized(systemId),
    pendulum = systemId === 'system:pendulum-network';
  const header = magnetic
    ? [
        'time_normalized',
        'node_id',
        'node_index',
        'x_normalized',
        'y_normalized',
        'vx_normalized',
        'vy_normalized',
        'energy_normalized'
      ]
    : [
        'time_s',
        'node_id',
        'node_index',
        'phase_rad',
        ...(pendulum ? ['omega_rad_s'] : []),
        'order_1',
        'local_coherence_1',
        'mean_local_coherence_1',
        ...(pendulum ? ['energy_J'] : [])
      ];
  const rows = [header.join(',')];
  let previous = -Infinity;
  const ids = samples[0]!.nodeIds;
  if (ids.some((id) => !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(id))) throw new Error('안전한 노드 ID가 필요합니다.');
  for (const sample of samples) {
    if (sample.time < previous || sample.nodeIds.join('|') !== ids.join('|') || !ids.length)
      throw new Error('동일한 노드 순서의 시간순 표본이 필요합니다.');
    const count = magnetic ? 1 : ids.length;
    if (
      sample.state.length !== (magnetic ? 4 : count * (pendulum ? 2 : 1)) ||
      (!magnetic && sample.localCoherence.length !== ids.length)
    )
      throw new Error('상태와 노드 차원이 일치하지 않습니다.');
    for (let i = 0; i < count; i++) {
      const values = magnetic
        ? [sample.time, i, ...sample.state, sample.energy]
        : [
            sample.time,
            i,
            sample.state[i],
            ...(pendulum ? [sample.state[i + count]] : []),
            sample.order,
            sample.localCoherence[i],
            sample.meanLocalOrder,
            ...(pendulum ? [sample.energy] : [])
          ];
      if (
        values.length !== header.length - 1 ||
        !values.every((value) => typeof value === 'number' && Number.isFinite(value))
      )
        throw new Error('유한한 수치만 CSV로 내보낼 수 있습니다.');
      rows.push([values[0], magnetic ? 'bob' : ids[i], ...values.slice(1)].join(','));
    }
    previous = sample.time;
  }
  return `${rows.join('\r\n')}\r\n`;
}
