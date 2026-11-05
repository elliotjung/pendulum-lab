import { stabilityFocusCanonical } from './stability-focus-config';
import type { LearnUnit } from '../learn/schema';
import type { ExperimentStateV1 } from '../contracts/experiment';
import { serializeExperiment } from '../persistence/serialization';
import type { ContractResult } from '../contracts/validation';
import { nonlinearFocusCanonical } from './nonlinear-focus-config';
import { chaosFocusCanonical } from './chaos-focus-config';
import { validateResearchFields } from './research-focus-definitions';
import type { ResearchFields } from './research-focus-contracts';
export const unwrapResearch = <T>(result: ContractResult<T>): T => {
  if (!result.ok) throw new Error(result.issues.map((entry) => entry.message).join(' '));
  return result.value;
};
type Source = Pick<LearnUnit, 'id' | 'courseId' | 'contentVersion'>;
export function researchCanonical(unit: Source, input: ResearchFields): ExperimentStateV1 {
  if (unit.courseId !== `course-${unit.id.split('.')[0]}` || unit.contentVersion !== 1)
    throw new Error('전용 실험의 단원과 버전이 다릅니다.');
  const fields = validateResearchFields(unit.id, input);
  const value = unit.id.startsWith('4.')
    ? nonlinearFocusCanonical(unit.id, fields)
    : unit.id.startsWith('5.')
      ? chaosFocusCanonical(unit.id, fields)
      : stabilityFocusCanonical(unit.id, fields);
  const canonical: ExperimentStateV1 = {
    ...value,
    provenance: {
      createdByVersion: 'product-focus-v3',
      source: { kind: 'derived', id: `learn:${unit.courseId}:${unit.id}:v${unit.contentVersion}` },
      parentExperimentIds: []
    }
  };
  unwrapResearch(serializeExperiment(canonical));
  return canonical;
}
export function validateResearchCanonical(unit: Source, fields: ResearchFields, input: unknown): void {
  if (
    unwrapResearch(serializeExperiment(researchCanonical(unit, fields))) !== unwrapResearch(serializeExperiment(input))
  )
    throw new Error('실험의 출처·단위·시스템·분석 설정이 이 단원과 다릅니다.');
}
