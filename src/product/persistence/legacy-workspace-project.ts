import { sha256Hex, textToBytes } from '../../research/zipBundle';
import { createResearchProject, verifyResearchBundle } from '../provenance/project';
import { PROJECT_LIMITS, type ResearchProjectBundle, type ResearchArtifact } from '../provenance/contracts';
import type { LegacyWorkspaceRecord, LegacyWorkspaceMapping } from './legacy-workspace-contracts';
import { workspaceAbort } from './legacy-workspace-contracts';
import { workspaceRecord } from './legacy-workspace-records';

/** Conservative part sizes leave room for native manifests and reviewer/report exports without dropping a record. */
export const LEGACY_WORKSPACE_RECORDS_PER_PART = 48;
export const LEGACY_WORKSPACE_PART_BYTES = 48 * 1024 * 1024;
const label = (value: string, fallback: string, max = 160) =>
  value.length <= max && value.trim() && !/[\u0000-\u001f]/.test(value) ? value : fallback;
export function exportWorkspaceRecord(record: LegacyWorkspaceRecord, sourceSha256: string): Uint8Array {
  return textToBytes(JSON.stringify({ schema: 'pendulum-legacy-workspace-record/v1', sourceSha256, record }, null, 2));
}
export async function workspaceProjects(
  records: readonly LegacyWorkspaceRecord[],
  assets: Map<string, Uint8Array>,
  digest: string,
  importedAt: string,
  signal?: AbortSignal
) {
  const parts: ResearchProjectBundle[] = [];
  const mappings: LegacyWorkspaceMapping[] = [];
  let bundle: ResearchProjectBundle | undefined,
    partRecords = 0,
    partBytes = 0;
  function newPart() {
    bundle = createResearchProject({
      id: `legacy-project-${digest.slice(0, 20)}-${parts.length}`,
      title: `가져온 기존 연구 · ${parts.length + 1}`,
      createdAt: importedAt,
      description:
        '원본 archive에서 실제 프로젝트·세션·부분 run을 구성했습니다. 원본 기록의 메트릭·이미지·계획은 전용 typed record 보기와 다운로드로 확인하세요.'
    });
    bundle.project.warnings.push(
      '원본 궤적이 없는 기록은 partial입니다. 기존 통계·계획 결과를 새 엔진 계산 완료·series·figure 계보로 가장하지 않습니다.',
      '전체 원본 archive와 typed record 파일을 함께 보관하세요. 개별 project part는 전체 legacy 저장소의 대체 백업이 아닙니다.'
    );
    parts.push(bundle);
    partRecords = 0;
    partBytes = 0;
  }
  async function artifact(
    record: LegacyWorkspaceRecord,
    runId: string,
    data: Uint8Array,
    filename: string,
    kind: ResearchArtifact['kind'],
    note: string
  ) {
    const id = `artifact-${record.id}-${bundle!.project.artifacts.length}`;
    const path = `artifacts/${id}.${kind === 'configuration' ? 'json' : filename.endsWith('.zip') ? 'zip' : 'bin'}`;
    const item: ResearchArtifact = {
      id,
      runId,
      kind,
      schema: kind === 'configuration' ? 'pendulum-experiment/v1' : 'opaque-attachment/v1',
      filename,
      path,
      mediaType: filename.endsWith('.json')
        ? 'application/json'
        : (record.asset?.mediaType ?? 'application/octet-stream'),
      bytes: data.length,
      sha256: await sha256Hex(data),
      status: 'present',
      parentIds: [],
      note
    };
    bundle!.project.artifacts.push(item);
    bundle!.project.runs.at(-1)!.artifactIds.push(id);
    bundle!.files.push({ path, data: new Uint8Array(data) });
    partBytes += data.length;
    return id;
  }
  for (const record of records) {
    workspaceAbort(signal);
    const bytes = exportWorkspaceRecord(record, digest),
      binary = assets.get(record.id);
    const config = record.canonical ? textToBytes(JSON.stringify(record.canonical, null, 2)) : undefined;
    const recordBytes =
      (bytes.length <= PROJECT_LIMITS.fileBytes ? bytes.length : 0) + (binary?.length ?? 0) + (config?.length ?? 0);
    if (
      !bundle ||
      partRecords >= LEGACY_WORKSPACE_RECORDS_PER_PART ||
      partBytes + recordBytes > LEGACY_WORKSPACE_PART_BYTES
    )
      newPart();
    const current = bundle!;
    const source = workspaceRecord(record.payload) ? record.payload : null;
    const sourceSession =
      record.kind === 'session'
        ? record
        : records.find((item) => item.kind === 'session' && item.sourceId && source?.sessionId === item.sourceId);
    const sessionId = sourceSession ? `session-${sourceSession.id}` : 'legacy-session-unassigned';
    if (!current.project.sessions.some((session) => session.id === sessionId))
      current.project.sessions.push({
        id: sessionId,
        title: sourceSession ? label(sourceSession.title, sourceSession.id) : '원본에 세션 연결이 없는 기록',
        createdAt: importedAt
      });
    const runId = `run-${record.id}`;
    const timestamp = source?.createdAt ?? source?.timestamp;
    const createdAt =
      typeof timestamp === 'string' && /^\d{4}-\d\d-\d\dT/.test(timestamp) && Number.isFinite(Date.parse(timestamp))
        ? timestamp
        : importedAt;
    current.project.runs.push({
      id: runId,
      sessionId,
      label: label(record.title, record.id),
      createdAt,
      status: source?.error ? 'failed' : 'partial',
      ...(record.canonical ? { experiment: structuredClone(record.canonical) } : {}),
      artifactIds: [],
      note: `기존 ${record.kind} ${record.sourcePath}. 원본 ID=${record.sourceId ?? '지정 없음'}. ${record.canonical ? '실제 canonical 재시작 설정을 연결했습니다.' : '원본에서 실행 설정을 확인할 수 없어 생성하지 않았습니다.'} 완료 궤적을 주장하지 않습니다. ${record.issues.length ? '전용 record 보기에 미해결 사항이 있습니다.' : ''}`
    });
    const ids: string[] = [];
    if (config)
      ids.push(
        await artifact(
          record,
          runId,
          config,
          'experiment.json',
          'configuration',
          '기존 snapshot에서 변환한 실제 SI 실험 설정. 원본 엔진의 현재 상태·시각·16개 적분기 ID·허용오차·seed를 보존하는 재시작 설정입니다.'
        )
      );
    if (bytes.length <= PROJECT_LIMITS.fileBytes)
      ids.push(
        await artifact(
          record,
          runId,
          bytes,
          `${record.id}.json`,
          'attachment',
          '별도 schema pendulum-legacy-workspace-record/v1의 typed 기록과 source SHA. 새로운 분석 artifact인 것처럼 재명명하지 않습니다. 전용 legacy workspace 보기에서 표·설정·계획을 해석합니다.'
        )
      );
    else
      current.project.warnings.push(
        `${record.id}: typed record JSON이24MiB를 넘어 전체 source archive와 전용 record export에서 보존합니다. 이 part에는 해당 원본 전체가 없습니다.`
      );
    if (binary)
      ids.push(
        await artifact(
          record,
          runId,
          binary,
          record.asset!.filename,
          'attachment',
          '원본 검증된 image/ZIP bytes. series나 존재하지 않는 figure 출처를 생성하지 않았습니다. 전용 record 보기에서 실제 표시/다운로드합니다.'
        )
      );
    if (record.kind === 'external-reference') {
      const id = `missing-${record.id}`,
        path = `artifacts/missing-${id}.bin`;
      current.project.artifacts.push({
        id,
        runId,
        kind: 'attachment',
        schema: 'opaque-attachment/v1',
        filename: `${id}.bin`,
        path,
        mediaType: 'application/octet-stream',
        bytes: 0,
        sha256: '0'.repeat(64),
        status: 'missing',
        parentIds: [],
        note: '원본 session artifactManifest는 외부 경로/해시만 기록했습니다. 파일 bytes가 없어 missing으로 보존하며 네트워크/로컬 경로를 읽지 않습니다.'
      });
      current.project.runs.at(-1)!.artifactIds.push(id);
      ids.push(id);
    }
    current.project.notebook.push({
      id: `note-${record.id}`,
      title: label(record.title, record.id),
      text: `원본 종류: ${record.kind}\n원본 경로: ${record.sourcePath}\n원본 ID: ${record.sourceId ?? '없음'}\n기존 record 연결: ${record.links.join(', ') || '없음'}\n${record.issues.join('\n')}\n전체 숫자·설정·계획과 source metadata는 typed record JSON과 전용 보기에서 확인하세요.`,
      artifactIds: ids
    });
    mappings.push({ recordId: record.id, partId: current.project.id, sessionId, runId, artifactIds: ids });
    partRecords++;
  }
  for (const part of parts) {
    workspaceAbort(signal);
    await verifyResearchBundle(part);
  }
  return { parts, mappings };
}
