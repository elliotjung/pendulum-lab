import { StateStore } from '../../state/StateStore';
import { LEGACY_SESSION_SCHEMA_V10, SESSION_SCHEMA_VERSION } from '../../state/sessionSchema';
import type { RuntimeSnapshot } from '../../types/domain';
import { fromCanonicalPlanar, toCanonicalPlanar, type PlanarState } from '../adapters/physics/planar';
import { fromCanonicalChain, toCanonicalChain } from '../adapters/physics/chain';
import type { ExperimentStateV1 } from '../contracts/experiment';
import { isRecord } from '../contracts/contract-checks';
import { failure, success, type ContractResult } from '../contracts/validation';
import { inspectSafeData } from './safe-data';
import { LEGACY_ODE_INTEGRATOR_IDS, type LegacyOdeIntegratorId } from '../adapters/physics/planar-integrators';

const SESSION_FIELDS = [
  'schemaVersion',
  'systemType',
  'method',
  'mode',
  'dt',
  'tolerance',
  'stepsPerFrame',
  'damping',
  'parameters',
  'state',
  'simTime',
  'seed',
  'hash'
] as const;

export interface MigratedLegacySession {
  readonly canonical: ExperimentStateV1;
  readonly summary: readonly string[];
  readonly warnings: readonly string[];
}

/** Restart projection only. The exact full source is retained separately by the preview. */
export function migrateLegacySession(
  input: unknown,
  durationSeconds: number | undefined,
  sourceId: string
): ContractResult<MigratedLegacySession> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  const source = safe.value;
  if (
    !isRecord(source) ||
    SESSION_FIELDS.some((key) => !Object.hasOwn(source, key)) ||
    Object.keys(source).some((key) => !(SESSION_FIELDS as readonly string[]).includes(key))
  ) {
    return failure(
      'incomplete-session',
      '$',
      '필수 필드가 모두 있는 기존 session 파일만 변환합니다. 누락·추가 필드는 원본에서 복구하세요.',
      'keep-original'
    );
  }
  if (source.schemaVersion !== SESSION_SCHEMA_VERSION && source.schemaVersion !== LEGACY_SESSION_SCHEMA_V10)
    return failure(
      'unsupported-session-version',
      '$.schemaVersion',
      '지원하는 원본은 pendulum-session/v10-ts 또는 v11-ts입니다.',
      'keep-original'
    );
  if (typeof source.mode !== 'string' || typeof source.hash !== 'string')
    return failure(
      'invalid-session-metadata',
      '$',
      'mode와 hash는 명시적인 원본 문자열이어야 합니다. 기본값이나 새 hash로 보정하지 않았습니다.',
      'keep-original'
    );
  // Validate the original exact data, including full angular winding. Do not use
  // the legacy importer's angle wrapping or its method-alias substitution.
  const checked = StateStore.validate(source, { preserveAngleWinding: true });
  if (!checked.ok || !checked.value)
    return failure('invalid-session', '$', `기존 session 검증 실패: ${checked.problems.join('; ')}`, 'keep-original');
  const snapshot = checked.value;
  if (!(LEGACY_ODE_INTEGRATOR_IDS as readonly string[]).includes(`integrator:${String(source.method)}`))
    return failure(
      'unsupported-legacy-integrator',
      '$.method',
      '등록된 기존 적분기를 확인할 수 없습니다. 다른 적분기로 바꾸지 않았습니다. 원본을 보존하세요.',
      'keep-original'
    );
  if (durationSeconds === undefined || !Number.isFinite(durationSeconds) || durationSeconds <= 0)
    return failure(
      'restart-duration-required',
      '$.durationSeconds',
      '원본 session에는 향후 관찰 시간이 없습니다. 재시작할 관찰 시간(s)을 직접 지정한 뒤 다시 미리보기 하세요.',
      'correct-input'
    );
  const method = `integrator:${source.method}` as LegacyOdeIntegratorId;
  const { parameters: p } = snapshot;
  const common = {
    gamma: snapshot.damping,
    tolerance: snapshot.tolerance,
    integratorId: method,
    step: snapshot.dt,
    duration: durationSeconds,
    startTime: snapshot.simTime,
    sampleEvery: 1,
    analyses: [],
    ...(snapshot.seed === null
      ? {}
      : {
          seed: { value: String(snapshot.seed), generator: 'legacy-session-seed', generatorVersion: 'unversioned' }
        }),
    provenance: {
      createdByVersion: 'legacy-migration-v1',
      source: { kind: 'import' as const, id: sourceId },
      parentExperimentIds: []
    }
  };
  const candidate =
    snapshot.systemType === 'triple'
      ? toCanonicalChain({
          ...common,
          systemId: 'system:triple',
          parameters: { masses: [p.m1, p.m2, p.m3!], lengths: [p.l1, p.l2, p.l3!], g: p.g },
          initialState: snapshot.state
        })
      : toCanonicalPlanar({
          ...common,
          systemId: snapshot.systemType === 'compound-double' ? 'system:compound-double' : 'system:double',
          parameters: { m1: p.m1, m2: p.m2, l1: p.l1, l2: p.l2, g: p.g },
          initialState: snapshot.state as unknown as PlanarState
        });
  // The product ID and current adapter model/integrator versions come only from
  // the real adapters. No migration-specific pseudo execution contract is made.
  if (!candidate.ok) return candidate;
  const executable =
    snapshot.systemType === 'triple' ? fromCanonicalChain(candidate.value) : fromCanonicalPlanar(candidate.value);
  if (!executable.ok) return executable;
  return success({
    canonical: candidate.value,
    summary: [
      `${String(source.schemaVersion)} → ${candidate.value.schema} · ${snapshot.systemType}`,
      `각도 winding·물성·감쇠·적분기·시간 간격·seed를 보존합니다. 현재 상태를 t=${snapshot.simTime} s의 재시작 초기조건으로 사용합니다.`,
      `직접 지정한 관찰 시간 ${durationSeconds} s, 매 step 1개 표본, 분석 요청 0개로 새 run을 만듭니다.`
    ],
    warnings: sessionWarnings(snapshot, source.schemaVersion)
  });
}

function sessionWarnings(snapshot: RuntimeSnapshot, sourceSchema: string): string[] {
  return [
    '중단된 계산의 solver buffer·실행 이력·난수 스트림을 이어받는 resume가 아닙니다. 새 결과는 원본 결과 인증을 뜻하지 않습니다.',
    `원본 mode=${snapshot.mode}, stepsPerFrame=${snapshot.stepsPerFrame}, hash=${snapshot.hash}는 전체 원본 백업에 보존됩니다. tolerance=${snapshot.tolerance}는 적분기 설정에도 보존했습니다. 고정 step을 자동 적응형으로 바꾸거나 기존 hash를 새 run의 검증값으로 사용하지 않습니다.`,
    ...(sourceSchema === LEGACY_SESSION_SCHEMA_V10
      ? ['v10의 질점 모델을 현재 동일 모델 adapter로 읽습니다. compound-double로 추측하거나 바꾸지 않습니다.']
      : []),
    ...(snapshot.systemType !== 'triple' &&
    (snapshot.parameters.m3 !== undefined || snapshot.parameters.l3 !== undefined)
      ? ['현재 double/compound 모델에서 사용하지 않는 m3/l3는 원본 백업에만 보존됩니다.']
      : [])
  ];
}
