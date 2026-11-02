import { rk4Step } from '../../../../physics/integrators';
import { buildFeatureLibrary, type SindyResult } from '../../../../research/sindy';
import { hamiltonianVectorField, type HamiltonianModel } from '../../../../research/hamiltonianLearning';
import type { LearningPreprocessing, LearningSettings } from './learning-contracts';

export function learningRmse(prediction: number[][], truth: number[][]): number {
  if (!prediction.length || prediction.length !== truth.length)
    throw new Error('검증 예측과 관측의 길이가 맞지 않습니다.');
  let error = 0,
    count = 0;
  prediction.forEach((row, i) =>
    row.forEach((v, j) => {
      error += (v - truth[i]![j]!) ** 2;
      count++;
    })
  );
  const value = Math.sqrt(error / count);
  if (!Number.isFinite(value) || value > 1e12)
    throw new Error('학습 예측이 발산했습니다. library·정규화·기간을 조정하세요.');
  return value;
}
export function learningMultiply(operator: number[], row: number[]): number[] {
  return row.map((_, i) => row.reduce((sum, v, j) => sum + operator[i * row.length + j]! * v, 0));
}
export function learnedDerivative(
  payload: SindyResult | HamiltonianModel,
  s: LearningSettings,
  row: number[]
): number[] {
  if (s.method === 'hamiltonian') {
    const model = payload as HamiltonianModel,
      n = model.degreesOfFreedom;
    const field = hamiltonianVectorField(model, row.slice(0, n), row.slice(n));
    return field.qDot.concat(field.pDot);
  }
  const model = payload as SindyResult;
  const features = buildFeatureLibrary([row], { polynomialDegree: s.polynomialDegree, includeTrig: s.includeTrig })
    .theta[0]!;
  return model.equations.map((equation) => equation.coefficients.reduce((sum, c, i) => sum + c * features[i]!, 0));
}
export function learningIntegrate(
  initial: number[],
  steps: number,
  dt: number,
  derivative: (row: number[], step: number) => number[]
): number[][] {
  let current = Float64Array.from(initial);
  const next = new Float64Array(initial.length),
    rows: number[][] = [];
  for (let step = 0; step < steps; step++) {
    rk4Step(
      current,
      dt,
      (state, out) => {
        const value = derivative(Array.from(state), step);
        for (let i = 0; i < out.length; i++) out[i] = value[i]!;
        return out;
      },
      next
    );
    current = Float64Array.from(next);
    const row = Array.from(current);
    if (row.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e12))
      throw new Error('모델 rollout이 발산했습니다. 기간·library·ridge를 조정하세요.');
    rows.push(row);
  }
  return rows;
}
export function inverseLearningTransform(rows: number[][], p: LearningPreprocessing): number[][] {
  return rows.map((row) => row.map((v, i) => v * p.scale[i]! + p.mean[i]!));
}
export function learningComparisonRows(times: number[], truth: number[][], prediction: number[][]): number[][] {
  return prediction.map((row, i) => [times[i]!, ...row.flatMap((v, j) => [truth[i]![j]!, v])]);
}
export function learningWarnings(training: number, validation: number, rollout: number, persistence: number): string[] {
  const warnings: string[] = [];
  if (validation > Math.max(1e-5, training * 5))
    warnings.push('검증 오차가 훈련 오차보다 큽니다. 과적합·분포 변화·식별 가능성을 확인하세요.');
  if (rollout > persistence) warnings.push('자유 rollout이 마지막 관측값을 유지하는 기준 예측보다 부정확합니다.');
  return warnings;
}
