import { bytesToText, sha256Hex } from '../../research/zipBundle';
import type { ResearchProjectBundle } from './contracts';
import { PROJECT_LIMITS } from './contracts';
import { createResearchProject, addResearchSession, verifyResearchBundle } from './project';
import { isResearchPackage, readResearchZip, verifyResearchChecksums } from './package';
import { projectRecord } from './validation';

/** Read-only bridge: retain the original legacy ZIP and every member without inventing canonical runs. */
export async function importLegacyResearchPackage(bytes: Uint8Array): Promise<ResearchProjectBundle> {
  const entries = readResearchZip(bytes);
  bytes = new Uint8Array(bytes);
  if (isResearchPackage(entries)) throw new Error('새 project ZIP의 오류를 legacy 가져오기로 우회할 수 없습니다.');
  await verifyResearchChecksums(entries);
  const paper = entries.find((entry) => entry.path === 'paper/paper-pack.json');
  const submission = entries.find((entry) => entry.path === 'manifest/submission.json');
  if (!paper || !submission || entries.length + 1 > PROJECT_LIMITS.artifacts)
    throw new Error('지원하는 기존 research ZIP 구조·파일 수가 아닙니다.');
  const pack: unknown = JSON.parse(bytesToText(paper.data)),
    manifest: unknown = JSON.parse(bytesToText(submission.data));
  projectRecord(pack);
  projectRecord(manifest);
  if (
    pack.schemaVersion !== 'pendulum-paper-pack/v2' ||
    manifest.schemaVersion !== 'pendulum-submission/v10-ts' ||
    !pack.currentSnapshot ||
    typeof pack.currentSnapshot !== 'object' ||
    typeof pack.methodsMarkdown !== 'string'
  )
    throw new Error('기존 paper pack/submission schema가 유효하지 않습니다.');
  if (bytes.length > PROJECT_LIMITS.fileBytes)
    throw new Error('원본 ZIP 첨부는 최대24 MiB입니다. 작은 기존 bundle로 내보내세요.');
  const digest = await sha256Hex(bytes),
    timestamp = new Date().toISOString();
  let bundle = createResearchProject({
    title: '가져온 기존 연구 ZIP',
    id: `legacy-project-${digest.slice(0, 24)}`,
    createdAt: timestamp,
    description: '기존 연구 내보내기의 원본과 모든 멤버를 보존한 호환 보기입니다.'
  });
  bundle = addResearchSession(bundle, { title: '기존 research export', id: 'legacy-session', createdAt: timestamp });
  bundle.project.runs.push({
    id: 'legacy-run',
    sessionId: 'legacy-session',
    label: '기존 ZIP 원본',
    createdAt: timestamp,
    status: 'partial',
    artifactIds: [],
    note: 'legacy snapshot을 canonical 실험이나 실행 완료로 변환하지 않았습니다. 원본 notebook·figure·provenance를 첨부로 보존합니다.'
  });
  const append = async (
    data: Uint8Array,
    filename: string,
    kind: 'legacy' | 'attachment',
    note: string,
    parentIds: string[]
  ) => {
    data = new Uint8Array(data);
    const sha256 = await sha256Hex(data),
      id = `artifact-${sha256.slice(0, 24)}-${bundle.project.artifacts.length}`;
    const path = `artifacts/${id}.${kind === 'legacy' ? 'zip' : 'bin'}`;
    bundle.project.artifacts.push({
      id,
      runId: 'legacy-run',
      filename,
      kind,
      path,
      schema: kind === 'legacy' ? 'legacy-original/v1' : 'opaque-attachment/v1',
      mediaType: kind === 'legacy' ? 'application/zip' : 'application/octet-stream',
      bytes: data.length,
      sha256,
      status: 'present',
      note,
      parentIds
    });
    bundle.project.runs[0]!.artifactIds.push(id);
    bundle.files.push({ path, data });
  };
  await append(
    bytes,
    'legacy-research.zip',
    'legacy',
    '가져온 기존 ZIP 전체의 원본 bytes. 멤버별 SHA256·CRC32·legacy hash를 모두 확인했습니다.',
    []
  );
  const originalId = bundle.project.artifacts[0]!.id;
  for (const [index, entry] of entries.entries()) {
    await append(
      entry.data,
      `member-${index}-${entry.path.split('/').at(-1)!}`.slice(0, 128),
      'attachment',
      `기존 archive 멤버 ${entry.path}. 원본 bytes를 보존하며 외부 HTML/SVG/notebook 코드를 실행하지 않습니다.`,
      [originalId]
    );
  }
  bundle.project.warnings.push(
    '기존 ZIP의 무결성은 확인했습니다. 원본 snapshot의 canonical migration·계산 재실행·figure 출처 재인증은 수행하지 않았습니다.'
  );
  return verifyResearchBundle(bundle);
}
