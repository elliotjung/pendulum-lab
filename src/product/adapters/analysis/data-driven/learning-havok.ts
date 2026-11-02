import { hankelMatrix, havokAnalysis } from '../../../../research/havok';
import { thinSvd } from '../../../../research/svd';
import { finiteDifferenceDerivatives } from '../../../../research/sindy';
import type { LearningData, LearningModel, LearningOutput, LearningSettings } from './learning-contracts';
import type { LearningHavokModel } from './learning-model';
import {
  learningComparisonRows,
  learningIntegrate,
  learningMultiply,
  learningRmse,
  learningWarnings
} from './learning-math';

export function fitLearningHavok(train: number[][], dt: number, s: LearningSettings): LearningHavokModel {
  const scalar = train.map((row) => row[0]!);
  const fit = havokAnalysis(scalar, dt, { delays: s.delays, rank: s.rank });
  const hankel = hankelMatrix(scalar, s.delays);
  const svd = thinSvd(hankel.data, hankel.rows, hankel.cols, { maxRank: s.rank });
  if (svd.rank !== fit.rank) throw new Error('HAVOK training basis의 rank가 일치하지 않습니다.');
  return {
    rank: fit.rank,
    delays: s.delays,
    basis: svd.u,
    singularValues: svd.singularValues,
    linearOperator: fit.linearOperator,
    forcingCoupling: fit.forcingCoupling,
    eigenvalues: fit.eigenvalues,
    trainingResidual: fit.reconstructionError
  };
}
export function learningHavokProjection(rows: number[][], fit: LearningHavokModel): number[][] {
  const h = hankelMatrix(
    rows.map((row) => row[0]!),
    fit.delays
  );
  const output: number[][] = [];
  for (let t = 0; t < h.cols; t++) {
    const row: number[] = [];
    for (let i = 0; i < fit.rank; i++) {
      let sum = 0;
      for (let j = 0; j < fit.delays; j++) sum += fit.basis[j * fit.rank + i]! * h.data[j * h.cols + t]!;
      row.push(sum / fit.singularValues[i]!);
    }
    output.push(row);
  }
  return output;
}
function field(row: number[], fit: LearningHavokModel): number[] {
  return learningMultiply(fit.linearOperator, row.slice(0, fit.rank - 1)).map(
    (v, i) => v + fit.forcingCoupling[i]! * row[fit.rank - 1]!
  );
}
function residual(rows: number[][], fit: LearningHavokModel, dt: number): number {
  const dots = finiteDifferenceDerivatives(rows, dt);
  return learningRmse(
    rows.slice(1, -1).map((row) => field(row, fit)),
    dots.slice(1, -1).map((row) => row.slice(0, fit.rank - 1))
  );
}
export function evaluateLearningHavok(
  data: LearningData,
  s: LearningSettings,
  model: LearningModel,
  train: number[][],
  validation: number[][],
  dt: number
): LearningOutput {
  const fit = model.payload as LearningHavokModel;
  const training = learningHavokProjection(train, fit),
    heldout = learningHavokProjection(validation, fit),
    core = fit.rank - 1;
  const count = Math.min(s.rolloutSteps, heldout.length - 1);
  const initial = heldout[0]!.slice(0, core);
  const prediction = learningIntegrate(initial, count, dt, (row, step) => field([...row, heldout[step]![core]!], fit));
  const truth = heldout.slice(1, count + 1).map((row) => row.slice(0, core));
  const persistence = learningRmse(
    truth.map(() => initial),
    truth
  );
  const trainRmse = residual(training, fit, dt),
    validationRmse = residual(heldout, fit, dt),
    rollout = learningRmse(prediction, truth);
  return {
    model,
    metrics: {
      trainingRmse: trainRmse,
      validationRmse,
      rolloutRmse: rollout,
      persistenceRmse: persistence,
      validationTrainingRatio: validationRmse / Math.max(trainRmse, 1e-12),
      trainingSamples: training.length,
      validationSamples: heldout.length,
      rank: fit.rank,
      trainingRelativeResidual: fit.trainingResidual
    },
    columns: [
      `축 (${data.axisUnit})`,
      ...Array.from({ length: core }, (_, i) => [`관측 v${i + 1}`, `조건부 예측 v${i + 1}`]).flat()
    ],
    units: [data.axisUnit, ...Array<string>(core * 2).fill('1')],
    rows: learningComparisonRows(data.times.slice(s.splitIndex + 1, s.splitIndex + count + 1), truth, prediction),
    warnings: [
      ...learningWarnings(trainRmse, validationRmse, rollout, persistence),
      ...(count < s.rolloutSteps
        ? [`HAVOK 검증 delay window가 부족하여 요청한 ${s.rolloutSteps}단계 중 ${count}단계만 조건부 재구성했습니다.`]
        : []),
      ...(Array.isArray(data.provenance.warnings)
        ? data.provenance.warnings.filter((v): v is string => typeof v === 'string')
        : []),
      'HAVOK 결과는 훈련 basis로 투영한 delay 좌표입니다. 검증 forcing을 사용하는 조건부 재구성이며 자율 예측이 아닙니다.',
      'delay window에는 표시된 시작 시각 이후의 관측값이 포함됩니다. 실시간 예측으로 해석하지 마세요.'
    ],
    details: [
      `훈련 구간에서만 SVD basis와 특잇값·선형 core·forcing 결합을 고정했습니다. rank ${fit.rank}, delays ${fit.delays}.`,
      `요청 재구성 ${s.rolloutSteps}단계, 실제 재구성 ${count}단계입니다.`,
      '검증 Hankel window는 훈련 window와 겹치지 않습니다. 검증 자료로 basis 또는 계수를 다시 맞추지 않습니다.',
      'trainingRmse/validationRmse는 latent core 도함수 오차, rolloutRmse는 알려진 forcing을 쓰는 latent core 적분 오차입니다.'
    ]
  };
}
