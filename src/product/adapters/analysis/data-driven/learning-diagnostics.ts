import { complexAbs, complexLog, matrixEigenvalues, type Complex } from '../../../../research/complexEig';
import { eigenvaluesGeneral } from '../../../../research/eigenGeneral';
import { finiteDifferenceDerivatives, type SindyResult } from '../../../../research/sindy';
import { predictEsnOneStep, type TrainedEsn } from '../../../../research/reservoir';
import type { DmdResult } from '../../../../research/dmd';
import type { HamiltonianModel } from '../../../../research/hamiltonianLearning';
import type { LearningData, LearningModel, LearningSettings } from './learning-contracts';
import type { LearningHavokModel } from './learning-model';
import { learningSlices, transformLearning } from './learning-validation';
import { learnedDerivative, learningMultiply } from './learning-math';
import { learningHavokProjection } from './learning-havok';

/** Fixed-model consistency checks only: never fit coefficients, weights, or an SVD basis. */
function near(actual: number, expected: number): void {
  if (!Number.isFinite(expected) || Math.abs(actual - expected) > 1e-8 * Math.max(1, Math.abs(expected)))
    throw new Error('저장된 모델 진단이 고정 모델·훈련 자료와 일치하지 않습니다.');
}
function checkSpectrum(actual: Complex[], expected: Complex[]): void {
  actual.forEach((value, i) => {
    near(value.re, expected[i]!.re);
    near(value.im, expected[i]!.im);
  });
}
function fitStatistics(prediction: number[], truth: number[]): { residualNorm: number; rSquared: number } {
  const mean = truth.reduce((sum, v) => sum + v, 0) / truth.length;
  let residual = 0,
    total = 0;
  prediction.forEach((v, i) => {
    residual += (v - truth[i]!) ** 2;
    total += (truth[i]! - mean) ** 2;
  });
  return { residualNorm: Math.sqrt(residual), rSquared: total > 0 ? 1 - residual / total : residual < 1e-20 ? 1 : 0 };
}
function sindyDiagnostics(rows: number[][], dt: number, s: LearningSettings, fit: SindyResult): void {
  const truth = finiteDifferenceDerivatives(rows, dt).slice(1, -1),
    prediction = rows.slice(1, -1).map((row) => learnedDerivative(fit, s, row));
  fit.equations.forEach((equation, i) => {
    const expected = fitStatistics(
      prediction.map((row) => row[i]!),
      truth.map((row) => row[i]!)
    );
    near(equation.residualNorm, expected.residualNorm);
    near(equation.rSquared, expected.rSquared);
  });
}
function hamiltonianDiagnostics(rows: number[][], dt: number, s: LearningSettings, fit: HamiltonianModel): void {
  const truth = finiteDifferenceDerivatives(rows, dt).slice(1, -1),
    prediction = rows.slice(1, -1).map((row) => learnedDerivative(fit, s, row));
  const expected = fitStatistics(prediction.flat(), truth.flat());
  near(fit.residualNorm, expected.residualNorm);
  near(fit.rSquared, expected.rSquared);
}
function dmdDiagnostics(rows: number[][], dt: number, fit: DmdResult): void {
  const spectrum = matrixEigenvalues(fit.operator, fit.dimension);
  checkSpectrum(fit.discreteEigenvalues, spectrum);
  const continuous = spectrum.map((value) => {
    const log = complexLog(value);
    return { re: log.re / dt, im: log.im / dt };
  });
  checkSpectrum(fit.continuousEigenvalues, continuous);
  continuous.forEach((value, i) => {
    near(fit.growthRates[i]!, value.re);
    near(fit.angularFrequencies[i]!, Math.abs(value.im));
  });
  let residual = 0,
    total = 0;
  rows.slice(0, -1).forEach((row, i) =>
    learningMultiply(fit.operator, row).forEach((v, j) => {
      residual += (v - rows[i + 1]![j]!) ** 2;
      total += rows[i + 1]![j]! ** 2;
    })
  );
  near(fit.oneStepError, total > 0 ? Math.sqrt(residual / total) : Math.sqrt(residual));
}
function reservoirDiagnostics(rows: number[][], fit: TrainedEsn): void {
  const n = fit.spec.reservoirSize,
    matrix = Array.from({ length: n }, (_, i) => fit.reservoir.slice(i * n, (i + 1) * n));
  const radius = Math.max(...eigenvaluesGeneral(matrix).map(complexAbs));
  near(fit.measuredSpectralRadius, radius);
  const prediction = predictEsnOneStep(fit, rows.slice(0, -1)).slice(fit.spec.washout),
    truth = rows.slice(fit.spec.washout + 1);
  fit.trainNrmse.forEach((value, i) => {
    const expected = fitStatistics(
      prediction.map((row) => row[i]!),
      truth.map((row) => row[i]!)
    );
    const target = truth.map((row) => row[i]!),
      mean = target.reduce((sum, v) => sum + v, 0) / target.length;
    const total = target.reduce((sum, v) => sum + (v - mean) ** 2, 0);
    near(
      value,
      total > 0 ? expected.residualNorm / Math.sqrt(total) : expected.residualNorm / Math.sqrt(target.length)
    );
  });
}
function havokDiagnostics(rows: number[][], dt: number, fit: LearningHavokModel): void {
  const coordinates = learningHavokProjection(rows, fit),
    dots = finiteDifferenceDerivatives(coordinates, dt),
    core = fit.rank - 1;
  let residual = 0,
    total = 0;
  coordinates.slice(1, -1).forEach((row, t) =>
    learningMultiply(fit.linearOperator, row.slice(0, core)).forEach((v, i) => {
      const predicted = v + fit.forcingCoupling[i]! * row[core]!;
      residual += (predicted - dots[t + 1]![i]!) ** 2;
      total += dots[t + 1]![i]! ** 2;
    })
  );
  near(fit.trainingResidual, total > 0 ? Math.sqrt(residual / total) : Math.sqrt(residual));
  checkSpectrum(fit.eigenvalues, matrixEigenvalues(fit.linearOperator, core));
  // Verify the persisted training SVD triplets against H Hᵀ without recomputing an SVD.
  const windows = rows.length - fit.delays + 1;
  for (let mode = 0; mode < fit.rank; mode++) {
    const sigmaSquared = fit.singularValues[mode]! ** 2;
    if (mode > 0 && fit.singularValues[mode]! > fit.singularValues[mode - 1]!)
      throw new Error('HAVOK 특잇값 순서가 잘못되었습니다.');
    let norm = 0,
      error = 0;
    for (let i = 0; i < fit.delays; i++) {
      let product = 0;
      for (let t = 0; t < windows; t++) {
        let projection = 0;
        for (let j = 0; j < fit.delays; j++) projection += rows[t + j]![0]! * fit.basis[j * fit.rank + mode]!;
        product += rows[t + i]![0]! * projection;
      }
      const expected = sigmaSquared * fit.basis[i * fit.rank + mode]!;
      error += (product - expected) ** 2;
      norm += expected ** 2;
    }
    if (Math.sqrt(error) > 1e-7 * Math.max(1, Math.sqrt(norm)))
      throw new Error('HAVOK training basis와 특잇값이 훈련 자료와 일치하지 않습니다.');
  }
}
export function checkLearningDiagnostics(data: LearningData, s: LearningSettings, model: LearningModel): void {
  const slices = learningSlices(data, s),
    rows = transformLearning(slices.train, model.preprocessing);
  if (s.method === 'sindy') sindyDiagnostics(rows, slices.dt, s, model.payload as SindyResult);
  if (s.method === 'hamiltonian') hamiltonianDiagnostics(rows, slices.dt, s, model.payload as HamiltonianModel);
  if (s.method === 'dmd') dmdDiagnostics(rows, slices.dt, model.payload as DmdResult);
  if (s.method === 'reservoir') reservoirDiagnostics(rows, model.payload as TrainedEsn);
  if (s.method === 'havok') havokDiagnostics(rows, slices.dt, model.payload as LearningHavokModel);
}
