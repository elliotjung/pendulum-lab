import type { UnitaryFloquetSpectrum } from '../../../research/unitaryFloquet';
import type { AnalysisState, ExperimentProvenance } from '../../contracts/experiment';
import type { CanonicalUnit } from '../../contracts/quantities';

export const DISCRETE_SYSTEM_IDS = [
  'system:standard-map',
  'system:quantum-kicked-rotor',
  'system:unitary-floquet'
] as const;
export type DiscreteSystemId = (typeof DISCRETE_SYSTEM_IDS)[number];
export const DISCRETE_MODEL_VERSION = 'discrete-model-v1';
export const DISCRETE_INTEGRATOR_VERSION = 'discrete-native-v1';
export const MAX_DISCRETE_GRID = 512;
export const MAX_DISCRETE_MATRIX = 8;
export const MAX_DISCRETE_STEPS = 100_000;
export const MAX_DISCRETE_WORK = 2_000_000;
export const DISCRETE_MAX_SAMPLES = 1001;
export interface DiscreteComplexState {
  readonly re: readonly number[];
  readonly im: readonly number[];
}
export interface DiscreteMatrix {
  readonly re: readonly (readonly number[])[];
  readonly im: readonly (readonly number[])[];
}
export interface DiscreteConfig {
  readonly systemId: DiscreteSystemId;
  readonly parameters: Readonly<Record<string, number>>;
  readonly gridSize: number;
  readonly initialState: readonly number[];
  readonly wavefunction?: DiscreteComplexState;
  readonly matrix?: DiscreteMatrix;
  readonly integratorId: 'internal';
  readonly iterations: number;
  readonly startIteration: number;
  readonly sampleEvery: number;
  readonly analyses?: readonly AnalysisState[];
  readonly provenance?: ExperimentProvenance;
}
export interface DiscreteSample {
  readonly step: number;
  readonly iteration: number;
  readonly state: readonly number[];
  readonly theta: number;
  readonly p: number;
  /** Native FFT ordering; display momentum supplies the matching quantum numbers. */
  readonly re: readonly number[];
  readonly im: readonly number[];
  readonly momentum: readonly number[];
  readonly probability: readonly number[];
  readonly norm: number;
  /** Absolute deviation from probability one; evolution is never renormalized. */
  readonly normDrift: number;
  readonly meanSquareMomentum: number;
  readonly spectrum?: UnitaryFloquetSpectrum;
  readonly warnings: readonly string[];
}
export interface DiscreteParameterField {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly canonicalUnit: CanonicalUnit;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}
const f = (key: string, label: string, min: number, max: number, step = 0.1): DiscreteParameterField => ({
  key,
  label,
  unit: '정규화',
  canonicalUnit: '1',
  min,
  max,
  step
});
export function discreteParameterFields(id: DiscreteSystemId): readonly DiscreteParameterField[] {
  if (id === 'system:standard-map') return [f('kickStrength', '킥 강도 K', -20, 20)];
  if (id === 'system:quantum-kicked-rotor')
    return [f('kickStrength', '킥 강도 K', -20, 20), f('hbar', '유효 ℏ', 0.01, 20, 0.01)];
  return [f('hbar', '유효 ℏ', 0.01, 20, 0.01), f('period', '정규화 주기 T', 0.01, 100, 0.01)];
}
export function defaultDiscreteConfig(systemId: DiscreteSystemId = 'system:standard-map'): DiscreteConfig {
  if (!(DISCRETE_SYSTEM_IDS as readonly string[]).includes(systemId))
    throw new RangeError('지원하는 이산·양자 모델을 선택하세요.');
  const gridSize = systemId === 'system:standard-map' ? 1 : systemId === 'system:unitary-floquet' ? 4 : 8;
  const phases = [-1.2, -0.3, 0.7, 2.1];
  return {
    systemId,
    parameters:
      systemId === 'system:standard-map'
        ? { kickStrength: 1.2 }
        : systemId === 'system:quantum-kicked-rotor'
          ? { kickStrength: 5, hbar: 1 }
          : { hbar: 1, period: 1 },
    gridSize,
    initialState: systemId === 'system:standard-map' ? [1, 0] : [],
    ...(systemId === 'system:quantum-kicked-rotor'
      ? {
          wavefunction: {
            re: Array.from({ length: gridSize }, (_, i) => (i === 0 ? 1 : 0)),
            im: Array(gridSize).fill(0) as number[]
          }
        }
      : {}),
    ...(systemId === 'system:unitary-floquet'
      ? {
          matrix: {
            re: phases.map((p, i) => phases.map((_, j) => (i === j ? Math.cos(p) : 0))),
            im: phases.map((p, i) => phases.map((_, j) => (i === j ? Math.sin(p) : 0)))
          }
        }
      : {}),
    integratorId: 'internal',
    iterations: 128,
    startIteration: 0,
    sampleEvery: 1
  };
}
export function resizeDiscreteConfig(c: DiscreteConfig, gridSize: number): DiscreteConfig {
  if (
    c.systemId === 'system:standard-map' ||
    !Number.isInteger(gridSize) ||
    gridSize < 2 ||
    gridSize > (c.systemId === 'system:unitary-floquet' ? MAX_DISCRETE_MATRIX : MAX_DISCRETE_GRID) ||
    (c.systemId === 'system:quantum-kicked-rotor' && (gridSize & (gridSize - 1)) !== 0)
  )
    throw new RangeError('지원하는 격자 크기 또는 행렬 차원을 선택하세요.');
  if (c.systemId === 'system:quantum-kicked-rotor')
    return {
      ...structuredClone(c),
      gridSize,
      wavefunction: {
        re: Array.from({ length: gridSize }, (_, i) => (i === 0 ? 1 : 0)),
        im: Array(gridSize).fill(0) as number[]
      }
    };
  const phases = Array.from({ length: gridSize }, (_, i) => -2 + (4 * i) / gridSize);
  return {
    ...structuredClone(c),
    gridSize,
    matrix: {
      re: phases.map((p, i) => phases.map((_, j) => (i === j ? Math.cos(p) : 0))),
      im: phases.map((p, i) => phases.map((_, j) => (i === j ? Math.sin(p) : 0)))
    }
  };
}
export function discreteWarnings(c: DiscreteConfig): string[] {
  if (c.systemId === 'system:standard-map')
    return [
      '표준 사상은 정규화한 θ와 p를 한 번씩 반복합니다. θ는 [0,2π), p는 감싸지 않습니다. 반복 번호는 연속 시간이나 SI 초가 아닙니다.',
      '단일 유한 궤적으로 전역 확산이나 KAM 장벽의 소멸을 증명할 수 없습니다.'
    ];
  const shared = [
    '복소수·행렬 성분, ℏ와 준에너지는 정규화 값입니다. 자동 norm 보정과 고유값 단위원 투영을 하지 않습니다.',
    '작은 밀집 Floquet 스펙트럼은 기존 특성다항식 수치 근을 사용합니다. 중복·가까운 고유값의 정확성과 수렴은 별도 검증이 필요합니다.'
  ];
  if (c.systemId === 'system:unitary-floquet')
    return [
      ...shared,
      '입력 연산자의 unitarity defect와 원 고유값의 단위원 이탈을 함께 확인하세요. 비유니터리 입력도 진단하며, 이 평가에는 시간 적분기와 궤적이 없습니다.'
    ];
  const initialNorm = c.wavefunction?.re.reduce((s, r, i) => s + r * r + c.wavefunction!.im[i]! ** 2, 0) ?? 0;
  return [
    ...shared,
    'FFT 순서 m=0,…,N/2−1,−N/2,…,−1을 보존합니다. 유한 주기 격자의 경계 확률과 N에 따른 수렴을 확인해야 합니다. 작은 격자만으로 동역학적 국소화를 판단하지 마세요.',
    ...(Math.abs(initialNorm - 1) > 1e-10
      ? [
          `입력 파동함수의 초기 확률 norm=${initialNorm.toPrecision(8)}입니다. 1과의 편차를 표시하며 입력 계수를 정규화하지 않습니다.`
        ]
      : []),
    ...(c.gridSize > MAX_DISCRETE_MATRIX
      ? [
          `같은 N=${c.gridSize} 격자의 밀집 준에너지 평가는 지원 한계 N≤${MAX_DISCRETE_MATRIX}를 초과하므로 생략합니다. 파동함수 진화는 같은 전체 격자에서 수행합니다.`
        ]
      : [`준에너지는 파동함수와 동일한 유한 N=${c.gridSize} Floquet 연산자로 평가합니다.`])
  ];
}
