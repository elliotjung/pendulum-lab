import { decodeBase64UrlText, encodeBase64UrlText } from '../../app/base64UrlText';
import { canonicalSharedExperimentParameterHash, decodeSharedExperiment } from '../../app/experimentShareCodec';
import type { SharedExperimentV2, SharedExperimentV3, SharedExperimentV4 } from '../../app/experimentShareTypes';
import { toCanonicalPlanar, type PlanarConfig, type PlanarState } from '../adapters/physics/planar';
import { toCanonicalChain, type ChainConfig } from '../adapters/physics/chain';
import { parseContractJson } from './json';
import { canonicalJson, type JsonValue } from './safe-data';
import {
  LegacyLinkError,
  linkDuration,
  linkError,
  linkFields,
  linkRecord,
  type LegacyLinkOptions,
  type LegacyLinkProjection
} from './legacy-link-contracts';

function validateShape(raw: Record<string, JsonValue>) {
  const version = raw.v;
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4)
    linkError('unsupported-legacy-share-version', '$.v', '기존 share v1–v4만 지원합니다.');
  if (version === 1)
    linkFields(
      raw,
      ['v', 'system', 'method', 'dt', 'damping', 'toleranceExponent', 'parameters', 'initial', 'tab'],
      [],
      '$'
    );
  else {
    linkFields(
      raw,
      [
        'v',
        'scope',
        'provenance',
        'physics',
        'execution',
        'render',
        'tab',
        ...(version === 4 ? ['preferences', 'workflow'] : [])
      ],
      [],
      '$'
    );
    const scope = linkRecord(raw.scope, '$.scope');
    linkFields(scope, ['kind', 'includesResults', 'omittedUnsafeControls'], [], '$.scope');
    if (canonicalJson(scope.omittedUnsafeControls!) !== canonicalJson(['audioOn', 'backgroundSim']))
      linkError(
        'unsupported-legacy-scope',
        '$.scope.omittedUnsafeControls',
        '오디오·백그라운드 실행을 제외한 원본 scope가 필요합니다.'
      );
    const provenance = linkRecord(raw.provenance, '$.provenance');
    linkFields(
      provenance,
      ['packageName', 'packageVersion', 'physicsVersion', 'physicsSchema', 'sourceCommit', 'parameterHash'],
      [],
      '$.provenance'
    );
    const fingerprint = linkRecord(provenance.parameterHash, '$.provenance.parameterHash');
    linkFields(fingerprint, ['algorithm', 'value'], [], '$.provenance.parameterHash');
    if (
      fingerprint.algorithm !== 'fnv1a32-canonical-json' ||
      fingerprint.value !==
        canonicalSharedExperimentParameterHash(
          raw as unknown as SharedExperimentV2 | SharedExperimentV3 | SharedExperimentV4
        )
    )
      linkError(
        'legacy-parameter-hash-mismatch',
        '$.provenance.parameterHash',
        '원본의 물성·실행 fingerprint가 맞지 않습니다. 새 hash로 대신하지 않았습니다.'
      );
    const execution = linkRecord(raw.execution, '$.execution');
    linkFields(execution, ['seed', 'timingMode', 'speed', 'stepsPerFrame', 'ensemble'], [], '$.execution');
    if (execution.ensemble !== null)
      linkFields(
        linkRecord(execution.ensemble, '$.execution.ensemble'),
        version === 4 ? ['count', 'epsilon', 'variable', 'pattern', 'seed'] : ['count', 'epsilonExponent'],
        [],
        '$.execution.ensemble'
      );
    if (raw.render !== null)
      linkFields(
        linkRecord(raw.render, '$.render'),
        ['trailMode', 'trailLength', 'phaseAxis', 'qualityMode', 'glow', 'longExposure', 'interpolate', 'autoQuality'],
        [],
        '$.render'
      );
    if (version === 4) {
      linkFields(linkRecord(raw.preferences, '$.preferences'), ['angleUnit'], [], '$.preferences');
      linkFields(linkRecord(raw.workflow, '$.workflow'), ['goal', 'step', 'trajectoryStage'], [], '$.workflow');
    }
  }
  const physics = version === 1 ? raw : linkRecord(raw.physics, '$.physics');
  if (version !== 1)
    linkFields(
      physics,
      ['system', 'method', 'dt', 'damping', 'toleranceExponent', 'parameters', 'initial'],
      [],
      '$.physics'
    );
  linkFields(
    linkRecord(physics.parameters, '$.physics.parameters'),
    ['m1', 'm2', 'm3', 'l1', 'l2', 'l3', 'g'],
    [],
    '$.physics.parameters'
  );
  linkFields(linkRecord(physics.initial, '$.physics.initial'), ['theta', 'omega'], [], '$.physics.initial');
  return version;
}

export function projectLegacyShare(hash: string, options: LegacyLinkOptions): LegacyLinkProjection {
  let text: string;
  try {
    text = decodeBase64UrlText(hash.slice('#experiment='.length));
  } catch {
    return linkError('invalid-legacy-share', '$', '공유 링크의 base64url 또는 UTF-8이 올바르지 않습니다.');
  }
  if (encodeBase64UrlText(text) !== hash.slice('#experiment='.length))
    return linkError('invalid-legacy-share', '$', '비표준 base64url padding bits를 보정하지 않았습니다.');
  const parsed = parseContractJson(text);
  if (!parsed.ok) throw new LegacyLinkError(parsed.issues);
  const raw = linkRecord(parsed.value, '$');
  const version = validateShape(raw);
  const decoded = decodeSharedExperiment(hash);
  if (!decoded.ok || !decoded.payload)
    return linkError('invalid-legacy-share', '$', '기존 share decoder가 이 입력을 거부했습니다.');
  const repairs = decoded.diagnostics.filter(
    (issue) => !['migrated-v1', 'migrated-v2', 'migrated-v3', 'parameter-hash-mismatch'].includes(issue.code)
  );
  if (repairs.length)
    return linkError(
      'legacy-share-repair-required',
      '$',
      `기존 decoder의 보정이 필요한 입력은 변환하지 않습니다: ${repairs.map((issue) => `${issue.code} ${(issue.fields ?? []).join(',')}`).join('; ')}`
    );
  const payload = decoded.payload;
  // Even informational version migration must not alter a physically authored value.
  const rawPhysics = version === 1 ? raw : linkRecord(raw.physics, '$.physics');
  if (
    canonicalJson(rawPhysics as JsonValue) !== canonicalJson(payload.physics as unknown as JsonValue) &&
    version !== 1
  )
    return linkError('legacy-physics-changed', '$.physics', '원본 물리 설정과 decoder 결과가 다릅니다.');
  const p = payload.physics,
    parameters = p.parameters;
  const common = {
    gamma: p.damping,
    integratorId: `integrator:${p.method}` as PlanarConfig['integratorId'],
    tolerance: 10 ** p.toleranceExponent,
    step: p.dt,
    duration: linkDuration(options.durationSeconds),
    startTime: 0,
    sampleEvery: 1,
    analyses: [],
    ...(version >= 2 && payload.execution.seed !== null
      ? {
          seed: {
            value: String(payload.execution.seed),
            generator: 'legacy-share-seed',
            generatorVersion: 'unversioned'
          }
        }
      : {}),
    provenance: {
      createdByVersion: 'legacy-links-v1',
      source: { kind: 'import' as const, id: options.sourceId },
      parentExperimentIds: []
    }
  };
  const canonical =
    p.system === 'triple'
      ? toCanonicalChain({
          ...common,
          systemId: 'system:triple',
          parameters: {
            masses: [parameters.m1, parameters.m2, parameters.m3],
            lengths: [parameters.l1, parameters.l2, parameters.l3],
            g: parameters.g
          },
          initialState: [...p.initial.theta, ...p.initial.omega]
        } as ChainConfig)
      : toCanonicalPlanar({
          ...common,
          systemId: p.system === 'compound-double' ? 'system:compound-double' : 'system:double',
          parameters: { m1: parameters.m1, m2: parameters.m2, l1: parameters.l1, l2: parameters.l2, g: parameters.g },
          initialState: [p.initial.theta[0], p.initial.theta[1], p.initial.omega[0], p.initial.omega[1]] as PlanarState
        });
  const requirements: LegacyLinkProjection['transferRequirements'] = [];
  if (version >= 2) {
    if (payload.execution.ensemble)
      requirements.push({
        kind: 'ensemble',
        sourcePaths: ['$.execution.ensemble'],
        message:
          '근접 궤적 개수·섭동 변수·pattern·정확한 epsilon·seed를 호환 ensemble 실행에 전달해야 합니다. 단일 기준 run으로 대신하지 않습니다.'
      });
    if (
      [payload.execution.speed, payload.execution.stepsPerFrame, payload.execution.timingMode].some(
        (value) => value !== null
      )
    )
      requirements.push({
        kind: 'display',
        sourcePaths: ['$.execution.speed', '$.execution.stepsPerFrame', '$.execution.timingMode'],
        message: '원본의 재생 속도·frame당 step·시간 방식을 별도 표시/실행 설정에 적용해야 합니다.'
      });
    if (payload.render)
      requirements.push({
        kind: 'display',
        sourcePaths: ['$.render'],
        message: '원본 trail·phase·quality·glow·interpolation 표시 설정을 별도 호환 view에 전달해야 합니다.'
      });
    requirements.push({
      kind: 'provenance',
      sourcePaths: ['$.provenance', '$.scope'],
      message:
        '원본 package·physics 버전·source commit·fingerprint·setup-only 범위는 compatibility envelope에 보존합니다. 새 결과나 외부 진위 인증이 아닙니다.'
    });
  }
  if (version === 4) {
    requirements.push({
      kind: 'workflow',
      sourcePaths: ['$.workflow'],
      message: '원본 goal·step·trajectoryStage를 학습/관찰 workflow에 적용해야 합니다.'
    });
    requirements.push({
      kind: 'display',
      sourcePaths: ['$.preferences.angleUnit'],
      message: '표시 각도 단위만 적용합니다. 원본 theta/omega는 항상 rad 및 rad/s이며 재변환하지 않습니다.'
    });
  }
  requirements.push({
    kind: 'navigation',
    sourcePaths: ['$.tab'],
    message: `기존 tab=${payload.tab}의 목적을 새 분석/연구 view에 연결해야 합니다. 물리 설정 변환은 tab 기능 실행 증거가 아닙니다.`
  });
  if (p.system !== 'triple')
    requirements.push({
      kind: 'inactive-fields',
      sourcePaths: [
        '$.physics.parameters.m3',
        '$.physics.parameters.l3',
        '$.physics.initial.theta[2]',
        '$.physics.initial.omega[2]'
      ],
      message: '현재 이중 모델에서 사용하지 않는 세 번째 링크 값은 원본/envelope에 보존합니다.'
    });
  if (!canonical.ok)
    requirements.push({
      kind: 'unsupported-method',
      sourcePaths: ['$.physics'],
      message: canonical.issues.map((issue) => `${issue.path}: ${issue.message}`).join(' ')
    });
  return {
    sourceKind: 'legacy-share',
    sourceVersion: version,
    decoded: parsed.value,
    resolved: payload as unknown as JsonValue,
    canonical: canonical.ok ? canonical.value : null,
    fieldMappings: [
      {
        sourcePath: version === 1 ? '$' : '$.physics',
        targetPath: '$.canonical',
        transform: 'system/model identity, SI parameters, absolute theta/omega and integrator identity preserved'
      },
      {
        sourcePath: '$.physics.toleranceExponent',
        targetPath: '$.canonical.integrator.settings.tolerance',
        transform: '10 ** toleranceExponent; unit 1'
      },
      {
        sourcePath: '$.durationSeconds (explicit caller option)',
        targetPath: '$.canonical.runtime.duration',
        transform: 'seconds; not inferred from the link'
      }
    ],
    declaredDefaults:
      version < 4
        ? [
            {
              path: '$.resolved.preferences/workflow',
              value: { preferences: payload.preferences, workflow: payload.workflow } as unknown as JsonValue,
              origin: `decodeSharedExperiment v${version}->v4 migration; absent in original schema, not authored source fields`
            },
            {
              path: '$.resolved.provenance.parameterHash',
              value: payload.provenance.parameterHash,
              origin:
                'Existing decoder fingerprint of the resolved v4 physics/execution; original fingerprint was verified separately and remains in decoded source.'
            },
            ...(version === 1
              ? [
                  {
                    path: '$.resolved.execution/render/provenance/scope',
                    value: {
                      execution: payload.execution,
                      render: payload.render,
                      provenance: payload.provenance,
                      scope: payload.scope
                    } as unknown as JsonValue,
                    origin:
                      'Existing v1 migration metadata; execution/render settings were absent in source and remain null, not historical user preferences.'
                  }
                ]
              : [
                  {
                    path: '$.resolved.execution.ensemble.variable/pattern/seed',
                    value: payload.execution.ensemble
                      ? {
                          variable: payload.execution.ensemble.variable,
                          pattern: payload.execution.ensemble.pattern,
                          seed: payload.execution.ensemble.seed
                        }
                      : null,
                    origin:
                      'Existing v2/v3->v4 decoder defaults for fields absent in the original nearby-trajectory schema.'
                  }
                ]),
            ...(version === 2
              ? [
                  {
                    path: '$.resolved.provenance.physicsSchema',
                    value: payload.provenance.physicsSchema,
                    origin:
                      'Existing v2 point-mass schema migration v10-ts->v11-ts; original source schema remains in decoded.'
                  }
                ]
              : [])
          ]
        : [],
    inheritedFromBase: [],
    transferRequirements: requirements,
    decoderDiagnostics: decoded.diagnostics
  };
}
