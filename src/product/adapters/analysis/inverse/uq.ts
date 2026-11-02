import { sobolIndices } from '../../../../research/sobolSensitivity';
import { fitPolynomialChaos, type PolynomialChaosSample } from '../../../../research/surrogate';
import { latinHypercube } from '../../../../research/experimentDesign';
import { executeBatchRun } from '../../../lab/experiments/execute';
import { batchMetricMetadata } from '../../../lab/experiments/metadata';
import type { InverseRequest, InverseProgress, UqSettings } from './contracts';
import { uqEvaluationCount, variableName, withVariables } from './validation';
import { finiteData } from './data';
export const UQ_WARNINGS = [
  '독립 균등분포의 입력 범위를 가정합니다. 상관 입력·분포 추정·posterior 불확실성은 이 분석에 포함되지 않습니다.',
  '유한 기간·유한 해상도의 선택한 상태 요약 통계에 대한 민감도입니다. 원시 궤적이나 장기 거동의 증명이 아닙니다.'
] as const;

export async function runUq(request: InverseRequest, settings: UqSettings, progress: InverseProgress) {
  const variables = settings.variables.map((v) => ({ name: variableName(v), min: v.min, max: v.max }));
  const metadata = batchMetricMetadata(request.experiment),
    index = settings.metric.index;
  const metricLabel = `${metadata.labels[index]} ${settings.metric.statistic}`,
    metricUnit = metadata.units[index] ?? '1',
    total = uqEvaluationCount(settings);
  const evaluated: PolynomialChaosSample[] = [];
  const evaluate = (point: number[]): number => {
    const experiment = withVariables(request.experiment, settings.variables, point);
    const result = executeBatchRun({
      batchId: request.id,
      run: { id: `${request.id}-${evaluated.length}`, index: evaluated.length, experiment, assignments: [] }
    });
    const metric = result.summary.metrics[index];
    if (!metric) throw new Error('표본 평가 중 출력 차원이 바뀌었습니다.');
    const output = metric[settings.metric.statistic];
    if (!Number.isFinite(output))
      throw new Error('유한하지 않은 모델 평가입니다. 실패 표본을 조용히 제외하지 않습니다.');
    evaluated.push({ inputs: [...point], output });
    progress({ fraction: evaluated.length / total, work: evaluated.length });
    return output;
  };
  const warnings = [
    ...UQ_WARNINGS,
    ...(request.experiment.seed
      ? [
          '확률 모델은 모든 입력에서 같은 canonical seed를 유지합니다. 이는 공통 난수 조건부 민감도이며 seed 자체의 변동성은 포함하지 않습니다.'
        ]
      : []),
    ...metadata.warnings
  ];
  if (settings.kind === 'sobol') {
    const result = await sobolIndices(evaluate, variables, { samples: settings.samples });
    if (
      !(result.variance > 0) ||
      ![...result.firstOrder, ...result.total, result.mean, result.variance].every(Number.isFinite)
    )
      throw new Error(
        '출력 분산이 0이거나 지표가 유한하지 않아 Sobol 지수를 정의할 수 없습니다. 출력·범위를 바꾸세요.'
      );
    return {
      rows: result.firstOrder.map((first, i) => [i + 1, first, result.total[i]!]),
      columns: ['변수 번호', '1차 Sobol 지수', '총효과 Sobol 지수'],
      units: ['1', '1', '1'],
      details: [
        `출력: ${metricLabel} (${metricUnit})`,
        `native ${result.method}`,
        ...variables.map((v, i) => `${i + 1}. ${v.name}: U(${v.min},${v.max})`),
        `평균 ${result.mean}; 분산 ${result.variance}; 평가 ${result.evaluations}`
      ],
      warnings: [
        ...warnings,
        result.caveat,
        'native Sobol 표본열은 고정된 결정론적 열입니다. seed 입력은 이 열을 무작위화하지 않습니다. 지수는 [0,1]로 강제 절삭하지 않습니다.'
      ],
      evaluations: evaluated.length,
      payload: finiteData({ native: result, evaluated, metricLabel, metricUnit })
    };
  }
  const trainingPoints = latinHypercube(variables.length, settings.samples, `${settings.seed}:train`);
  const validationCount = total - settings.samples,
    validationPoints = latinHypercube(variables.length, validationCount, `${settings.seed}:validation`);
  const physical = (unit: number[]) =>
    unit.map((v, i) => variables[i]!.min + v * (variables[i]!.max - variables[i]!.min));
  const training = trainingPoints.map((unit) => {
    const inputs = physical(unit);
    return { inputs, output: evaluate(inputs) };
  });
  const model = fitPolynomialChaos(variables, training, { degree: settings.degree });
  if (
    ![
      model.mean,
      model.variance,
      model.rSquared,
      model.conditionEstimate,
      ...model.coefficients,
      ...model.firstOrderSobol,
      ...model.totalSobol
    ].every(Number.isFinite)
  )
    throw new Error('PCE 회귀의 조건수·계수가 유한하지 않습니다. 차수를 낮추거나 표본을 늘리세요.');
  const validation = validationPoints.map((unit) => {
    const inputs = physical(unit),
      output = evaluate(inputs),
      predicted = model.predict(inputs);
    if (!Number.isFinite(predicted)) throw new Error('PCE 예측이 유한하지 않습니다.');
    return { inputs, output, predicted };
  });
  const validationRmse = Math.sqrt(
      validation.reduce((sum, v) => sum + (v.output - v.predicted) ** 2, 0) / validation.length
    ),
    validationMaxError = Math.max(...validation.map((v) => Math.abs(v.output - v.predicted)));
  const outputRange = Math.max(...training.map((v) => v.output)) - Math.min(...training.map((v) => v.output));
  if (model.conditionEstimate > 1e8)
    warnings.push('회귀 조건수가 큽니다. 계수·Sobol 분해가 불안정할 수 있습니다. 차수를 낮추고 표본을 늘리세요.');
  if (model.rSquared < 0.9 || validationRmse > Math.max(1e-12, 0.1 * outputRange))
    warnings.push(
      '대리모델의 훈련 적합도 또는 별도 validation 오차가 불충분합니다. 이 surrogate를 신뢰하기 전에 범위·차수·표본을 바꾸세요.'
    );
  if (model.variance === 0)
    warnings.push(
      'surrogate 분산이 0입니다. 표의 0 지수는 native PCE의 상수 모델 규약이며 식별된 중요도 순위가 아닙니다.'
    );
  return {
    columns: ['변수 번호', 'PCE 1차 Sobol 지수', 'PCE 총효과 Sobol 지수'],
    units: ['1', '1', '1'],
    rows: model.firstOrderSobol.map((first, i) => [i + 1, first, model.totalSobol[i]!]),
    details: [
      `출력: ${metricLabel} (${metricUnit})`,
      'native 정규화 Legendre polynomial chaos; 독립 균등분포',
      ...variables.map((v, i) => `${i + 1}. ${v.name}: U(${v.min},${v.max})`),
      `훈련 ${training.length}; 독립 설계 validation ${validation.length}; 훈련 R² ${model.rSquared}; 조건수 ${model.conditionEstimate}`,
      `validation RMSE ${validationRmse} ${metricUnit}; 최대 오차 ${validationMaxError} ${metricUnit}`
    ],
    warnings: [
      ...warnings,
      'validation은 훈련과 다른 seed의 별도 LHS 설계입니다. 표본 오차가 전체 입력 영역의 오차 상한을 보장하지 않습니다. 범위 밖 외삽은 지원하지 않습니다.'
    ],
    evaluations: evaluated.length,
    payload: finiteData({
      model: {
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
      },
      training,
      validation,
      validationRmse,
      validationMaxError,
      metricLabel,
      metricUnit
    })
  };
}
