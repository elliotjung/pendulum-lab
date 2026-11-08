import type { ExperimentStateV1 } from '../contracts/experiment';
import { migrateLegacyLink, type LegacyLinkCompatibilityV1 } from './legacy-link';
import type { LegacyLinkOptions } from './legacy-link-contracts';
import { parseContractJson } from './json';
import { canonicalJson, inspectSafeData, type JsonValue } from './safe-data';

export const LEGACY_LINK_SESSION_PREFIX = 'pendulum-product/legacy-link/v1/';
export interface LegacyLinkSession {
  canonical: ExperimentStateV1;
  sourceText: string;
  options: LegacyLinkOptions;
}
/** Re-run the strict translator on every read; stored booleans or repaired
 * envelopes can never assert that a compatibility requirement was fulfilled. */
export function validateLegacyLinkSession(input: unknown): {
  session: LegacyLinkSession;
  compatibility: LegacyLinkCompatibilityV1;
} {
  const safe = inspectSafeData(input);
  if (!safe.ok) throw new Error('링크 전달에는 안전한 JSON 데이터만 사용할 수 있습니다.');
  input = safe.value;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('링크 전달 객체가 필요합니다.');
  const record = input as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'canonical,options,sourceText')
    throw new Error('알 수 없는 링크 전달 필드입니다.');
  const result = migrateLegacyLink(record.sourceText as string, record.options as LegacyLinkOptions);
  if (!result.ok || !result.value.canonical)
    throw new Error('보관한 링크를 엄격하게 다시 변환하지 못했습니다. 원본을 보존하세요.');
  if (canonicalJson(record.canonical as JsonValue) !== canonicalJson(result.value.canonical as unknown as JsonValue))
    throw new Error('물리 설정과 링크 전달 원본이 일치하지 않습니다.');
  return {
    session: {
      canonical: structuredClone(result.value.canonical),
      sourceText: record.sourceText as string,
      options: structuredClone(record.options as LegacyLinkOptions)
    },
    compatibility: result.value.compatibility
  };
}
export function saveLegacyLinkSession(storage: Pick<Storage, 'getItem' | 'setItem'>, input: LegacyLinkSession) {
  const checked = validateLegacyLinkSession(input);
  const key = LEGACY_LINK_SESSION_PREFIX + checked.session.options.sourceId;
  const text = JSON.stringify({ schema: 'pendulum-legacy-link-session/v1', ...checked.session });
  const prior = storage.getItem(key);
  if (prior !== null && prior !== text)
    throw new Error('동일한 ID의 다른 전달 원본이 있습니다. 기존 원본을 덮어쓰지 않았습니다.');
  if (prior === null) storage.setItem(key, text);
}
export function loadLegacyLinkSession(
  storage: Pick<Storage, 'getItem'>,
  experiment: ExperimentStateV1
): LegacyLinkCompatibilityV1 | null {
  const id = experiment.provenance?.source.id;
  if (experiment.provenance?.createdByVersion !== 'legacy-links-v1' || !id) return null;
  const text = storage.getItem(LEGACY_LINK_SESSION_PREFIX + id);
  if (text === null) return null;
  const parsed = parseContractJson(text);
  if (!parsed.ok) throw new Error('보관한 링크 전달 JSON이 손상되었습니다. 원본 저장 키는 보존했습니다.');
  const value = parsed.value as Record<string, JsonValue>;
  if (value.schema !== 'pendulum-legacy-link-session/v1') throw new Error('지원하지 않는 링크 전달 버전입니다.');
  const { schema: _schema, ...input } = value;
  const checked = validateLegacyLinkSession(input);
  if (
    canonicalJson(experiment as unknown as JsonValue) !==
    canonicalJson(checked.session.canonical as unknown as JsonValue)
  )
    throw new Error('현재 실험과 보관한 링크가 다릅니다. 전달 설정을 적용하지 않았습니다.');
  return checked.compatibility;
}
