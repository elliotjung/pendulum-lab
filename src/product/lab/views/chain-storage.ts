import {
  fromCanonicalChain,
  toCanonicalChain,
  type ChainConfig,
  type ChainSample,
  type ChainSystemId
} from '../../adapters/physics/chain';
import { parseExperiment, serializeExperiment } from '../../persistence';

export const CHAIN_STORAGE_PREFIX = 'pendulum-product/chain/v1/';
export const CHAIN_IMPORT_MAX_BYTES = 200_000;

export function serializeChainConfig(config: ChainConfig): string {
  const state = toCanonicalChain(config);
  if (!state.ok) throw new Error(state.issues.map((item) => item.message).join(' '));
  const serialized = serializeExperiment(state.value);
  if (!serialized.ok) throw new Error(serialized.issues.map((item) => item.message).join(' '));
  return serialized.value;
}

export function parseChainConfig(text: string, systemId: ChainSystemId): ChainConfig {
  if (new TextEncoder().encode(text).length > CHAIN_IMPORT_MAX_BYTES)
    throw new Error('상태 파일은 200 KB 이하여야 합니다.');
  const state = parseExperiment(text);
  if (!state.ok) throw new Error(state.issues.map((item) => item.message).join(' '));
  if (state.value.systemId !== systemId)
    throw new Error('다른 시스템의 설정입니다. 해당 시스템 화면에서 파일을 열어 주세요.');
  const config = fromCanonicalChain(state.value);
  if (!config.ok) throw new Error(config.issues.map((item) => item.message).join(' '));
  return config.value;
}

export function saveChainConfig(storage: Pick<Storage, 'getItem' | 'setItem'>, config: ChainConfig): void {
  // A future/corrupt record is never overwritten by an unrelated default session.
  const key = `${CHAIN_STORAGE_PREFIX}${config.systemId}`;
  const existing = storage.getItem(key);
  if (existing !== null) parseChainConfig(existing, config.systemId);
  storage.setItem(key, serializeChainConfig(config));
}

export function loadChainConfig(storage: Pick<Storage, 'getItem'>, systemId: ChainSystemId): ChainConfig | null {
  const text = storage.getItem(`${CHAIN_STORAGE_PREFIX}${systemId}`);
  return text === null ? null : parseChainConfig(text, systemId);
}

/** Numeric-only cells; headers explicitly preserve the theta-half/omega-half layout. */
export function chainTrajectoryCsv(samples: readonly ChainSample[]): string {
  const dimension = samples[0]?.state.length;
  if (!dimension || dimension % 2 !== 0 || dimension > 256) throw new Error('사슬의 유효한 상태 표본이 필요합니다.');
  const n = dimension / 2;
  const rows = [
    [
      'time_s',
      ...Array.from({ length: n }, (_, i) => `theta${i + 1}_rad`),
      ...Array.from({ length: n }, (_, i) => `omega${i + 1}_rad_s`),
      'kinetic_J',
      'potential_J',
      'total_J'
    ].join(',')
  ];
  for (const sample of samples) {
    const values = [sample.time, ...sample.state, sample.energy.KE, sample.energy.PE, sample.energy.total];
    if (sample.state.length !== dimension || !values.every(Number.isFinite))
      throw new Error('같은 링크 수의 유한한 상태 데이터만 CSV로 내보낼 수 있습니다.');
    rows.push(values.join(','));
  }
  return `${rows.join('\r\n')}\r\n`;
}
