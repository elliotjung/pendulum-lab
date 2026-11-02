import type { BatchSnapshot } from './contracts';
import { BATCH_LIMITS } from './contracts';
import { validateBatchSnapshot } from './validation';
export function serializeBatch(snapshot: BatchSnapshot): string {
  const checked = validateBatchSnapshot(snapshot),
    text = JSON.stringify(checked, null, 2);
  if (new TextEncoder().encode(text).length > BATCH_LIMITS.artifactBytes)
    throw new Error('실험 파일은 최대 16 MiB입니다.');
  return text;
}
export function parseBatch(text: string): BatchSnapshot {
  if (
    typeof text !== 'string' ||
    text.length > BATCH_LIMITS.artifactBytes ||
    new TextEncoder().encode(text).length > BATCH_LIMITS.artifactBytes
  )
    throw new Error('실험 파일은 최대 16 MiB입니다.');
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error('다중 실험 JSON이 손상되었습니다. 원본을 보존하세요.');
  }
  return validateBatchSnapshot(input);
}
