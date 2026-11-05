import type { DmdResult } from '../../research/dmd';
import type {
  LearningModel,
  LearningData,
  LearningMethod,
  LearningSettings
} from '../adapters/analysis/data-driven/learning-contracts';
import type { LearningHavokModel } from '../adapters/analysis/data-driven/learning-model';
import { learningHavokProjection } from '../adapters/analysis/data-driven/learning-havok';
import { learningSlices, transformLearning } from '../adapters/analysis/data-driven/learning-validation';
import type { ResearchFocusResult } from './research-focus-contracts';

/** Native aggregate RMSE mixes coordinates; it must never acquire a false SI unit. */
export function reproducibilityMetricMeaning(method: LearningMethod, key: string): { label: string; unit: string } {
  const derivativeFit = method === 'sindy' || method === 'hamiltonian' || method === 'havok';
  const stateUnit =
    method === 'havok' ? '1' : method === 'hamiltonian' || method === 'reservoir' ? '정규화 q,p' : '혼합 rad · rad/s';
  const derivativeUnit =
    method === 'havok' ? 's^-1' : method === 'hamiltonian' ? '정규화 (q,p)/τ' : '혼합 rad/s · rad/s^2';
  if (key === 'trainingRmse' || key === 'validationRmse')
    return {
      label: `${key === 'trainingRmse' ? '훈련' : 'validation'} ${derivativeFit ? '도함수 적합' : '한 단계 상태'} RMSE`,
      unit: derivativeFit ? derivativeUnit : stateUnit
    };
  if (key === 'rolloutRmse' || key === 'persistenceRmse')
    return {
      label:
        key === 'rolloutRmse'
          ? method === 'havok'
            ? '관측 forcing 조건부 latent 재구성 RMSE'
            : '자유 rollout 상태 RMSE'
          : '초기 상태 유지 기준 RMSE',
      unit: stateUnit
    };
  if (key === 'learnedEnergyDrift') return { label: '학습 Hamiltonian의 유한 rollout drift', unit: '정규화 H' };
  const labels: Record<string, string> = {
    validationTrainingRatio: 'validation/훈련 오차 비율',
    trainingSamples: '훈련 표본 수',
    validationSamples: 'validation 표본 수',
    rank: 'retained rank',
    trainingRelativeResidual: 'native 훈련 상대 도함수 residual'
  };
  if (labels[key]) return { label: labels[key], unit: '1' };
  throw new Error(`학습 진단의 단위·의미가 등록되지 않았습니다: ${method}/${key}`);
}

/** Display retained native model payloads; no fitting, eigensolver or physics is implemented here. */
export function reproducibilitySpectralDiagnostics(
  model: LearningModel,
  data: LearningData,
  settings: LearningSettings
) {
  const tables: ResearchFocusResult['tables'][number][] = [],
    charts: ResearchFocusResult['charts'][number][] = [],
    warnings: string[] = [];
  if (model.method === 'dmd') {
    const fit = model.payload as DmdResult;
    tables.push(
      {
        id: 'dmd-spectral-modes',
        title: 'DMD · native 스펙트럼 모드 (공간 고유벡터 아님)',
        columns: [
          '모드',
          'Re λ (1; per step)',
          'Im λ (1; per step)',
          'Re μ (s^-1)',
          'Im μ (s^-1)',
          '성장률 (s^-1)',
          '각주파수 (rad/s)'
        ],
        rows: fit.discreteEigenvalues.map((v, i) => [
          i + 1,
          v.re,
          v.im,
          fit.continuousEigenvalues[i]!.re,
          fit.continuousEigenvalues[i]!.im,
          fit.growthRates[i]!,
          fit.angularFrequencies[i]!
        ])
      },
      {
        id: 'dmd-observable-operator',
        title: 'DMD · 원 관측 좌표의 실제 한 단계 연산자',
        columns: ['출력 좌표', '입력 좌표', 'native 계수', '계수 단위'],
        rows: fit.operator.map((value, i) => {
          const row = Math.floor(i / fit.dimension),
            column = i % fit.dimension;
          return [model.labels[row]!, model.labels[column]!, value, row === column ? '1' : row === 0 ? 's' : 's^-1'];
        })
      }
    );
    charts.push(
      {
        id: 'dmd-discrete-spectrum',
        title: 'DMD native 이산 스펙트럼',
        mode: 'scatter',
        xLabel: 'Re λ (1)',
        yLabel: 'Im λ (1)',
        series: [{ label: '한 step multiplier', points: fit.discreteEigenvalues.map((v) => ({ x: v.re, y: v.im })) }]
      },
      {
        id: 'dmd-continuous-spectrum',
        title: 'DMD native 연속시간 스펙트럼 μ=log(λ)/dt',
        mode: 'scatter',
        xLabel: 'Re μ (s^-1)',
        yLabel: 'Im μ (s^-1)',
        series: [
          { label: 'native complex log/dt', points: fit.continuousEigenvalues.map((v) => ({ x: v.re, y: v.im })) }
        ]
      }
    );
    warnings.push(
      'DMD 표는 보존된 실제 one-step operator와 spectral modes입니다. native DMD 결과는 공간 mode 고유벡터를 제공하지 않으므로 공간 mode shape를 만들거나 추정해 표시하지 않습니다. 혼합 각도·각속도 좌표의 수치 norm은 좌표 단위/스케일에 의존합니다.'
    );
  } else if (model.method === 'havok') {
    const fit = model.payload as LearningHavokModel,
      core = fit.rank - 1;
    const slices = learningSlices(data, settings),
      heldout = learningHavokProjection(transformLearning(slices.validation, model.preprocessing), fit);
    tables.push(
      {
        id: 'havok-core-spectrum',
        title: 'HAVOK · native 연속시간 core spectrum',
        columns: ['모드', 'Re μ (s^-1)', 'Im μ (s^-1)'],
        rows: fit.eigenvalues.map((v, i) => [i + 1, v.re, v.im])
      },
      {
        id: 'havok-singular-modes',
        title: 'HAVOK · 실제 retained singular spectrum',
        columns: ['retained mode', '훈련 σ (rad)', '역할'],
        rows: fit.singularValues.map((v, i) => [i + 1, v, i === core ? 'observed forcing' : 'linear core'])
      },
      {
        id: 'havok-training-basis',
        title: 'HAVOK · 훈련 구간에서만 고정한 실제 delay basis',
        columns: ['delay index', ...Array.from({ length: fit.rank }, (_, i) => `U mode${i + 1} (1)`)],
        rows: Array.from({ length: fit.delays }, (_, j) => [j, ...fit.basis.slice(j * fit.rank, (j + 1) * fit.rank)])
      },
      {
        id: 'havok-core-operator',
        title: 'HAVOK · 실제 core generator A와 forcing coupling B',
        columns: ['core 좌표', '입력 좌표', 'native 계수 (s^-1)'],
        rows: [
          ...fit.linearOperator.map((v, i) => [Math.floor(i / core) + 1, (i % core) + 1, v]),
          ...fit.forcingCoupling.map((v, i) => [i + 1, `forcing v${fit.rank}`, v])
        ]
      },
      {
        id: 'havok-observed-delay-coordinates',
        title: 'HAVOK · 고정 훈련 basis에 투영한 실제 held-out 관측',
        columns: [
          'window 시작 (s)',
          'window 끝 (s)',
          ...Array.from({ length: fit.rank }, (_, i) => `${i === core ? '관측 forcing' : 'core'} v${i + 1} (1)`)
        ],
        rows: heldout.map((row, i) => [
          data.times[settings.splitIndex + i]!,
          data.times[settings.splitIndex + i + fit.delays - 1]!,
          ...row
        ])
      }
    );
    charts.push(
      {
        id: 'havok-core-spectrum',
        title: 'HAVOK native core spectrum (DMD log 변환 아님)',
        mode: 'scatter',
        xLabel: 'Re μ (s^-1)',
        yLabel: 'Im μ (s^-1)',
        series: [{ label: '연속 core generator', points: fit.eigenvalues.map((v) => ({ x: v.re, y: v.im })) }]
      },
      {
        id: 'havok-observed-forcing',
        title: 'HAVOK · held-out 관측 forcing (미래 window 사용)',
        xLabel: '관측 window 시작 (s)',
        yLabel: `관측 forcing v${fit.rank} (1)`,
        series: [
          {
            label: '고정 훈련 basis의 관측 좌표',
            points: heldout.map((row, i) => ({ x: data.times[settings.splitIndex + i]!, y: row[core]! }))
          }
        ]
      }
    );
    warnings.push(
      'HAVOK forcing 곡선은 저장한 훈련 basis·특잇값으로 held-out 관측을 투영한 실제 마지막 좌표입니다. basis·계수를 재학습하지 않습니다. 각 window는 표시된 시작 이후의 관측까지 사용하며 외부 물리력 또는 관측 없는 실시간 예측이 아닙니다.'
    );
  }
  return { tables, charts, warnings };
}
