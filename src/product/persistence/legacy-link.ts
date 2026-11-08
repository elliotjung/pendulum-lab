import { success, type ContractResult } from '../contracts/validation';
import { DATA_LIMITS, inspectSafeData, canonicalJson, type JsonValue } from './safe-data';
import type { ExperimentStateV1 } from '../contracts/experiment';
import { projectLegacyShare } from './legacy-link-share';
import { projectLegacyQuery } from './legacy-link-query';
import { projectLegacyExpansion } from './legacy-link-expansion';
import {
  LEGACY_LINK_COMPATIBILITY_SCHEMA,
  LegacyLinkError,
  linkError,
  type LegacyLinkOptions,
  type LegacyLinkMigration,
  type LegacyLinkProjection,
  type LegacyLinkCompatibilityV1
} from './legacy-link-contracts';
export * from './legacy-link-contracts';

const issuedEnvelopes = new WeakSet<LegacyLinkCompatibilityV1>();
function freezeEnvelope<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeEnvelope(child);
    Object.freeze(value);
  }
  return value;
}

/** Read-only, detached translation. Caller retains preview/confirmation authority and chooses navigation/storage. */
export function migrateLegacyLink(sourceText: string, options: LegacyLinkOptions): ContractResult<LegacyLinkMigration> {
  try {
    if (
      typeof sourceText !== 'string' ||
      sourceText.length > 8192 ||
      new TextEncoder().encode(sourceText).length > DATA_LIMITS.bytes
    )
      return linkError('legacy-link-size-limit', '$', '기존 링크는 8192자 이하여야 합니다. 원본을 보존하세요.');
    const checkedOptions = inspectSafeData(options);
    if (!checkedOptions.ok) throw new LegacyLinkError(checkedOptions.issues);
    options = checkedOptions.value as unknown as LegacyLinkOptions;
    if (!options || typeof options.sourceId !== 'string' || !/^[A-Za-z0-9._:-]{1,96}$/.test(options.sourceId))
      return linkError(
        'invalid-legacy-source-id',
        '$.sourceId',
        '경로·URL·사용자 정보가 없는 opaque source ID가 필요합니다.'
      );
    const trimmed = sourceText.trim();
    if (!/^(?:https?:\/\/|[?#])/i.test(trimmed))
      return linkError('unsupported-legacy-link', '$', 'http(s) URL, query 또는 알려진 hash가 필요합니다.');
    let url: URL;
    try {
      // The fixed base only parses a relative query/hash; it is never contacted or placed in canonical state.
      url = new URL(trimmed, 'https://pendulum.invalid/app.html');
      if (url.username || url.password || /%(?![0-9a-f]{2})/i.test(url.search)) throw new Error('ambiguous URL');
      decodeURIComponent(url.search.replaceAll('+', ' '));
    } catch {
      return linkError('invalid-legacy-url', '$', 'URL 또는 query의 percent/UTF-8 인코딩이 올바르지 않습니다.');
    }
    let projection: LegacyLinkProjection;
    if (url.hash.startsWith('#experiment=')) projection = projectLegacyShare(url.hash, options);
    else if (url.hash.startsWith('#expansion=')) projection = projectLegacyExpansion(url.hash, options);
    else if (url.hash && url.hash !== '#')
      return linkError('unsupported-legacy-hash', '$.hash', '알 수 없는 hash를 새 route로 추측하지 않았습니다.');
    else projection = projectLegacyQuery(url, options);
    const compatibility = freezeEnvelope({
      schema: LEGACY_LINK_COMPATIBILITY_SCHEMA,
      sourceText,
      ...projection
    });
    issuedEnvelopes.add(compatibility);
    return success({
      canonical: projection.canonical,
      compatibility,
      summary: [
        `${projection.sourceKind} ${projection.sourceVersion} → versioned compatibility envelope`,
        projection.canonical
          ? '표현 가능한 SI 물성·초기조건·적분기를 새 물리 재시작 설정으로 변환했습니다.'
          : '아직 완전한 물리 재시작 설정을 만들 수 없습니다. 명시된 base/stepper 요구 조건을 확인하세요.',
        `전체 원본과 ${projection.transferRequirements.length}개의 별도 실행·workflow·표시 전달 요구를 보존했습니다.`
      ],
      warnings: [
        '원본을 읽기만 했습니다. 저장·실행·URL 이동은 수행하지 않았습니다.',
        'canonical 물리 재시작 설정은 별도 ensemble·workflow·표시 요구가 이미 적용되었다는 뜻이 아닙니다. pending 요구는 실제 consumer에서 확인해야 합니다.'
      ]
    });
  } catch (cause) {
    if (cause instanceof LegacyLinkError) return { ok: false, issues: cause.issues };
    return {
      ok: false,
      issues: [
        {
          code: 'legacy-link-conversion-failed',
          path: '$',
          message: '원본 링크를 안전하게 변환하지 못했습니다. 원본을 보존하고 형식·물성을 확인하세요.',
          recovery: 'keep-original'
        }
      ]
    };
  }
}

/** The complete envelope is a separate download; canonical export never claims to contain it. */
export function serializeLegacyLinkCompatibility(value: LegacyLinkMigration['compatibility']): string {
  if (!issuedEnvelopes.has(value))
    throw new TypeError('An issued, immutable legacy-link compatibility envelope is required.');
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** A downloaded envelope is data, never confirmation authority. Recreate it
 * from its original source and require every mapping/default/value to match. */
export function restoreLegacyLinkCompatibility(input: unknown): ContractResult<LegacyLinkMigration> {
  try {
    const checked = inspectSafeData(input);
    if (!checked.ok) return checked;
    const value = checked.value as unknown as LegacyLinkCompatibilityV1;
    if (!value || value.schema !== LEGACY_LINK_COMPATIBILITY_SCHEMA)
      return linkError('unsupported-legacy-envelope', '$', '지원하지 않는 호환 envelope 버전입니다.');
    const canonical = value.canonical;
    const base =
      value.sourceKind === 'legacy-url'
        ? (value.resolved as { baseExperiment?: ExperimentStateV1 | null }).baseExperiment
        : null;
    const restored = migrateLegacyLink(value.sourceText, {
      sourceId: canonical?.provenance?.source.id ?? 'restored-legacy-link',
      ...(canonical?.runtime.domain === 'time' ? { durationSeconds: canonical.runtime.duration.value } : {}),
      ...(base ? { queryBase: base } : {})
    });
    if (!restored.ok) return restored;
    if (
      canonicalJson(value as unknown as JsonValue) !==
      canonicalJson(restored.value.compatibility as unknown as JsonValue)
    )
      return linkError(
        'legacy-envelope-mismatch',
        '$',
        '호환 파일의 원본·매핑·설정이 엄격한 재변환과 다릅니다. 보정하지 않았습니다.'
      );
    return restored;
  } catch (cause) {
    return {
      ok: false,
      issues: [
        {
          code: 'invalid-legacy-envelope',
          path: '$',
          message: cause instanceof Error ? cause.message : '호환 파일을 재검증하지 못했습니다.',
          recovery: 'keep-original'
        }
      ]
    };
  }
}

export function legacyLinkRestorationOptions(value: LegacyLinkCompatibilityV1): LegacyLinkOptions {
  serializeLegacyLinkCompatibility(value);
  const canonical = value.canonical;
  const base =
    value.sourceKind === 'legacy-url'
      ? (value.resolved as { baseExperiment?: ExperimentStateV1 | null }).baseExperiment
      : null;
  return {
    sourceId: canonical?.provenance?.source.id ?? 'restored-legacy-link',
    ...(canonical?.runtime.domain === 'time' ? { durationSeconds: canonical.runtime.duration.value } : {}),
    ...(base ? { queryBase: structuredClone(base) } : {})
  };
}
