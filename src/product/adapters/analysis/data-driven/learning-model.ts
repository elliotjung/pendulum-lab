import { buildFeatureLibrary, type SindyResult } from '../../../../research/sindy';
import type { DmdResult } from '../../../../research/dmd';
import type { HamiltonianModel } from '../../../../research/hamiltonianLearning';
import type { TrainedEsn } from '../../../../research/reservoir';
import { LEARNING_VERSION, type LearningData, type LearningModel, type LearningSettings } from './learning-contracts';
import { canonicalJson, type JsonValue } from '../../../persistence/safe-data';
import { checkLearningDiagnostics } from './learning-diagnostics';
import {
  fitLearningPreprocessing,
  learningClosed,
  learningIdentity,
  learningNumbers,
  learningSafe,
  learningSlices,
  learningSeed
} from './learning-validation';

export interface LearningHavokModel {
  rank: number;
  delays: number;
  basis: number[];
  singularValues: number[];
  linearOperator: number[];
  forcingCoupling: number[];
  eigenvalues: { re: number; im: number }[];
  trainingResidual: number;
}
export type LearningPayload = SindyResult | DmdResult | TrainedEsn | HamiltonianModel | LearningHavokModel;
function exact(a: unknown, b: unknown): boolean {
  return canonicalJson(a as JsonValue) === canonicalJson(b as JsonValue);
}
function finite(value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12)
    throw new Error('모델 진단은 유한한 수치여야 합니다.');
}
function spectrum(value: unknown, n: number): void {
  if (!Array.isArray(value) || value.length !== n) throw new Error('모델 spectrum 차원이 일치하지 않습니다.');
  for (const eigenvalue of value) {
    learningClosed(eigenvalue, ['re', 'im']);
    finite(eigenvalue.re);
    finite(eigenvalue.im);
  }
}
function validateSindy(payload: unknown, s: LearningSettings, dim: number): void {
  learningClosed(payload, ['terms', 'equations', 'threshold']);
  const terms = buildFeatureLibrary([Array<number>(dim).fill(0)], {
    polynomialDegree: s.polynomialDegree,
    includeTrig: s.includeTrig
  }).terms;
  if (
    !exact(payload.terms, terms) ||
    payload.threshold !== s.threshold ||
    !Array.isArray(payload.equations) ||
    payload.equations.length !== dim
  )
    throw new Error('SINDy 모델 library·방정식 차원이 일치하지 않습니다.');
  payload.equations.forEach((equation, i) => {
    learningClosed(equation, ['stateIndex', 'coefficients', 'activeTerms', 'rSquared', 'residualNorm']);
    if (equation.stateIndex !== i) throw new Error('SINDy 방정식 순서가 잘못되었습니다.');
    learningNumbers(equation.coefficients, terms.length);
    finite(equation.rSquared);
    finite(equation.residualNorm);
    const active = terms
      .map((t, j) => ({ term: t.name, coefficient: (equation.coefficients as number[])[j]! }))
      .filter((v) => v.coefficient !== 0);
    if (!exact(equation.activeTerms, active)) throw new Error('SINDy 활성 항이 계수와 일치하지 않습니다.');
  });
}
function validateDmd(payload: unknown, dim: number): void {
  learningClosed(payload, [
    'dimension',
    'rank',
    'operator',
    'discreteEigenvalues',
    'continuousEigenvalues',
    'growthRates',
    'angularFrequencies',
    'oneStepError'
  ]);
  if (payload.dimension !== dim || payload.rank !== dim) throw new Error('DMD 모델 차원이 일치하지 않습니다.');
  learningNumbers(payload.operator, dim * dim);
  spectrum(payload.discreteEigenvalues, dim);
  spectrum(payload.continuousEigenvalues, dim);
  learningNumbers(payload.growthRates, dim);
  learningNumbers(payload.angularFrequencies, dim);
  finite(payload.oneStepError);
}
function validateReservoir(payload: unknown, s: LearningSettings, dim: number): void {
  learningClosed(payload, [
    'spec',
    'measuredSpectralRadius',
    'reservoir',
    'inputWeights',
    'readout',
    'featureDim',
    'trainNrmse'
  ]);
  learningClosed(payload.spec, [
    'dimension',
    'reservoirSize',
    'spectralRadius',
    'inputScaling',
    'leakRate',
    'connectivity',
    'bias',
    'ridge',
    'washout',
    'seed'
  ]);
  const expected = {
    dimension: dim,
    reservoirSize: s.reservoirSize,
    spectralRadius: 0.8,
    inputScaling: 0.5,
    leakRate: 1,
    connectivity: 1,
    bias: 0,
    ridge: s.ridge,
    washout: s.washout,
    seed: learningSeed(s.seed)
  };
  if (
    Object.entries(expected).some(([k, v]) => (payload.spec as Record<string, unknown>)[k] !== v) ||
    payload.featureDim !== dim + 1 + s.reservoirSize
  )
    throw new Error('reservoir 모델 설정이 일치하지 않습니다.');
  learningNumbers(payload.reservoir, s.reservoirSize ** 2);
  learningNumbers(payload.inputWeights, s.reservoirSize * dim);
  learningNumbers(payload.readout, dim * (dim + 1 + s.reservoirSize));
  learningNumbers(payload.trainNrmse, dim);
  finite(payload.measuredSpectralRadius);
  if (Math.abs((payload.measuredSpectralRadius as number) - 0.8) > 1e-6)
    throw new Error('reservoir spectral radius가 잘못되었습니다.');
}
function validateHamiltonian(payload: unknown, s: LearningSettings, dim: number): void {
  learningClosed(payload, ['degreesOfFreedom', 'terms', 'coefficients', 'residualNorm', 'rSquared']);
  const n = dim / 2;
  if (payload.degreesOfFreedom !== n || !Array.isArray(payload.terms) || payload.terms.length > 80)
    throw new Error('Hamiltonian 모델 차원이 잘못되었습니다.');
  // Native library ordering follows total degree and descending exponents, with the gauge constant removed.
  const polynomial = buildFeatureLibrary([Array<number>(dim).fill(0)], {
    polynomialDegree: s.polynomialDegree
  }).terms.map((term) => term.exponents!);
  const labels = Array.from({ length: dim }, (_, i) => (i < n ? `q${i}` : `p${i - n}`));
  const terms: unknown[] = polynomial
    .filter((exponents) => exponents.some(Boolean))
    .map((exponents) => ({
      name: exponents
        .map((e, i) => (!e ? '' : e === 1 ? labels[i] : `${labels[i]}^${e}`))
        .filter(Boolean)
        .join(' '),
      kind: 'poly',
      exponents
    }));
  if (s.includeTrig)
    for (let i = 0; i < n; i++)
      terms.push(
        { name: `cos(q${i})`, kind: 'cos', coordinate: i },
        { name: `sin(q${i})`, kind: 'sin', coordinate: i }
      );
  if (!exact(payload.terms, terms)) throw new Error('Hamiltonian library가 설정과 일치하지 않습니다.');
  learningNumbers(payload.coefficients, terms.length);
  finite(payload.residualNorm);
  finite(payload.rSquared);
}
function validateHavok(payload: unknown, s: LearningSettings): void {
  learningClosed(payload, [
    'rank',
    'delays',
    'basis',
    'singularValues',
    'linearOperator',
    'forcingCoupling',
    'eigenvalues',
    'trainingResidual'
  ]);
  const r = payload.rank as number;
  if (!Number.isInteger(r) || r < 2 || r > s.rank || payload.delays !== s.delays)
    throw new Error('HAVOK rank가 잘못되었습니다.');
  learningNumbers(payload.basis, s.delays * r);
  learningNumbers(payload.singularValues, r);
  if ((payload.singularValues as number[]).some((v) => v <= 1e-12)) throw new Error('HAVOK 특잇값이 너무 작습니다.');
  learningNumbers(payload.linearOperator, (r - 1) ** 2);
  learningNumbers(payload.forcingCoupling, r - 1);
  spectrum(payload.eigenvalues, r - 1);
  finite(payload.trainingResidual);
  // Check frozen basis orthonormality before using external projection coefficients.
  for (let a = 0; a < r; a++)
    for (let b = 0; b < r; b++) {
      let dot = 0;
      for (let j = 0; j < s.delays; j++)
        dot += (payload.basis as number[])[j * r + a]! * (payload.basis as number[])[j * r + b]!;
      if (Math.abs(dot - (a === b ? 1 : 0)) > 1e-6) throw new Error('HAVOK basis가 직교정규가 아닙니다.');
    }
}
export function validateLearningModel(
  data: LearningData,
  s: LearningSettings,
  model: unknown
): asserts model is LearningModel {
  learningSafe(model);
  learningClosed(model, [
    'schema',
    'algorithmVersion',
    'method',
    'dimension',
    'selection',
    'labels',
    'units',
    'preprocessing',
    'trainingIdentity',
    'settings',
    'payload'
  ]);
  const dim = s.selection.length;
  if (
    model.schema !== 'pendulum-learning-model/v1' ||
    model.algorithmVersion !== LEARNING_VERSION ||
    model.method !== s.method ||
    model.dimension !== dim ||
    !exact(model.settings, s) ||
    !exact(model.selection, s.selection) ||
    !exact(
      model.labels,
      s.selection.map((i) => data.labels[i])
    ) ||
    !exact(
      model.units,
      s.selection.map((i) => data.units[i])
    ) ||
    model.trainingIdentity !== learningIdentity(data, s)
  )
    throw new Error('저장 모델의 버전·설정·훈련 데이터 lineage가 일치하지 않습니다.');
  const expected = fitLearningPreprocessing(learningSlices(data, s).train, s.preprocessing);
  if (!exact(model.preprocessing, expected)) throw new Error('저장된 전처리는 훈련 구간만으로 고정되어야 합니다.');
  if (s.method === 'sindy') validateSindy(model.payload, s, dim);
  if (s.method === 'dmd') validateDmd(model.payload, dim);
  if (s.method === 'reservoir') validateReservoir(model.payload, s, dim);
  if (s.method === 'hamiltonian') validateHamiltonian(model.payload, s, dim);
  if (s.method === 'havok') validateHavok(model.payload, s);
  checkLearningDiagnostics(data, s, model as unknown as LearningModel);
}
