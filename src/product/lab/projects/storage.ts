import { base64ToBytes } from '../../../research/zipBundle';

export const PROJECT_STORAGE_KEY = 'pendulum-lab/product/research-project/v1';
export const PROJECT_LOCAL_ARCHIVE_BYTES = 3 * 1024 * 1024;
const MAX_LOCAL_TEXT = 4 * 1024 * 1024 + 1024;
const STORAGE_SCHEMA = 'pendulum-research-local/v1';

export function encodeLocalResearchArchive(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > PROJECT_LOCAL_ARCHIVE_BYTES)
    throw new Error('로컬 저장은 3 MiB 이하 ZIP만 지원합니다. 더 큰 프로젝트는 재현 ZIP으로 보존하세요.');
  let binary = '';
  for (let start = 0; start < bytes.length; start += 16_384)
    binary += String.fromCharCode(...bytes.subarray(start, start + 16_384));
  return JSON.stringify({ schema: STORAGE_SCHEMA, encoding: 'base64', data: btoa(binary) });
}

export function decodeLocalResearchArchive(text: string): Uint8Array {
  if (typeof text !== 'string' || text.length > MAX_LOCAL_TEXT)
    throw new Error('저장된 연구 프로젝트가 로컬 크기 상한을 넘습니다. 원본 저장 내용은 보존했습니다.');
  const value: unknown = JSON.parse(text);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'data,encoding,schema'
  )
    throw new Error('저장된 연구 프로젝트 형식을 읽을 수 없습니다. 원본 저장 내용은 보존했습니다.');
  const record = value as Record<string, unknown>;
  if (
    record.schema !== STORAGE_SCHEMA ||
    record.encoding !== 'base64' ||
    typeof record.data !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.data) ||
    !record.data.length
  )
    throw new Error('저장된 연구 프로젝트 버전 또는 데이터가 유효하지 않습니다.');
  const bytes = base64ToBytes(record.data);
  if (!bytes.length || bytes.length > PROJECT_LOCAL_ARCHIVE_BYTES)
    throw new Error('저장된 연구 ZIP이 로컬 크기 상한을 넘습니다.');
  return bytes;
}

export function saveLocalResearchArchive(storage: Pick<Storage, 'setItem'>, bytes: Uint8Array): void {
  storage.setItem(PROJECT_STORAGE_KEY, encodeLocalResearchArchive(bytes));
}

export function loadLocalResearchArchive(storage: Pick<Storage, 'getItem'>): Uint8Array {
  const text = storage.getItem(PROJECT_STORAGE_KEY);
  if (text === null) throw new Error('이 브라우저에 저장한 연구 프로젝트가 없습니다. 재현 ZIP을 가져올 수도 있습니다.');
  return decodeLocalResearchArchive(text);
}
