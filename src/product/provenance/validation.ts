import { validateExperimentState } from '../contracts/experiment-validation';
import { validateArtifactData } from '../adapters/analysis/core/artifact-validation';
import { validateDiagnosticSeries } from '../adapters/analysis/core/validation';
import { createDiagnosticSeries } from '../adapters/analysis/core/source';
import {
  PROJECT_LIMITS,
  RESEARCH_PROJECT_SCHEMA,
  type ResearchProject,
  type ResearchProjectBundle,
  type ResearchSeriesDocument
} from './contracts';

const encoder = new TextEncoder();
const kinds = [
  'configuration',
  'series',
  'core',
  'advanced',
  'stability',
  'batch',
  'inverse',
  'data-driven',
  'observation',
  'legacy',
  'attachment'
];
export function projectRecord(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('연구 객체가 필요합니다.');
}
export function projectFields(value: unknown, required: string[], optional: string[] = []): void {
  projectRecord(value);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))
  )
    throw new Error('연구 데이터에 누락되었거나 지원하지 않는 필드가 있습니다.');
}
export function projectString(value: unknown, max = 4000, empty = false): asserts value is string {
  if (
    typeof value !== 'string' ||
    (!empty && !value.trim()) ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)
  )
    throw new Error('연구 텍스트 길이·제어 문자를 확인하세요.');
}
export function projectId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(value))
    throw new Error('연구 ID가 유효하지 않습니다.');
}
function date(value: unknown): void {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/u.test(value) || !Number.isFinite(Date.parse(value)))
    throw new Error('연구 생성 시각이 유효하지 않습니다.');
}
function list(value: unknown, max: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('연구 목록 제한을 초과했습니다.');
}
function ids(value: unknown, max = PROJECT_LIMITS.artifacts): string[] {
  list(value, max);
  value.forEach(projectId);
  if (new Set(value).size !== value.length) throw new Error('연구 참조 ID가 중복되었습니다.');
  return value as string[];
}
/** Stricter portable paths also reject Windows streams, device names and aliases. */
export function safeResearchPath(path: unknown): asserts path is string {
  if (
    typeof path !== 'string' ||
    path.length > 240 ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(path) ||
    path
      .split('/')
      .some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          /[. ]$/u.test(part) ||
          /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part)
      )
  )
    throw new Error('안전하지 않은 연구 archive 경로입니다.');
}
/** Inspect descriptors before reading values: no getters, inherited data or JSON hooks. */
export function inspectProjectData(input: unknown): void {
  let nodes = 0;
  const ancestors = new Set<object>();
  const visit = (value: unknown, depth: number): void => {
    if (++nodes > 160_000 || depth > 28) throw new Error('연구 manifest 구조가 너무 큽니다.');
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value === 'string') {
      projectString(value, 16_384, true);
      return;
    }
    if (!value || typeof value !== 'object' || ancestors.has(value))
      throw new Error('연구 manifest는 유한 JSON 데이터여야 합니다.');
    const array = Array.isArray(value),
      proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null)
      throw new Error('연구 manifest에는 일반 객체만 허용합니다.');
    const descriptors = Object.getOwnPropertyDescriptors(value),
      keys = Reflect.ownKeys(descriptors);
    const length = array ? (descriptors.length!.value as number) : 0;
    if (array ? length > 4096 || keys.length !== length + 1 : keys.length > 256)
      throw new Error('연구 manifest 배열·객체 제한을 초과했습니다.');
    ancestors.add(value);
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key))
        throw new Error('위험한 연구 속성입니다.');
      const descriptor = descriptors[key]!;
      if (!('value' in descriptor) || !descriptor.enumerable || (array && !/^(?:0|[1-9][0-9]*)$/u.test(key)))
        throw new Error('연구 manifest는 접근자·숨김 속성·희소 배열을 지원하지 않습니다.');
      visit(descriptor.value, depth + 1);
    }
    ancestors.delete(value);
  };
  visit(input, 0);
  if (encoder.encode(JSON.stringify(input)).length > PROJECT_LIMITS.manifestBytes)
    throw new Error('연구 manifest는 최대2 MiB입니다.');
}
export function validateResearchProject(input: unknown): ResearchProject {
  inspectProjectData(input);
  projectFields(input, [
    'schema',
    'id',
    'title',
    'description',
    'createdAt',
    'updatedAt',
    'software',
    'sessions',
    'runs',
    'artifacts',
    'notebook',
    'figures',
    'citations',
    'warnings'
  ]);
  const project = input as unknown as ResearchProject;
  if (project.schema !== RESEARCH_PROJECT_SCHEMA)
    throw new Error('지원하지 않는 연구 project 버전입니다. 원본을 보존하세요.');
  projectId(project.id);
  projectString(project.title, 160);
  projectString(project.description, 8000, true);
  date(project.createdAt);
  date(project.updatedAt);
  projectFields(project.software, ['name', 'version']);
  projectString(project.software.name, 160);
  projectString(project.software.version, 160);
  list(project.sessions, PROJECT_LIMITS.sessions);
  list(project.runs, PROJECT_LIMITS.runs);
  list(project.artifacts, PROJECT_LIMITS.artifacts);
  list(project.notebook, PROJECT_LIMITS.notebook);
  list(project.figures, PROJECT_LIMITS.figures);
  list(project.citations, 128);
  list(project.warnings, 128);
  project.warnings.forEach((warning) => projectString(warning, 4000));
  const allIds = new Set<string>();
  const unique = (id: string) => {
    projectId(id);
    if (allIds.has(id)) throw new Error('연구 ID가 중복되었습니다.');
    allIds.add(id);
  };
  for (const session of project.sessions) {
    projectFields(session, ['id', 'title', 'createdAt']);
    unique(session.id);
    projectString(session.title, 160);
    date(session.createdAt);
  }
  const sessionIds = new Set(project.sessions.map((session) => session.id));
  for (const run of project.runs) {
    projectFields(run, ['id', 'sessionId', 'label', 'createdAt', 'status', 'artifactIds', 'note'], ['experiment']);
    unique(run.id);
    projectString(run.label, 160);
    projectString(run.note, 4000, true);
    date(run.createdAt);
    ids(run.artifactIds);
    if (!sessionIds.has(run.sessionId) || !['completed', 'partial', 'failed'].includes(run.status))
      throw new Error('연구 run의 session·상태가 유효하지 않습니다.');
    if (run.experiment !== undefined && !validateExperimentState(run.experiment).ok)
      throw new Error('연구 run의 canonical 입력이 유효하지 않습니다.');
  }
  const runs = new Map(project.runs.map((run) => [run.id, run]));
  const paths = new Set<string>();
  for (const artifact of project.artifacts) {
    projectFields(
      artifact,
      [
        'id',
        'runId',
        'kind',
        'schema',
        'filename',
        'path',
        'mediaType',
        'bytes',
        'sha256',
        'status',
        'parentIds',
        'note'
      ],
      ['nativeId', 'nativeInputRunId']
    );
    unique(artifact.id);
    safeResearchPath(artifact.path);
    projectString(artifact.filename, 128);
    if (!artifact.path.startsWith('artifacts/')) throw new Error('원본 artifact는 artifacts/ 안에 있어야 합니다.');
    if (/[\\/:]/u.test(artifact.filename) || artifact.filename === '.' || artifact.filename === '..')
      throw new Error('artifact 파일명에는 경로를 넣을 수 없습니다.');
    projectString(artifact.schema, 160);
    projectString(artifact.mediaType, 128);
    projectString(artifact.note, 4000, true);
    ids(artifact.parentIds);
    for (const field of ['nativeId', 'nativeInputRunId'] as const)
      if (artifact[field] !== undefined) projectString(artifact[field], 256);
    if (
      !runs.has(artifact.runId) ||
      !kinds.includes(artifact.kind) ||
      !['present', 'missing'].includes(artifact.status) ||
      !Number.isSafeInteger(artifact.bytes) ||
      artifact.bytes < 0 ||
      artifact.bytes > PROJECT_LIMITS.fileBytes ||
      !/^[a-f0-9]{64}$/u.test(artifact.sha256) ||
      (artifact.status === 'missing' && !artifact.note.trim())
    )
      throw new Error('artifact 계보·크기·checksum·누락 사유가 유효하지 않습니다.');
    const key = artifact.path.toLowerCase();
    if (paths.has(key)) throw new Error('artifact 경로가 중복되었습니다.');
    paths.add(key);
    if (!runs.get(artifact.runId)!.artifactIds.includes(artifact.id))
      throw new Error('run과 artifact의 양방향 참조가 다릅니다.');
  }
  const artifacts = new Map(project.artifacts.map((artifact) => [artifact.id, artifact]));
  for (const run of project.runs)
    for (const id of run.artifactIds)
      if (artifacts.get(id)?.runId !== run.id) throw new Error('run에 없거나 다른 run의 artifact가 연결되었습니다.');
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error('artifact 계보에 순환이 있습니다.');
    if (visited.has(id)) return;
    const artifact = artifacts.get(id);
    if (!artifact) throw new Error('artifact 계보의 부모가 없습니다.');
    visiting.add(id);
    artifact.parentIds.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  project.artifacts.forEach((artifact) => visit(artifact.id));
  for (const cell of project.notebook) {
    projectFields(cell, ['id', 'title', 'text', 'artifactIds']);
    unique(cell.id);
    projectString(cell.title, 160);
    projectString(cell.text, 16_384, true);
    for (const id of ids(cell.artifactIds))
      if (!artifacts.has(id)) throw new Error('notebook이 없는 artifact를 참조합니다.');
  }
  for (const figure of project.figures) {
    projectFields(figure, ['id', 'title', 'caption', 'runId', 'sourceArtifactId', 'xColumn', 'yColumn', 'theme']);
    unique(figure.id);
    projectString(figure.title, 160);
    projectString(figure.caption, 4000, true);
    const source = artifacts.get(figure.sourceArtifactId);
    if (
      !source ||
      source.runId !== figure.runId ||
      source.kind !== 'series' ||
      !Number.isInteger(figure.xColumn) ||
      figure.xColumn < -1 ||
      !Number.isInteger(figure.yColumn) ||
      figure.yColumn < 0 ||
      !['light', 'dark', 'print', 'colorblind'].includes(figure.theme)
    )
      throw new Error('figure의 원 run·series·좌표·theme가 유효하지 않습니다.');
  }
  for (const citation of project.citations) {
    projectFields(citation, ['id', 'text', 'url']);
    unique(citation.id);
    projectString(citation.text, 4000);
    projectString(citation.url, 2048, true);
    if (citation.url && !/^https?:\/\/[^\s]+$/u.test(citation.url))
      throw new Error('참고문헌 URL은 http(s)여야 합니다.');
  }
  return project;
}

export function validateResearchSeriesDocument(input: unknown): ResearchSeriesDocument {
  validateArtifactData(input);
  projectFields(input, ['schema', 'experiment', 'series']);
  const document = input as ResearchSeriesDocument;
  if (document.schema !== 'pendulum-project-series/v1' || !validateExperimentState(document.experiment).ok)
    throw new Error('연구 series의 버전·canonical 입력이 유효하지 않습니다.');
  projectFields(
    document.series,
    ['axisUnit', 'labels', 'units', 'times', 'states', 'warnings'],
    ['energy', 'energyUnit']
  );
  validateDiagnosticSeries(document.series);
  if (!document.series.times.length || !document.series.labels.length)
    throw new Error('연구 series에는 실제 기록 표본과 좌표가 필요합니다.');
  const expected = createDiagnosticSeries(document.experiment, []);
  if (
    JSON.stringify(document.series.labels) !== JSON.stringify(expected.labels) ||
    JSON.stringify(document.series.units) !== JSON.stringify(expected.units) ||
    document.series.axisUnit !== expected.axisUnit ||
    (document.series.energy !== undefined && document.series.energyUnit !== expected.energyUnit)
  )
    throw new Error('연구 series 좌표·단위·축이 원본 adapter의 물리적 의미와 다릅니다.');
  return document;
}

export function validateResearchFiles(bundle: ResearchProjectBundle): void {
  if (!Array.isArray(bundle.files) || bundle.files.length > PROJECT_LIMITS.files)
    throw new Error('연구 파일 개수 제한을 초과했습니다.');
  const paths = new Set<string>();
  let total = 0;
  for (const file of bundle.files) {
    safeResearchPath(file.path);
    if (!(file.data instanceof Uint8Array) || file.data.length > PROJECT_LIMITS.fileBytes)
      throw new Error('연구 원본 파일은 최대24 MiB입니다.');
    const key = file.path.toLowerCase();
    if (paths.has(key)) throw new Error('연구 파일 경로가 중복되었습니다.');
    paths.add(key);
    total += file.data.length;
  }
  if (total > PROJECT_LIMITS.archiveBytes) throw new Error('연구 파일 합계는 최대64 MiB입니다.');
  const expected = new Set(
    bundle.project.artifacts.filter((artifact) => artifact.status === 'present').map((artifact) => artifact.path)
  );
  if (bundle.files.length !== expected.size || bundle.files.some((file) => !expected.has(file.path)))
    throw new Error('연구 원본 파일과 present artifact 목록이 다릅니다.');
}
