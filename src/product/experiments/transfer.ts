import type { LearnUnit } from '../learn/schema';
import type { ExperimentStateV1 } from '../contracts/experiment';
import { isCourseId, isCourseUnitId, serializeProductRoute } from '../contracts/routes';
import { fromCanonicalPlanar, toCanonicalPlanar, type PlanarConfig } from '../adapters/physics/planar';
import { encodeShareToken } from '../persistence/share';
import { parseContractJson } from '../persistence/json';

const SESSION_SCHEMA = 'pendulum-focus-session/v1';
export const focusStorageKey = (unit: Pick<LearnUnit, 'courseId' | 'id'>) =>
  `pendulum-product/focus/v1/${unit.courseId}/${unit.id}`;

/** Unit provenance uses the existing opaque source contract, without changing routes or storage formats. */
export function focusCanonical(unit: LearnUnit, config: PlanarConfig): ExperimentStateV1 {
  const result = toCanonicalPlanar({
    ...config,
    provenance: {
      createdByVersion: 'product-focus-v1',
      source: { kind: 'derived', id: `learn:${unit.courseId}:${unit.id}:v${unit.contentVersion}` },
      parentExperimentIds: config.provenance?.parentExperimentIds ?? [],
      ...(config.provenance?.sourceUnits ? { sourceUnits: config.provenance.sourceUnits } : {})
    }
  });
  if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' '));
  return result.value;
}

export function focusLabHref(unit: LearnUnit, config: PlanarConfig): string {
  const canonical = focusCanonical(unit, config);
  const token = encodeShareToken(canonical);
  if (!token.ok) throw new Error(token.issues.map((item) => item.message).join(' '));
  const route = serializeProductRoute({ kind: 'lab-system', systemId: canonical.systemId, stateToken: token.value });
  if (!route.ok) throw new Error(route.issues.map((item) => item.message).join(' '));
  return route.value;
}

export function focusSource(experiment: ExperimentStateV1): { unitId: string; href: string; version: number } | null {
  if (experiment.provenance?.source.kind !== 'derived') return null;
  const match = /^learn:(course-[1-8]):([1-8]\.[1-9][0-9]?):v([1-9][0-9]*)$/.exec(
    experiment.provenance.source.id ?? ''
  );
  if (!match || !isCourseId(match[1]) || !isCourseUnitId(match[1], match[2]) || !Number.isSafeInteger(Number(match[3])))
    return null;
  return { unitId: match[2]!, href: `#/learn/${match[1]}/${match[2]}`, version: Number(match[3]) };
}

/** Corrupt/future data is left intact. Caller disables writes after any read failure. */
export function loadFocusConfig(storage: Pick<Storage, 'getItem'>, unit: LearnUnit): PlanarConfig | null {
  const raw = storage.getItem(focusStorageKey(unit));
  if (raw === null) return null;
  if (raw.length > 64 * 1024) throw new Error('저장된 전용 실험이 크기 제한을 초과했습니다.');
  const checked = parseContractJson(raw);
  if (!checked.ok) throw new Error('저장된 전용 실험을 읽지 못했습니다.');
  const data = checked.value;
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Object.keys(data).sort().join(',') !== 'contentVersion,experiment,schema' ||
    data.schema !== SESSION_SCHEMA ||
    data.contentVersion !== unit.contentVersion
  )
    throw new Error('저장된 전용 실험 버전이 이 단원과 다릅니다.');
  const result = fromCanonicalPlanar(data.experiment);
  if (!result.ok) throw new Error('저장된 전용 실험 설정이 유효하지 않습니다.');
  const source = focusSource(data.experiment as unknown as ExperimentStateV1);
  if (source?.href !== `#/learn/${unit.courseId}/${unit.id}` || source.version !== unit.contentVersion)
    throw new Error('저장된 전용 실험의 출처 단원이 다릅니다.');
  return result.value;
}

export function saveFocusConfig(storage: Pick<Storage, 'setItem'>, unit: LearnUnit, config: PlanarConfig): void {
  storage.setItem(
    focusStorageKey(unit),
    JSON.stringify({
      schema: SESSION_SCHEMA,
      contentVersion: unit.contentVersion,
      experiment: focusCanonical(unit, config)
    })
  );
}
