import {
  eulerMaruyamaStep,
  milsteinStep,
  commutativeMilsteinStep,
  stochasticHeunStratonovichStep,
  type GaussianSampler,
  type MatrixSdeScratch,
  type DiffusionMatrix,
  type DiffusionMatrixJacobian
} from '../../../physics/stochasticSteppers';
import type { Derivative, StateVector } from '../../../physics/types';
import { fields, invalid, isRecord } from '../../contracts/contract-checks';
import type { OptionMap } from '../../contracts/experiment';
import type { QuantityMap } from '../../contracts/quantities';
import type { ContractIssue } from '../../contracts/validation';
import { inspectSafeData } from '../../persistence/safe-data';

type Pair = readonly [number, number];
type Matrix2 = readonly [number, number, number, number];
interface AffineDiffusion {
  readonly offset: Pair;
  readonly slope: Pair;
}
export type FieldStochasticOptions = AffineDiffusion &
  (
    | { readonly scheme: 'euler-maruyama' | 'milstein' }
    | { readonly scheme: 'heun-stratonovich' | 'commutative-milstein'; readonly matrix: Matrix2 }
  );
export const FIELD_STOCHASTIC_SCHEMES = [
  'euler-maruyama',
  'milstein',
  'heun-stratonovich',
  'commutative-milstein'
] as const;
const isMatrix = (scheme: string) => scheme === 'heun-stratonovich' || scheme === 'commutative-milstein';

export function validateFieldStochastic(input: unknown, systemId: string, issues: ContractIssue[]): void {
  if (input === undefined) return;
  if (systemId !== 'system:langevin') {
    invalid(issues, '$.stochastic', '확률 확산 설정은 Langevin 진자에서만 지원합니다.');
    return;
  }
  const safe = inspectSafeData(input);
  if (!safe.ok) {
    issues.push(...safe.issues);
    return;
  }
  const value = safe.value;
  if (
    !isRecord(value) ||
    typeof value.scheme !== 'string' ||
    !(FIELD_STOCHASTIC_SCHEMES as readonly string[]).includes(value.scheme)
  ) {
    invalid(issues, '$.stochastic.scheme', '지원하는 네 가지 확률 scheme 중 하나를 선택하세요.');
    return;
  }
  fields(
    value,
    ['scheme', 'offset', 'slope', ...(isMatrix(value.scheme) ? ['matrix'] : [])],
    [],
    '$.stochastic',
    issues
  );
  for (const [key, size] of [
    ['offset', 2],
    ['slope', 2],
    ...(isMatrix(value.scheme) ? [['matrix', 4] as const] : [])
  ] as const) {
    const vector = value[key];
    if (
      !Array.isArray(vector) ||
      vector.length !== size ||
      vector.some((v) => typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 10)
    )
      invalid(issues, `$.stochastic.${key}`, `−10–10 범위의 유한한 숫자 ${size}개가 필요합니다.`);
  }
}
export function fieldStochasticCanonical(value: FieldStochasticOptions | undefined): {
  settings: QuantityMap;
  options?: OptionMap;
} {
  return value === undefined
    ? { settings: {} }
    : {
        settings: {
          diffusionOffset: { kind: 'vector', values: value.offset, unit: '1' },
          diffusionSlope: { kind: 'vector', values: value.slope, unit: '1' },
          ...('matrix' in value
            ? { diffusionMatrix: { kind: 'vector' as const, values: value.matrix, unit: '1' as const } }
            : {})
        },
        options: { scheme: value.scheme, diffusionModel: 'row-affine-v1' }
      };
}
export function readFieldStochastic(
  settings: QuantityMap,
  options: OptionMap | undefined,
  issues: ContractIssue[]
): FieldStochasticOptions | undefined {
  if (options === undefined && !Object.keys(settings).length) return;
  if (!fields(options, ['scheme', 'diffusionModel'], [], '$.integrator.options', issues)) return;
  if (
    typeof options.scheme !== 'string' ||
    !(FIELD_STOCHASTIC_SCHEMES as readonly string[]).includes(options.scheme) ||
    options.diffusionModel !== 'row-affine-v1'
  ) {
    invalid(issues, '$.integrator.options', '지원하는 확률 scheme과 row-affine-v1 확산 버전이 필요합니다.');
    return;
  }
  const matrix = isMatrix(options.scheme);
  fields(
    settings,
    ['diffusionOffset', 'diffusionSlope', ...(matrix ? ['diffusionMatrix'] : [])],
    [],
    '$.integrator.settings',
    issues
  );
  const vector = (key: string, size: number): readonly number[] => {
    const q = settings[key];
    if (!q || q.kind !== 'vector' || q.unit !== '1' || q.values.length !== size) {
      invalid(issues, `$.integrator.settings.${key}`, `단위 1의 ${size}성분 vector가 필요합니다.`);
      return [];
    }
    return q.values;
  };
  const result = {
    scheme: options.scheme,
    offset: vector('diffusionOffset', 2),
    slope: vector('diffusionSlope', 2),
    ...(matrix ? { matrix: vector('diffusionMatrix', 4) } : {})
  } as FieldStochasticOptions;
  validateFieldStochastic(result, 'system:langevin', issues);
  return result;
}

/** Declarative diffusion callbacks only; every drift and SDE step is native. */
export function fieldStochasticCallbacks(sigma: number, options: FieldStochasticOptions) {
  const diagonal = (state: StateVector) =>
    [0, 1].map((i) => sigma * (options.offset[i]! + options.slope[i]! * state[i]!));
  const prime = options.slope.map((value) => sigma * value);
  const diffusion: DiffusionMatrix = (state, out, noiseDimension) => {
    if (!('matrix' in options) || noiseDimension !== 2) throw new Error('2×2 확산 행렬이 필요합니다.');
    for (let i = 0; i < 2; i++)
      for (let k = 0; k < 2; k++)
        out[i * 2 + k] = sigma * (options.offset[i]! + options.slope[i]! * state[i]!) * options.matrix[i * 2 + k]!;
  };
  const jacobian: DiffusionMatrixJacobian = (_state, out, noiseDimension) => {
    if (!('matrix' in options) || noiseDimension !== 2) throw new Error('2×2 확산 행렬이 필요합니다.');
    out.fill(0);
    for (let i = 0; i < 2; i++)
      for (let k = 0; k < 2; k++) out[(i * 2 + k) * 2 + i] = sigma * options.slope[i]! * options.matrix[i * 2 + k]!;
  };
  return { diagonal, prime, diffusion, jacobian };
}
export function createFieldStochasticStepper(
  sigma: number,
  options: FieldStochasticOptions | undefined,
  drift: Derivative
) {
  const callbacks = options === undefined ? undefined : fieldStochasticCallbacks(sigma, options);
  const scratch: MatrixSdeScratch = {};
  return (state: StateVector, dt: number, gaussian: GaussianSampler, out: StateVector): void => {
    if (options === undefined) {
      eulerMaruyamaStep(state, dt, drift, [0, sigma], gaussian, out);
      return;
    }
    if (options.scheme === 'euler-maruyama')
      eulerMaruyamaStep(state, dt, drift, callbacks!.diagonal(state), gaussian, out);
    else if (options.scheme === 'milstein')
      milsteinStep(state, dt, drift, callbacks!.diagonal(state), callbacks!.prime, gaussian, out);
    else if (options.scheme === 'heun-stratonovich')
      stochasticHeunStratonovichStep(state, dt, drift, 2, callbacks!.diffusion, gaussian, out, scratch);
    else
      commutativeMilsteinStep(state, dt, drift, 2, callbacks!.diffusion, callbacks!.jacobian, gaussian, out, scratch);
  };
}
export function fieldStochasticWarnings(options: FieldStochasticOptions): string[] {
  return [
    `선택한 native scheme: ${options.scheme}. σ는 공통 잡음 세기이며 대각 확산은 σ·(offsetᵢ+slopeᵢ·xᵢ), 행렬 확산은 이 값×Mᵢₖ입니다.`,
    options.scheme === 'heun-stratonovich'
      ? 'Stratonovich 해석입니다. 곱셈 잡음에서 같은 drift를 쓰는 Itô 모델과 다른 확률 방정식이며 자동 drift 보정은 하지 않습니다.'
      : 'Itô 해석입니다. Milstein에는 이 row-affine 확산의 정확한 도함수를 제공합니다. 계산된 경로 자체가 강수렴 차수를 인증하지는 않습니다.',
    ...('matrix' in options
      ? [
          '2개의 독립 Brownian 채널을 사용합니다. 각 행이 자기 성분에만 의존하는 affine 계수×상수 행렬이므로 잡음 벡터장은 서로 commute합니다. 임의의 비가환 사용자 함수를 실행하지 않습니다.'
        ]
      : []),
    '같은 seed·scheme·확산 설정·dt에서 경로를 재현합니다. scheme 변경은 난수 소비 순서를 바꿀 수 있으며 dt 변경 시 같은 Brownian path를 보장하지 않습니다.'
  ];
}
