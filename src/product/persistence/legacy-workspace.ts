import { parseStorageImportJson, validateWorkspaceImportDocument } from '../../app/parity/storage-import-guards';
import { validateResearchDbArchive } from '../../research/researchDb';
import { sha256Hex } from '../../research/zipBundle';
import { success, type ContractResult } from '../contracts/validation';
import { copyResearchBundle, verifyResearchBundle } from '../provenance/project';
import { inspectSafeData } from './safe-data';
import {
  extractWorkspaceRecords,
  mapWorkspaceRecords,
  validateWorkspaceNumbers,
  workspaceRecord
} from './legacy-workspace-records';
import { workspaceProjects, exportWorkspaceRecord } from './legacy-workspace-project';
import {
  LEGACY_WORKSPACE_SCHEMA,
  workspaceAbort,
  type LegacyWorkspaceOptions,
  type LegacyWorkspacePreview,
  type LegacyWorkspaceAdoption
} from './legacy-workspace-contracts';
export * from './legacy-workspace-contracts';
export { exportWorkspaceRecord } from './legacy-workspace-project';

const issued = new WeakMap<LegacyWorkspacePreview, { source: Uint8Array; assets: Map<string, Uint8Array> }>();
const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !(value instanceof Uint8Array)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
/** Never reads browser stores. Input is a detached exported JSON file with the original import guards. */
export async function previewLegacyWorkspace(
  input: Uint8Array,
  options: LegacyWorkspaceOptions,
  signal?: AbortSignal
): Promise<ContractResult<LegacyWorkspacePreview>> {
  try {
    workspaceAbort(signal);
    if (!(input instanceof Uint8Array) || !input.length || input.length > 64 * 1024 * 1024)
      throw new Error('원본 JSON 파일은1byte–64MiB입니다.');
    const safeOptions = inspectSafeData(options);
    if (!safeOptions.ok) throw new Error('가져오기 옵션은 callback/getter 없는 유한한 데이터여야 합니다.');
    options = safeOptions.value as unknown as LegacyWorkspaceOptions;
    if (
      !options ||
      !/^[A-Za-z0-9._:-]{1,64}$/.test(options.sourceId) ||
      !Number.isFinite(options.durationSeconds) ||
      options.durationSeconds <= 0 ||
      options.durationSeconds > 300
    )
      throw new Error('명시적인 source ID와 새 관찰 시간(0–300s)이 필요합니다.');
    const source = new Uint8Array(input);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(source);
    const kind = options.kind ?? (text.includes('"pendulum-research-db/v1"') ? 'research-db' : 'workspace');
    const parsed = parseStorageImportJson(text, kind, source.length);
    if (!parsed.ok) throw new Error(`${parsed.diagnostic.code}: ${parsed.diagnostic.message}`);
    const raw = parsed.value;
    if (!workspaceRecord(raw)) throw new Error('기존 workspace/archive 객체가 필요합니다.');
    if (kind === 'workspace') {
      const problems = validateWorkspaceImportDocument(raw);
      if (problems.length) throw new Error(problems.join('; '));
    } else {
      const validation = validateResearchDbArchive(raw);
      if (!validation.ok) throw new Error(validation.problems.join('; '));
    }
    validateWorkspaceNumbers(raw);
    const importedAt = options.importedAt ?? new Date().toISOString();
    if (!/^\d{4}-\d\d-\d\dT/.test(importedAt) || !Number.isFinite(Date.parse(importedAt)))
      throw new Error('가져오기 시각이 유효하지 않습니다.');
    const digest = await sha256Hex(source);
    workspaceAbort(signal);
    const { records, assets } = await mapWorkspaceRecords(extractWorkspaceRecords(raw, kind), options, signal);
    const { parts, mappings } = await workspaceProjects(records, assets, digest, importedAt, signal);
    const durationId = await sha256Hex(new TextEncoder().encode(`${options.sourceId}\n${options.durationSeconds}`));
    const preview: LegacyWorkspacePreview = freeze({
      schema: LEGACY_WORKSPACE_SCHEMA,
      id: `legacy-migration-${digest.slice(0, 24)}-${durationId.slice(0, 12)}`,
      sourceKind: kind,
      sourceSchema: String(raw.schemaVersion),
      sourceBytes: source.length,
      sourceSha256: digest,
      importedAt,
      options: { ...options, importedAt, kind },
      records,
      parts,
      mappings,
      warnings: [
        '원본 JSON bytes와SHA256을 그대로 보존했습니다. 기존 localStorage/IndexedDB는 읽거나 쓰지 않았습니다.',
        '표본이 없는 과거 기록은 partial입니다. 숫자 메트릭이나 이미지에서 궤적·완료 run·figure 계보를 만들어내지 않았습니다.',
        `총${records.length}개의 실제 typed 기록을${parts.length}개의 검증된 project part로 분할했습니다. 누락·slice·자동 clamp는 수행하지 않았습니다.`,
        ...(records.some((record) => record.status === 'unresolved')
          ? [
              '미해결 record가 있습니다. 명시된 원본/설정 문제를 확인한 뒤 채택하세요. 완료된 기능 동등성으로 표시하지 않습니다.'
            ]
          : [])
      ]
    });
    issued.set(preview, { source, assets });
    return success(preview);
  } catch (cause) {
    return {
      ok: false,
      issues: [
        {
          code:
            cause instanceof DOMException && cause.name === 'AbortError'
              ? 'legacy-workspace-cancelled'
              : 'legacy-workspace-invalid',
          path: '$',
          message: cause instanceof Error ? cause.message : '원본 archive를 변환하지 못했습니다.',
          recovery: 'keep-original'
        }
      ]
    };
  }
}
export function exportLegacyWorkspaceSource(preview: LegacyWorkspacePreview): Uint8Array {
  const original = issued.get(preview);
  if (!original) throw new TypeError('발행된 미리보기가 필요합니다.');
  return new Uint8Array(original.source);
}
export function exportLegacyWorkspaceAsset(preview: LegacyWorkspacePreview, recordId: string): Uint8Array {
  const bytes = issued.get(preview)?.assets.get(recordId);
  if (!bytes) throw new Error('검증된 binary record가 없습니다.');
  return new Uint8Array(bytes);
}
export function exportLegacyWorkspaceRecord(preview: LegacyWorkspacePreview, recordId: string): Uint8Array {
  if (!issued.has(preview)) throw new TypeError('발행된 미리보기가 필요합니다.');
  const record = preview.records.find((item) => item.id === recordId);
  if (!record) throw new Error('알 수 없는 record ID입니다.');
  return exportWorkspaceRecord(record, preview.sourceSha256);
}
export async function confirmLegacyWorkspace(
  preview: LegacyWorkspacePreview,
  id: string
): Promise<ContractResult<LegacyWorkspaceAdoption>> {
  if (!issued.has(preview) || preview.id !== id)
    return {
      ok: false,
      issues: [
        {
          code: 'legacy-workspace-not-confirmed',
          path: '$',
          message: '발행된 미리보기를 확인한 뒤 다시 채택하세요.',
          recovery: 'keep-original'
        }
      ]
    };
  try {
    for (const part of preview.parts) await verifyResearchBundle(part);
    const detached = freeze({
      ...preview,
      records: structuredClone(preview.records),
      parts: preview.parts.map(copyResearchBundle),
      mappings: structuredClone(preview.mappings)
    });
    issued.set(detached, issued.get(preview)!);
    return success({
      preview: detached,
      source: exportLegacyWorkspaceSource(preview)
    });
  } catch {
    return {
      ok: false,
      issues: [
        {
          code: 'legacy-workspace-mutated',
          path: '$',
          message: '미리보기 project bytes·checksum이 변경되어 채택하지 않았습니다.',
          recovery: 'keep-original'
        }
      ]
    };
  }
}
