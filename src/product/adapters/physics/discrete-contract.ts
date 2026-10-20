import { fields, invalid } from '../../contracts/contract-checks';
import { EXPERIMENT_SCHEMA, type ExperimentStateV1 } from '../../contracts/experiment';
import { validateExperimentState } from '../../contracts/experiment-validation';
import type { QuantityValue } from '../../contracts/quantities';
import { issue, success, type ContractIssue, type ContractResult } from '../../contracts/validation';
import { inspectSafeData } from '../../persistence/safe-data';
import {
  DISCRETE_INTEGRATOR_VERSION,
  DISCRETE_MODEL_VERSION,
  DISCRETE_SYSTEM_IDS,
  MAX_DISCRETE_GRID,
  MAX_DISCRETE_MATRIX,
  MAX_DISCRETE_STEPS,
  MAX_DISCRETE_WORK,
  discreteParameterFields,
  type DiscreteConfig,
  type DiscreteSystemId
} from './discrete-schema';

export const discreteStepCount = (c: Pick<DiscreteConfig, 'systemId' | 'iterations'>) =>
  c.systemId === 'system:unitary-floquet' ? 0 : c.iterations;
const zero = (x: number) => (x === 0 ? 0 : x);
export function validateDiscreteConfig(input: unknown): ContractResult<DiscreteConfig> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  const issues: ContractIssue[] = [];
  if (
    !fields(
      safe.value,
      [
        'systemId',
        'parameters',
        'gridSize',
        'initialState',
        'integratorId',
        'iterations',
        'startIteration',
        'sampleEvery'
      ],
      ['wavefunction', 'matrix', 'analyses', 'provenance'],
      '$',
      issues
    )
  )
    return { ok: false, issues };
  const c = safe.value;
  if (!(DISCRETE_SYSTEM_IDS as readonly unknown[]).includes(c.systemId))
    return { ok: false, issues: [issue('unsupported-system', '$.systemId', '지원하는 이산·양자 모델이 아닙니다.')] };
  const id = c.systemId as DiscreteSystemId;
  const range = (v: unknown, min: number, max: number, path: string, integer = false) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isSafeInteger(v)))
      invalid(issues, path, `${min}–${max} 범위의 유한${integer ? ' 정수' : '한 수'}가 필요합니다.`);
  };
  const fs = discreteParameterFields(id);
  if (
    fields(
      c.parameters,
      fs.map((f) => f.key),
      [],
      '$.parameters',
      issues
    )
  )
    for (const f of fs) range(c.parameters[f.key], f.min, f.max, `$.parameters.${f.key}`);
  range(
    c.gridSize,
    id === 'system:standard-map' ? 1 : 2,
    id === 'system:standard-map' ? 1 : id === 'system:unitary-floquet' ? MAX_DISCRETE_MATRIX : MAX_DISCRETE_GRID,
    '$.gridSize',
    true
  );
  const n =
    typeof c.gridSize === 'number' &&
    Number.isSafeInteger(c.gridSize) &&
    c.gridSize >= 1 &&
    c.gridSize <= MAX_DISCRETE_GRID
      ? c.gridSize
      : 0;
  if (id === 'system:quantum-kicked-rotor' && (n < 2 || (n & (n - 1)) !== 0))
    invalid(issues, '$.gridSize', 'FFT 격자는 2 이상의 2의 거듭제곱이어야 합니다.');
  const vector = (v: unknown, length: number, path: string, bound = 1000): number[] => {
    if (!Array.isArray(v) || v.length !== length) {
      invalid(issues, path, `성분 ${length}개가 필요합니다.`);
      return [];
    }
    v.forEach((x, i) => range(x, -bound, bound, `${path}[${i}]`));
    return v as number[];
  };
  const initialState = vector(c.initialState, id === 'system:standard-map' ? 2 : 0, '$.initialState', Number.MAX_VALUE);
  if (
    id === 'system:standard-map' &&
    initialState.length === 2 &&
    (initialState[0]! < 0 || initialState[0]! >= 2 * Math.PI)
  )
    invalid(issues, '$.initialState[0]', '원통의 초기 θ는 [0,2π) 범위여야 합니다.');
  if (id === 'system:quantum-kicked-rotor') {
    if (fields(c.wavefunction, ['re', 'im'], [], '$.wavefunction', issues)) {
      const re = vector(c.wavefunction.re, n, '$.wavefunction.re', Number.MAX_VALUE),
        im = vector(c.wavefunction.im, n, '$.wavefunction.im', Number.MAX_VALUE);
      const norm = re.reduce((s, r, i) => s + r * r + (im[i] ?? 0) ** 2, 0);
      if (!(norm > 1e-24 && Number.isFinite(norm)))
        invalid(
          issues,
          '$.wavefunction',
          '확률 norm은 1e−24보다 큰 유한한 값이어야 합니다. 입력을 자동 정규화하지 않습니다.'
        );
    }
  } else if (c.wavefunction !== undefined) invalid(issues, '$.wavefunction', '이 모델에는 파동함수 입력이 없습니다.');
  if (id === 'system:unitary-floquet') {
    if (fields(c.matrix, ['re', 'im'], [], '$.matrix', issues))
      for (const part of ['re', 'im'] as const) {
        const rows = c.matrix[part];
        if (!Array.isArray(rows) || rows.length !== n) invalid(issues, `$.matrix.${part}`, `행 ${n}개가 필요합니다.`);
        else rows.forEach((row, i) => vector(row, n, `$.matrix.${part}[${i}]`, 10));
      }
  } else if (c.matrix !== undefined) invalid(issues, '$.matrix', '이 모델에는 행렬 입력이 없습니다.');
  if (c.integratorId !== 'internal')
    invalid(issues, '$.integratorId', '전용 이산 사상·FFT 주기·스펙트럼 평가만 지원합니다.');
  range(c.iterations, 1, MAX_DISCRETE_STEPS, '$.iterations', true);
  range(c.startIteration, 0, Number.MAX_SAFE_INTEGER - MAX_DISCRETE_STEPS, '$.startIteration', true);
  range(c.sampleEvery, 1, MAX_DISCRETE_STEPS, '$.sampleEvery', true);
  if (typeof c.iterations === 'number' && id === 'system:quantum-kicked-rotor' && c.iterations * n > MAX_DISCRETE_WORK)
    invalid(issues, '$.iterations', '격자×반복 작업 예산을 초과했습니다. 격자 또는 반복 수를 줄이세요.');
  if (c.analyses !== undefined && (!Array.isArray(c.analyses) || c.analyses.length !== 0))
    issues.push(
      issue(
        'unsupported-analysis',
        '$.analyses',
        '이산·양자 전용 진단만 지원합니다. 비호환 연속계 분석이 있는 원본을 보존하세요.',
        'keep-original'
      )
    );
  if (issues.length) return { ok: false, issues };
  const config = c as unknown as DiscreteConfig;
  const checked = validateExperimentState(rawCanonical(config));
  return checked.ok ? success(config) : checked;
}
function rawCanonical(c: DiscreteConfig): ExperimentStateV1 {
  const parameters: Record<string, QuantityValue> = {};
  for (const [k, value] of Object.entries({
    ...c.parameters,
    gridSize: c.gridSize,
    configuredIterations: c.iterations,
    configuredStart: c.startIteration,
    configuredSampleEvery: c.sampleEvery
  }))
    parameters[k] = { kind: 'scalar', value: zero(value), unit: '1' };
  const initialConditions: Record<string, QuantityValue> = {};
  if (c.systemId === 'system:standard-map') {
    initialConditions.theta = { kind: 'scalar', value: zero(c.initialState[0]!), unit: 'rad' };
    initialConditions.p = { kind: 'scalar', value: zero(c.initialState[1]!), unit: '1' };
  } else if (c.wavefunction)
    initialConditions.wavefunction = {
      kind: 'complex-vector',
      re: c.wavefunction.re.map(zero),
      im: c.wavefunction.im.map(zero),
      unit: '1'
    };
  else if (c.matrix)
    initialConditions.operator = {
      kind: 'complex-vector',
      re: c.matrix.re.flat().map(zero),
      im: c.matrix.im.flat().map(zero),
      unit: '1'
    };
  return {
    schema: EXPERIMENT_SCHEMA,
    systemId: c.systemId,
    modelVersion: DISCRETE_MODEL_VERSION,
    parameters,
    initialConditions,
    modelOptions: {
      timeConvention: 'normalized',
      representation:
        c.systemId === 'system:standard-map'
          ? 'phase-cylinder'
          : c.systemId === 'system:quantum-kicked-rotor'
            ? 'fft-momentum'
            : 'row-major-operator'
    },
    integrator: { kind: 'internal', version: DISCRETE_INTEGRATOR_VERSION, settings: {} },
    runtime:
      c.systemId === 'system:unitary-floquet'
        ? { domain: 'evaluation' }
        : { domain: 'iteration', start: c.startIteration, iterations: c.iterations, sampleEvery: c.sampleEvery },
    analyses: c.analyses ?? [],
    ...(c.provenance ? { provenance: c.provenance } : {})
  };
}
export function toCanonicalDiscrete(input: DiscreteConfig): ContractResult<ExperimentStateV1> {
  const checked = validateDiscreteConfig(input);
  return checked.ok ? validateExperimentState(rawCanonical(checked.value)) : checked;
}
export function fromCanonicalDiscrete(input: unknown): ContractResult<DiscreteConfig> {
  const checked = validateExperimentState(input);
  if (!checked.ok) return checked;
  const v = checked.value,
    issues: ContractIssue[] = [];
  if (!(DISCRETE_SYSTEM_IDS as readonly string[]).includes(v.systemId) || v.modelVersion !== DISCRETE_MODEL_VERSION)
    return {
      ok: false,
      issues: [issue('unsupported-version', '$', '지원하는 이산·양자 모델 버전을 선택하세요.', 'keep-original')]
    };
  const id = v.systemId as DiscreteSystemId;
  fields(v.modelOptions, ['timeConvention', 'representation'], [], '$.modelOptions', issues);
  const representation =
    id === 'system:standard-map'
      ? 'phase-cylinder'
      : id === 'system:quantum-kicked-rotor'
        ? 'fft-momentum'
        : 'row-major-operator';
  if (v.modelOptions?.timeConvention !== 'normalized' || v.modelOptions.representation !== representation)
    invalid(issues, '$.modelOptions', '모델의 정규화 단위와 상태 표현을 보존해야 합니다.');
  if (v.topology !== undefined || v.seed !== undefined)
    invalid(issues, '$', '이 결정론적 모델에 표현할 수 없는 topology 또는 seed입니다.');
  if (
    v.integrator.kind !== 'internal' ||
    v.integrator.version !== DISCRETE_INTEGRATOR_VERSION ||
    v.integrator.options !== undefined ||
    Object.keys(v.integrator.settings).length
  )
    invalid(issues, '$.integrator', '지원하는 전용 stepper 설정이 필요합니다.');
  fields(
    v.parameters,
    [
      ...discreteParameterFields(id).map((f) => f.key),
      'gridSize',
      'configuredIterations',
      'configuredStart',
      'configuredSampleEvery'
    ],
    [],
    '$.parameters',
    issues
  );
  fields(
    v.initialConditions,
    id === 'system:standard-map'
      ? ['theta', 'p']
      : [id === 'system:quantum-kicked-rotor' ? 'wavefunction' : 'operator'],
    [],
    '$.initialConditions',
    issues
  );
  const scalar = (key: string) => {
    const q = v.parameters[key];
    if (!q || q.kind !== 'scalar' || q.unit !== '1') {
      invalid(issues, `$.parameters.${key}`, '정규화 scalar가 필요합니다.');
      return 0;
    }
    return q.value;
  };
  const n = scalar('gridSize'),
    iterations = scalar('configuredIterations'),
    startIteration = scalar('configuredStart'),
    sampleEvery = scalar('configuredSampleEvery');
  if (
    id === 'system:unitary-floquet'
      ? v.runtime.domain !== 'evaluation'
      : v.runtime.domain !== 'iteration' ||
        v.runtime.start !== startIteration ||
        v.runtime.iterations !== iterations ||
        v.runtime.sampleEvery !== sampleEvery
  )
    invalid(issues, '$.runtime', '모델 실행 설정과 runtime이 일치해야 합니다.');
  const initialState: number[] = [];
  if (id === 'system:standard-map')
    for (const key of ['theta', 'p']) {
      const q = v.initialConditions[key];
      if (!q || q.kind !== 'scalar' || q.unit !== (key === 'theta' ? 'rad' : '1'))
        invalid(issues, `$.initialConditions.${key}`, '모델 좌표의 단위를 확인하세요.');
      else initialState.push(q.value);
    }
  const q = v.initialConditions[id === 'system:quantum-kicked-rotor' ? 'wavefunction' : 'operator'];
  if (
    id !== 'system:standard-map' &&
    (!q ||
      q.kind !== 'complex-vector' ||
      q.unit !== '1' ||
      q.re.length !== (id === 'system:quantum-kicked-rotor' ? n : n * n))
  )
    invalid(issues, '$.initialConditions', '동일 차원의 복소수 상태 또는 row-major 연산자가 필요합니다.');
  if (issues.length) return { ok: false, issues };
  const complex = q && q.kind === 'complex-vector' ? q : undefined;
  // Bound dimensions before constructing any nested matrix from transport data.
  if (
    !Number.isSafeInteger(n) ||
    n < 1 ||
    n > (id === 'system:unitary-floquet' ? MAX_DISCRETE_MATRIX : MAX_DISCRETE_GRID)
  )
    return { ok: false, issues: [issue('invalid-value', '$.parameters.gridSize', '지원하는 차원 범위를 확인하세요.')] };
  return validateDiscreteConfig({
    systemId: id,
    parameters: Object.fromEntries(discreteParameterFields(id).map((f) => [f.key, scalar(f.key)])),
    gridSize: n,
    initialState,
    ...(id === 'system:quantum-kicked-rotor' && complex ? { wavefunction: { re: complex.re, im: complex.im } } : {}),
    ...(id === 'system:unitary-floquet' && complex
      ? {
          matrix: {
            re: Array.from({ length: n }, (_, i) => complex.re.slice(i * n, (i + 1) * n)),
            im: Array.from({ length: n }, (_, i) => complex.im.slice(i * n, (i + 1) * n))
          }
        }
      : {}),
    integratorId: 'internal',
    iterations,
    startIteration,
    sampleEvery,
    analyses: v.analyses,
    ...(v.provenance ? { provenance: v.provenance } : {})
  });
}
export const validateDiscreteExperiment = validateDiscreteConfig;
export const discreteToCanonical = toCanonicalDiscrete;
export const discreteFromCanonical = fromCanonicalDiscrete;
