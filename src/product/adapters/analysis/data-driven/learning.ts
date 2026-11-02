import { identifyDynamics, finiteDifferenceDerivatives, type SindyResult } from '../../../../research/sindy';
import { dynamicModeDecomposition, type DmdResult } from '../../../../research/dmd';
import { learnHamiltonian, evaluateHamiltonian, type HamiltonianModel } from '../../../../research/hamiltonianLearning';
import {
  trainEsn,
  buildNextStepTargets,
  predictEsnFree,
  predictEsnOneStep,
  type TrainedEsn
} from '../../../../research/reservoir';
import {
  LEARNING_VERSION,
  type LearningData,
  type LearningModel,
  type LearningOutput,
  type LearningSettings
} from './learning-contracts';
import {
  fitLearningPreprocessing,
  learningIdentity,
  learningSeed,
  learningSlices,
  transformLearning,
  validateLearning
} from './learning-validation';
import { validateLearningModel } from './learning-model';
import { fitLearningHavok, evaluateLearningHavok } from './learning-havok';
import {
  inverseLearningTransform,
  learnedDerivative,
  learningComparisonRows,
  learningIntegrate,
  learningMultiply,
  learningRmse,
  learningWarnings
} from './learning-math';

export { validateLearning } from './learning-validation';
export { learningDefaults } from './learning-contracts';
export type { LearningData, LearningSettings, LearningModel, LearningOutput } from './learning-contracts';

export function trainLearning(
  data: LearningData,
  settings: LearningSettings,
  progress?: (work: number) => void
): LearningOutput {
  validateLearning(data, settings);
  const { train, dt } = learningSlices(data, settings);
  const preprocessing = fitLearningPreprocessing(train, settings.preprocessing),
    rows = transformLearning(train, preprocessing);
  progress?.(0);
  let payload: unknown;
  if (settings.method === 'sindy') {
    const dots = finiteDifferenceDerivatives(rows, dt);
    payload = identifyDynamics(
      rows.slice(1, -1),
      dots.slice(1, -1),
      { polynomialDegree: settings.polynomialDegree, includeTrig: settings.includeTrig },
      { threshold: settings.threshold, ridge: settings.ridge, maxIterations: 10 }
    );
  } else if (settings.method === 'dmd') payload = dynamicModeDecomposition(rows, dt, { ridge: settings.ridge });
  else if (settings.method === 'havok') payload = fitLearningHavok(rows, dt, settings);
  else if (settings.method === 'reservoir') {
    const { inputs, targets } = buildNextStepTargets(rows);
    payload = trainEsn(inputs, targets, {
      dimension: settings.selection.length,
      reservoirSize: settings.reservoirSize,
      seed: learningSeed(settings.seed),
      ridge: settings.ridge,
      washout: settings.washout,
      spectralRadius: 0.8,
      inputScaling: 0.5,
      leakRate: 1,
      connectivity: 1,
      bias: 0
    });
  } else {
    const dots = finiteDifferenceDerivatives(rows, dt),
      n = settings.selection.length / 2;
    payload = learnHamiltonian(
      rows.slice(1, -1).map((row) => row.slice(0, n)),
      rows.slice(1, -1).map((row) => row.slice(n)),
      dots.slice(1, -1).map((row) => row.slice(0, n)),
      dots.slice(1, -1).map((row) => row.slice(n)),
      {
        degreesOfFreedom: n,
        polynomialDegree: settings.polynomialDegree,
        ...(settings.includeTrig ? { trigCoordinates: Array.from({ length: n }, (_, i) => i) } : {})
      },
      { ridge: settings.ridge }
    );
  }
  progress?.(1);
  // Native results may contain -0; canonical JSON deliberately normalizes it.
  const model = JSON.parse(
    JSON.stringify({
      schema: 'pendulum-learning-model/v1',
      algorithmVersion: LEARNING_VERSION,
      method: settings.method,
      dimension: settings.selection.length,
      selection: settings.selection,
      labels: settings.selection.map((i) => data.labels[i]),
      units: settings.selection.map((i) => data.units[i]),
      preprocessing,
      trainingIdentity: learningIdentity(data, settings),
      settings,
      payload
    })
  ) as LearningModel;
  const output = evaluateLearning(data, settings, model);
  progress?.(2);
  return output;
}
function predictionErrors(
  train: number[][],
  validation: number[][],
  dt: number,
  s: LearningSettings,
  payload: unknown
): { training: number; validation: number } {
  if (s.method === 'dmd') {
    const fit = payload as DmdResult;
    const error = (rows: number[][]) =>
      learningRmse(
        rows.slice(0, -1).map((row) => learningMultiply(fit.operator, row)),
        rows.slice(1)
      );
    return { training: error(train), validation: error(validation) };
  }
  if (s.method === 'reservoir') {
    const fit = payload as TrainedEsn;
    const prediction = predictEsnOneStep(fit, train.slice(0, -1));
    const warmup = train.slice(-Math.max(1, s.washout + 1));
    const valPrediction = predictEsnOneStep(fit, [...warmup, ...validation.slice(0, -1)]).slice(warmup.length);
    return {
      training: learningRmse(prediction.slice(s.washout), train.slice(1 + s.washout)),
      validation: learningRmse(valPrediction, validation.slice(1))
    };
  }
  const error = (rows: number[][]) =>
    learningRmse(
      rows.slice(1, -1).map((row) => learnedDerivative(payload as SindyResult | HamiltonianModel, s, row)),
      finiteDifferenceDerivatives(rows, dt).slice(1, -1)
    );
  return { training: error(train), validation: error(validation) };
}
export function evaluateLearning(data: LearningData, settings: LearningSettings, model: unknown): LearningOutput {
  validateLearning(data, settings);
  validateLearningModel(data, settings, model);
  const slices = learningSlices(data, settings),
    p = model.preprocessing;
  const train = transformLearning(slices.train, p),
    validation = transformLearning(slices.validation, p),
    dt = slices.dt;
  if (settings.method === 'havok') return evaluateLearningHavok(data, settings, model, train, validation, dt);
  const errors = predictionErrors(train, validation, dt, settings, model.payload),
    initial = validation[0]!,
    count = settings.rolloutSteps;
  let predicted: number[][];
  if (settings.method === 'dmd') {
    const fit = model.payload as DmdResult;
    let row = initial.slice();
    predicted = [];
    for (let step = 0; step < count; step++) {
      row = learningMultiply(fit.operator, row);
      predicted.push(row);
    }
  } else if (settings.method === 'reservoir') {
    const warmup = [...train.slice(-Math.max(1, settings.washout + 1)), initial];
    predicted = predictEsnFree(model.payload as TrainedEsn, warmup, count);
  } else
    predicted = learningIntegrate(initial, count, dt, (row) =>
      learnedDerivative(model.payload as SindyResult | HamiltonianModel, settings, row)
    );
  const truth = validation.slice(1, count + 1),
    rollout = learningRmse(predicted, truth),
    persistence = learningRmse(
      truth.map(() => initial),
      truth
    );
  const warnings = learningWarnings(errors.training, errors.validation, rollout, persistence);
  if (Array.isArray(data.provenance.warnings))
    warnings.push(...data.provenance.warnings.filter((v): v is string => typeof v === 'string'));
  warnings.push('검증 오차는 유한한 한 구간의 진단입니다. 새 초기조건·장기 예측의 정확성을 보장하지 않습니다.');
  if (settings.preprocessing === 'none' && new Set(model.units).size > 1)
    warnings.push('통합 RMSE는 서로 다른 단위의 성분을 섞습니다. 개별 관측·예측 값과 단위를 함께 확인하세요.');
  if (settings.includeTrig && model.units.some((unit) => !['rad', '1'].includes(unit)))
    warnings.push('삼각 library는 선택된 수치 좌표에 직접 적용됩니다. 각도·무차원 좌표인지 확인하세요.');
  const metrics: Record<string, number> = {
    trainingRmse: errors.training,
    validationRmse: errors.validation,
    rolloutRmse: rollout,
    persistenceRmse: persistence,
    validationTrainingRatio: errors.validation / Math.max(errors.training, 1e-12),
    trainingSamples: train.length,
    validationSamples: validation.length
  };
  if (settings.method === 'hamiltonian') {
    const fit = model.payload as HamiltonianModel,
      n = fit.degreesOfFreedom;
    const energies = [initial, ...predicted].map((row) => evaluateHamiltonian(fit, row.slice(0, n), row.slice(n)));
    metrics.learnedEnergyDrift = Math.max(...energies.map((e) => Math.abs(e - energies[0]!)));
    warnings.push('canonical 좌표 선언은 출처의 주장입니다. 외부 자료의 물리적 의미·보존계를 인증하지 않습니다.');
    warnings.push(
      '한 에너지 궤도의 자료와 ridge 적합만으로 Hamiltonian의 유일성을 보장할 수 없습니다. 서로 다른 에너지의 독립 검증 자료가 필요합니다.'
    );
  }
  if (settings.method === 'sindy' || settings.method === 'hamiltonian')
    warnings.push('수치 도함수는 관측 잡음을 증폭합니다. 복원된 항과 계수는 library·ridge·표본 간격에 의존합니다.');
  const physicalTruth = inverseLearningTransform(truth, p),
    physicalPrediction = inverseLearningTransform(predicted, p);
  const output: LearningOutput = {
    model,
    metrics,
    columns: [`축 (${data.axisUnit})`, ...model.labels.flatMap((label) => [`관측 ${label}`, `예측 ${label}`])],
    units: [data.axisUnit, ...model.units.flatMap((unit) => [unit, unit])],
    rows: learningComparisonRows(
      data.times.slice(settings.splitIndex + 1, settings.splitIndex + count + 1),
      physicalTruth,
      physicalPrediction
    ),
    warnings,
    details: [
      `훈련 [${settings.sliceStart}, ${settings.splitIndex}), 검증 [${settings.splitIndex}, ${settings.sliceEnd}); 인덱스 끝은 미포함입니다.`,
      '전처리와 모델은 훈련 구간만으로 고정했습니다. 검증 시 재학습하지 않고 저장된 모델을 평가합니다.',
      settings.method === 'sindy' || settings.method === 'hamiltonian'
        ? 'trainingRmse/validationRmse는 분할별 중앙차분 도함수 적합 오차입니다. 경계 도함수는 제외합니다.'
        : 'trainingRmse/validationRmse는 한 단계 예측 오차입니다. reservoir 검증은 명시된 teacher forcing을 사용합니다.',
      'rolloutRmse/persistenceRmse는 검증 첫 상태에서 시작하는 자유 예측 오차이며 전처리 좌표에서 계산합니다. 표는 원래 단위입니다.',
      `모델 버전 ${LEARNING_VERSION}; seed ${settings.seed}; ${settings.method === 'reservoir' ? '고정 난수 reservoir와 ridge readout' : '결정론적 선형 계수 적합'}; gradient epoch 학습이 아닙니다.`
    ]
  };
  // Reject numerical overflow anywhere rather than silently serializing it as null.
  if ([...Object.values(metrics), ...output.rows.flat()].some((v) => !Number.isFinite(v) || Math.abs(v) > 1e12))
    throw new Error('학습 결과가 유한 범위를 벗어났습니다. 구간·library·전처리를 조정하세요.');
  return output;
}
