import type { ExperimentStateV1 } from '../contracts/experiment';
import type { ContractIssue } from '../contracts/validation';
import type { JsonValue } from './safe-data';

export const LEGACY_LINK_COMPATIBILITY_SCHEMA = 'pendulum-legacy-link-compatibility/v1' as const;
export interface LegacyLinkOptions {
  readonly durationSeconds?: number;
  readonly sourceId: string;
  /** Required for query links that only override a subset of an existing experiment. */
  readonly queryBase?: ExperimentStateV1;
}
export interface LegacyLinkMapping {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly transform: string;
}
export interface LegacyLinkRequirement {
  readonly kind:
    | 'ensemble'
    | 'workflow'
    | 'display'
    | 'navigation'
    | 'base-experiment'
    | 'suite'
    | 'unsupported-method'
    | 'unknown-query'
    | 'inactive-fields'
    | 'provenance'
    | 'preset';
  readonly sourcePaths: readonly string[];
  readonly message: string;
}
export interface LegacyLinkDefault {
  readonly path: string;
  readonly value: JsonValue;
  readonly origin: string;
}
/** Full compatibility data stays separate from the canonical physical restart. */
export interface LegacyLinkCompatibilityV1 {
  readonly schema: typeof LEGACY_LINK_COMPATIBILITY_SCHEMA;
  readonly sourceKind: 'legacy-share' | 'legacy-url' | 'expansion';
  readonly sourceVersion: 1 | 2 | 3 | 4 | 'legacy-query/v1' | 'legacy-expansion/unversioned';
  readonly sourceText: string;
  readonly decoded: JsonValue;
  readonly resolved: JsonValue;
  readonly decoderDiagnostics: readonly {
    code: string;
    severity: string;
    message: string;
    fields?: readonly string[];
  }[];
  readonly fieldMappings: readonly LegacyLinkMapping[];
  readonly declaredDefaults: readonly LegacyLinkDefault[];
  readonly inheritedFromBase: readonly string[];
  readonly transferRequirements: readonly LegacyLinkRequirement[];
  /** A physical restart is not a claim that pending UI/ensemble/workflow requirements were applied. */
  readonly canonical: ExperimentStateV1 | null;
}
export interface LegacyLinkMigration {
  readonly canonical: ExperimentStateV1 | null;
  readonly compatibility: LegacyLinkCompatibilityV1;
  readonly summary: readonly string[];
  readonly warnings: readonly string[];
}
export interface LegacyLinkProjection {
  readonly sourceKind: LegacyLinkCompatibilityV1['sourceKind'];
  readonly sourceVersion: LegacyLinkCompatibilityV1['sourceVersion'];
  readonly decoded: JsonValue;
  readonly resolved: JsonValue;
  readonly canonical: ExperimentStateV1 | null;
  readonly fieldMappings: LegacyLinkMapping[];
  readonly declaredDefaults: LegacyLinkDefault[];
  readonly inheritedFromBase: string[];
  readonly transferRequirements: LegacyLinkRequirement[];
  readonly decoderDiagnostics: LegacyLinkCompatibilityV1['decoderDiagnostics'];
}

export class LegacyLinkError extends Error {
  constructor(readonly issues: readonly ContractIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'LegacyLinkError';
  }
}
export function linkError(code: string, path: string, message: string): never {
  throw new LegacyLinkError([{ code, path, message, recovery: 'keep-original' }]);
}
export function linkRecord(value: unknown, path: string): Record<string, JsonValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return linkError('invalid-legacy-link', path, '명시적인 객체가 필요합니다. 원본을 보존하세요.');
  return value as Record<string, JsonValue>;
}
export function linkFields(
  value: Record<string, JsonValue>,
  required: readonly string[],
  optional: readonly string[],
  path: string
) {
  for (const key of required)
    if (!Object.hasOwn(value, key))
      linkError(
        'incomplete-legacy-link',
        `${path}.${key}`,
        '필수 원본 필드가 없습니다. 기본값으로 보정하지 않았습니다.'
      );
  for (const key of Object.keys(value))
    if (![...required, ...optional].includes(key))
      linkError(
        'unsupported-legacy-field',
        `${path}.${key}`,
        '이 버전에서 정의하지 않은 필드입니다. 조용히 버리지 않았습니다.'
      );
}
export function linkNumber(value: unknown, path: string, min: number, max: number, integer = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Object.is(value, -0) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    return linkError(
      'invalid-legacy-number',
      path,
      `${min}–${max}${integer ? ' 정수' : ''} 범위의 완전한 유한 숫자가 필요합니다. 보정하지 않았습니다.`
    );
  return value;
}
export function linkDuration(value: number | undefined): number {
  if (value === undefined)
    return linkError(
      'restart-duration-required',
      '$.durationSeconds',
      '링크에는 관찰 종료 시간이 없습니다. 새 관찰 시간(s)을 직접 지정하세요.'
    );
  return linkNumber(value, '$.durationSeconds', 1e-6, 300);
}
