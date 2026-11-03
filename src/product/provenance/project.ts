import { sha256Hex, bytesToText, textToBytes } from '../../research/zipBundle';
import { validateExperimentState } from '../contracts/experiment-validation';
import {
  RESEARCH_PROJECT_SCHEMA,
  PROJECT_LIMITS,
  type ResearchProjectBundle,
  type ResearchArtifactKind,
  type ResearchArtifact,
  type AddResearchArtifactOptions,
  type CreateResearchProjectOptions,
  type CaptureResearchRunOptions
} from './contracts';
import type { DiagnosticSeries } from '../adapters/analysis/core/contracts';
import type { ExperimentStateV1 } from '../contracts/experiment';
import {
  validateResearchProject,
  validateResearchFiles,
  validateResearchSeriesDocument,
  projectId,
  projectString
} from './validation';

const freshId = (kind: string) => `${kind}-${globalThis.crypto.randomUUID()}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export function researchSeriesComplete(experiment: ExperimentStateV1, series: DiagnosticSeries | undefined): boolean {
  if (!series?.times.length || experiment.runtime.domain === 'evaluation') return false;
  const runtime = experiment.runtime,
    start = runtime.domain === 'time' ? runtime.start.value : runtime.start;
  const end = start + (runtime.domain === 'time' ? runtime.duration.value : runtime.iterations);
  const tolerance = 1e-9 * Math.max(1, Math.abs(start), Math.abs(end));
  return (
    series.times.length > 1 &&
    Math.abs(series.times[0]! - start) <= tolerance &&
    Math.abs(series.times.at(-1)! - end) <= tolerance
  );
}
export function copyResearchBundle(bundle: ResearchProjectBundle): ResearchProjectBundle {
  validateResearchProject(bundle.project);
  validateResearchFiles(bundle);
  return {
    project: clone(bundle.project),
    // Buffer.slice() retains a view of its pooled backing store; always detach
    // through the Uint8Array constructor before hashing or returning originals.
    files: bundle.files.map((file) => ({ path: file.path, data: new Uint8Array(file.data) }))
  };
}
export function createResearchProject(options: CreateResearchProjectOptions): ResearchProjectBundle {
  const timestamp = options.createdAt ?? new Date().toISOString();
  const bundle: ResearchProjectBundle = {
    project: {
      schema: RESEARCH_PROJECT_SCHEMA,
      id: options.id ?? freshId('project'),
      title: options.title,
      description: options.description ?? '',
      createdAt: timestamp,
      updatedAt: timestamp,
      software: { name: '@elliotjung/pendulum-lab', version: '10.36.0' },
      sessions: [],
      runs: [],
      artifacts: [],
      notebook: [],
      figures: [],
      citations: [],
      warnings: ['체크섬은 파일 무결성만 확인하며 원본의 진위·과학적 정확성·사람 검토를 인증하지 않습니다.']
    },
    files: []
  };
  validateResearchProject(bundle.project);
  return bundle;
}
export function addResearchSession(
  bundle: ResearchProjectBundle,
  options: { title: string; id?: string; createdAt?: string }
): ResearchProjectBundle {
  const next = copyResearchBundle(bundle),
    timestamp = options.createdAt ?? new Date().toISOString();
  next.project.sessions.push({ id: options.id ?? freshId('session'), title: options.title, createdAt: timestamp });
  next.project.updatedAt = timestamp;
  validateResearchProject(next.project);
  return next;
}

interface NativeDescription {
  kind: ResearchArtifactKind;
  schema: string;
  nativeId?: string;
  nativeInputRunId?: string;
  experiment?: unknown;
}
/** Validate native files through their original parser without rewriting their bytes. */
export async function inspectResearchArtifactBytes(
  data: Uint8Array,
  kind?: ResearchArtifactKind
): Promise<NativeDescription> {
  if (!(data instanceof Uint8Array) || data.length > PROJECT_LIMITS.fileBytes)
    throw new Error('연구 원본 파일은 최대24 MiB입니다.');
  if (kind === 'legacy' || kind === 'attachment')
    return { kind, schema: kind === 'legacy' ? 'legacy-original/v1' : 'opaque-attachment/v1' };
  const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('연구 artifact JSON이 손상되었습니다. 원본을 보존하세요.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('연구 artifact 객체가 필요합니다.');
  const body = parsed as Record<string, unknown>,
    schema = body.schema;
  let actual: ResearchArtifactKind;
  switch (schema) {
    case 'pendulum-experiment/v1': {
      const checked = validateExperimentState(parsed);
      if (!checked.ok) throw new Error('canonical experiment 파일이 유효하지 않습니다.');
      actual = 'configuration';
      break;
    }
    case 'pendulum-project-series/v1':
      validateResearchSeriesDocument(parsed);
      actual = 'series';
      break;
    case 'pendulum-core-diagnostic/v1':
      (await import('../adapters/analysis/core/artifact')).importCoreDiagnosticArtifact(text);
      actual = 'core';
      break;
    case 'pendulum-advanced-diagnostic/v1':
      (await import('../adapters/analysis/advanced/artifact')).importAdvancedDiagnosticArtifact(text);
      actual = 'advanced';
      break;
    case 'pendulum-stability-workflow/v1':
      (await import('../adapters/analysis/stability/artifact')).importStabilityArtifact(text);
      actual = 'stability';
      break;
    case 'pendulum-batch/v1':
      (await import('../lab/experiments/artifact')).parseBatch(text);
      actual = 'batch';
      break;
    case 'pendulum-inverse-result/v1':
      await (await import('../adapters/analysis/inverse/artifact')).importInverseResult(text);
      actual = 'inverse';
      break;
    case 'pendulum-data-driven-result/v1':
      await (await import('../adapters/analysis/data-driven/artifact')).parseDataDrivenResult(text);
      actual = 'data-driven';
      break;
    case 'pendulum-observation/v1':
      await (await import('../observations/artifact')).parseObservationArtifact(text);
      actual = 'observation';
      break;
    default:
      throw new Error('지원하지 않는 연구 artifact schema입니다. 기존 research ZIP은 호환 가져오기를 사용하세요.');
  }
  if (kind !== undefined && kind !== actual) throw new Error('artifact 종류와 원본 schema가 다릅니다.');
  const request = body.request as Record<string, unknown> | undefined;
  const nativeId = body.artifactId ?? body.id,
    nativeInputRunId = body.inputRunId ?? body.inputId;
  return {
    kind: actual,
    schema: String(schema),
    ...(typeof nativeId === 'string' ? { nativeId } : {}),
    ...(typeof nativeInputRunId === 'string' ? { nativeInputRunId } : {}),
    ...(actual === 'configuration'
      ? { experiment: parsed }
      : body.experiment !== undefined
        ? { experiment: body.experiment }
        : request?.experiment !== undefined
          ? { experiment: request.experiment }
          : {})
  };
}
function ordered(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(ordered).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${ordered((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}
export async function addResearchArtifact(
  bundle: ResearchProjectBundle,
  options: AddResearchArtifactOptions
): Promise<ResearchProjectBundle> {
  const next = copyResearchBundle(bundle),
    run = next.project.runs.find((entry) => entry.id === options.runId);
  if (!run) throw new Error('artifact를 연결할 run이 없습니다.');
  projectString(options.filename, 128);
  if (!(options.data instanceof Uint8Array) || options.data.length > PROJECT_LIMITS.fileBytes)
    throw new Error('연구 원본 파일은 최대24 MiB입니다.');
  const data = new Uint8Array(options.data);
  const description = await inspectResearchArtifactBytes(data, options.kind);
  if (run.experiment && description.experiment && ordered(run.experiment) !== ordered(description.experiment))
    throw new Error('첨부 artifact의 원본 실험 설정이 선택한 run과 다릅니다. 원 run을 따로 캡처하세요.');
  const sha256 = await sha256Hex(data),
    id = `artifact-${sha256.slice(0, 24)}-${next.project.artifacts.length}`;
  const { experiment: _experiment, ...metadata } = description;
  const artifact: ResearchArtifact = {
    ...metadata,
    id,
    runId: run.id,
    filename: options.filename,
    path: `artifacts/${id}.${description.kind === 'legacy' ? 'zip' : description.kind === 'attachment' ? 'bin' : 'json'}`,
    mediaType:
      options.mediaType ??
      (description.kind === 'legacy'
        ? 'application/zip'
        : description.kind === 'attachment'
          ? 'application/octet-stream'
          : 'application/json'),
    bytes: data.length,
    sha256,
    status: 'present',
    parentIds: options.parentIds ? [...options.parentIds] : [],
    note:
      options.note ??
      (description.kind === 'legacy' || description.kind === 'attachment'
        ? '원본 bytes를 보존한 첨부입니다. 실행·과학 검증 또는 canonical migration을 주장하지 않습니다.'
        : '원본 파일과 native 계보를 보존합니다. 프로젝트 연결은 사용자가 지정한 기록입니다.')
  };
  next.project.artifacts.push(artifact);
  run.artifactIds.push(id);
  next.files.push({ path: artifact.path, data });
  next.project.updatedAt = new Date().toISOString();
  validateResearchProject(next.project);
  validateResearchFiles(next);
  return next;
}
export async function captureResearchRun(
  bundle: ResearchProjectBundle,
  options: CaptureResearchRunOptions
): Promise<ResearchProjectBundle> {
  let next = copyResearchBundle(bundle);
  const checked = validateExperimentState(options.experiment);
  if (!checked.ok) throw new Error('캡처할 canonical 실험 설정이 유효하지 않습니다.');
  const hasSamples = !!options.series?.times.length;
  const complete = researchSeriesComplete(checked.value, options.series);
  if (options.status === 'completed' && !complete)
    throw new Error('실제 표본이 시작부터 종료까지 도달하지 않아 완료 run으로 기록할 수 없습니다.');
  const id = options.id ?? freshId('run');
  projectId(id);
  next.project.runs.push({
    id,
    sessionId: options.sessionId,
    label: options.label,
    createdAt: options.createdAt ?? new Date().toISOString(),
    experiment: clone(checked.value),
    status: options.status ?? (complete ? 'completed' : 'partial'),
    artifactIds: [],
    note: hasSamples
      ? `클릭 시점의 기록 표본 ${options.series!.times.length}개와 입력을 복사했습니다. 전체 궤적·새 계산·장기 재현성을 보장하지 않습니다.`
      : '설정만 캡처했습니다. 원본 표본과 계산 결과가 없는 partial run입니다.'
  });
  validateResearchProject(next.project);
  next = await addResearchArtifact(next, {
    runId: id,
    filename: 'experiment.json',
    data: textToBytes(JSON.stringify(checked.value, null, 2)),
    kind: 'configuration',
    note: '캡처한 canonical 설정. SI 값·단위·seed·적분·model/schema version을 보존합니다.'
  });
  const configId = next.project.artifacts.at(-1)!.id;
  if (hasSamples)
    next = await addResearchArtifact(next, {
      runId: id,
      filename: 'series.json',
      data: textToBytes(
        JSON.stringify(
          { schema: 'pendulum-project-series/v1', experiment: checked.value, series: options.series },
          null,
          2
        )
      ),
      kind: 'series',
      parentIds: [configId],
      note: '실제 기록 표본을 순서·시간축·좌표·단위와 함께 복사했습니다. 보간·단위 재명명·재계산하지 않았습니다.'
    });
  return next;
}
export function readResearchArtifact(bundle: ResearchProjectBundle, artifactId: string): unknown {
  const artifact = bundle.project.artifacts.find((entry) => entry.id === artifactId);
  if (!artifact || artifact.status !== 'present') throw new Error('요청한 artifact가 누락되었습니다.');
  const file = bundle.files.find((entry) => entry.path === artifact.path);
  if (!file) throw new Error('present artifact 원본 파일이 없습니다.');
  if (artifact.kind === 'legacy' || artifact.kind === 'attachment')
    throw new Error('이 첨부는 실행하거나 JSON으로 해석하지 않는 원본 bytes입니다.');
  return JSON.parse(bytesToText(file.data)) as unknown;
}
export async function verifyResearchBundle(input: ResearchProjectBundle): Promise<ResearchProjectBundle> {
  // A detached plain-byte snapshot avoids Buffer backing-store hashing and
  // caller mutation while asynchronous native validation is in progress.
  const bundle = copyResearchBundle(input);
  const files = new Map(bundle.files.map((file) => [file.path, file.data]));
  for (const artifact of bundle.project.artifacts) {
    if (artifact.status === 'missing') continue;
    const data = files.get(artifact.path)!;
    if (data.length !== artifact.bytes || (await sha256Hex(data)) !== artifact.sha256)
      throw new Error('연구 artifact bytes·SHA256 checksum이 다릅니다. 원본을 보존하세요.');
    const description = await inspectResearchArtifactBytes(data, artifact.kind);
    if (
      description.schema !== artifact.schema ||
      description.nativeId !== artifact.nativeId ||
      description.nativeInputRunId !== artifact.nativeInputRunId
    )
      throw new Error('연구 manifest와 원본 native schema·계보가 다릅니다.');
    const run = bundle.project.runs.find((entry) => entry.id === artifact.runId)!;
    if (run.experiment && description.experiment && ordered(run.experiment) !== ordered(description.experiment))
      throw new Error('연구 artifact 원본 설정과 run이 다릅니다.');
  }
  for (const figure of bundle.project.figures) {
    const source = bundle.project.artifacts.find((artifact) => artifact.id === figure.sourceArtifactId)!;
    if (source.status === 'missing') continue;
    const document = validateResearchSeriesDocument(readResearchArtifact(bundle, source.id));
    if (figure.xColumn >= document.series.labels.length || figure.yColumn >= document.series.labels.length)
      throw new Error('figure가 원본 series에 없는 좌표를 참조합니다.');
  }
  for (const run of bundle.project.runs) {
    if (run.status !== 'completed' || !run.experiment) continue;
    const series = bundle.project.artifacts.filter(
      (artifact) => artifact.runId === run.id && artifact.kind === 'series'
    );
    if (
      !series.length ||
      series.every(
        (artifact) =>
          artifact.status === 'present' &&
          !researchSeriesComplete(
            run.experiment!,
            validateResearchSeriesDocument(readResearchArtifact(bundle, artifact.id)).series
          )
      )
    )
      throw new Error('완료 run에는 시작부터 종료까지 도달한 원본 표본이 필요합니다.');
  }
  return bundle;
}
