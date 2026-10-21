import type { AnalysisDefinition } from '../contracts/catalog';
import { analysis, ode, initialState, rhs } from './analyses-helpers';

const discoveredCoreAnalyses: readonly AnalysisDefinition[] = [
  analysis({
    id: 'analysis:energy',
    name: ['에너지와 드리프트', 'Energy and drift'],
    module: 'src/physics/energy.ts',
    exports: ['relativeEnergyDrift', 'DissipatedWorkTracker'],
    stage: 18,
    description: [
      '기계적 에너지 변화와 소산 일 균형을 진단합니다.',
      'Diagnose mechanical energy change and dissipated-work balance.'
    ],
    inputs: [
      [
        'energy-series',
        '초기·현재 EnergyBreakdown 및 선택적 시간별 에너지·소산 전력.',
        'Initial/current EnergyBreakdown and optional timed energy/dissipation-power samples.'
      ]
    ],
    parameters: [
      'relativeEnergyDrift(initial, current)와 DissipatedWorkTracker 생성자·메서드 규약.',
      'relativeEnergyDrift(initial, current) and DissipatedWorkTracker constructor/method contracts.'
    ],
    output: [
      'energy-drift',
      '상대 에너지 오차와 선택적 소산 일 균형.',
      'Relative energy error and optional dissipated-work balance.'
    ],
    cost: [
      '두 에너지 비교는 상수 비용, 일 누적은 표본 수에 비례합니다.',
      'Constant cost for two energies; work accumulation is linear in samples.'
    ],
    limitation: [
      '시스템별 에너지와 소산 전력은 호출자가 제공해야 하며 물리적 소산을 수치 오차로 해석하지 않습니다.',
      'Callers must supply model-specific energy and dissipative power; physical dissipation is not numerical drift.'
    ]
  }),
  analysis({
    id: 'analysis:fft',
    name: ['푸리에 스펙트럼', 'Fourier spectrum'],
    module: 'src/physics/fft.ts',
    exports: ['fftInPlace', 'ifftInPlace'],
    stage: 18,
    description: [
      '균일 표본의 실수·허수 버퍼를 푸리에 변환합니다.',
      'Fourier-transform uniformly sampled real and imaginary buffers.'
    ],
    inputs: [
      [
        'uniform-series',
        '길이가 같은 Float64Array 실수·허수 표본 버퍼.',
        'Equal-length Float64Array real and imaginary sample buffers.'
      ]
    ],
    parameters: [
      'fftInPlace(re, im); 역변환은 ifftInPlace(re, im). 주파수 축 환산에는 별도 표본 간격이 필요합니다.',
      'fftInPlace(re, im); inverse through ifftInPlace(re, im). Frequency-axis conversion needs the sample interval separately.'
    ],
    output: ['complex-spectrum', '제자리 갱신된 복소수 계수 버퍼.', 'Complex coefficient buffers modified in place.'],
    cost: ['표본 수 N에 대해 O(N log N).', 'O(N log N) for N samples.'],
    limitation: [
      '버퍼 길이는 양의 2의 거듭제곱이어야 하며 입력을 제자리 변경합니다.',
      'Buffer length must be a positive power of two; input buffers are mutated.'
    ]
  }),
  analysis({
    id: 'analysis:naff',
    name: ['NAFF 주파수 추출', 'NAFF frequency extraction'],
    module: 'src/chaos/naff.ts',
    exports: ['naffDecompose'],
    stage: 18,
    description: [
      '복소 시계열에서 지배 주파수 성분을 반복 추출합니다.',
      'Iteratively extract dominant frequency components from a complex series.'
    ],
    inputs: [['uniform-series', '같은 길이의 re/im 시계열과 양의 dt.', 'Equal-length re/im series with positive dt.']],
    parameters: [
      'naffDecompose(re, im, dt, terms, NaffOptions): 항 수와 refineIterations; Hann 창 사용.',
      'naffDecompose(re, im, dt, terms, NaffOptions): component count and refineIterations; uses a Hann window.'
    ],
    output: [
      'frequency-components',
      '주파수, 복소 진폭 및 파워 성분 목록.',
      'Frequency, complex amplitude and power components.'
    ],
    cost: [
      '항 수와 주파수 탐색 반복마다 전체 표본을 평가합니다.',
      'Evaluates the full sample set for each component and frequency-search iteration.'
    ],
    limitation: [
      '최소 4개 표본과 적절한 표본 간격이 필요하며 유한 관측 구간의 분해능에 제한됩니다.',
      'Needs at least four samples and a suitable sampling interval; resolution is limited by the observation window.'
    ]
  }),
  analysis({
    id: 'analysis:poincare',
    name: ['푸앵카레 단면', 'Poincare sections'],
    module: 'src/chaos/poincare.ts',
    exports: ['poincareSection', 'poincareSectionPreset', 'poincareResultCsv'],
    stage: 18,
    description: [
      '연속 궤도를 적분하고 사건 단면의 교차점을 정밀화합니다.',
      'Integrate a continuous trajectory and refine event-section crossings.'
    ],
    inputs: [initialState, rhs],
    scope: ode,
    parameters: [
      'PoincareOptions의 section, direction, dt, maxTime, rootTol, 과도구간 및 표본 상한.',
      'PoincareOptions section, direction, dt, maxTime, rootTol, transient removal and point cap.'
    ],
    output: [
      'section-crossings',
      '상태·시간·교차 방향과 근 잔차가 포함된 단면.',
      'Section states, times, directions and root residuals.'
    ],
    cost: [
      '적분 단계 수와 교차근 정밀화 횟수에 비례합니다.',
      'Scales with integration steps and crossing-root refinement.'
    ],
    limitation: [
      '연속 Derivative와 사건 함수를 요구하며 이산 맵이나 접촉 재설정에 직접 적용하지 않습니다.',
      'Requires a continuous Derivative and event function; not a direct discrete-map or contact-reset interface.'
    ]
  }),
  analysis({
    id: 'analysis:lyapunov',
    name: ['리아푸노프 지수', 'Lyapunov exponents'],
    module: 'src/chaos/lyapunov.ts',
    exports: ['maximalLyapunov', 'lyapunovSpectrum'],
    stage: 18,
    description: [
      '최대 지수 또는 변분 방정식 기반 지수 스펙트럼을 추정합니다.',
      'Estimate the maximal exponent or a variational Lyapunov spectrum.'
    ],
    inputs: [initialState, rhs],
    scope: ode,
    parameters: [
      'LyapunovSettings의 dt, steps, method와 재정규화 설정; 전체 스펙트럼은 count와 선택적 Jacobian.',
      'LyapunovSettings dt, steps, method and renormalization settings; spectrum additionally takes count and an optional Jacobian.'
    ],
    output: [
      'lyapunov-spectrum',
      '지수 추정값과 수렴 시계열·설정.',
      'Exponent estimates with convergence series and settings.'
    ],
    cost: [
      '적분 길이와 상태·접선 차원에 따라 증가합니다.',
      'Increases with integration horizon and state/tangent dimensions.'
    ],
    limitation: [
      '유한 시간 추정이며 전체 스펙트럼의 수치 Jacobian과 좌표·정규화 선택이 결과에 영향을 줍니다.',
      'Finite-time estimates depend on numerical Jacobians, coordinates and normalization choices.'
    ]
  }),
  analysis({
    id: 'analysis:sali-fli',
    name: ['SALI·FLI 혼돈 지표', 'SALI and FLI indicators'],
    module: 'src/chaos/indicators.ts',
    exports: ['saliIndicator', 'fliIndicator'],
    stage: 18,
    description: [
      '접선 벡터의 정렬과 성장으로 유한 시간 혼돈 지표를 계산합니다.',
      'Compute finite-time chaos indicators from tangent alignment and growth.'
    ],
    inputs: [initialState, rhs],
    scope: ode,
    parameters: [
      'IndicatorSettings와 선택적 Jacobian; saliIndicator와 fliIndicator의 직접 호출 규약.',
      'IndicatorSettings and optional Jacobian; direct saliIndicator and fliIndicator call contracts.'
    ],
    output: ['chaos-indicators', 'SALI 또는 FLI 값과 시간별 기록.', 'SALI or FLI values and time records.'],
    cost: [
      '한두 접선 벡터의 변분 적분 단계 수에 비례합니다.',
      'Scales with variational integration steps for one or two tangent vectors.'
    ],
    limitation: [
      'S01의 sali는 검색 앵커이며 실제 export는 saliIndicator입니다. 지표 자체는 혼돈의 수학적 증명이 아닙니다.',
      'The S01 sali anchor resolves to the actual saliIndicator export. Indicators alone are not mathematical proof of chaos.'
    ]
  }),
  analysis({
    id: 'analysis:zero-one',
    name: ['0–1 혼돈 검사', '0–1 chaos test'],
    module: 'src/chaos/zeroOneTest.ts',
    exports: ['zeroOneTest'],
    stage: 18,
    description: [
      '스칼라 시계열의 확산 통계로 0–1 검사량을 계산합니다.',
      'Calculate the 0–1 statistic from scalar-series diffusion.'
    ],
    inputs: [
      [
        'scalar-series',
        '검사 최소 길이를 만족하는 유한 스칼라 표본.',
        'Finite scalar samples satisfying the test minimum length.'
      ]
    ],
    parameters: [
      'ZeroOneOptions의 cSamples, 지연 및 표본 처리 옵션.',
      'ZeroOneOptions cSamples, lag and sample-processing options.'
    ],
    output: ['zero-one-statistic', 'K 통계량과 검사 진단.', 'K statistic and test diagnostics.'],
    cost: [
      '시험 주파수 수, 표본 수 및 지연 구간에 따라 증가합니다.',
      'Increases with trial frequencies, sample count and lag range.'
    ],
    limitation: [
      '잡음, 과표본화, 짧은 기록에 민감하며 별도 검증 없이 확정 분류하지 않습니다.',
      'Sensitive to noise, oversampling and short records; not a definitive classification without corroboration.'
    ]
  }),
  analysis({
    id: 'analysis:shadowing',
    name: ['궤도 신뢰 시간', 'Shadowing reliability'],
    module: 'src/chaos/shadowing.ts',
    exports: ['shadowingHorizon'],
    stage: 18,
    description: [
      '계산 궤도와 더 정밀한 참조 궤도의 차이가 허용치를 넘는 시간을 찾습니다.',
      'Find when a trajectory differs from a finer reference beyond tolerance.'
    ],
    inputs: [initialState, rhs],
    scope: ode,
    parameters: [
      'ShadowingOptions의 dt, referenceDt, 적분법, 허용치와 관측 시간.',
      'ShadowingOptions dt, referenceDt, methods, tolerance and observation horizon.'
    ],
    output: [
      'shadowing-report',
      '오차 시계열, 신뢰 시간 및 참조 불확실성.',
      'Error series, reliability horizon and reference uncertainty.'
    ],
    cost: [
      '후보 및 세분된 참조 적분을 함께 수행합니다.',
      'Runs candidate and refined reference integrations together.'
    ],
    limitation: [
      '수치 참조와의 비교이며 엄밀한 shadowing 정리나 정확해 보장은 아닙니다.',
      'Comparison with a numerical reference is not a rigorous shadowing theorem or exact-solution guarantee.'
    ]
  }),
  analysis({
    id: 'analysis:rqa',
    name: ['재귀 정량화', 'Recurrence quantification'],
    module: 'src/chaos/rqa.ts',
    exports: ['recurrenceQuantification'],
    stage: 19,
    description: [
      '지연 임베딩의 재귀 행렬에서 정량 지표를 계산합니다.',
      'Compute quantitative measures from delay-embedding recurrence matrices.'
    ],
    inputs: [['scalar-series', '유한 스칼라 시계열.', 'Finite scalar time series.']],
    parameters: [
      'RqaOptions의 dimension, delay, epsilon, targetRecurrenceRate, lMin, vMin, theiler.',
      'RqaOptions dimension, delay, epsilon, targetRecurrenceRate, lMin, vMin and theiler.'
    ],
    output: [
      'rqa-report',
      '재귀 행렬과 재귀율·결정성 등 정량 지표.',
      'Recurrence matrix and measures such as recurrence rate and determinism.'
    ],
    cost: [
      '임베딩 표본 수에 대해 조밀 행렬의 시간·메모리 비용이 제곱으로 증가합니다.',
      'Dense-matrix time and memory grow quadratically with embedded samples.'
    ],
    limitation: [
      '기존 조밀 행렬 작업 예산과 임베딩·임계값 선택에 제한됩니다.',
      'Subject to existing dense-matrix budgets and embedding/threshold choices.'
    ]
  })
];

/** Native bindings stay discoverable; the S18 product executes them in an isolated, terminable worker.
 * Runtime source validation additionally checks the actual model and recorded sampling.
 */
export const coreAnalyses: readonly AnalysisDefinition[] = discoveredCoreAnalyses.map((definition) =>
  definition.integrationStage === 18
    ? {
        ...definition,
        tags: [...definition.tags, 'product-core-diagnostics-v1'],
        computation: { ...definition.computation, location: 'worker', cancellable: true }
      }
    : definition.integrationStage === 19
      ? {
          ...definition,
          tags: [...definition.tags, 'product-advanced-diagnostics-v1'],
          computation: { ...definition.computation, location: 'worker', cancellable: true }
        }
      : definition
);
