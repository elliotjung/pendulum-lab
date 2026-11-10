import type { ExperimentStateV1 } from '../contracts/experiment';
import { isRecord } from '../contracts/contract-checks';
import { failure, success, type ContractIssue, type ContractResult } from '../contracts/validation';
import { parseContractJson } from './json';
import { canonicalJson, DATA_LIMITS, inspectSafeData, type JsonValue } from './safe-data';
import { migrateLegacySession, type MigratedLegacySession } from './legacy-migration-session';
import {
  migrateLegacyLink,
  serializeLegacyLinkCompatibility,
  restoreLegacyLinkCompatibility,
  legacyLinkRestorationOptions,
  LEGACY_LINK_COMPATIBILITY_SCHEMA,
  type LegacyLinkCompatibilityV1
} from './legacy-link';
import type { LegacyLinkOptions } from './legacy-link-contracts';
import { defaultPlanarConfig, fromCanonicalPlanar, toCanonicalPlanar } from '../adapters/physics/planar';
import { defaultChainConfig, fromCanonicalChain, toCanonicalChain } from '../adapters/physics/chain';
import { validateExperimentState } from '../contracts/experiment-validation';
import { hashBytes } from '../../research/zipBundle';

export const LEGACY_MIGRATION_PREVIEW_SCHEMA = 'pendulum-legacy-migration-preview/v1';
export type LegacyMigrationSourceKind =
  'session' | 'modern-run' | 'legacy-share' | 'legacy-url' | 'workspace' | 'research' | 'expansion' | 'unknown';
export interface LegacyMigrationOptions {
  readonly durationSeconds: number;
  readonly queryBase?: ExperimentStateV1;
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
  readonly status: 'ready' | 'needs-transfer' | 'recovery-required';
  readonly canonical: ExperimentStateV1 | null;
  readonly issues: readonly ContractIssue[];
  readonly warnings: readonly string[];
  readonly summary: readonly string[];
  readonly backup: LegacyMigrationBackup;
  readonly compatibility?: LegacyLinkCompatibilityV1;
}

// Confirmation is intentionally tied to an issued, immutable in-memory preview.
// An ID collision or a fabricated/restored JSON object cannot authorize a run.
const issued = new WeakMap<LegacyMigrationPreview, ExperimentStateV1 | null>();
const issuedLinkOptions = new WeakMap<LegacyMigrationPreview, LegacyLinkOptions>();
function freezeTree<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}
function previewId(text: string, duration: number | undefined, baseIdentity?: string): string {
  let hash = 0x811c9dc5;
  const input = `${duration === undefined ? 'unspecified' : duration}\n${text}`;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  // The base suffix is an opaque correlation hash, not authentication. The
  // storage boundary still compares the full input and refuses any collision.
  return `legacy-v1-${(hash >>> 0).toString(16).padStart(8, '0')}-${text.length}${baseIdentity ? `-base-${baseIdentity}` : ''}`;
}

/** A query base must be a complete, supported canonical snapshot. Inspect its
 * descriptors before reading fields; programmatic getters are never evaluated. */
export function validateLegacyMigrationBase(input: unknown): ContractResult<ExperimentStateV1> {
  const checked = validateExperimentState(input);
  if (!checked.ok) return checked;
  const base = checked.value;
  if (!['system:double', 'system:compound-double', 'system:triple'].includes(base.systemId))
    return failure(
      'unsupported-legacy-query-base',
      '$.queryBase.systemId',
      '기존 query의 base는 이중·복합·삼중 진자 canonical 설정이어야 합니다. 다른 모델의 값을 이식하지 않았습니다.',
      'keep-original'
    );
  const adapter = base.systemId === 'system:triple' ? fromCanonicalChain(base) : fromCanonicalPlanar(base);
  return adapter.ok ? success(base) : adapter;
}

function migrationOptions(input: unknown): ContractResult<{
  durationSeconds?: number;
  queryBase?: ExperimentStateV1;
  baseIdentity?: string;
}> {
  const checked = inspectSafeData(input === undefined ? {} : input);
  if (!checked.ok) return checked;
  const value = checked.value;
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !['durationSeconds', 'queryBase'].includes(key)) ||
    (Object.hasOwn(value, 'durationSeconds') && typeof value.durationSeconds !== 'number')
  )
    return failure(
      'invalid-legacy-migration-options',
      '$.options',
      '관찰 시간과 명시적인 canonical base만 지정하세요.',
      'keep-original'
    );
  const base = Object.hasOwn(value, 'queryBase') ? validateLegacyMigrationBase(value.queryBase) : undefined;
  if (base && !base.ok) return base;
  return success({
    ...(typeof value.durationSeconds === 'number' ? { durationSeconds: value.durationSeconds } : {}),
    ...(base?.ok
      ? {
          queryBase: base.value,
          baseIdentity: hashBytes(new TextEncoder().encode(canonicalJson(base.value as unknown as JsonValue)))
        }
      : {})
  });
}

/**
 * Read-only inspection: no navigation, storage, engine run, or source rewriting.
 * A ready result certifies a bounded restart configuration only. Backups contain
 * the caller's text, not a claim about the byte encoding of an original file.
 */
export function previewLegacyMigration(sourceText: string, options?: LegacyMigrationOptions): LegacyMigrationPreview {
  if (typeof sourceText !== 'string') throw new TypeError('Legacy migration requires raw text.');
  const checkedOptions = migrationOptions(options);
  const duration = checkedOptions.ok ? checkedOptions.value.durationSeconds : undefined;
  const queryBase = checkedOptions.ok ? checkedOptions.value.queryBase : undefined;
  const id = previewId(sourceText, duration, checkedOptions.ok ? checkedOptions.value.baseIdentity : undefined);
  let sourceKind: LegacyMigrationSourceKind = 'unknown';
  let result: ContractResult<MigratedLegacySession>;
  let compatibility: LegacyLinkCompatibilityV1 | undefined;
  const trimmed = sourceText.trim();
  if (!checkedOptions.ok) result = checkedOptions;
  else if (sourceText.length > DATA_LIMITS.bytes || new TextEncoder().encode(sourceText).length > DATA_LIMITS.bytes) {
    result = failure(
      'legacy-source-size-limit',
      '$',
      '변환 미리보기는 UTF-8 256 KiB 이하만 읽습니다. 큰 원본은 백업하고 기존 앱의 가져오기·복구 도구를 사용하세요.',
      'keep-original'
    );
  } else if (/^(?:https?:\/\/|[?#])/i.test(trimmed)) {
    let hash: string;
    try {
      hash = trimmed.startsWith('#') ? trimmed : new URL(trimmed).hash;
    } catch {
      hash = '';
    }
    if (hash.startsWith('#experiment=')) {
      sourceKind = 'legacy-share';
    } else {
      sourceKind = hash.startsWith('#expansion=') ? 'expansion' : 'legacy-url';
    }
    const linked = migrateLegacyLink(sourceText, {
      sourceId: id,
      ...(duration === undefined ? {} : { durationSeconds: duration }),
      ...(queryBase === undefined ? {} : { queryBase })
    });
    if (!linked.ok) result = linked;
    else {
      compatibility = linked.value.compatibility;
      sourceKind = compatibility.sourceKind;
      result = linked.value.canonical
        ? success({ canonical: linked.value.canonical, summary: linked.value.summary, warnings: linked.value.warnings })
        : failure(
            'legacy-link-transfer-required',
            '$',
            '별도 base·실행·표시 설정을 확인해야 합니다. 호환 설정 파일과 원본을 내려받아 보존하세요.',
            'keep-original'
          );
    }
  } else {
    const parsed = parseContractJson(trimmed);
    if (!parsed.ok) result = parsed;
    else {
      const value = parsed.value;
      if (isRecord(value) && value.schema === LEGACY_LINK_COMPATIBILITY_SCHEMA) {
        const restored = restoreLegacyLinkCompatibility(value);
        if (!restored.ok) result = restored;
        else {
          compatibility = restored.value.compatibility;
          sourceKind = compatibility.sourceKind;
          const canonical = restored.value.canonical;
          result =
            canonical?.runtime.domain === 'time' && duration !== canonical.runtime.duration.value
              ? failure(
                  'legacy-envelope-duration-conflict',
                  '$.durationSeconds',
                  `호환 파일의 관찰 기간은 ${canonical.runtime.duration.value}s입니다. 입력한 기간과 달라 적용하지 않았습니다. 원본 기간을 입력해 미리보기를 다시 실행하세요.`,
                  'keep-original'
                )
              : canonical
                ? success({ canonical, summary: restored.value.summary, warnings: restored.value.warnings })
                : failure(
                    'legacy-envelope-native-consumer-required',
                    '$',
                    '이 파일은 전용 native suite consumer에서 확인하세요.',
                    'keep-original'
                  );
        }
      } else if (
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
    status:
      compatibility?.sourceKind === 'expansion'
        ? 'needs-transfer'
        : result.ok
          ? compatibility?.transferRequirements.length
            ? 'needs-transfer'
            : 'ready'
          : 'recovery-required',
    canonical: result.ok ? result.value.canonical : null,
    issues: result.ok ? [] : result.issues.map((entry) => ({ ...entry, recovery: 'keep-original' as const })),
    warnings: result.ok
      ? result.value.warnings
      : ['변환·저장·실행·원본 변경을 수행하지 않았습니다. 백업에는 입력한 텍스트 전체가 포함됩니다.'],
    summary: result.ok ? result.value.summary : ['원본 백업을 내려받은 뒤 기존 앱에서 복구하세요.'],
    backup: { fileName: `${id}-original.txt`, mediaType: 'text/plain;charset=utf-8', text: sourceText },
    ...(compatibility ? { compatibility } : {})
  });
  issued.set(preview, result.ok ? result.value.canonical : null);
  if (compatibility) issuedLinkOptions.set(preview, legacyLinkRestorationOptions(compatibility));
  return preview;
}

/** Opens the complete compatibility workspace. Pending consumers are still
 * explicit; this does not relabel a physical-only restart as a full migration. */
export function confirmLegacyLinkTransfer(preview: LegacyMigrationPreview, id: string) {
  const options = issuedLinkOptions.get(preview),
    canonical = issued.get(preview);
  if (!options || !canonical || !preview.compatibility || id !== preview.id)
    throw new TypeError('변환 가능한 issued 링크 미리보기를 다시 확인하세요.');
  return {
    canonical: structuredClone(canonical),
    sourceText: preview.compatibility.sourceText,
    options: structuredClone(options)
  };
}

/** Explicit confirmation returns a detached copy; the caller chooses storage/navigation. */
export function confirmLegacyMigration(
  preview: LegacyMigrationPreview,
  previewIdValue: string
): ContractResult<ExperimentStateV1> {
  const canonical = issued.get(preview);
  if (!canonical || preview.status !== 'ready' || previewIdValue !== preview.id)
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

export function defaultLegacyMigrationBase(
  system:
    'double' | 'compound-double' | 'triple' | 'system:double' | 'system:compound-double' | 'system:triple' = 'double'
): ExperimentStateV1 {
  if (typeof system !== 'string') throw new TypeError('명시적인 이중·복합·삼중 시스템 ID가 필요합니다.');
  const id = system.startsWith('system:') ? system : `system:${system}`;
  const result =
    id === 'system:triple'
      ? toCanonicalChain(defaultChainConfig('system:triple'))
      : id === 'system:double' || id === 'system:compound-double'
        ? toCanonicalPlanar(defaultPlanarConfig(id))
        : undefined;
  if (!result) throw new Error('지원하는 query base 시스템이 아닙니다.');
  if (!result.ok) throw new Error('Default query base is invalid.');
  return result.value;
}
export function exportLegacyMigrationCompatibility(preview: LegacyMigrationPreview) {
  if (!issued.has(preview) || !preview.compatibility)
    throw new TypeError('An issued compatibility preview is required.');
  return {
    fileName: `${preview.id}-compatibility.json`,
    mediaType: 'application/json',
    text: serializeLegacyLinkCompatibility(preview.compatibility)
  };
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
