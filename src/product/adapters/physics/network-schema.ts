import type { AnalysisState, ExperimentProvenance, SeedState } from '../../contracts/experiment';
import type { CanonicalUnit } from '../../contracts/quantities';

export const NETWORK_SYSTEM_IDS = [
  'system:magnetic',
  'system:pendulum-network',
  'system:huygens-phase-pair',
  'system:kuramoto',
  'system:chimera-exploration'
] as const;
export type NetworkSystemId = (typeof NETWORK_SYSTEM_IDS)[number];
export const NETWORK_MODEL_VERSION = 'network-model-v1';
export const NETWORK_INTEGRATOR_VERSION = 'network-integrator-v1';
export const MAX_NETWORK_NODES = 128;
export const MAX_NETWORK_EDGES = 4096;
export const MAX_NETWORK_STEPS = 100_000;
export const NETWORK_SEED_GENERATOR = 'fnv1a-mulberry32';
export interface NetworkNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly mass: number;
  readonly length: number;
  readonly damping: number;
  readonly frequency: number;
  readonly strength: number;
}
export interface NetworkEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly weight: number;
}
/** Edges are undirected, unique by endpoint pair; ringOrder carries spatial identity independently of array order. */
export interface NetworkGraph {
  readonly nodes: readonly NetworkNode[];
  readonly edges: readonly NetworkEdge[];
  readonly ringOrder?: readonly string[];
}
export interface NetworkBasinSettings {
  readonly size: number;
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly maxSteps: number;
  readonly speedTolerance: number;
}
export interface NetworkConfig {
  readonly systemId: NetworkSystemId;
  readonly parameters: Readonly<Record<string, number>>;
  readonly graph: NetworkGraph;
  readonly initialState: readonly number[];
  readonly integratorId: 'integrator:rk4' | 'internal';
  readonly step: number;
  readonly duration: number;
  readonly startTime?: number;
  readonly sampleEvery?: number;
  readonly seed: SeedState;
  readonly analyses?: readonly AnalysisState[];
  readonly provenance?: ExperimentProvenance;
  readonly basin?: NetworkBasinSettings;
}
export interface NetworkSample {
  readonly step: number;
  readonly time: number;
  readonly state: readonly number[];
  readonly positions: readonly { readonly x: number; readonly y: number }[];
  readonly nodeIds: readonly string[];
  readonly phases: readonly number[];
  readonly order: number;
  readonly meanLocalOrder: number;
  readonly localCoherence: readonly number[];
  readonly energy: number;
  readonly energyUnit: string;
  readonly phaseDifference: number;
  readonly classification: string;
  readonly warnings: readonly string[];
}
export interface NetworkBasinCell {
  readonly x: number;
  readonly y: number;
  readonly magnetId: string;
  readonly converged: boolean;
  readonly steps: number;
}
export interface NetworkBasinSnapshot {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly NetworkBasinCell[];
  readonly completed: number;
  readonly total: number;
}
export interface NetworkField {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly canonicalUnit: CanonicalUnit;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}
const field = (
  key: string,
  label: string,
  unit: string,
  canonicalUnit: CanonicalUnit,
  min: number,
  max: number,
  step = 0.01
): NetworkField => ({ key, label, unit, canonicalUnit, min, max, step });
export function networkParameterFields(id: NetworkSystemId): readonly NetworkField[] {
  if (id === 'system:magnetic')
    return [
      field('restoring', '선형 복원 k', '정규화', '1', 0, 10),
      field('damping', '감쇠 γ', '정규화', '1', 0, 10),
      field('height', '정칙화 높이 d', '정규화', '1', 0.05, 5)
    ];
  if (id === 'system:pendulum-network') return [field('g', '중력 g', 'm/s²', 'm/s^2', 0.001, 100)];
  return [
    field('coupling', '위상 결합 K', 's⁻¹', 's^-1', -20, 20),
    field('phaseLag', '위상 지연 α', 'rad', 'rad', -Math.PI, Math.PI),
    ...(id === 'system:chimera-exploration' ? [field('radius', '양쪽 이웃 수 R', '개', '1', 1, 63, 1)] : [])
  ];
}
export const networkIsInternal = (id: string) => id === 'system:chimera-exploration';
export const networkIsPhase = (id: string) => !['system:magnetic', 'system:pendulum-network'].includes(id);
const seed = (): SeedState => ({ value: 'network-15', generator: NETWORK_SEED_GENERATOR, generatorVersion: '1' });
function graphOf(count: number, radius: number | undefined): NetworkGraph {
  const nodes = Array.from({ length: count }, (_, i) => ({
    id: `n${i + 1}`,
    x: Math.cos((2 * Math.PI * i) / count),
    y: Math.sin((2 * Math.PI * i) / count),
    mass: 1,
    length: 1,
    damping: 0,
    frequency: 0,
    strength: 1
  }));
  const edges: NetworkEdge[] = [];
  for (let i = 0; i < count; i++)
    for (let j = i + 1; j < count; j++) {
      const distance = Math.min(j - i, count - (j - i));
      if (radius === undefined || distance <= radius)
        edges.push({ id: `e${i + 1}_${j + 1}`, source: nodes[i]!.id, target: nodes[j]!.id, weight: 1 });
    }
  return { nodes, edges, ...(radius === undefined ? {} : { ringOrder: nodes.map((n) => n.id) }) };
}
export function defaultNetworkConfig(systemId: NetworkSystemId = 'system:magnetic'): NetworkConfig {
  if (!(NETWORK_SYSTEM_IDS as readonly string[]).includes(systemId))
    throw new RangeError('지원하는 네트워크 모델을 선택하세요.');
  const count =
    systemId === 'system:magnetic'
      ? 3
      : systemId === 'system:huygens-phase-pair'
        ? 2
        : systemId === 'system:chimera-exploration'
          ? 32
          : systemId === 'system:pendulum-network'
            ? 8
            : 16;
  let graph = graphOf(
    count,
    systemId === 'system:pendulum-network' ? 1 : systemId === 'system:chimera-exploration' ? 4 : undefined
  );
  if (systemId === 'system:magnetic')
    graph = {
      nodes: graph.nodes.map((n, i) => ({
        ...n,
        x: Math.cos(Math.PI / 2 + (2 * Math.PI * i) / 3),
        y: Math.sin(Math.PI / 2 + (2 * Math.PI * i) / 3)
      })),
      edges: []
    };
  if (systemId === 'system:pendulum-network')
    graph = { ...graph, edges: graph.edges.map((e) => ({ ...e, weight: 0.3 })) };
  if (systemId === 'system:kuramoto')
    graph = {
      ...graph,
      nodes: graph.nodes.map((n, i) => ({
        ...n,
        frequency: Math.max(-2, Math.min(2, 0.5 * Math.tan(Math.PI * ((i + 0.5) / count - 0.5))))
      }))
    };
  if (systemId === 'system:huygens-phase-pair')
    graph = { ...graph, nodes: graph.nodes.map((n, i) => ({ ...n, frequency: i === 0 ? 1 : 1.2 })) };
  const initialState =
    systemId === 'system:magnetic'
      ? [0.3, 0.2, 0, 0]
      : systemId === 'system:pendulum-network'
        ? [...graph.nodes.map((_, i) => 0.2 * Math.cos((2 * Math.PI * i) / count)), ...Array<number>(count).fill(0)]
        : systemId === 'system:chimera-exploration'
          ? graph.nodes.map((_, i) => (i < count / 2 || i % 2 === 0 ? 0 : Math.PI))
          : graph.nodes.map((_, i) => (2 * Math.PI * (i + 0.5)) / count);
  return {
    systemId,
    graph,
    initialState,
    parameters:
      systemId === 'system:magnetic'
        ? { restoring: 0.5, damping: 0.2, height: 0.25 }
        : systemId === 'system:pendulum-network'
          ? { g: 9.81 }
          : {
              coupling: systemId === 'system:huygens-phase-pair' ? 0.5 : 1.5,
              phaseLag: systemId === 'system:chimera-exploration' ? 1.45 : 0,
              ...(systemId === 'system:chimera-exploration' ? { radius: 4 } : {})
            },
    integratorId: networkIsInternal(systemId) ? 'internal' : 'integrator:rk4',
    step: systemId === 'system:chimera-exploration' ? 0.02 : 0.005,
    duration: 10,
    startTime: 0,
    sampleEvery: 1,
    seed: seed(),
    analyses: [],
    ...(systemId === 'system:magnetic'
      ? { basin: { size: 8, xMin: -2, xMax: 2, yMin: -2, yMax: 2, maxSteps: 2000, speedTolerance: 0.01 } }
      : {})
  };
}
/** Regenerates an explicit sparse ring, including its stable spatial order. */
export function resizeNetworkConfig(config: NetworkConfig, count: number, radius?: number): NetworkConfig {
  const id = config.systemId;
  const min = id === 'system:magnetic' ? 1 : id === 'system:chimera-exploration' ? 8 : 2;
  if (
    !Number.isInteger(count) ||
    count < min ||
    count > (id === 'system:magnetic' ? 16 : MAX_NETWORK_NODES) ||
    (id === 'system:huygens-phase-pair' && count !== 2)
  )
    throw new RangeError('이 모델의 노드 수 범위를 확인하세요.');
  const r =
    id === 'system:magnetic' || id === 'system:huygens-phase-pair'
      ? undefined
      : (radius ?? (id === 'system:chimera-exploration' ? Math.max(1, Math.floor(count / 8)) : 1));
  if (
    r !== undefined &&
    (!Number.isInteger(r) ||
      r < 1 ||
      r > (id === 'system:chimera-exploration' ? Math.floor((count - 1) / 2) : Math.floor(count / 2)))
  )
    throw new RangeError('노드 수에 맞는 정수 고리 반경을 선택하세요.');
  let graph = graphOf(count, r);
  if (id === 'system:magnetic') graph = { nodes: graph.nodes, edges: [] };
  if (graph.edges.length > MAX_NETWORK_EDGES)
    throw new RangeError('간선 예산을 초과합니다. 노드 수 또는 고리 반경을 줄이세요.');
  const original = new Map(config.graph.nodes.map((n, i) => [n.id, { node: n, i }]));
  graph = { ...graph, nodes: graph.nodes.map((n) => original.get(n.id)?.node ?? n) };
  const initialState =
    id === 'system:magnetic'
      ? [...config.initialState]
      : id === 'system:pendulum-network'
        ? [
            ...graph.nodes.map((n) => {
              const old = original.get(n.id);
              return old ? config.initialState[old.i]! : 0;
            }),
            ...graph.nodes.map((n) => {
              const old = original.get(n.id);
              return old ? config.initialState[config.graph.nodes.length + old.i]! : 0;
            })
          ]
        : graph.nodes.map((n, i) => {
            const old = original.get(n.id);
            return old ? config.initialState[old.i]! : (2 * Math.PI * i) / count;
          });
  return {
    ...structuredClone(config),
    graph,
    initialState,
    parameters: { ...config.parameters, ...(id === 'system:chimera-exploration' ? { radius: r! } : {}) }
  };
}
/** Each stable ID owns its stream, so storage order cannot alter seeded initial conditions. */
export function networkSeededConfig(config: NetworkConfig, value: string): NetworkConfig {
  function random(key: string) {
    let hash = 2166136261;
    for (const char of `${value}:${key}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    let t = (hash + 0x6d2b79f5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const initialState =
    config.systemId === 'system:magnetic'
      ? [4 * random('x') - 2, 4 * random('y') - 2, 0, 0]
      : config.systemId === 'system:pendulum-network'
        ? [...config.graph.nodes.map((n) => 0.4 * random(n.id) - 0.2), ...config.graph.nodes.map(() => 0)]
        : config.graph.nodes.map((n) => 2 * Math.PI * random(n.id));
  return {
    ...structuredClone(config),
    initialState,
    seed: { value, generator: NETWORK_SEED_GENERATOR, generatorVersion: '1' }
  };
}
export interface NetworkPreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}
export function networkPresets(id: NetworkSystemId): readonly NetworkPreset[] {
  return [
    { id: 'default', label: '대표 설정', description: '모델의 기준 설정을 복원합니다.' },
    { id: 'seeded', label: 'Seed 초기조건', description: '같은 seed와 stable ID에서 같은 초기조건을 생성합니다.' },
    ...(id === 'system:huygens-phase-pair'
      ? [{ id: 'anti-phase', label: '역위상 결합', description: '음의 결합으로 역위상 잠금을 탐색합니다.' }]
      : [])
  ];
}
export function networkPresetConfig(id: NetworkSystemId, presetId: string): NetworkConfig {
  const c = defaultNetworkConfig(id);
  if (presetId === 'default') return c;
  if (presetId === 'seeded') return networkSeededConfig(c, c.seed.value);
  if (presetId === 'anti-phase' && id === 'system:huygens-phase-pair')
    return { ...c, parameters: { ...c.parameters, coupling: -0.5 } };
  throw new RangeError('지원하는 프리셋을 선택하세요.');
}
export function networkWarnings(config: NetworkConfig): string[] {
  return [
    `규모: 노드 ${config.graph.nodes.length}/${MAX_NETWORK_NODES}, 간선 ${config.graph.edges.length}/${MAX_NETWORK_EDGES}. 밀집 RHS·국소 지표는 O(N²)이며 큰 네트워크는 worker에서 최대 64단계·8ms 묶음으로 처리합니다.`,
    '고정 간격 적분 결과는 dt·관찰 길이·노드 수를 바꾸어 수렴과 장시간 지속성을 확인해야 합니다.',
    ...(config.systemId === 'system:magnetic'
      ? [
          '자기 모델은 정규화한 현상론적 평면 모델입니다. 시간·위치·속도·힘 상수·에너지는 정규화 값이며 실제 자석 접촉·형상은 포함하지 않습니다.',
          '궤적은 RK4, basin seed grid는 기존 도구와 같은 semi-implicit Euler입니다. 유한 시간 최근접 자석 표시는 인력권 증명이 아니며 미수렴 mask를 함께 확인하세요. 감쇠 0에서는 정착 basin으로 해석하지 마세요.'
        ]
      : config.systemId === 'system:pendulum-network'
        ? [
            '비틀림 결합은 무방향 대칭 그래프입니다. 감쇠가 있으면 에너지는 보존되지 않습니다. R과 local coherence는 θ의 원형 정렬 진단이며 진동의 위상 추정량이 아닙니다.'
          ]
        : [
            '위상만 포함하는 축약 모델입니다. order parameter와 local coherence는 순간 위상 정렬이며 기계 에너지가 없습니다. 고립 노드의 local coherence는 0입니다.',
            '그래프는 무방향이며 각 행의 이웃 가중치 합으로 결합을 정규화합니다. self 항을 포함한 기존 all-to-all K/N과는 유효 결합 세기가 다릅니다.'
          ]),
    ...(config.systemId === 'system:huygens-phase-pair'
      ? [
          'Huygens 위상 축약은 진폭·탈진기·지지대 반동·충돌·기어 마찰을 포함하지 않습니다. 음의 K는 역위상 잠금 예제이며 실제 시계의 기계 모형이 아닙니다.'
        ]
      : []),
    ...(config.systemId === 'system:chimera-exploration'
      ? [
          '기존 synchronization exploration과 같은 midpoint RK2와 매 단계 위상 wrapping을 사용합니다. ringOrder는 stable ID 순서이며 반경 R의 단위 가중치 비국소 고리를 유지합니다.',
          'chimera-candidate는 유한 크기 순간 진단입니다. 장시간 지속성·N·반경·초기조건 교란을 확인하기 전 안정한 chimera로 단정할 수 없습니다.'
        ]
      : [])
  ];
}
