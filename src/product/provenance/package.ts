import {
  buildZip,
  parseZip,
  checksumEntriesSha256,
  textToBytes,
  bytesToText,
  type ZipEntryInput,
  type BundleChecksumSha256
} from '../../research/zipBundle';
import {
  PROJECT_LIMITS,
  RESEARCH_PACKAGE_SCHEMA,
  RESEARCH_PROJECT_SCHEMA,
  type ResearchProjectBundle
} from './contracts';
import { verifyResearchBundle } from './project';
import { inspectProjectData, projectFields, safeResearchPath, validateResearchProject } from './validation';

const CHECKSUM_PATH = 'manifest/checksums.json';
const PROJECT_PATH = 'manifest/project.json';
const PACKAGE_PATH = 'manifest/package.json';
const parseJson = (data: Uint8Array): unknown => {
  if (data.length > PROJECT_LIMITS.manifestBytes) throw new Error('연구 manifest는 최대2 MiB입니다.');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)) as unknown;
};
export function readResearchZip(bytes: Uint8Array): ZipEntryInput[] {
  if (!(bytes instanceof Uint8Array) || bytes.length > PROJECT_LIMITS.archiveBytes)
    throw new Error('연구 ZIP은 최대64 MiB입니다.');
  const entries = parseZip(bytes);
  if (entries.length > PROJECT_LIMITS.files) throw new Error('연구 ZIP 파일 개수 제한을 초과했습니다.');
  for (const entry of entries) {
    safeResearchPath(entry.path);
    if (entry.data.length > PROJECT_LIMITS.fileBytes) throw new Error('연구 ZIP의 개별 파일은 최대24 MiB입니다.');
  }
  return entries.map(({ path, data }) => ({ path, data }));
}
export async function verifyResearchChecksums(entries: ZipEntryInput[]): Promise<void> {
  const checksum = entries.find((entry) => entry.path === CHECKSUM_PATH);
  if (!checksum) throw new Error('ZIP checksum manifest가 없습니다.');
  const raw = parseJson(checksum.data);
  inspectProjectData(raw);
  projectFields(raw, ['schemaVersion', 'generatedAt', 'algorithm', 'files'], ['verify']);
  const manifest = raw as {
    schemaVersion: string;
    generatedAt: string;
    algorithm: string;
    files: BundleChecksumSha256[];
    verify?: string;
  };
  if (
    manifest.schemaVersion !== 'pendulum-bundle-checksums/v2' ||
    manifest.algorithm !== 'sha256 + crc32 + fnv1a64' ||
    !Number.isFinite(Date.parse(manifest.generatedAt)) ||
    !Array.isArray(manifest.files)
  )
    throw new Error('지원하지 않는 checksum manifest입니다.');
  const others = entries.filter((entry) => entry.path !== CHECKSUM_PATH);
  if (manifest.files.length !== others.length) throw new Error('ZIP checksum manifest의 파일 수가 다릅니다.');
  const seen = new Set<string>();
  for (const row of manifest.files) {
    projectFields(row, ['path', 'bytes', 'crc32', 'hash', 'sha256']);
    safeResearchPath(row.path);
    const key = row.path.toLowerCase();
    if (
      seen.has(key) ||
      row.path === CHECKSUM_PATH ||
      !Number.isSafeInteger(row.bytes) ||
      row.bytes < 0 ||
      !/^[a-f0-9]{8}$/u.test(row.crc32) ||
      !/^[a-f0-9]{16}$/u.test(row.hash) ||
      !/^[a-f0-9]{64}$/u.test(row.sha256)
    )
      throw new Error('ZIP checksum row의 경로·형식·중복이 유효하지 않습니다.');
    seen.add(key);
  }
  const actual = await checksumEntriesSha256(others);
  for (const checked of actual) {
    const row = manifest.files.find((entry) => entry.path === checked.path);
    if (
      !row ||
      row.bytes !== checked.bytes ||
      row.crc32 !== checked.crc32 ||
      row.hash !== checked.hash ||
      row.sha256 !== checked.sha256
    )
      throw new Error(`ZIP checksum이 다릅니다: ${checked.path}. 원본 파일을 보존하세요.`);
  }
}
export async function buildResearchPackage(
  bundle: ResearchProjectBundle,
  options: { extraEntries?: ZipEntryInput[] } = {}
): Promise<Uint8Array> {
  const checked = await verifyResearchBundle(bundle);
  const entries: ZipEntryInput[] = checked.files.map((file) => ({ path: file.path, data: file.data.slice() }));
  const paths = new Set(entries.map((entry) => entry.path.toLowerCase()));
  for (const extra of options.extraEntries ?? []) {
    safeResearchPath(extra.path);
    if (
      !(extra.data instanceof Uint8Array) ||
      extra.data.length > PROJECT_LIMITS.fileBytes ||
      !/^(?:report\.md|notebook\.json|reviewer\.html|figures\/[A-Za-z0-9._-]+\.(?:svg|csv|txt))$/u.test(extra.path) ||
      paths.has(extra.path.toLowerCase())
    )
      throw new Error('생성된 연구 출력의 경로·크기·중복이 유효하지 않습니다.');
    paths.add(extra.path.toLowerCase());
    entries.push({ path: extra.path, data: extra.data.slice() });
  }
  entries.push({ path: PROJECT_PATH, data: textToBytes(JSON.stringify(checked.project, null, 2)) });
  entries.push({
    path: PACKAGE_PATH,
    data: textToBytes(
      JSON.stringify(
        {
          schema: RESEARCH_PACKAGE_SCHEMA,
          projectSchema: RESEARCH_PROJECT_SCHEMA,
          projectId: checked.project.id,
          generatedAt: checked.project.updatedAt,
          software: checked.project.software,
          contentPolicy: 'original-artifact-bytes',
          files: [...entries.map((entry) => entry.path), PACKAGE_PATH, CHECKSUM_PATH]
        },
        null,
        2
      )
    )
  });
  entries.push({
    path: CHECKSUM_PATH,
    data: textToBytes(
      JSON.stringify(
        {
          schemaVersion: 'pendulum-bundle-checksums/v2',
          generatedAt: checked.project.updatedAt,
          algorithm: 'sha256 + crc32 + fnv1a64',
          files: await checksumEntriesSha256(entries)
        },
        null,
        2
      )
    )
  });
  if (entries.length > PROJECT_LIMITS.files) throw new Error('연구 ZIP 파일 개수 제한을 초과했습니다.');
  const projected =
    22 + entries.reduce((sum, entry) => sum + 76 + textToBytes(entry.path).length * 2 + entry.data.length, 0);
  if (projected > PROJECT_LIMITS.archiveBytes) throw new Error('연구 ZIP은 metadata 포함 최대64 MiB입니다.');
  return buildZip(entries, new Date(checked.project.updatedAt));
}
export async function importResearchPackage(bytes: Uint8Array): Promise<ResearchProjectBundle> {
  const entries = readResearchZip(bytes);
  await verifyResearchChecksums(entries);
  const projectEntry = entries.find((entry) => entry.path === PROJECT_PATH),
    marker = entries.find((entry) => entry.path === PACKAGE_PATH);
  if (!projectEntry || !marker)
    throw new Error('새 연구 project package가 아닙니다. 기존 ZIP은 호환 가져오기를 사용하세요.');
  const project = validateResearchProject(parseJson(projectEntry.data)),
    raw = parseJson(marker.data);
  inspectProjectData(raw);
  projectFields(raw, ['schema', 'projectSchema', 'projectId', 'generatedAt', 'software', 'contentPolicy', 'files']);
  const metadata = raw as {
    schema: string;
    projectSchema: string;
    projectId: string;
    generatedAt: string;
    software: unknown;
    contentPolicy: string;
    files: string[];
  };
  if (
    metadata.schema !== RESEARCH_PACKAGE_SCHEMA ||
    metadata.projectSchema !== project.schema ||
    metadata.projectId !== project.id ||
    metadata.generatedAt !== project.updatedAt ||
    JSON.stringify(metadata.software) !== JSON.stringify(project.software) ||
    metadata.contentPolicy !== 'original-artifact-bytes' ||
    !Array.isArray(metadata.files) ||
    metadata.files.length !== entries.length ||
    new Set(metadata.files).size !== entries.length ||
    metadata.files.some((path) => !entries.some((entry) => entry.path === path))
  )
    throw new Error('연구 package software/schema/files manifest가 다릅니다.');
  const artifactPaths = new Set(
    project.artifacts.filter((artifact) => artifact.status === 'present').map((artifact) => artifact.path)
  );
  for (const entry of entries) {
    if (
      !artifactPaths.has(entry.path) &&
      ![PROJECT_PATH, PACKAGE_PATH, CHECKSUM_PATH].includes(entry.path) &&
      !/^(?:report\.md|notebook\.json|reviewer\.html|figures\/[A-Za-z0-9._-]+\.(?:svg|csv|txt))$/u.test(entry.path)
    )
      throw new Error('연구 package에 등록하지 않은 파일이 있습니다.');
  }
  return verifyResearchBundle({ project, files: entries.filter((entry) => artifactPaths.has(entry.path)) });
}

export function isResearchPackage(entries: ZipEntryInput[]): boolean {
  return entries.some(
    (entry) =>
      entry.path === PROJECT_PATH ||
      entry.path === PACKAGE_PATH ||
      entry.path.toLowerCase() === PROJECT_PATH ||
      entry.path.toLowerCase() === PACKAGE_PATH
  );
}
export { bytesToText };
