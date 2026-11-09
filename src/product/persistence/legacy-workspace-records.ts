import type { ResearchDbArchive } from '../../research/researchDb';
import { RESEARCH_DB_STORES } from '../../research/researchDb';
import { sha256Hex } from '../../research/zipBundle';
import { readResearchZip } from '../provenance/package';
import { PROJECT_LIMITS } from '../provenance/contracts';
import { migrateLegacySession } from './legacy-migration-session';
import type { JsonValue } from './safe-data';
import {
  workspaceAbort,
  type LegacyWorkspaceOptions,
  type LegacyWorkspaceRecord,
  type LegacyWorkspaceRecordKind
} from './legacy-workspace-contracts';

export const workspaceRecord = (value: unknown): value is Record<string, JsonValue> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function validateWorkspaceNumbers(value: unknown): void {
  const pending = [value];
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === 'number' && (!Number.isFinite(item) || Object.is(item, -0)))
      throw new Error('유한하지 않은 숫자 또는 음의0을 보정하지 않았습니다. 원본을 보존하세요.');
    if (item && typeof item === 'object') for (const child of Object.values(item)) pending.push(child);
  }
}
interface Draft {
  path: string;
  kind: LegacyWorkspaceRecordKind;
  payload: JsonValue;
  parentId: string | null;
  fallbackId?: string;
  sourceMetadata?: JsonValue;
}
export function extractWorkspaceRecords(value: Record<string, JsonValue>, kind: 'workspace' | 'research-db'): Draft[] {
  const output: Draft[] = [];
  function add(
    path: string,
    recordKind: LegacyWorkspaceRecordKind,
    payload: JsonValue,
    parentId: string | null = null,
    fallbackId?: string
  ): string {
    const id = `legacy-record-${output.length}`;
    output.push({ path, kind: recordKind, payload, parentId, ...(fallbackId ? { fallbackId } : {}) });
    return id;
  }
  function list(
    parent: Record<string, JsonValue>,
    key: string,
    path: string,
    recordKind: LegacyWorkspaceRecordKind,
    owner: string | null = null
  ) {
    if (!Object.hasOwn(parent, key) || parent[key] === null) return;
    const values = parent[key];
    if (!Array.isArray(values)) throw new Error(`${path}.${key}: 배열이 필요합니다. 빈 목록으로 대체하지 않았습니다.`);
    values.forEach((item, index) => {
      const child = add(`${path}.${key}[${index}]`, recordKind, item, owner);
      if (recordKind === 'session' && workspaceRecord(item))
        list(item, 'artifactManifest', `${path}.${key}[${index}]`, 'external-reference', child);
      if (recordKind === 'plan' && workspaceRecord(item)) {
        list(item, 'experiments', `${path}.${key}[${index}]`, 'point', child);
        list(item, 'points', `${path}.${key}[${index}]`, 'point', child);
      }
    });
  }
  function research(source: Record<string, JsonValue>, path: string, owner: string | null = null) {
    const header = Object.fromEntries(
      Object.entries(source).filter(([key]) =>
        ['schemaVersion', 'savedAt', 'migrations', 'droppedEntries'].includes(key)
      )
    );
    if (Object.keys(header).length) add(`${path} (storage metadata)`, 'settings', header, owner);
    for (const [key, recordKind] of [
      ['project', 'project'],
      ['workspace', 'workspace'],
      ['layout', 'settings'],
      ['batchCheckpoint', 'settings'],
      ['selectedExperimentId', 'settings']
    ] as const)
      if (Object.hasOwn(source, key) && source[key] !== null) add(`${path}.${key}`, recordKind, source[key]!, owner);
    for (const [key, recordKind] of [
      ['sessions', 'session'],
      ['workspaces', 'workspace'],
      ['experiments', 'experiment'],
      ['runLog', 'run-log'],
      ['comparisonRows', 'metrics']
    ] as const)
      list(source, key, path, recordKind, owner);
    if (source.parameterStudy !== undefined && source.parameterStudy !== null) {
      const plan = add(`${path}.parameterStudy`, 'plan', source.parameterStudy, owner);
      if (workspaceRecord(source.parameterStudy))
        list(source.parameterStudy, 'experiments', `${path}.parameterStudy`, 'point', plan);
    }
    const known = new Set([
      'schemaVersion',
      'savedAt',
      'migrations',
      'droppedEntries',
      'project',
      'workspace',
      'layout',
      'batchCheckpoint',
      'selectedExperimentId',
      'sessions',
      'workspaces',
      'experiments',
      'runLog',
      'comparisonRows',
      'parameterStudy'
    ]);
    for (const [key, item] of Object.entries(source))
      if (!known.has(key)) add(`${path}.${key}`, 'unknown', item, owner);
  }
  if (kind === 'research-db') {
    const archive = value as unknown as ResearchDbArchive;
    add(
      '$ (archive metadata)',
      'settings',
      Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'stores' && key !== 'recovery'))
    );
    for (const store of RESEARCH_DB_STORES)
      for (const [index, record] of (archive.stores[store] ?? []).entries()) {
        const recordKind: LegacyWorkspaceRecordKind = (
          {
            experiments: 'experiment',
            runLog: 'run-log',
            parameterStudies: 'plan',
            studyResults: 'metrics',
            figures: 'image',
            bundles: 'archive',
            settings: 'settings'
          } as const
        )[store];
        const path = `$.stores.${store}[${index}].payload`;
        const id = add(path, recordKind, record.payload as JsonValue, null, record.id);
        output.at(-1)!.sourceMetadata = Object.fromEntries(
          Object.entries(record).filter(([key]) => key !== 'payload')
        ) as JsonValue;
        if (recordKind === 'plan' && workspaceRecord(record.payload)) {
          list(record.payload, 'experiments', path, 'point', id);
          list(record.payload, 'points', path, 'point', id);
        }
        if (store === 'settings' && record.id === 'workbench-state' && workspaceRecord(record.payload))
          research(record.payload, path, id);
      }
    if (Object.hasOwn(value, 'recovery')) add('$.recovery', 'settings', value.recovery!);
  } else {
    if (!workspaceRecord(value.research)) throw new Error('기존 research 객체가 필요합니다.');
    add(
      '$ (workspace metadata)',
      'settings',
      Object.fromEntries(Object.entries(value).filter(([key]) => ['schemaVersion', 'savedAt'].includes(key)))
    );
    research(value.research, '$.research');
    if (value.snapshot !== undefined && value.snapshot !== null)
      add('$.snapshot', 'experiment', { snapshot: value.snapshot, name: '가져온 live snapshot' });
    if (value.designStudy !== undefined && value.designStudy !== null) {
      const id = add('$.designStudy', 'plan', value.designStudy);
      if (workspaceRecord(value.designStudy)) list(value.designStudy, 'points', '$.designStudy', 'point', id);
    }
    if (value.figureCaptions !== undefined) add('$.figureCaptions', 'settings', value.figureCaptions);
    for (const [key, item] of Object.entries(value))
      if (!['schemaVersion', 'savedAt', 'research', 'snapshot', 'designStudy', 'figureCaptions'].includes(key))
        add(`$.${key}`, 'unknown', item);
  }
  if (!output.length) add('$', 'settings', value);
  return output;
}

function imageBytes(payload: Record<string, JsonValue>): { bytes: Uint8Array; mime: string } | null {
  if (typeof payload.dataUrl !== 'string') return null;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(payload.dataUrl);
  if (!match) throw new Error('이미지는 PNG/JPEG/WebP base64만 지원합니다. SVG·HTML을 실행하지 않습니다.');
  const binary = atob(match[2]!);
  if (btoa(binary) !== match[2]) throw new Error('이미지 base64가 비표준 형식입니다.');
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const mime = match[1]!;
  if (bytes.length > PROJECT_LIMITS.fileBytes || !bytes.length) throw new Error('이미지 크기 제한을 넘습니다.');
  const signature =
    mime === 'image/png'
      ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
      : mime === 'image/jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217
        : new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' &&
          new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP';
  if (!signature) throw new Error('이미지의 실제 서명이 MIME과 다릅니다.');
  return { bytes, mime };
}
function archiveBytes(value: JsonValue | undefined): Uint8Array | null {
  if (!value || typeof value !== 'object') return null;
  const entries = Array.isArray(value) ? value : Object.values(value);
  if (entries.length > PROJECT_LIMITS.fileBytes) throw new Error('기존 ZIP 개별 크기 제한을 넘습니다.');
  if (!Array.isArray(value) && Object.keys(value).some((key, index) => key !== String(index)))
    throw new Error('기존 ZIP bytes 키가 연속되지 않습니다.');
  if (entries.some((byte) => typeof byte !== 'number' || !Number.isInteger(byte) || byte < 0 || byte > 255))
    throw new Error('기존 ZIP byte 배열이 유효하지 않습니다.');
  const bytes = Uint8Array.from(entries as number[]);
  readResearchZip(bytes);
  return bytes;
}

export async function mapWorkspaceRecords(drafts: Draft[], options: LegacyWorkspaceOptions, signal?: AbortSignal) {
  const records: LegacyWorkspaceRecord[] = [];
  const assets = new Map<string, Uint8Array>();
  for (const [index, draft] of drafts.entries()) {
    workspaceAbort(signal);
    const id = `legacy-record-${index}`,
      payload = workspaceRecord(draft.payload) ? draft.payload : null;
    const sourceId = payload && typeof payload.id === 'string' ? payload.id : (draft.fallbackId ?? null);
    const title =
      payload && typeof (payload.name ?? payload.label ?? payload.title ?? payload.caption) === 'string'
        ? String(payload.name ?? payload.label ?? payload.title ?? payload.caption)
        : `${draft.kind} ${sourceId ?? index + 1}`;
    const issues: string[] = [];
    let canonical: LegacyWorkspaceRecord['canonical'] = null,
      asset: LegacyWorkspaceRecord['asset'] = null;
    const snapshot =
      payload?.snapshot ??
      (payload?.schemaVersion === 'pendulum-session/v11-ts' || payload?.schemaVersion === 'pendulum-session/v10-ts'
        ? payload
        : undefined);
    if (snapshot !== undefined) {
      const result = migrateLegacySession(snapshot, options.durationSeconds, `${options.sourceId}-${index}`);
      if (result.ok) canonical = result.value.canonical;
      else issues.push(...result.issues.map((issue) => `${issue.path}: ${issue.message}`));
    } else if (draft.kind === 'experiment')
      issues.push('원본 experiment에 snapshot이 없습니다. 물리 설정이나 완료 run을 만들어내지 않았습니다.');
    else if (draft.kind === 'point')
      issues.push(
        '원본 point에 실행 snapshot이 없습니다. 현재 live snapshot을 과거 point의 입력으로 추측하지 않았습니다. 값·계획·결과를 typed record로 보존합니다.'
      );
    if (draft.kind === 'unknown')
      issues.push('지원하는 원본 의미가 정의되지 않은 필드입니다. 원본 값을 그대로 표시/내보내며 실행하지 않습니다.');
    try {
      const binary =
        payload && draft.kind === 'image'
          ? imageBytes(payload)
          : payload && draft.kind === 'archive'
            ? (() => {
                const bytes = archiveBytes(payload.zip);
                return bytes ? { bytes, mime: 'application/zip' } : null;
              })()
            : null;
      if (binary) {
        const extension = binary.mime === 'application/zip' ? 'zip' : binary.mime.split('/')[1]!;
        asset = {
          filename: `${id}.${extension}`,
          mediaType: binary.mime,
          bytes: binary.bytes.length,
          sha256: await sha256Hex(binary.bytes)
        };
        assets.set(id, binary.bytes);
      } else if (draft.kind === 'image' || draft.kind === 'archive')
        issues.push(
          '원본에 읽을 수 있는 image/ZIP bytes가 없습니다. typed 원본 record와 source archive 참조를 보존했습니다.'
        );
    } catch (cause) {
      issues.push(cause instanceof Error ? cause.message : 'binary 원본을 읽을 수 없습니다.');
    }
    records.push({
      id,
      sourcePath: draft.path,
      sourceId,
      kind: draft.kind,
      title,
      payload: draft.payload,
      sourceMetadata: draft.sourceMetadata ?? null,
      parentId: draft.parentId,
      links: [],
      canonical,
      status: issues.length ? 'unresolved' : 'mapped',
      issues,
      asset
    });
    if (index % 32 === 31) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const bySource = new Map<string, string[]>();
  for (const record of records)
    if (record.sourceId) bySource.set(record.sourceId, [...(bySource.get(record.sourceId) ?? []), record.id]);
  return {
    records: records.map((record) => {
      const payload = workspaceRecord(record.payload) ? record.payload : null;
      const issues = [...record.issues],
        references: string[] = [];
      const reference = (key: string, value: string) => {
        const targets = bySource.get(value) ?? [];
        if (!targets.length)
          issues.push(
            `${key}: 원본 참조 ID ${value}의 대상이 없습니다. 관계를 만들거나 다른 ID로 대체하지 않았습니다.`
          );
        references.push(...targets);
      };
      for (const key of ['experimentId', 'projectId', 'studyId', 'pointId', 'activeSessionId'])
        if (typeof payload?.[key] === 'string') reference(key, payload[key] as string);
      for (const key of ['sessionIds', 'pinnedRunIds', 'comparisonHistory'])
        if (Array.isArray(payload?.[key]))
          for (const value of payload[key]) if (typeof value === 'string') reference(key, value);
      let canonical = record.canonical;
      if (record.kind === 'run-log' && payload && typeof payload.experimentId === 'string') {
        const experiment = records.find(
          (entry) => entry.kind === 'experiment' && entry.sourceId === payload.experimentId
        );
        const source =
          experiment && workspaceRecord(experiment.payload) && workspaceRecord(experiment.payload.snapshot)
            ? experiment.payload.snapshot
            : null;
        if (
          experiment?.canonical &&
          source &&
          payload.snapshotHash === source.hash &&
          payload.method === source.method &&
          payload.system === source.systemType &&
          payload.dt === source.dt &&
          payload.damping === source.damping
        )
          canonical = structuredClone(experiment.canonical);
        else
          issues.push(
            '과거 run log의 hash·method·system·dt·damping을 참조 experiment와 모두 대조할 수 없어 실행 입력을 만들어내지 않았습니다.'
          );
      }
      return {
        ...record,
        canonical,
        issues,
        status: issues.length ? ('unresolved' as const) : ('mapped' as const),
        links: [...new Set([...(record.parentId ? [record.parentId] : []), ...references])]
      };
    }),
    assets
  };
}
