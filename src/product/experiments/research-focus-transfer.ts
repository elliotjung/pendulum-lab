import type { LearnUnit } from '../learn/schema';
import { encodeShareToken } from '../persistence/share';
import { serializeProductRoute } from '../contracts/routes';
import { parseContractJson } from '../persistence/json';
import { researchCanonical, unwrapResearch, validateResearchCanonical } from './research-focus-config';
import { validateResearchFields } from './research-focus-definitions';
import type { ResearchFields } from './research-focus-contracts';
export const researchFocusStorageKey = (unit: Pick<LearnUnit, 'courseId' | 'id'>) =>
  `pendulum-product/research-focus/v1/${unit.courseId}/${unit.id}`;
export function researchFocusLabHref(unit: LearnUnit, fields: ResearchFields): string {
  const canonical = researchCanonical(unit, fields);
  const token = unwrapResearch(encodeShareToken(canonical));
  return unwrapResearch(serializeProductRoute({ kind: 'lab-system', systemId: canonical.systemId, stateToken: token }));
}
export function saveResearchFocusFields(
  storage: Pick<Storage, 'setItem'>,
  unit: LearnUnit,
  fields: ResearchFields
): void {
  storage.setItem(
    researchFocusStorageKey(unit),
    JSON.stringify({
      schema: 'pendulum-research-focus-session/v1',
      contentVersion: unit.contentVersion,
      fields: validateResearchFields(unit.id, fields),
      experiment: researchCanonical(unit, fields)
    })
  );
}
/** Invalid originals remain untouched; the caller disables writes for that session. */
export function loadResearchFocusFields(storage: Pick<Storage, 'getItem'>, unit: LearnUnit): ResearchFields | null {
  const raw = storage.getItem(researchFocusStorageKey(unit));
  if (raw === null) return null;
  if (raw.length > 65536) throw new Error('저장된 전용 실험의 크기 제한을 넘었습니다.');
  const value = unwrapResearch(parseContractJson(raw));
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'contentVersion,experiment,fields,schema' ||
    value.schema !== 'pendulum-research-focus-session/v1' ||
    value.contentVersion !== unit.contentVersion
  )
    throw new Error('저장된 전용 실험의 버전이 다릅니다.');
  const fields = validateResearchFields(unit.id, value.fields);
  validateResearchCanonical(unit, fields, value.experiment);
  return fields;
}
