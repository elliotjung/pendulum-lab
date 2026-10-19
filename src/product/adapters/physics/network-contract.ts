import { EXPERIMENT_SCHEMA, type ExperimentStateV1 } from '../../contracts/experiment';
import { validateExperimentState } from '../../contracts/experiment-validation';
import type { CanonicalUnit, QuantityValue } from '../../contracts/quantities';
import { fields, invalid, isRecord } from '../../contracts/contract-checks';
import { issue, success, type ContractIssue, type ContractResult } from '../../contracts/validation';
import { inspectSafeData } from '../../persistence/safe-data';
import {
  MAX_NETWORK_EDGES,
  MAX_NETWORK_NODES,
  MAX_NETWORK_STEPS,
  NETWORK_INTEGRATOR_VERSION,
  NETWORK_MODEL_VERSION,
  NETWORK_SEED_GENERATOR,
  NETWORK_SYSTEM_IDS,
  networkIsInternal,
  networkParameterFields,
  type NetworkConfig,
  type NetworkSystemId
} from './network-schema';

export const networkStepCount = (c: Pick<NetworkConfig, 'duration' | 'step'>) =>
  Math.ceil(c.duration / c.step - 8 * Number.EPSILON * (c.duration / c.step));
const nodeFields = ['x', 'y', 'mass', 'length', 'damping', 'frequency', 'strength'] as const;
const nodeUnits: readonly CanonicalUnit[] = ['1', '1', 'kg', 'm', 's^-1', 'rad/s', '1'];
const basinFields = ['size', 'xMin', 'xMax', 'yMin', 'yMax', 'maxSteps', 'speedTolerance'] as const;
export function validateNetworkConfig(input: unknown): ContractResult<NetworkConfig> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  const issues: ContractIssue[] = [];
  if (
    !fields(
      safe.value,
      ['systemId', 'parameters', 'graph', 'initialState', 'integratorId', 'step', 'duration', 'seed'],
      ['startTime', 'sampleEvery', 'analyses', 'provenance', 'basin'],
      '$',
      issues
    )
  )
    return { ok: false, issues };
  const c = safe.value;
  if (!(NETWORK_SYSTEM_IDS as readonly unknown[]).includes(c.systemId))
    return {
      ok: false,
      issues: [...issues, issue('unsupported-system', '$.systemId', '지원하는 네트워크 모델이 아닙니다.')]
    };
  const id = c.systemId as NetworkSystemId;
  const range = (v: unknown, min: number, max: number, path: string, integer = false) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v)))
      invalid(issues, path, `${min}–${max} 범위의 유한${integer ? ' 정수' : '한 수'}가 필요합니다.`);
  };
  const params = networkParameterFields(id);
  if (
    fields(
      c.parameters,
      params.map((f) => f.key),
      [],
      '$.parameters',
      issues
    )
  )
    for (const f of params) range(c.parameters[f.key], f.min, f.max, `$.parameters.${f.key}`, f.key === 'radius');
  const graph = isRecord(c.graph) ? c.graph : {};
  fields(c.graph, ['nodes', 'edges'], ['ringOrder'], '$.graph', issues);
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [],
    edges = Array.isArray(graph.edges) ? graph.edges : [];
  range(
    nodes.length,
    id === 'system:magnetic' ? 1 : id === 'system:chimera-exploration' ? 8 : 2,
    id === 'system:magnetic' ? 16 : MAX_NETWORK_NODES,
    '$.graph.nodes.length',
    true
  );
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges))
    invalid(issues, '$.graph', 'nodes와 edges 배열이 필요합니다.');
  range(edges.length, 0, MAX_NETWORK_EDGES, '$.graph.edges.length', true);
  const ids = new Set<string>(),
    edgeIds = new Set<string>(),
    pairs = new Set<string>();
  const validId = (v: unknown, path: string, set: Set<string>) => {
    if (typeof v !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(v) || set.has(v))
      invalid(issues, path, '중복 없는 stable ASCII ID가 필요합니다.');
    else set.add(v);
  };
  nodes.forEach((node, i) => {
    const path = `$.graph.nodes[${i}]`;
    if (!fields(node, ['id', ...nodeFields], [], path, issues)) return;
    validId(node.id, `${path}.id`, ids);
    for (const key of nodeFields)
      range(
        node[key],
        key === 'mass' || key === 'length' || key === 'strength' ? 0.01 : key === 'damping' ? 0 : -100,
        key === 'frequency' ? 100 : key === 'damping' ? 20 : 100,
        `${path}.${key}`
      );
  });
  edges.forEach((edge, i) => {
    const path = `$.graph.edges[${i}]`;
    if (!fields(edge, ['id', 'source', 'target', 'weight'], [], path, issues)) return;
    validId(edge.id, `${path}.id`, edgeIds);
    if (
      typeof edge.source !== 'string' ||
      typeof edge.target !== 'string' ||
      !ids.has(edge.source) ||
      !ids.has(edge.target) ||
      edge.source === edge.target
    )
      invalid(issues, path, '간선 끝점은 서로 다른 기존 노드여야 합니다.');
    else {
      const pair = [edge.source, edge.target].sort().join(':');
      if (pairs.has(pair)) invalid(issues, path, '같은 무방향 노드 쌍의 중복 간선을 제거하세요.');
      pairs.add(pair);
    }
    range(edge.weight, 0, 100, `${path}.weight`);
  });
  const ring = Array.isArray(graph.ringOrder) ? graph.ringOrder : [];
  if (
    graph.ringOrder !== undefined &&
    (!Array.isArray(graph.ringOrder) ||
      ring.length !== nodes.length ||
      new Set(ring).size !== nodes.length ||
      ring.some((v) => typeof v !== 'string' || !ids.has(v)))
  )
    invalid(issues, '$.graph.ringOrder', '공간 순서는 모든 stable 노드 ID를 한 번씩 포함해야 합니다.');
  if (id === 'system:magnetic' && edges.length)
    invalid(issues, '$.graph.edges', '고정 자석은 간선을 사용하지 않습니다.');
  if (
    id === 'system:huygens-phase-pair' &&
    (nodes.length !== 2 || edges.length !== 1 || !isRecord(edges[0]) || edges[0].weight !== 1)
  )
    invalid(issues, '$.graph', 'Huygens 쌍에는 두 노드와 단위 가중치 간선 하나가 필요합니다.');
  if (id === 'system:chimera-exploration') {
    const radius = isRecord(c.parameters) && typeof c.parameters.radius === 'number' ? c.parameters.radius : NaN;
    if (
      !ring.length ||
      !Number.isInteger(radius) ||
      radius < 1 ||
      radius > Math.floor((nodes.length - 1) / 2) ||
      ring.some((v) => typeof v !== 'string' || !ids.has(v))
    )
      invalid(issues, '$.graph.ringOrder', '비국소 고리 순서와 유효 반경이 필요합니다.');
    else {
      const expected = new Set<string>();
      for (let i = 0; i < ring.length; i++)
        for (let d = 1; d <= radius; d++)
          expected.add([ring[i] as string, ring[(i + d) % ring.length] as string].sort().join(':'));
      if (
        expected.size !== pairs.size ||
        [...expected].some((p) => !pairs.has(p)) ||
        edges.some((e) => !isRecord(e) || e.weight !== 1)
      )
        invalid(issues, '$.graph.edges', 'chimera는 반경 R과 일치하는 단위 가중치 비국소 고리여야 합니다.');
    }
  }
  const initial = Array.isArray(c.initialState) ? c.initialState : [];
  const dimension = id === 'system:magnetic' ? 4 : nodes.length * (id === 'system:pendulum-network' ? 2 : 1);
  if (!Array.isArray(c.initialState) || initial.length !== dimension)
    invalid(issues, '$.initialState', `상태 성분 ${dimension}개가 필요합니다.`);
  initial.forEach((v, i) => range(v, -10000, 10000, `$.initialState[${i}]`));
  if (c.integratorId !== (networkIsInternal(id) ? 'internal' : 'integrator:rk4'))
    invalid(issues, '$.integratorId', '이 모델의 RK4 또는 내부 midpoint RK2를 사용하세요.');
  range(c.step, 0.00001, 0.05, '$.step');
  range(c.duration, 0.00001, 300, '$.duration');
  if (c.startTime !== undefined) range(c.startTime, 0, Number.MAX_VALUE, '$.startTime');
  if (c.sampleEvery !== undefined) range(c.sampleEvery, 1, MAX_NETWORK_STEPS, '$.sampleEvery', true);
  if (
    typeof c.step === 'number' &&
    typeof c.duration === 'number' &&
    (c.step > c.duration || networkStepCount({ step: c.step, duration: c.duration }) > MAX_NETWORK_STEPS)
  )
    invalid(issues, '$.runtime', `관찰 길이와 최대 ${MAX_NETWORK_STEPS} 단계 예산을 확인하세요.`);
  if (c.analyses !== undefined && (!Array.isArray(c.analyses) || c.analyses.length))
    issues.push(
      issue(
        'unsupported-analysis',
        '$.analyses',
        '이 adapter는 기본 진단만 지원합니다. 원본을 보존하세요.',
        'keep-original'
      )
    );
  if (fields(c.seed, ['value', 'generator', 'generatorVersion'], [], '$.seed', issues)) {
    if (
      typeof c.seed.value !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(c.seed.value) ||
      c.seed.generator !== NETWORK_SEED_GENERATOR ||
      c.seed.generatorVersion !== '1'
    )
      invalid(issues, '$.seed', '지원하는 seed 문자열·생성기 버전이 필요합니다.');
  }
  if (id === 'system:magnetic') {
    if (fields(c.basin, basinFields, [], '$.basin', issues)) {
      const b = c.basin;
      range(b.size, 2, 16, '$.basin.size', true);
      range(b.maxSteps, 1, 10000, '$.basin.maxSteps', true);
      range(b.speedTolerance, 0.000001, 1, '$.basin.speedTolerance');
      for (const key of ['xMin', 'xMax', 'yMin', 'yMax']) range(b[key], -10, 10, `$.basin.${key}`);
      if (
        typeof b.xMin !== 'number' ||
        typeof b.xMax !== 'number' ||
        typeof b.yMin !== 'number' ||
        typeof b.yMax !== 'number' ||
        !(b.xMin < b.xMax) ||
        !(b.yMin < b.yMax)
      )
        invalid(issues, '$.basin', '격자 범위는 증가해야 합니다.');
    }
  } else if (c.basin !== undefined)
    issues.push(issue('unsupported-field', '$.basin', '자기 모델만 basin seed grid를 사용합니다.', 'keep-original'));
  if (issues.length) return { ok: false, issues };
  const config = c as unknown as NetworkConfig;
  const checked = validateExperimentState(rawCanonical(config));
  return checked.ok ? success(config) : checked;
}
function rawCanonical(c: NetworkConfig): ExperimentStateV1 {
  const parameters: Record<string, QuantityValue> = {};
  for (const f of networkParameterFields(c.systemId))
    parameters[f.key] = { kind: 'scalar', value: c.parameters[f.key]!, unit: f.canonicalUnit };
  nodeFields.forEach((key, i) => {
    parameters[`node_${key}`] = { kind: 'vector', values: c.graph.nodes.map((n) => n[key]), unit: nodeUnits[i]! };
  });
  if (c.graph.edges.length)
    parameters.edgeWeights = {
      kind: 'vector',
      values: c.graph.edges.map((e) => e.weight),
      unit: c.systemId === 'system:pendulum-network' ? 'J' : '1'
    };
  if (c.basin)
    for (const key of basinFields) parameters[`basin_${key}`] = { kind: 'scalar', value: c.basin[key], unit: '1' };
  const n = c.graph.nodes.length;
  const initialConditions: Record<string, QuantityValue> =
    c.systemId === 'system:magnetic'
      ? { state: { kind: 'vector', values: c.initialState, unit: '1' } }
      : {
          phase: { kind: 'vector', values: c.initialState.slice(0, n), unit: 'rad' },
          ...(c.systemId === 'system:pendulum-network'
            ? { velocity: { kind: 'vector', values: c.initialState.slice(n), unit: 'rad/s' } }
            : {})
        };
  return {
    schema: EXPERIMENT_SCHEMA,
    systemId: c.systemId,
    modelVersion: NETWORK_MODEL_VERSION,
    parameters,
    initialConditions,
    topology: {
      schema: 'pendulum-network-topology/v1',
      nodes: c.graph.nodes.map((n) => n.id),
      edges: c.graph.edges.map(({ id, source, target }) => ({ id, source, target })),
      ...(c.graph.ringOrder ? { ringOrder: c.graph.ringOrder } : {})
    },
    modelOptions: { timeConvention: c.systemId === 'system:magnetic' ? 'normalized' : 'si' },
    integrator:
      c.integratorId === 'internal'
        ? { kind: 'internal', version: NETWORK_INTEGRATOR_VERSION, settings: {} }
        : { kind: 'selectable', id: c.integratorId, version: NETWORK_INTEGRATOR_VERSION, settings: {} },
    runtime: {
      domain: 'time',
      start: { value: c.startTime ?? 0, unit: 's' },
      duration: { value: c.duration, unit: 's' },
      step: { value: c.step, unit: 's' },
      sampleEvery: c.sampleEvery ?? 1
    },
    analyses: c.analyses ?? [],
    seed: c.seed,
    ...(c.provenance ? { provenance: c.provenance } : {})
  };
}
export function toCanonicalNetwork(input: NetworkConfig): ContractResult<ExperimentStateV1> {
  const checked = validateNetworkConfig(input);
  return checked.ok ? validateExperimentState(rawCanonical(checked.value)) : checked;
}
export function fromCanonicalNetwork(input: unknown): ContractResult<NetworkConfig> {
  const checked = validateExperimentState(input);
  if (!checked.ok) return checked;
  const v = checked.value,
    issues: ContractIssue[] = [];
  if (
    !(NETWORK_SYSTEM_IDS as readonly string[]).includes(v.systemId) ||
    v.modelVersion !== NETWORK_MODEL_VERSION ||
    !v.topology ||
    v.runtime.domain !== 'time'
  )
    return {
      ok: false,
      issues: [
        issue('unsupported-version', '$', '지원하는 네트워크 버전·topology·시간 설정이 필요합니다.', 'keep-original')
      ]
    };
  const id = v.systemId as NetworkSystemId,
    fieldsForModel = networkParameterFields(id);
  fields(v.modelOptions, ['timeConvention'], [], '$.modelOptions', issues);
  if (v.modelOptions?.timeConvention !== (id === 'system:magnetic' ? 'normalized' : 'si'))
    invalid(issues, '$.modelOptions.timeConvention', '모델의 시간 규약과 일치해야 합니다.');
  if (
    v.integrator.version !== NETWORK_INTEGRATOR_VERSION ||
    v.integrator.options !== undefined ||
    Object.keys(v.integrator.settings).length ||
    (networkIsInternal(id)
      ? v.integrator.kind !== 'internal'
      : v.integrator.kind !== 'selectable' || v.integrator.id !== 'integrator:rk4')
  )
    invalid(issues, '$.integrator', '표현할 수 없는 적분기 설정입니다.');
  fields(
    v.parameters,
    [
      ...fieldsForModel.map((f) => f.key),
      ...nodeFields.map((k) => `node_${k}`),
      ...(v.topology.edges.length ? ['edgeWeights'] : []),
      ...(id === 'system:magnetic' ? basinFields.map((k) => `basin_${k}`) : [])
    ],
    [],
    '$.parameters',
    issues
  );
  fields(
    v.initialConditions,
    id === 'system:magnetic' ? ['state'] : id === 'system:pendulum-network' ? ['phase', 'velocity'] : ['phase'],
    [],
    '$.initialConditions',
    issues
  );
  const scalar = (key: string, unit: CanonicalUnit): number => {
    const q = v.parameters[key];
    if (!q || q.kind !== 'scalar' || q.unit !== unit) {
      invalid(issues, `$.parameters.${key}`, `${unit} scalar가 필요합니다.`);
      return 0;
    }
    return q.value;
  };
  const vector = (
    group: 'parameters' | 'initialConditions',
    key: string,
    unit: CanonicalUnit,
    length: number
  ): readonly number[] => {
    const q = v[group][key];
    if (!q || q.kind !== 'vector' || q.unit !== unit || q.values.length !== length) {
      invalid(issues, `$.${group}.${key}`, `길이 ${length}의 ${unit} vector가 필요합니다.`);
      return [];
    }
    return q.values;
  };
  const n = v.topology.nodes.length;
  const columns = nodeFields.map((key, i) => vector('parameters', `node_${key}`, nodeUnits[i]!, n));
  const weights = v.topology.edges.length
    ? vector('parameters', 'edgeWeights', id === 'system:pendulum-network' ? 'J' : '1', v.topology.edges.length)
    : [];
  const graph = {
    nodes: v.topology.nodes.map((nodeId, i) => ({
      id: nodeId,
      ...Object.fromEntries(nodeFields.map((key, j) => [key, columns[j]![i]]))
    })),
    edges: v.topology.edges.map((e, i) => ({ ...e, weight: weights[i] })),
    ...(v.topology.ringOrder ? { ringOrder: v.topology.ringOrder } : {})
  };
  const parameters = Object.fromEntries(fieldsForModel.map((f) => [f.key, scalar(f.key, f.canonicalUnit)]));
  const initialState =
    id === 'system:magnetic'
      ? vector('initialConditions', 'state', '1', 4)
      : [
          ...vector('initialConditions', 'phase', 'rad', n),
          ...(id === 'system:pendulum-network' ? vector('initialConditions', 'velocity', 'rad/s', n) : [])
        ];
  const basin =
    id === 'system:magnetic' ? Object.fromEntries(basinFields.map((k) => [k, scalar(`basin_${k}`, '1')])) : undefined;
  if (issues.length) return { ok: false, issues };
  return validateNetworkConfig({
    systemId: id,
    parameters,
    graph,
    initialState,
    integratorId: v.integrator.kind === 'internal' ? 'internal' : v.integrator.id,
    step: v.runtime.step.value,
    duration: v.runtime.duration.value,
    startTime: v.runtime.start.value,
    sampleEvery: v.runtime.sampleEvery,
    seed: v.seed,
    analyses: v.analyses,
    ...(v.provenance ? { provenance: v.provenance } : {}),
    ...(basin ? { basin } : {})
  });
}
export const networkToCanonical = toCanonicalNetwork;
export const networkFromCanonical = fromCanonicalNetwork;
