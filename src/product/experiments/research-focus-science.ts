import { executeStabilityFocus } from './stability-focus-science';
import { executeNonlinearFocus } from './nonlinear-focus-science';
import { executeChaosFocus } from './chaos-focus-science';
import { validateResearchFields } from './research-focus-definitions';
import { researchCanonical } from './research-focus-config';
import type { ResearchFields, ResearchFocusResult } from './research-focus-contracts';
/** JSON has one zero. Preserve native finite values while normalizing signed zero at the worker boundary. */
export function normalizeResearchFocusResult<T>(input: T): T {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('계산 결과가 유한하지 않습니다. 시간 간격과 조건을 확인하세요.');
    return (input === 0 ? 0 : input) as T;
  }
  if (Array.isArray(input)) return input.map(normalizeResearchFocusResult) as T;
  if (input && typeof input === 'object')
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, normalizeResearchFocusResult(value)])
    ) as T;
  return input;
}
export function executeResearchFocus(
  id: string,
  input: ResearchFields,
  progress?: (fraction: number) => void
): ResearchFocusResult {
  const fields = validateResearchFields(id, input);
  const result = id.startsWith('4.')
    ? executeNonlinearFocus(id, fields, progress)
    : id.startsWith('5.')
      ? executeChaosFocus(id, fields, progress)
      : executeStabilityFocus(id, fields, progress);
  return normalizeResearchFocusResult({
    ...result,
    fields,
    canonical: researchCanonical({ id, courseId: `course-${id.split('.')[0]}`, contentVersion: 1 }, fields)
  });
}
