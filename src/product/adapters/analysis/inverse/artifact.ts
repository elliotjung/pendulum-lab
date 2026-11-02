import { validateObservationArtifact } from '../../../observations/index';
import { closed } from '../../../lab/experiments/safe';
import { fitPolynomialChaos, type PolynomialChaosSample } from '../../../../research/surrogate';
import { latinHypercube } from '../../../../research/experimentDesign';
import { sobolIndices } from '../../../../research/sobolSensitivity';
import { batchMetricMetadata } from '../../../lab/experiments/metadata';
import { readDiagnosticConfiguration } from '../core/source-config';
import { integrationStepCount } from '../../../../validation/numericalBudgets';
import { INVERSE_LIMITS, INVERSE_VERSION, type InverseResult, type InverseRequest } from './contracts';
import { inverseData, inverseHash, freezeInverseData } from './data';
import { ESTIMATE_WARNINGS } from './estimate';
import { UQ_WARNINGS } from './uq';
import { inverseInputId, inverseResultId } from './execute';
import { uqEvaluationCount, validateInverseRequest, variableName } from './validation';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const same = (a: unknown, b: unknown) => inverseHash(a) === inverseHash(b);
const numbers = (input: unknown, length: number): input is number[] =>
  Array.isArray(input) && input.length === length && input.every((v) => typeof v === 'number' && Number.isFinite(v));
const strings = (input: unknown, max: number): input is string[] =>
  Array.isArray(input) && input.length <= max && input.every((v) => typeof v === 'string' && v.length <= 4000);
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

function validateEstimate(result: InverseResult): void {
  const settings = result.request.settings;
  if (settings.kind !== 'estimate') throw new Error('추정 종류가 맞지 않습니다.');
  const p = result.payload;
  closed(p, ['fit', 'forwardStepsPerEvaluation', 'estimatedWork']);
  const fit = p.fit;
  if (!record(fit)) throw new Error('native 추정 결과 객체가 필요합니다.');
  if ([...ESTIMATE_WARNINGS, ...settings.observation.warnings].some((value) => !result.warnings.includes(value)))
    throw new Error('추정의 필수 전제·관측 경고가 없습니다.');
  closed(fit, [
    'parameters',
    'cost',
    'rmse',
    'iterations',
    'converged',
    'status',
    'lambda',
    'gradientNorm',
    'degreesOfFreedom',
    'residualVariance',
    'covariance',
    'standardErrors',
    'correlation',
    'estimated',
    'parametersFull',
    'initialAngles'
  ]);
  const n = settings.parameters.length;
  if (
    !numbers(fit.parameters, n) ||
    typeof fit.cost !== 'number' ||
    fit.cost < 0 ||
    typeof fit.rmse !== 'number' ||
    fit.rmse < 0 ||
    !Number.isSafeInteger(fit.iterations) ||
    Number(fit.iterations) < 1 ||
    Number(fit.iterations) > settings.maxIterations ||
    result.evaluations !== fit.iterations ||
    typeof fit.converged !== 'boolean' ||
    !['cost-converged', 'step-converged', 'gradient-converged', 'max-iterations', 'lambda-overflow'].includes(
      String(fit.status)
    ) ||
    fit.converged !== ['cost-converged', 'step-converged', 'gradient-converged'].includes(String(fit.status))
  )
    throw new Error('추정의 차원·수렴 상태가 맞지 않습니다.');
  if (
    !fit.converged &&
    !result.warnings.includes(
      `추정이 수렴하지 않았습니다 (${fit.status}). 최선의 후보만 반환했으며 성공한 물성 복원으로 표시하지 않습니다.`
    )
  )
    throw new Error('추정 실패 경고가 없습니다.');
  const rows = settings.parameters.map((p, i) => [i + 1, (fit.parameters as number[])[i]!, p.min, p.max]);
  if (!same(rows, result.rows)) throw new Error('추정 표와 native 결과가 일치하지 않습니다.');
  if (!record(fit.estimated) || !record(fit.parametersFull)) throw new Error('추정 물성 계보가 없습니다.');
  closed(
    fit.estimated,
    settings.parameters.map((p) => p.key)
  );
  closed(fit.parametersFull, ['m1', 'm2', 'l1', 'l2', 'g']);
  const source = readDiagnosticConfiguration(result.request.experiment);
  if (source.family !== 'planar') throw new Error('원본 모델이 맞지 않습니다.');
  for (const key of ['m1', 'm2', 'l1', 'l2', 'g'] as const) {
    const index = settings.parameters.findIndex((p) => p.key === key),
      value = index >= 0 ? (fit.parameters as number[])[index]! : source.config.parameters[key];
    if (
      fit.parametersFull[key] !== value ||
      (index >= 0 &&
        ((fit.estimated as Record<string, unknown>)[key] !== value ||
          value < settings.parameters[index]!.min ||
          value > settings.parameters[index]!.max))
    )
      throw new Error('추정 물성·원본·범위 관계가 일치하지 않습니다.');
  }
  if (!numbers(fit.initialAngles, 2) || !same(fit.initialAngles, source.config.initialState.slice(0, 2)))
    throw new Error('추정 초기 각도가 원본과 다릅니다.');
  const residualCount = 2 * settings.observation.data.times.length;
  if (fit.degreesOfFreedom !== residualCount - n || !close(fit.cost, (fit.rmse ** 2 * residualCount) / 2))
    throw new Error('추정 cost·잔차·자유도가 일치하지 않습니다.');
  if (
    typeof fit.lambda !== 'number' ||
    fit.lambda <= 0 ||
    typeof fit.gradientNorm !== 'number' ||
    fit.gradientNorm < 0 ||
    typeof fit.residualVariance !== 'number' ||
    fit.residualVariance < 0 ||
    !close(fit.residualVariance, (2 * fit.cost) / (residualCount - n))
  )
    throw new Error('추정 damping·gradient·잔차 분산이 유효하지 않습니다.');
  if (
    !Array.isArray(fit.standardErrors) ||
    fit.standardErrors.length !== n ||
    fit.standardErrors.some((v) => v !== null && (typeof v !== 'number' || v < 0))
  )
    throw new Error('표준오차의 차원·유한값을 확인하세요.');
  for (const key of ['covariance', 'correlation']) {
    const matrix = fit[key];
    if (
      !Array.isArray(matrix) ||
      (matrix.length !== 0 && matrix.length !== n) ||
      matrix.some(
        (row) => !Array.isArray(row) || row.length !== n || row.some((v) => v !== null && typeof v !== 'number')
      )
    )
      throw new Error('추정 공분산·상관 행렬 차원이 맞지 않습니다.');
  }
  const covariance = fit.covariance as (number | null)[][],
    correlation = fit.correlation as (number | null)[][],
    errors = fit.standardErrors as (number | null)[];
  if (!covariance.length) {
    if (
      !result.warnings.includes(
        'Jacobian이 특이하여 공분산을 계산할 수 없습니다. 식별 불가능한 조합·짧은 관측·정지 궤적을 확인하세요.'
      )
    )
      throw new Error('공분산 계산 불가 경고가 없습니다.');
    if (correlation.length || errors.some((value) => value !== null))
      throw new Error('계산 불가 공분산과 표준오차가 일치하지 않습니다.');
  } else {
    if (correlation.length !== n) throw new Error('공분산·상관 행렬 차원이 다릅니다.');
    for (let i = 0; i < n; i++) {
      const diagonal = covariance[i]![i]!;
      if (
        diagonal === null
          ? errors[i] !== null
          : errors[i] === null || !close(errors[i]!, Math.sqrt(Math.max(diagonal, 0)))
      )
        throw new Error('공분산 대각과 표준오차가 일치하지 않습니다.');
      for (let j = 0; j < n; j++) {
        const value = covariance[i]![j]!,
          reverse = covariance[j]![i]!;
        if (value !== null && reverse !== null && !close(value, reverse))
          throw new Error('공분산 대칭성이 유효하지 않습니다.');
        if (value !== null && errors[i] !== null && errors[j] !== null) {
          const denominator = errors[i]! * errors[j]!,
            expected = denominator > 0 ? value / denominator : i === j ? 1 : 0;
          if (correlation[i]![j] === null || !close(correlation[i]![j]!, expected))
            throw new Error('공분산·표준오차·상관 관계가 일치하지 않습니다.');
        }
      }
    }
  }
  if (
    !Number.isSafeInteger(p.forwardStepsPerEvaluation) ||
    Number(p.forwardStepsPerEvaluation) > INVERSE_LIMITS.forwardSteps ||
    Number(p.forwardStepsPerEvaluation) < 0 ||
    !Number.isSafeInteger(p.estimatedWork) ||
    Number(p.estimatedWork) > INVERSE_LIMITS.work ||
    Number(p.estimatedWork) < 0
  )
    throw new Error('추정 계산량이 유효하지 않습니다.');
  let expectedSteps = 0,
    previousTime = 0;
  for (const time of settings.observation.data.times) {
    expectedSteps += integrationStepCount(time - previousTime, source.config.step, '추정 복원');
    previousTime = time;
  }
  const expectedWork = expectedSteps * ((n + 30) * settings.maxIterations + n + 1);
  if (p.forwardStepsPerEvaluation !== expectedSteps || p.estimatedWork !== expectedWork)
    throw new Error('추정 계산량과 관측 시각·solver 관계가 다릅니다.');
}
function samples(input: unknown, request: InverseRequest, count: number, predicted = false): PolynomialChaosSample[] {
  const settings = request.settings;
  if (settings.kind === 'estimate' || !Array.isArray(input) || input.length !== count)
    throw new Error('UQ 표본 개수가 맞지 않습니다.');
  for (const sample of input) {
    if (!record(sample)) throw new Error('표본 객체가 필요합니다.');
    closed(sample, predicted ? ['inputs', 'output', 'predicted'] : ['inputs', 'output']);
    if (
      !numbers(sample.inputs, settings.variables.length) ||
      sample.inputs.some((v, i) => v < settings.variables[i]!.min || v > settings.variables[i]!.max) ||
      typeof sample.output !== 'number' ||
      !Number.isFinite(sample.output) ||
      (predicted && typeof sample.predicted !== 'number')
    )
      throw new Error('UQ 표본 차원·범위·출력값이 유효하지 않습니다.');
  }
  return input as PolynomialChaosSample[];
}
function validateUqResult(result: InverseResult): void {
  const s = result.request.settings,
    p = result.payload;
  if (s.kind === 'estimate' || result.evaluations !== uqEvaluationCount(s))
    throw new Error('UQ 평가 개수가 맞지 않습니다.');
  const metadata = batchMetricMetadata(result.request.experiment);
  if ([...UQ_WARNINGS, ...metadata.warnings].some((value) => !result.warnings.includes(value)))
    throw new Error('UQ의 필수 전제·모델 경고가 없습니다.');
  if (
    p.metricLabel !== `${metadata.labels[s.metric.index]} ${s.metric.statistic}` ||
    p.metricUnit !== (metadata.units[s.metric.index] ?? '1')
  )
    throw new Error('출력 이름·단위가 원본 모델과 일치하지 않습니다.');
  if (s.kind === 'sobol') {
    closed(p, ['native', 'evaluated', 'metricLabel', 'metricUnit']);
    samples(p.evaluated, result.request, result.evaluations);
    const native = p.native;
    if (!record(native)) throw new Error('native Sobol 결과가 필요합니다.');
    closed(native, [
      'variables',
      'firstOrder',
      'total',
      'mean',
      'variance',
      'samples',
      'evaluations',
      'nonFiniteOutputs',
      'method',
      'caveat'
    ]);
    if (
      !same(native.variables, s.variables.map(variableName)) ||
      !numbers(native.firstOrder, s.variables.length) ||
      !numbers(native.total, s.variables.length) ||
      typeof native.mean !== 'number' ||
      typeof native.variance !== 'number' ||
      native.variance <= 0 ||
      native.samples !== s.samples ||
      native.evaluations !== result.evaluations ||
      native.nonFiniteOutputs !== 0 ||
      typeof native.method !== 'string' ||
      typeof native.caveat !== 'string' ||
      !same(
        result.rows,
        native.firstOrder.map((v, i) => [i + 1, v, (native.total as number[])[i]!])
      )
    )
      throw new Error('native Sobol 결과의 차원·분산·표 관계가 맞지 않습니다.');
    return;
  }
  closed(p, ['model', 'training', 'validation', 'validationRmse', 'validationMaxError', 'metricLabel', 'metricUnit']);
  const training = samples(p.training, result.request, s.samples),
    validation = samples(
      p.validation,
      result.request,
      result.evaluations - s.samples,
      true
    ) as (PolynomialChaosSample & { predicted: number })[];
  const variables = s.variables.map((v) => ({ name: variableName(v), min: v.min, max: v.max })),
    model = fitPolynomialChaos(variables, training, { degree: s.degree });
  const expectedModel = {
    variables: model.variables,
    degree: model.degree,
    multiIndices: model.multiIndices,
    coefficients: model.coefficients,
    mean: model.mean,
    variance: model.variance,
    firstOrderSobol: model.firstOrderSobol,
    totalSobol: model.totalSobol,
    rSquared: model.rSquared,
    conditionEstimate: model.conditionEstimate
  };
  if (
    !same(p.model, expectedModel) ||
    !same(
      result.rows,
      model.firstOrderSobol.map((v, i) => [i + 1, v, model.totalSobol[i]!])
    )
  )
    throw new Error('PCE 계수·표본·지수 관계가 맞지 않습니다.');
  for (const [label, data] of [
    ['train', training],
    ['validation', validation]
  ] as const) {
    const design = latinHypercube(variables.length, data.length, `${s.seed}:${label}`).map((unit) =>
      unit.map((v, i) => variables[i]!.min + v * (variables[i]!.max - variables[i]!.min))
    );
    if (
      !same(
        data.map((v) => v.inputs),
        design
      )
    )
      throw new Error('PCE 훈련·validation 설계 계보가 다릅니다.');
  }
  const errors = validation.map((v) => {
    const expected = model.predict(v.inputs);
    if (!close(expected, v.predicted)) throw new Error('PCE 예측이 계수와 일치하지 않습니다.');
    return Math.abs(v.output - v.predicted);
  });
  if (
    typeof p.validationRmse !== 'number' ||
    typeof p.validationMaxError !== 'number' ||
    !close(p.validationRmse, Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length)) ||
    !close(p.validationMaxError, Math.max(...errors))
  )
    throw new Error('PCE validation 오차가 일치하지 않습니다.');
}
export function validateInverseResultData(
  input: unknown,
  expectedRequest?: InverseRequest
): asserts input is InverseResult {
  inverseData(input);
  if (!record(input)) throw new Error('역문제 결과 객체가 필요합니다.');
  closed(input, [
    'schema',
    'algorithmVersion',
    'id',
    'inputId',
    'observationId',
    'kind',
    'request',
    'columns',
    'units',
    'rows',
    'details',
    'warnings',
    'evaluations',
    'payload'
  ]);
  const result = input as unknown as InverseResult;
  validateInverseRequest(result.request);
  if (
    result.schema !== 'pendulum-inverse-result/v1' ||
    result.algorithmVersion !== INVERSE_VERSION ||
    result.kind !== result.request.settings.kind ||
    result.inputId !== inverseInputId(result.request) ||
    (expectedRequest && !same(expectedRequest, result.request))
  )
    throw new Error('결과 버전·종류·입력 계보가 맞지 않습니다.');
  const { id, ...body } = result;
  const expectedRows =
    result.request.settings.kind === 'estimate'
      ? result.request.settings.parameters.length
      : result.request.settings.variables.length;
  if (
    id !== inverseResultId(body) ||
    !strings(result.columns, 16) ||
    !result.columns.length ||
    !strings(result.units, 16) ||
    result.units.length !== result.columns.length ||
    !strings(result.details, 128) ||
    !strings(result.warnings, 128) ||
    !Array.isArray(result.rows) ||
    result.rows.length !== expectedRows ||
    result.rows.some((row) => !numbers(row, result.columns.length)) ||
    !Number.isSafeInteger(result.evaluations) ||
    result.evaluations < 0 ||
    !record(result.payload)
  )
    throw new Error('결과 ID·표·단위·수치 형식이 유효하지 않습니다.');
  if (result.kind === 'estimate') {
    if (
      !same(result.columns, ['매개변수 번호', '추정값', '최솟값', '최댓값']) ||
      !same(result.units, ['1', '아래 매개변수 단위', '동일', '동일'])
    )
      throw new Error('추정 표의 이름·단위가 맞지 않습니다.');
    if (result.request.settings.kind !== 'estimate' || result.observationId !== result.request.settings.observation.id)
      throw new Error('원본 관측과 추정 관계가 없습니다.');
    validateEstimate(result);
  } else {
    if (
      !same(
        result.columns,
        result.kind === 'sobol'
          ? ['변수 번호', '1차 Sobol 지수', '총효과 Sobol 지수']
          : ['변수 번호', 'PCE 1차 Sobol 지수', 'PCE 총효과 Sobol 지수']
      ) ||
      !same(result.units, ['1', '1', '1'])
    )
      throw new Error('UQ 표의 이름·단위가 맞지 않습니다.');
    if (result.observationId !== undefined) throw new Error('UQ 결과에 잘못된 관측 참조가 있습니다.');
    validateUqResult(result);
  }
}
/** Full import/worker validation replays native Sobol estimators from saved outputs, never reruns physical kernels. */
export async function validateInverseResult(input: unknown, expectedRequest?: InverseRequest): Promise<InverseResult> {
  validateInverseResultData(input, expectedRequest);
  const s = input.request.settings;
  if (s.kind === 'estimate') await validateObservationArtifact(s.observation);
  if (s.kind === 'sobol') {
    const evaluated = input.payload.evaluated as PolynomialChaosSample[];
    let index = 0;
    const native = await sobolIndices(
      (point) => {
        const sample = evaluated[index++]!;
        if (!same(point, sample.inputs)) throw new Error('native Sobol 설계와 저장된 평가 좌표가 일치하지 않습니다.');
        return sample.output;
      },
      s.variables.map((v) => ({ name: variableName(v), min: v.min, max: v.max })),
      { samples: s.samples }
    );
    if (index !== evaluated.length || !same(native, input.payload.native))
      throw new Error('native Sobol 표본·출력과 지수 요약이 일치하지 않습니다.');
  }
  return freezeInverseData(input);
}
export function exportInverseResult(result: InverseResult): string {
  validateInverseResultData(result);
  return JSON.stringify(result, null, 2);
}
export async function importInverseResult(text: string): Promise<InverseResult> {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > INVERSE_LIMITS.artifactBytes)
    throw new Error('역문제 파일은 최대24 MiB입니다.');
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error('역문제 JSON이 손상되었습니다. 원본을 보존하세요.');
  }
  return validateInverseResult(input);
}
/** Restored surrogates use the same native PCE fitter and reject extrapolation. */
export function predictSurrogateResult(result: InverseResult, point: readonly number[]): number {
  validateInverseResultData(result);
  const s = result.request.settings;
  if (
    s.kind !== 'pce' ||
    point.length !== s.variables.length ||
    point.some((v, i) => !Number.isFinite(v) || v < s.variables[i]!.min || v > s.variables[i]!.max)
  )
    throw new Error('PCE 입력은 훈련 변수 범위 안에 있어야 합니다.');
  const model = fitPolynomialChaos(
    s.variables.map((v) => ({ name: variableName(v), min: v.min, max: v.max })),
    result.payload.training as PolynomialChaosSample[],
    { degree: s.degree }
  );
  return model.predict(point);
}
