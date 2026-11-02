import { restartedArnoldi } from '../../../../research/arnoldi';
import { restartedLanczos } from '../../../../research/lanczos';
import { eigenvaluesGeneral } from '../../../../research/eigenGeneral';
import {
  EIGEN_LIMITS,
  type EigenOperator,
  type EigenSettings,
  type EigenOutput,
  type EigenModel,
  type EigenPair
} from './eigen-contracts';
import {
  eigenApply,
  eigenClosed,
  eigenDimension,
  eigenEstimatedWork,
  eigenRecord,
  eigenSeed,
  safeEigenData,
  validateEigen
} from './eigen-validation';
export * from './eigen-contracts';
export { validateEigen } from './eigen-validation';

const close = (a: number, b: number) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-11 * Math.max(1, Math.abs(a), Math.abs(b));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0;
const integer = (value: unknown, max: number): value is number =>
  nonnegative(value) && Number.isSafeInteger(value) && value <= max;
const vector = (value: unknown, n: number): value is number[] =>
  Array.isArray(value) && value.length === n && value.every(finite);
/** Independently evaluate a complex Ritz vector using the original real operator. */
export function eigenResidual(operator: EigenOperator, pair: Pick<EigenPair, 'value' | 'vector'>): number {
  const aRe = eigenApply(operator, pair.vector.re),
    aIm = eigenApply(operator, pair.vector.im);
  let sum = 0;
  for (let i = 0; i < aRe.length; i++) {
    const re = aRe[i]! - pair.value.re * pair.vector.re[i]! + pair.value.im * pair.vector.im[i]!,
      im = aIm[i]! - pair.value.re * pair.vector.im[i]! - pair.value.im * pair.vector.re[i]!;
    sum += re * re + im * im;
  }
  return Math.sqrt(sum);
}
function validatePair(input: unknown, operator: EigenOperator, settings: EigenSettings): asserts input is EigenPair {
  const n = eigenDimension(operator);
  if (!eigenRecord(input) || !eigenRecord(input.value) || !eigenRecord(input.vector))
    throw new Error('고유쌍 데이터 객체가 필요합니다.');
  eigenClosed(input, ['value', 'vector', 'nativeResidual', 'residual']);
  eigenClosed(input.value, ['re', 'im']);
  eigenClosed(input.vector, ['re', 'im']);
  if (
    !finite(input.value.re) ||
    !finite(input.value.im) ||
    !vector(input.vector.re, n) ||
    !vector(input.vector.im, n) ||
    !nonnegative(input.nativeResidual) ||
    !nonnegative(input.residual)
  )
    throw new Error('고유쌍의 차원·유한값·잔차가 유효하지 않습니다.');
  const imaginary = input.vector.im;
  const norm = Math.sqrt(input.vector.re.reduce((sum, v, i) => sum + v * v + imaginary[i]! ** 2, 0));
  if (Math.abs(norm - 1) > 1e-7) throw new Error('저장된 고유벡터가 단위 정규화되어 있지 않습니다.');
  if (settings.method === 'lanczos' && (input.value.im !== 0 || input.vector.im.some((v) => v !== 0)))
    throw new Error('Lanczos 결과는 실수 고유쌍이어야 합니다.');
  if (!close(eigenResidual(operator, input as unknown as EigenPair), input.residual))
    throw new Error('저장된 고유쌍 잔차가 원본 연산자와 일치하지 않습니다.');
}
function validateModel(input: unknown, operator: EigenOperator, settings: EigenSettings): asserts input is EigenModel {
  safeEigenData(input);
  if (!eigenRecord(input) || input.method !== settings.method)
    throw new Error('저장된 고유해석 모델의 방법이 다릅니다.');
  const n = eigenDimension(operator);
  if (settings.method === 'general-eigensolver') {
    eigenClosed(input, ['kind', 'method', 'values']);
    if (input.kind !== 'dense-spectrum' || !Array.isArray(input.values) || input.values.length !== n)
      throw new Error('일반 고유값 모델의 차원이 맞지 않습니다.');
    for (const value of input.values) {
      if (!eigenRecord(value)) throw new Error('복소 고유값 객체가 필요합니다.');
      eigenClosed(value, ['re', 'im']);
      if (!finite(value.re) || !finite(value.im)) throw new Error('고유값이 유한하지 않습니다.');
    }
    if (operator.kind !== 'dense') throw new Error('일반 고유값 복원은 조밀 행렬만 지원합니다.');
    const replay = eigenvaluesGeneral(operator.matrix),
      values = input.values as { re: number; im: number }[];
    if (replay.some((value, i) => !close(value.re, values[i]!.re) || !close(value.im, values[i]!.im)))
      throw new Error('저장된 고유값이 원본 행렬의 제한된 재계산과 일치하지 않습니다.');
    return;
  }
  eigenClosed(input, ['kind', 'method', 'eigenpairs', 'nativeConverged', 'nativeRestarts', 'matVecs', 'trace']);
  const maxMatVecs = settings.maxRestarts * settings.krylovDim * (settings.method === 'lanczos' ? 2 : 1);
  if (
    input.kind !== 'krylov' ||
    !Array.isArray(input.eigenpairs) ||
    !input.eigenpairs.length ||
    input.eigenpairs.length > settings.k ||
    typeof input.nativeConverged !== 'boolean' ||
    !integer(input.nativeRestarts, settings.maxRestarts + 1) ||
    input.nativeRestarts < 1 ||
    !integer(input.matVecs, maxMatVecs) ||
    input.matVecs < 1 ||
    !Array.isArray(input.trace) ||
    input.trace.length !== input.matVecs
  )
    throw new Error('Krylov 고유쌍·반복·실제 연산 기록이 유효하지 않습니다.');
  for (const pair of input.eigenpairs) validatePair(pair, operator, settings);
  if (input.nativeConverged !== input.eigenpairs.every((pair: EigenPair) => pair.nativeResidual <= settings.tolerance))
    throw new Error('native 수렴 상태와 native 잔차가 일치하지 않습니다.');
  for (let i = 0; i < input.trace.length; i++) {
    const event = input.trace[i];
    if (!eigenRecord(event)) throw new Error('고유해석 연산 기록 객체가 필요합니다.');
    eigenClosed(event, ['work']);
    if (event.work !== i + 1) throw new Error('고유해석 연산 기록이 연속하지 않습니다.');
  }
}
const BASE_WARNINGS = [
  '유한 표본의 일부 스펙트럼입니다. 작은 잔차는 전체 스펙트럼의 완전성이나 고유값 조건수를 보장하지 않습니다.',
  '공개 결과 ID·재계산은 데이터의 내부 일관성 검사이며 외부 연산자의 진위나 물리적 정확성을 인증하지 않습니다.'
];
/** Repeated copies of one accurate Ritz vector do not establish k eigenpairs. */
function independentVectors(pairs: readonly EigenPair[]): number {
  const basis: { re: number[]; im: number[] }[] = [];
  for (const pair of pairs) {
    const re = [...pair.vector.re],
      im = [...pair.vector.im];
    for (let pass = 0; pass < 2; pass++)
      for (const b of basis) {
        let cRe = 0,
          cIm = 0;
        for (let i = 0; i < re.length; i++) {
          cRe += b.re[i]! * re[i]! + b.im[i]! * im[i]!;
          cIm += b.re[i]! * im[i]! - b.im[i]! * re[i]!;
        }
        for (let i = 0; i < re.length; i++) {
          re[i]! -= b.re[i]! * cRe - b.im[i]! * cIm;
          im[i]! -= b.re[i]! * cIm + b.im[i]! * cRe;
        }
      }
    const norm = Math.sqrt(re.reduce((sum, v, i) => sum + v * v + im[i]! ** 2, 0));
    if (norm > 1e-8) basis.push({ re: re.map((v) => v / norm), im: im.map((v) => v / norm) });
  }
  return basis.length;
}
function output(operator: EigenOperator, settings: EigenSettings, model: EigenModel): EigenOutput {
  const n = eigenDimension(operator),
    warnings = [...BASE_WARNINGS],
    details = [
      `실수 ${operator.kind === 'dense' ? '조밀' : '희소'} 연산자, 차원${n}; 버전 native-research-krylov-v1.`,
      `seed=${settings.seed}; 허용오차=${settings.tolerance}; 예상 계산량=${eigenEstimatedWork(operator, settings)}.`,
      `계수는0 또는 절댓값${EIGEN_LIMITS.minNonzeroCoefficient}–${EIGEN_LIMITS.maxCoefficient}; 단위는 연산자가 정의하는 고유값 단위입니다.`
    ];
  if (model.kind === 'dense-spectrum') {
    let trace = 0;
    if (operator.kind === 'dense') for (let i = 0; i < n; i++) trace += operator.matrix[i]![i]!;
    const traceError = Math.abs(trace - model.values.reduce((sum, value) => sum + value.re, 0));
    warnings.push('일반 조밀 solver는 고유값만 반환합니다. 고유벡터 잔차나 Krylov 수렴으로 표시하지 않습니다.');
    details.push('저장 결과 재평가는 원본 행렬에서 제한된 동일 solver 재계산으로 스펙트럼을 확인합니다.');
    return {
      model,
      metrics: { dimension: n, eigenvalues: n, traceError, estimatedWork: eigenEstimatedWork(operator, settings) },
      columns: ['고유값 번호', '고유값 실수부', '고유값 허수부'],
      units: ['1', '연산자 단위', '연산자 단위'],
      rows: model.values.map((value, i) => [i + 1, value.re, value.im]),
      warnings,
      details
    };
  }
  const residuals = model.eigenpairs.map((pair) => eigenResidual(operator, pair)),
    rank = independentVectors(model.eigenpairs),
    accepted =
      model.eigenpairs.length === settings.k &&
      rank === settings.k &&
      residuals.every((value) => value <= settings.tolerance),
    maximumResidual = Math.max(...residuals),
    maximumNativeResidual = Math.max(...model.eigenpairs.map((pair) => pair.nativeResidual));
  if (!accepted)
    warnings.push(
      '요청한 고유쌍 수 또는 독립 재계산 잔차 기준을 충족하지 못했습니다. 최선의 후보이며 수렴 성공이 아닙니다.'
    );
  if (!model.nativeConverged)
    warnings.push('native solver가 재시작 상한 내 수렴하지 않았습니다. Krylov 차수·상한·스펙트럼 분리를 확인하세요.');
  if (model.eigenpairs.length < settings.k)
    warnings.push('도달한 불변 부분공간이 요청한 고유쌍 수보다 작습니다. seed나 k를 변경하세요.');
  if (rank < model.eigenpairs.length)
    warnings.push('반환 고유벡터가 선형 독립 기준을 충족하지 못했습니다. 중복·거의 결함이 있는 고유값을 확인하세요.');
  if (settings.method === 'arnoldi')
    warnings.push(
      'Arnoldi는 최대 절댓값 고유쌍을 구합니다. which 선택은 Lanczos에만 적용됩니다. 내부 고유값·복소 입력은 지원하지 않습니다.'
    );
  details.push(
    `실제 행렬·벡터 곱${model.matVecs}회; native 보고 cycle=${model.nativeRestarts}.`,
    'trace는 실제 행렬·벡터 곱 순서입니다. native API는 cycle별 잔차를 노출하지 않아 이를 생성하거나 추정하지 않습니다.',
    'native cycle 수는 상한 소진 시 maxRestarts+1을 보고할 수 있습니다. 독립 잔차와 요청 고유쌍 수로 수렴을 따로 판정합니다.'
  );
  return {
    model,
    metrics: {
      dimension: n,
      requested: settings.k,
      returned: model.eigenpairs.length,
      independentVectors: rank,
      accepted: accepted ? 1 : 0,
      nativeConverged: model.nativeConverged ? 1 : 0,
      maximumResidual,
      maximumNativeResidual,
      matVecs: model.matVecs,
      nativeRestarts: model.nativeRestarts,
      estimatedWork: eigenEstimatedWork(operator, settings)
    },
    columns: ['고유쌍 번호', '고유값 실수부', '고유값 허수부', '독립 재계산 잔차', 'native 잔차'],
    units: ['1', '연산자 단위', '연산자 단위', '연산자 단위', '연산자 단위'],
    rows: model.eigenpairs.map((pair, i) => [i + 1, pair.value.re, pair.value.im, residuals[i]!, pair.nativeResidual]),
    warnings,
    details
  };
}
/** Re-evaluate persisted vectors on their saved operator; no Krylov refitting occurs. */
export function evaluateEigen(operator: EigenOperator, settings: EigenSettings, model: unknown): EigenOutput {
  validateEigen(operator, settings);
  validateModel(model, operator, settings);
  return output(operator, settings, structuredClone(model));
}
/** Native algorithms remain unchanged. Progress counts genuine operator applications. */
export function solveEigen(
  operator: EigenOperator,
  settings: EigenSettings,
  progress: (work: number) => void = () => undefined
): EigenOutput {
  validateEigen(operator, settings);
  const n = eigenDimension(operator);
  let model: EigenModel;
  if (settings.method === 'general-eigensolver') {
    if (operator.kind !== 'dense') throw new Error('일반 고유값 계산에는 조밀 연산자가 필요합니다.');
    progress(0);
    model = { kind: 'dense-spectrum', method: 'general-eigensolver', values: eigenvaluesGeneral(operator.matrix) };
    progress(1);
  } else {
    const trace: { work: number }[] = [];
    const apply = (value: readonly number[]) => {
      const result = eigenApply(operator, value);
      if (!result.every(Number.isFinite)) throw new Error('고유해석 연산 결과가 유한하지 않습니다.');
      const work = trace.length + 1;
      trace.push({ work });
      progress(work);
      return result;
    };
    const options = {
      dimension: n,
      numEigenvalues: settings.k,
      krylovDim: settings.krylovDim,
      maxRestarts: settings.maxRestarts,
      tolerance: settings.tolerance,
      seed: eigenSeed(settings.seed, n)
    };
    if (settings.method === 'arnoldi') {
      const native = restartedArnoldi(apply, options);
      model = {
        kind: 'krylov',
        method: 'arnoldi',
        nativeConverged: native.converged,
        nativeRestarts: native.restarts,
        matVecs: native.matVecs,
        trace,
        eigenpairs: native.eigenpairs.map((pair) => ({
          value: pair.value,
          vector: pair.vector,
          nativeResidual: pair.residual,
          residual: eigenResidual(operator, pair)
        }))
      };
    } else {
      const native = restartedLanczos(apply, { ...options, which: settings.which });
      model = {
        kind: 'krylov',
        method: 'lanczos',
        nativeConverged: native.converged,
        nativeRestarts: native.restarts,
        matVecs: native.matVecs,
        trace,
        eigenpairs: native.eigenpairs.map((pair) => {
          const adapted = {
            value: { re: pair.value, im: 0 },
            vector: { re: pair.vector, im: new Array<number>(n).fill(0) }
          };
          return { ...adapted, nativeResidual: pair.residual, residual: eigenResidual(operator, adapted) };
        })
      };
    }
  }
  // JSON normalizes negative zero without masking non-finite solver failures.
  safeEigenData(model);
  return evaluateEigen(operator, settings, JSON.parse(JSON.stringify(model)) as EigenModel);
}
