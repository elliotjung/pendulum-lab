import type { LearnUnit } from '../learn/schema';
import { encodeShareToken } from '../persistence/share';
import { serializeProductRoute } from '../contracts/routes';
import { parseContractJson } from '../persistence/json';
import {
  extendedCanonical,
  unwrapExtended,
  validateExtendedCanonical,
  validateExtendedFields,
  type ExtendedFields
} from './extended-config';
import type { ExperimentStateV1 } from '../contracts/experiment';
export const extendedFocusStorageKey = (unit: Pick<LearnUnit, 'courseId' | 'id'>) =>
  `pendulum-product/extended-focus/v1/${unit.courseId}/${unit.id}`;
export function extendedFocusLabHref(unit: LearnUnit, fields: ExtendedFields): string {
  const canonical = extendedCanonical(unit, fields),
    token = unwrapExtended(encodeShareToken(canonical));
  return unwrapExtended(serializeProductRoute({ kind: 'lab-system', systemId: canonical.systemId, stateToken: token }));
}
export function saveExtendedFocusFields(
  storage: Pick<Storage, 'setItem'>,
  unit: LearnUnit,
  fields: ExtendedFields
): void {
  storage.setItem(
    extendedFocusStorageKey(unit),
    JSON.stringify({
      schema: 'pendulum-extended-focus-session/v1',
      contentVersion: unit.contentVersion,
      fields,
      experiment: extendedCanonical(unit, fields)
    })
  );
}
/** Failed reads never overwrite originals. Callers explicitly disable writes for that session. */
export function loadExtendedFocusFields(storage: Pick<Storage, 'getItem'>, unit: LearnUnit): ExtendedFields | null {
  const raw = storage.getItem(extendedFocusStorageKey(unit));
  if (raw === null) return null;
  if (raw.length > 65536) throw new Error('저장된 전용 실험이 크기 제한을 넘었습니다.');
  const parsed = unwrapExtended(parseContractJson(raw));
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    Object.keys(parsed).sort().join(',') !== 'contentVersion,experiment,fields,schema' ||
    parsed.schema !== 'pendulum-extended-focus-session/v1' ||
    parsed.contentVersion !== unit.contentVersion
  )
    throw new Error('저장된 전용 실험 버전이 다릅니다.');
  const fields = validateExtendedFields(unit.id, parsed.fields as ExtendedFields);
  validateExtendedCanonical(unit, fields, parsed.experiment as unknown as ExperimentStateV1);
  return fields;
}
