import { executeReproducibilityFocus } from './reproducibility-focus-science';
import { validateResearchFields } from './research-focus-definitions';
import { researchCanonical } from './research-focus-config';
import { normalizeResearchFocusResult } from './research-focus-science';
import type { ResearchFields, ResearchFocusResult } from './research-focus-contracts';
/** Async native observation/model/package work leaves the S26 synchronous entry unchanged. */
export async function executeS27ResearchFocus(
  id: string,
  input: ResearchFields,
  progress?: (fraction: number) => void
): Promise<ResearchFocusResult> {
  if (!/^8\.(?:[1-9]|1[0-2])$/.test(id)) throw new RangeError('과정8의 비동기 연구 실험이 필요합니다.');
  const fields = validateResearchFields(id, input);
  const result = await executeReproducibilityFocus(id, fields, progress);
  return normalizeResearchFocusResult({
    ...result,
    fields,
    canonical: researchCanonical({ id, courseId: 'course-8', contentVersion: 1 }, fields)
  });
}
