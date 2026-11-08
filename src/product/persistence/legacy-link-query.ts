import { NUMERIC_CONTROL_IDS, parseNumericControlParam, parseLabIntegratorParam } from '../../app/deepLinkControls';
import { tabForLandingGoal } from '../../app/tabRouting';
import { SHARED_EXPERIMENT_TABS } from '../../app/experimentShareTypes';
import { EXPERIMENT_HANDOFF_SCHEMA, WORKFLOW_STEPS, TRAJECTORY_STAGES } from '../../app/experimentWorkflowContract';
import { EXPERIMENT_RECIPES } from '../../app/experimentRecipes';
import {
  PERTURBATION_PATTERNS,
  PERTURBATION_VARIABLES,
  normalizePerturbationVariableForSystem
} from '../../app/ensemblePerturbation';
import { LAB_CONTROL_BOUNDS } from '../../validation/sessionConstraints';
import type { SystemType } from '../../types/domain';
import { fromCanonicalPlanar } from '../adapters/physics/planar';
import { fromCanonicalChain } from '../adapters/physics/chain';
import type { ExperimentStateV1 } from '../contracts/experiment';
import type { QuantityMap } from '../contracts/quantities';
import type { JsonValue } from './safe-data';
import {
  LegacyLinkError,
  linkDuration,
  linkError,
  type LegacyLinkOptions,
  type LegacyLinkProjection,
  type LegacyLinkRequirement
} from './legacy-link-contracts';

const known = new Set<string>([
  ...NUMERIC_CONTROL_IDS,
  'w1',
  'w2',
  'sysType',
  'system',
  'method',
  'tab',
  'goal',
  'lang',
  'audience',
  'preset',
  'experiment',
  'experimentSchema',
  'workflowStep',
  'trajectoryStage',
  'angleUnit',
  'perturbationVar',
  'perturbationPattern',
  'perturbationSeed',
  'epsilon',
  'deltaTheta',
  'ensembleCount'
]);
const bounds = (id: string) =>
  id.startsWith('th')
    ? LAB_CONTROL_BOUNDS.angle
    : id.startsWith('iw')
      ? LAB_CONTROL_BOUNDS.angularVelocity
      : /^m\d$/.test(id)
        ? LAB_CONTROL_BOUNDS.mass
        : /^l\d$/.test(id)
          ? LAB_CONTROL_BOUNDS.length
          : id === 'g'
            ? LAB_CONTROL_BOUNDS.gravity
            : id === 'gamma'
              ? LAB_CONTROL_BOUNDS.damping
              : id === 'dt'
                ? LAB_CONTROL_BOUNDS.dt
                : id === 'spf'
                  ? LAB_CONTROL_BOUNDS.stepsPerFrame
                  : { min: 0.1, max: 4 };

export function projectLegacyQuery(url: URL, options: LegacyLinkOptions): LegacyLinkProjection {
  const params = url.searchParams;
  const entries = [...params.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length)
    return linkError(
      'duplicate-legacy-query',
      '$.query',
      '동일한 query 키가 반복되어 적용할 값을 결정하지 않았습니다.'
    );
  if (entries.some(([key]) => ['__proto__', 'prototype', 'constructor'].includes(key)))
    return linkError('unsafe-legacy-query', '$.query', 'Prototype 관련 query 키를 수용하지 않습니다.');
  const raw = Object.fromEntries(entries);
  const inherited: string[] = [];
  const mappings: LegacyLinkProjection['fieldMappings'] = [];
  const requirements: LegacyLinkRequirement[] = [];
  const parsed: Record<string, number> = {};
  const one = (primary: string, alias: string) => {
    const first = params.get(primary),
      second = params.get(alias);
    if (first !== null && second !== null && first !== second)
      linkError(
        'conflicting-legacy-alias',
        `$.query.${primary}`,
        `${primary}/${alias} 값이 다릅니다. 어느 쪽도 임의 선택하지 않았습니다.`
      );
    return first ?? second;
  };
  for (const id of NUMERIC_CONTROL_IDS) {
    const text = id === 'iw1' ? one(id, 'w1') : id === 'iw2' ? one(id, 'w2') : params.get(id);
    if (text === null) continue;
    const result = parseNumericControlParam(text, bounds(id));
    if (
      !result.ok ||
      result.value === undefined ||
      Object.is(result.value, -0) ||
      (id === 'spf' && !Number.isInteger(result.value))
    )
      linkError(
        'invalid-legacy-query-value',
        `$.query.${id}`,
        `기존 control의 숫자 형식·범위·정수 조건에 맞지 않습니다: ${result.reason ?? 'integer'}.`
      );
    parsed[id] = result.value;
  }
  const system = one('sysType', 'system');
  if (system !== null && !['double', 'compound-double', 'triple'].includes(system))
    linkError(
      'unsupported-legacy-system',
      '$.query.sysType',
      '기존 double/compound-double/triple 시스템 ID가 필요합니다.'
    );
  const method = params.get('method');
  if (method !== null && !parseLabIntegratorParam(method))
    linkError(
      'unsupported-legacy-integrator',
      '$.query.method',
      '기존 Lab URL에서 제공하는 적분기 ID가 필요합니다. 별칭으로 대체하지 않았습니다.'
    );
  const checkChoice = (key: string, choices: readonly string[]) => {
    const value = params.get(key);
    if (value !== null && !choices.includes(value))
      linkError('unsupported-legacy-query-choice', `$.query.${key}`, '기존 URL 계약에서 지원하지 않는 값입니다.');
    return value;
  };
  const explicitTab = checkChoice('tab', SHARED_EXPERIMENT_TABS);
  checkChoice('goal', ['explore', 'classroom', 'reproduce']);
  checkChoice('lang', ['ko', 'en']);
  checkChoice('audience', ['beginner', 'student', 'research']);
  checkChoice('angleUnit', ['rad', 'deg']);
  checkChoice('experimentSchema', [EXPERIMENT_HANDOFF_SCHEMA]);
  checkChoice(
    'experiment',
    EXPERIMENT_RECIPES.map((recipe) => recipe.id)
  );
  checkChoice('workflowStep', WORKFLOW_STEPS);
  checkChoice('trajectoryStage', TRAJECTORY_STAGES);
  const variable = checkChoice('perturbationVar', PERTURBATION_VARIABLES);
  checkChoice('perturbationPattern', PERTURBATION_PATTERNS);
  const physicalSystem = system ?? options.queryBase?.systemId.slice(7);
  if (
    variable &&
    physicalSystem &&
    normalizePerturbationVariableForSystem(variable, physicalSystem as SystemType) !== variable
  )
    linkError(
      'unsupported-legacy-perturbation',
      '$.query.perturbationVar',
      '선택한 시스템에서 해당 섭동 변수를 지원하지 않습니다. 다른 변수로 보정하지 않았습니다.'
    );
  for (const [key, min, max, integer] of [
    ['perturbationSeed', 0, 0xffff_ffff, true],
    ['ensembleCount', 2, 80, true],
    ['epsilon', 1e-7, 1e-2, false],
    ['deltaTheta', 1e-7, 1e-2, false]
  ] as const) {
    const value = params.get(key);
    if (value === null) continue;
    const result = parseNumericControlParam(value, { min, max });
    if (!result.ok || result.value === undefined || (integer && !Number.isInteger(result.value)))
      linkError('invalid-legacy-handoff-value', `$.query.${key}`, '기존 handoff 숫자 범위에 맞지 않습니다.');
  }
  one('epsilon', 'deltaTheta');
  const tab = explicitTab ?? tabForLandingGoal(url.href);
  if (tab)
    requirements.push({
      kind: 'navigation',
      sourcePaths: explicitTab ? ['$.query.tab'] : ['$.query.goal'],
      message: `기존 목적 tab=${tab}를 새 분석/학습/연구 view의 실제 동작에 연결해야 합니다. 명시적 tab이 Landing goal보다 우선합니다.`
    });
  for (const [kind, keys, message] of [
    [
      'display',
      ['lang', 'audience', 'angleUnit', 'speed', 'spf'],
      '언어·표시 단위·재생 설정은 별도 view 설정으로 전달합니다. audience는 과거 의도 메타데이터이며 기능 잠금을 만들지 않습니다.'
    ],
    [
      'workflow',
      ['experiment', 'experimentSchema', 'workflowStep', 'trajectoryStage'],
      '기존 실험 goal·workflow 단계와 trajectoryStage를 실제 workflow에 전달해야 합니다.'
    ],
    [
      'ensemble',
      ['perturbationVar', 'perturbationPattern', 'perturbationSeed', 'epsilon', 'deltaTheta', 'ensembleCount'],
      '근접 궤적 생성 규칙과 개수·정확한 epsilon·seed를 ensemble consumer에 전달해야 합니다.'
    ]
  ] as const) {
    const present = keys.filter((key) => params.has(key));
    if (present.length) requirements.push({ kind, sourcePaths: present.map((key) => `$.query.${key}`), message });
  }
  const unknown = entries.filter(([key]) => !known.has(key));
  if (unknown.length)
    requirements.push({
      kind: 'unknown-query',
      sourcePaths: unknown.map(([key]) => `$.query.${key}`),
      message: '정의되지 않은 query 값을 envelope에 보존합니다. 물리 설정·코드·네트워크 동작으로 실행하지 않습니다.'
    });
  if (params.has('preset'))
    requirements.push({
      kind: 'preset',
      sourcePaths: ['$.query.preset'],
      message:
        '기존 Shell의 private preset은 제공한 base 상태와의 동일성 검증이 필요합니다. 원본 preset을 무시한 canonical 변환은 확정하지 않습니다.'
    });
  let canonical: ExperimentStateV1 | null = null;
  if (!options.queryBase)
    requirements.push({
      kind: 'base-experiment',
      sourcePaths: ['$.query'],
      message:
        '일부 control만 지정한 URL입니다. 빠진 값은 추측하지 않았습니다. 사용자가 확인한 명시적 base experiment를 제공해야 합니다.'
    });
  else {
    const base = options.queryBase;
    const triple = base.systemId === 'system:triple';
    const checked = triple ? fromCanonicalChain(base) : fromCanonicalPlanar(base);
    if (!checked.ok) throw new LegacyLinkError(checked.issues);
    if (system !== null && `system:${system}` !== base.systemId)
      requirements.push({
        kind: 'base-experiment',
        sourcePaths: ['$.query.sysType', '$.query.system'],
        message:
          'URL의 시스템과 base 실험이 다릅니다. 해당 시스템의 명시적 base를 제공해야 합니다. 다른 모델의 값을 이식하지 않았습니다.'
      });
    else if (!params.has('preset')) {
      const parameters = structuredClone(base.parameters) as Record<string, QuantityMap[string]>;
      const initial = structuredClone(base.initialConditions) as Record<string, QuantityMap[string]>;
      const n = triple ? 3 : 2;
      for (const [id, value] of Object.entries(parsed)) {
        let target = '';
        if (/^[ml][123]$/.test(id)) {
          const index = Number(id.slice(1)) - 1;
          if (index >= n) {
            requirements.push({
              kind: 'inactive-fields',
              sourcePaths: [`$.query.${id}`],
              message: '현재 이중 모델에서 사용하지 않는 세 번째 링크 값은 envelope에 보존합니다.'
            });
            continue;
          }
          if (triple) {
            const key = id[0] === 'm' ? 'masses' : 'lengths',
              quantity = parameters[key]!;
            if (quantity.kind !== 'vector')
              linkError('invalid-query-base', '$.queryBase.parameters', 'base 벡터 표현이 맞지 않습니다.');
            const values = [...quantity.values];
            values[index] = value;
            parameters[key] = { ...quantity, values };
            target = `parameters.${key}[${index}]`;
          } else {
            const quantity = parameters[id]!;
            if (quantity.kind !== 'scalar')
              linkError('invalid-query-base', '$.queryBase.parameters', 'base 스칼라 표현이 맞지 않습니다.');
            parameters[id] = { ...quantity, value };
            target = `parameters.${id}`;
          }
        } else if (/^(?:th|iw)[123]$/.test(id)) {
          const index = Number(id.slice(2)) - 1;
          if (index >= n) {
            requirements.push({
              kind: 'inactive-fields',
              sourcePaths: [`$.query.${id}`],
              message: '현재 이중 모델에서 사용하지 않는 세 번째 초기값은 envelope에 보존합니다.'
            });
            continue;
          }
          const key = id.startsWith('th') ? 'theta' : 'omega';
          if (triple) {
            const quantity = initial[key]!;
            if (quantity.kind !== 'vector')
              linkError('invalid-query-base', '$.queryBase.initialConditions', 'base 벡터 표현이 맞지 않습니다.');
            const values = [...quantity.values];
            values[index] = value;
            initial[key] = { ...quantity, values };
            target = `initialConditions.${key}[${index}]`;
          } else {
            const name = `${key}${index + 1}`,
              quantity = initial[name]!;
            if (quantity.kind !== 'scalar')
              linkError('invalid-query-base', '$.queryBase.initialConditions', 'base 스칼라 표현이 맞지 않습니다.');
            initial[name] = { ...quantity, value };
            target = `initialConditions.${name}`;
          }
        } else if (id === 'g' || id === 'gamma') {
          const quantity = parameters[id]!;
          if (quantity.kind !== 'scalar')
            linkError('invalid-query-base', '$.queryBase.parameters', 'base 스칼라 표현이 맞지 않습니다.');
          parameters[id] = { ...quantity, value };
          target = `parameters.${id}`;
        } else if (id === 'dt') target = 'runtime.step';
        if (target)
          mappings.push({
            sourcePath: `$.query.${id}`,
            targetPath: `$.canonical.${target}`,
            transform: id.startsWith('th')
              ? 'rad, independent of angleUnit display preference'
              : 'exact decimal/scientific SI value; no slider-step quantization'
          });
      }
      if (base.runtime.domain !== 'time' || base.integrator.kind !== 'selectable')
        linkError('invalid-query-base', '$.queryBase', '선택형 적분기와 시간 기반 base가 필요합니다.');
      const candidate: ExperimentStateV1 = {
        ...structuredClone(base),
        parameters,
        initialConditions: initial,
        integrator: { ...base.integrator, ...(method ? { id: `integrator:${method}` } : {}) },
        runtime: {
          ...base.runtime,
          start: { value: 0, unit: 's' },
          duration: { value: linkDuration(options.durationSeconds), unit: 's' },
          step: { value: parsed.dt ?? base.runtime.step.value, unit: 's' }
        },
        provenance: {
          createdByVersion: 'legacy-links-v1',
          source: { kind: 'import', id: options.sourceId },
          parentExperimentIds: []
        }
      };
      const result = triple ? fromCanonicalChain(candidate) : fromCanonicalPlanar(candidate);
      if (!result.ok) throw new LegacyLinkError(result.issues);
      canonical = candidate;
      for (const [group, quantities] of [
        ['parameters', base.parameters],
        ['initialConditions', base.initialConditions]
      ] as const)
        for (const [key, quantity] of Object.entries(quantities)) {
          const paths =
            quantity.kind === 'vector'
              ? quantity.values.map((_value, index) => `$.${group}.${key}[${index}]`)
              : [`$.${group}.${key}`];
          for (const path of paths)
            if (!mappings.some((mapping) => mapping.targetPath === `$.canonical${path.slice(1)}`)) inherited.push(path);
        }
      inherited.push(
        '$.runtime.sampleEvery',
        '$.analyses',
        ...(params.has('dt') ? [] : ['$.runtime.step']),
        ...(method ? ['$.integrator.settings', '$.integrator.options (when present)'] : []),
        ...(base.seed ? ['$.seed'] : []),
        ...(method ? [] : ['$.integrator'])
      );
    }
  }
  return {
    sourceKind: 'legacy-url',
    sourceVersion: 'legacy-query/v1',
    decoded: raw,
    resolved: {
      values: parsed,
      system,
      method,
      tab,
      baseExperiment: options.queryBase ? (structuredClone(options.queryBase) as unknown as JsonValue) : null
    },
    canonical,
    fieldMappings: mappings,
    declaredDefaults: [
      {
        path: '$.canonical.runtime.start',
        value: 0,
        origin: 'Legacy setup URL starts a new run at t=0; no previous runtime clock was serialized.'
      }
    ],
    inheritedFromBase: inherited,
    transferRequirements: requirements,
    decoderDiagnostics: []
  };
}
