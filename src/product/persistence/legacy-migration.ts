import { decodeBase64UrlText } from '../../app/base64UrlText';
import type { ExperimentStateV1 } from '../contracts/experiment';
import { isRecord } from '../contracts/contract-checks';
import { failure, success, type ContractIssue, type ContractResult } from '../contracts/validation';
import { parseContractJson } from './json';
import { canonicalJson, DATA_LIMITS, type JsonValue } from './safe-data';
import { migrateLegacySession, type MigratedLegacySession } from './legacy-migration-session';

export const LEGACY_MIGRATION_PREVIEW_SCHEMA = 'pendulum-legacy-migration-preview/v1';
export type LegacyMigrationSourceKind =
  'session' | 'modern-run' | 'legacy-share' | 'legacy-url' | 'workspace' | 'research' | 'expansion' | 'unknown';
export interface LegacyMigrationOptions {
  readonly durationSeconds: number;
}
export interface LegacyMigrationBackup {
  readonly fileName: string;
  readonly mediaType: 'text/plain;charset=utf-8';
  /** Exact caller-supplied text, including BOM, whitespace and original URL. */
  readonly text: string;
}
export interface LegacyMigrationPreview {
  readonly schema: typeof LEGACY_MIGRATION_PREVIEW_SCHEMA;
  /** Deterministic correlation ID, not a security hash or an authenticity claim. */
  readonly id: string;
  readonly sourceText: string;
  readonly sourceKind: LegacyMigrationSourceKind;
  readonly status: 'ready' | 'recovery-required';
  readonly canonical: ExperimentStateV1 | null;
  readonly issues: readonly ContractIssue[];
  readonly warnings: readonly string[];
  readonly summary: readonly string[];
  readonly backup: LegacyMigrationBackup;
}

// Confirmation is intentionally tied to an issued, immutable in-memory preview.
// An ID collision or a fabricated/restored JSON object cannot authorize a run.
const issued = new WeakMap<LegacyMigrationPreview, ExperimentStateV1 | null>();
function freezeTree<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}
function previewId(text: string, duration: number | undefined): string {
  let hash = 0x811c9dc5;
  const input = `${duration === undefined ? 'unspecified' : duration}\n${text}`;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `legacy-v1-${(hash >>> 0).toString(16).padStart(8, '0')}-${text.length}`;
}

/**
 * Read-only inspection: no navigation, storage, engine run, or source rewriting.
 * A ready result certifies a bounded restart configuration only. Backups contain
 * the caller's text, not a claim about the byte encoding of an original file.
 */
export function previewLegacyMigration(sourceText: string, options?: LegacyMigrationOptions): LegacyMigrationPreview {
  if (typeof sourceText !== 'string') throw new TypeError('Legacy migration requires raw text.');
  const duration = options?.durationSeconds;
  const id = previewId(sourceText, duration);
  let sourceKind: LegacyMigrationSourceKind = 'unknown';
  let result: ContractResult<MigratedLegacySession>;
  const trimmed = sourceText.trim();
  if (sourceText.length > DATA_LIMITS.bytes || new TextEncoder().encode(sourceText).length > DATA_LIMITS.bytes) {
    result = failure(
      'legacy-source-size-limit',
      '$',
      '변환 미리보기는 UTF-8 256 KiB 이하만 읽습니다. 큰 원본은 백업하고 기존 앱의 가져오기·복구 도구를 사용하세요.',
      'keep-original'
    );
  } else if (/^(?:https?:\/\/|#)/i.test(trimmed)) {
    let hash: string;
    try {
      hash = trimmed.startsWith('#') ? trimmed : new URL(trimmed).hash;
    } catch {
      hash = '';
    }
    if (hash.startsWith('#experiment=')) {
      sourceKind = 'legacy-share';
      result = inspectLegacyShare(hash);
    } else {
      sourceKind = hash.startsWith('#expansion=') ? 'expansion' : 'legacy-url';
      result = failure(
        'legacy-link-recovery-required',
        '$',
        '이 기존 query·tab·expansion 링크를 새 설정으로 추측하지 않았습니다. 원본 링크를 백업하고 기존 앱에서 여세요.',
        'keep-original'
      );
    }
  } else {
    const parsed = parseContractJson(trimmed);
    if (!parsed.ok) result = parsed;
    else {
      const value = parsed.value;
      if (
        isRecord(value) &&
        typeof value.schemaVersion === 'string' &&
        value.schemaVersion.startsWith('pendulum-session/')
      ) {
        sourceKind = 'session';
        result = migrateLegacySession(value, duration, id);
      } else if (isRecord(value) && value.schemaVersion === 2 && value.generator === 'pendulum-lab-modern-lab') {
        sourceKind = 'modern-run';
        result = migrateModernRun(value, duration, id);
      } else {
        const schema = isRecord(value) ? value.schemaVersion : undefined;
        sourceKind =
          schema === 'pendulum-workspace/v1'
            ? 'workspace'
            : typeof schema === 'string' && schema.startsWith('pendulum-research-')
              ? 'research'
              : 'unknown';
        result = failure(
          'legacy-format-recovery-required',
          '$',
          '이 형식의 전체 의미를 새 실험으로 표현할 수 없습니다. 원본을 보존했습니다. workspace·연구 DB·결과 파일은 기존 앱의 해당 가져오기·복구 도구에서 여세요.',
          'keep-original'
        );
      }
    }
  }
  const preview = freezeTree<LegacyMigrationPreview>({
    schema: LEGACY_MIGRATION_PREVIEW_SCHEMA,
    id,
    sourceText,
    sourceKind,
    status: result.ok ? 'ready' : 'recovery-required',
    canonical: result.ok ? result.value.canonical : null,
    issues: result.ok ? [] : result.issues.map((entry) => ({ ...entry, recovery: 'keep-original' as const })),
    warnings: result.ok
      ? result.value.warnings
      : ['변환·저장·실행·원본 변경을 수행하지 않았습니다. 백업에는 입력한 텍스트 전체가 포함됩니다.'],
    summary: result.ok ? result.value.summary : ['원본 백업을 내려받은 뒤 기존 앱에서 복구하세요.'],
    backup: { fileName: `${id}-original.txt`, mediaType: 'text/plain;charset=utf-8', text: sourceText }
  });
  issued.set(preview, result.ok ? result.value.canonical : null);
  return preview;
}

/** Explicit confirmation returns a detached copy; the caller chooses storage/navigation. */
export function confirmLegacyMigration(
  preview: LegacyMigrationPreview,
  previewIdValue: string
): ContractResult<ExperimentStateV1> {
  const canonical = issued.get(preview);
  if (!canonical || previewIdValue !== preview.id)
    return failure(
      'legacy-preview-not-confirmed',
      '$',
      '변환 가능한 미리보기를 확인한 뒤 다시 확정하세요. 원본은 변경하지 않았습니다.',
      'keep-original'
    );
  return success(structuredClone(canonical));
}

export function exportLegacyMigrationBackup(preview: LegacyMigrationPreview): LegacyMigrationBackup {
  if (!issued.has(preview)) throw new TypeError('An issued migration preview is required.');
  return { ...preview.backup };
}

function inspectLegacyShare(hash: string): ContractResult<MigratedLegacySession> {
  if (hash.length > 8192)
    return failure('legacy-share-size-limit', '$', '기존 공유 링크가 8192자 상한을 넘습니다.', 'keep-original');
  let decoded: string;
  try {
    decoded = decodeBase64UrlText(hash.slice('#experiment='.length));
  } catch {
    return failure(
      'invalid-legacy-share',
      '$',
      '공유 링크의 base64url 또는 UTF-8을 읽을 수 없습니다.',
      'keep-original'
    );
  }
  const parsed = parseContractJson(decoded);
  if (!parsed.ok) return parsed;
  if (!isRecord(parsed.value) || ![1, 2, 3, 4].includes(Number(parsed.value.v)) || typeof parsed.value.v !== 'number')
    return failure(
      'unsupported-legacy-share-version',
      '$.v',
      '기존 share v1–v4만 인식합니다. 다른 버전은 원본을 보존하세요.',
      'keep-original'
    );
  return failure(
    'legacy-share-recovery-required',
    '$',
    `기존 share v${parsed.value.v}의 실행·ensemble·workflow·표시 설정 전체를 새 실험으로 표현하지 못합니다. 값을 보정하거나 버리지 않았습니다. 원본 링크를 기존 앱에서 여세요.`,
    'keep-original'
  );
}

function migrateModernRun(
  source: Record<string, unknown>,
  duration: number | undefined,
  id: string
): ContractResult<MigratedLegacySession> {
  const required = [
    'schemaVersion',
    'generator',
    'system',
    'physicalModel',
    'method',
    'dt',
    'gamma',
    'parameters',
    'initialState',
    'finalState',
    'simTime',
    'energy',
    'drift',
    'runtimeSnapshot'
  ];
  const allowed = [...required, 'locale', 'trajectoryRetention'];
  if (required.some((key) => !Object.hasOwn(source, key)) || Object.keys(source).some((key) => !allowed.includes(key)))
    return failure(
      'incomplete-legacy-run',
      '$',
      '정확한 runtimeSnapshot과 알려진 필드를 가진 run v2만 재시작합니다. 이전 run 파일은 기존 앱에서 여세요.',
      'keep-original'
    );
  const snapshot = source.runtimeSnapshot;
  if (!isRecord(snapshot))
    return failure('invalid-run-snapshot', '$.runtimeSnapshot', 'run의 runtimeSnapshot이 필요합니다.', 'keep-original');
  const migrated = migrateLegacySession(snapshot, duration, id);
  if (!migrated.ok) return migrated;
  const pairs = [
    ['system', 'systemType'],
    ['method', 'method'],
    ['dt', 'dt'],
    ['gamma', 'damping'],
    ['parameters', 'parameters'],
    ['finalState', 'state'],
    ['simTime', 'simTime']
  ] as const;
  if (
    pairs.some(
      ([outer, inner]) => canonicalJson(source[outer] as JsonValue) !== canonicalJson(snapshot[inner] as JsonValue)
    )
  )
    return failure(
      'inconsistent-legacy-run',
      '$.runtimeSnapshot',
      'run 외부 설정과 runtimeSnapshot이 다릅니다. 어느 쪽도 임의 선택하지 않았습니다.',
      'keep-original'
    );
  const model = source.system === 'compound-double' ? 'uniform-rigid-rods' : 'point-masses-on-massless-links';
  if (
    source.physicalModel !== model ||
    typeof source.energy !== 'number' ||
    !Number.isFinite(source.energy) ||
    typeof source.drift !== 'number' ||
    !Number.isFinite(source.drift) ||
    !Array.isArray(source.initialState) ||
    source.initialState.length !== (source.system === 'triple' ? 6 : 4) ||
    !source.initialState.every((value) => typeof value === 'number' && Number.isFinite(value))
  )
    return failure(
      'invalid-legacy-run',
      '$',
      'run 모델·초기 상태·에너지 메타데이터가 올바르지 않습니다.',
      'keep-original'
    );
  return success({
    ...migrated.value,
    warnings: [
      ...migrated.value.warnings,
      'run의 기존 initialState·energy·drift·locale·trajectoryRetention·결과는 원본 백업에 보존됩니다. 최종 상태에서 새 run을 시작하며 기존 결과의 재인증을 주장하지 않습니다.'
    ]
  });
}
