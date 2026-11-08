import {
  EXPANSION_MODEL_IDS,
  type ExpansionModelId,
  type ExpansionSuiteConfig
} from '../../physics/expandedModels-types';
import {
  createExpansionSystem,
  chainParams,
  expansionModelDefinition,
  DEFAULT_EXPANSION_METHODS
} from '../../physics/expandedModels-factory';
import { parseExpansionShareHash } from '../../physics/expandedModels-runners';
import { integratorRegistry } from '../../physics/integratorRegistry';
import type { IntegratorId } from '../../types/domain';
import { toCanonicalDriven, defaultDrivenConfig, type DrivenConfig } from '../adapters/physics/driven';
import { toCanonicalChain, type ChainConfig } from '../adapters/physics/chain';
import { toCanonicalSpatial, type SpatialConfig } from '../adapters/physics/spatial';
import type { ExperimentStateV1 } from '../contracts/experiment';
import { canonicalJson, type JsonValue } from './safe-data';
import { parseContractJson } from './json';
import {
  LegacyLinkError,
  linkError,
  linkFields,
  linkNumber,
  linkRecord,
  type LegacyLinkOptions,
  type LegacyLinkProjection
} from './legacy-link-contracts';

export function projectLegacyExpansion(hash: string, options: LegacyLinkOptions): LegacyLinkProjection {
  const token = hash.slice('#expansion='.length);
  let text: string;
  try {
    if (/^(?:%7b|\{)/i.test(token)) text = decodeURIComponent(token);
    else {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(token) || token.replace(/=+$/, '').length % 4 === 1) throw new Error('base64');
      text = atob(token);
      if (btoa(text).replace(/=+$/, '') !== token.replace(/=+$/, '')) throw new Error('noncanonical base64');
    }
  } catch {
    return linkError('invalid-legacy-expansion-encoding', '$', '기존 expansion base64/URI 인코딩이 올바르지 않습니다.');
  }
  const parsed = parseContractJson(text);
  if (!parsed.ok) throw new LegacyLinkError(parsed.issues);
  const source = linkRecord(parsed.value, '$');
  linkFields(source, ['model'], ['dt', 'horizon', 'methods', 'parameterOverrides'], '$');
  if (typeof source.model !== 'string' || !(EXPANSION_MODEL_IDS as readonly string[]).includes(source.model))
    return linkError('unsupported-legacy-expansion-model', '$.model', '기존 expansion 모델 ID가 필요합니다.');
  const model = source.model as ExpansionModelId;
  const definition = expansionModelDefinition(model);
  const declared: LegacyLinkProjection['declaredDefaults'] = [];
  const value = (key: 'dt' | 'horizon', fallback: number, min: number, max: number) => {
    if (!Object.hasOwn(source, key)) {
      declared.push({
        path: `$.${key}`,
        value: fallback,
        origin: `expansionModelDefinition(${model}).default${key === 'dt' ? 'Dt' : 'Horizon'}`
      });
      return fallback;
    }
    return linkNumber(source[key], `$.${key}`, min, max);
  };
  const dt = value('dt', definition.defaultDt, 1e-6, 0.05);
  const horizon = value('horizon', definition.defaultHorizon, 1e-6, 300);
  const rawMethods = Object.hasOwn(source, 'methods') ? source.methods : [...DEFAULT_EXPANSION_METHODS];
  if (
    !Array.isArray(rawMethods) ||
    rawMethods.length < 1 ||
    rawMethods.length > 16 ||
    new Set(rawMethods).size !== rawMethods.length ||
    rawMethods.some((method) => typeof method !== 'string' || !Object.hasOwn(integratorRegistry, method))
  )
    return linkError(
      'invalid-legacy-expansion-methods',
      '$.methods',
      '중복 없는 기존 적분기 목록이 필요합니다. 빈 목록을 기본값으로 보정하지 않았습니다.'
    );
  const methods = rawMethods as IntegratorId[];
  if (!Object.hasOwn(source, 'methods'))
    declared.push({
      path: '$.methods',
      value: methods,
      origin: 'DEFAULT_EXPANSION_METHODS; explicitly inherited native suite defaults'
    });
  const overrides = Object.hasOwn(source, 'parameterOverrides')
    ? linkRecord(source.parameterOverrides, '$.parameterOverrides')
    : {};
  for (const [key, parameter] of Object.entries(overrides)) {
    if (!Object.hasOwn(definition.defaultParameters, key) && !(model === 'chain' && /^(?:mass|length)[1-8]$/.test(key)))
      linkError(
        'unsupported-legacy-expansion-parameter',
        `$.parameterOverrides.${key}`,
        '기존 모델에서 정의하지 않은 물성입니다. 무시하지 않았습니다.'
      );
    linkNumber(parameter, `$.parameterOverrides.${key}`, key === 'force' ? -1000 : 0, 1000, key === 'links');
  }
  const config: ExpansionSuiteConfig = {
    model,
    dt,
    horizon,
    methods,
    parameterOverrides: overrides as Record<string, number>
  };
  // Compare the strict decoded projection with the preserved native parser, including URI fallback output from non-browser producers.
  const native = parseExpansionShareHash(`#expansion=${btoa(text).replace(/=+$/, '')}`);
  if (!native || canonicalJson(native as unknown as JsonValue) !== canonicalJson(source))
    linkError(
      'legacy-expansion-parser-mismatch',
      '$',
      '원본 native expansion parser 결과와 strict projection이 다릅니다.'
    );
  const system = createExpansionSystem(model, config.parameterOverrides);
  const p = system.parameters;
  for (const [key, parameter] of Object.entries(definition.defaultParameters))
    if (!Object.hasOwn(overrides, key))
      declared.push({
        path: `$.parameters.${key}`,
        value: parameter,
        origin: `expansionModelDefinition(${model}).defaultParameters`
      });
  declared.push({
    path: '$.initialState',
    value: Array.from(system.initialState),
    origin: `expansionModelDefinition(${model}).defaultState; legacy share encoder does not include initialState`
  });
  const roundedSteps = Math.round(horizon / dt);
  if (roundedSteps < 10 || roundedSteps > 80_000)
    linkError(
      'legacy-expansion-step-clamp',
      '$.horizon',
      '기존 suite가 단계 수를 10–80000으로 보정할 설정입니다. 조용히 다른 기간으로 변환하지 않았습니다.'
    );
  const duration = roundedSteps * dt;
  const stride = Math.max(1, Math.floor(roundedSteps / 240));
  const common = {
    step: dt,
    duration,
    startTime: 0,
    sampleEvery: stride,
    analyses: [],
    provenance: {
      createdByVersion: 'legacy-links-v1',
      source: { kind: 'import' as const, id: options.sourceId },
      parentExperimentIds: []
    }
  };
  let canonical: ExperimentStateV1 | null = null;
  const requirements: LegacyLinkProjection['transferRequirements'] = [
    {
      kind: 'suite',
      sourcePaths: ['$.methods', '$.model', '$.horizon'],
      message:
        '전체 method 목록을 동일 native expansion 모델로 비교하고 원본의 점수·bestMethod 선택·ghost/bifurcation/report 의미를 재현해야 합니다. canonical은 목록 첫 방법의 물리 run이며 suite 결과나 최적 방법을 대신하지 않습니다.'
    }
  ];
  const unsupported = (message: string) =>
    requirements.push({ kind: 'unsupported-method', sourcePaths: ['$.methods[0]'], message });
  if (model === 'chain') {
    if (p.links !== 4)
      unsupported(
        '기존 expansion은 고정 8차원 초기값을 공유합니다. links≠4의 초기좌표/자유도 의미는 별도 확인이 필요하며 새 사슬로 조용히 변환하지 않았습니다.'
      );
    else {
      const result = toCanonicalChain({
        ...common,
        systemId: 'system:chain',
        gamma: p.damping!,
        parameters: chainParams(p),
        initialState: Array.from(system.initialState),
        integratorId: `integrator:${methods[0]!}` as ChainConfig['integratorId']
      });
      if (result.ok) canonical = result.value;
      else unsupported(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join(' '));
    }
  } else if (model === 'spherical') {
    if (methods[0] !== 'rk4')
      unsupported('단일 구면 adapter는 native 내부 RK4만 실행합니다. 다른 목록 첫 방법을 RK4로 바꾸지 않았습니다.');
    else {
      const result = toCanonicalSpatial({
        ...common,
        systemId: 'system:spherical',
        parameters: { masses: [1], lengths: [p.length!], g: p.g!, damping: p.damping! },
        initialState: Array.from(system.initialState),
        integratorId: 'internal'
      } as SpatialConfig);
      if (result.ok) canonical = result.value;
      else unsupported(result.issues.map((issue) => issue.message).join(' '));
    }
  } else {
    const id = `system:${model}` as DrivenConfig['systemId'];
    const defaults = defaultDrivenConfig(id);
    if (defaults.controller)
      declared.push({
        path: '$.canonical.controller',
        value: { ...defaults.controller, enabled: false },
        origin:
          'New adapter requires an explicit disabled controller; feedback is absent in the native expansion model.'
      });
    const parameters = { ...p };
    delete parameters.driveAmplitude;
    delete parameters.driveFrequency;
    delete parameters.amplitude;
    delete parameters.frequency;
    const forcing =
      model === 'driven' || model === 'parametric'
        ? {
            waveform: 'sine' as const,
            amplitude: model === 'driven' ? p.driveAmplitude! : p.amplitude!,
            frequency: model === 'driven' ? p.driveFrequency! : p.frequency!,
            phase: Math.PI / 2
          }
        : model === 'cartpole'
          ? { waveform: 'sine' as const, amplitude: 0, frequency: 0, phase: 0 }
          : undefined;
    const result = toCanonicalDriven({
      ...common,
      systemId: id,
      parameters,
      initialState: Array.from(system.initialState),
      integratorId: `integrator:${methods[0]!}` as DrivenConfig['integratorId'],
      ...(forcing ? { forcing } : {}),
      ...(defaults.controller ? { controller: { ...defaults.controller, enabled: false } } : {})
    });
    if (result.ok) canonical = result.value;
    else unsupported(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join(' '));
  }
  return {
    sourceKind: 'expansion',
    sourceVersion: 'legacy-expansion/unversioned',
    decoded: parsed.value,
    resolved: {
      config: config as unknown as JsonValue,
      parameters: p,
      initialState: Array.from(system.initialState),
      nativeSteps: roundedSteps,
      nativeDuration: duration,
      nativeSampleStride: stride
    },
    canonical,
    fieldMappings: [
      {
        sourcePath: '$.parameterOverrides + named native defaults',
        targetPath: '$.canonical.parameters',
        transform: 'native createExpansionSystem parameters; source fields never clamped or discarded'
      },
      {
        sourcePath: '$.horizon/$.dt',
        targetPath: '$.canonical.runtime.duration',
        transform:
          'Math.round(horizon/dt) * dt, matching native suite fixed-step endpoint; requested horizon retained in envelope'
      },
      {
        sourcePath: '$.methods[0]',
        targetPath: '$.canonical.integrator',
        transform:
          model === 'spherical'
            ? 'rk4 only -> existing internal RK4; other methods remain pending'
            : 'exact first method identity; remaining suite methods remain pending'
      },
      ...(model === 'driven' || model === 'parametric'
        ? [
            {
              sourcePath: '$.parameters drive/amplitude and phase',
              targetPath: '$.canonical.forcing',
              transform: 'native A*cos(psi) -> sine waveform with phase offset pi/2; advancing native psi unchanged'
            }
          ]
        : [])
    ],
    declaredDefaults: declared,
    inheritedFromBase: [],
    transferRequirements: requirements,
    decoderDiagnostics: []
  };
}
