import type { AnalysisDefinition } from '../contracts/catalog';
import { analysis, ode, initialState, rhs } from './analyses-helpers';

const discoveredGeometryAnalyses: readonly AnalysisDefinition[] = [
  analysis({
    id: 'analysis:recurrence-network',
    name: ['재귀 네트워크', 'Recurrence network'],
    module: 'src/chaos/recurrenceNetwork.ts',
    exports: ['recurrenceNetworkMetrics'],
    stage: 19,
    description: [
      '재귀 인접 행렬의 군집·경로·연결 성분을 분석합니다.',
      'Analyze clustering, paths and connected components of recurrence adjacency.'
    ],
    inputs: [['matrix', 'n×n 재귀 행렬의 행 우선 버퍼.', 'Row-major buffer of an n-by-n recurrence matrix.']],
    parameters: [
      'recurrenceNetworkMetrics(matrix, n)의 행렬 크기 규약.',
      'Matrix-size contract of recurrenceNetworkMetrics(matrix, n).'
    ],
    output: [
      'network-metrics',
      '밀도, 차수, 군집도, 전이성 및 최대 성분 경로 길이.',
      'Density, degree, clustering, transitivity and largest-component path length.'
    ],
    cost: [
      '조밀 인접 자료와 반복 BFS·삼각형 계산은 큰 네트워크에서 비용이 큽니다.',
      'Dense adjacency, repeated BFS and triangle calculations are costly for large networks.'
    ],
    limitation: [
      '유효한 재귀 행렬을 호출자가 구성해야 하며 자기 재귀 대각선은 제외합니다.',
      'Caller must construct valid recurrence adjacency; self-recurrence diagonal is excluded.'
    ]
  }),
  analysis({
    id: 'analysis:correlation-dimension',
    name: ['상관 차원', 'Correlation dimension'],
    module: 'src/chaos/correlationDimension.ts',
    exports: ['correlationDimension', 'delayEmbed'],
    stage: 19,
    description: [
      '점군의 거리 분포에서 상관합 스케일링 기울기를 추정합니다.',
      'Estimate correlation-sum scaling slopes from point-cloud distances.'
    ],
    inputs: [
      [
        'point-cloud',
        '동일 차원의 점 10개 이상; 시계열은 별도 delayEmbed 가능.',
        'At least ten equal-dimensional points; series may be prepared with delayEmbed separately.'
      ]
    ],
    parameters: [
      'CorrelationDimensionOptions의 반경 수, 적합 구간과 Theiler 창.',
      'CorrelationDimensionOptions radius count, fitting interval and Theiler window.'
    ],
    output: [
      'dimension-estimate',
      'D2, 상관합 곡선, 적합 구간 및 표본 쌍 수.',
      'D2, correlation-sum curve, fit range and pair count.'
    ],
    cost: ['O(N²) 거리 저장과 정렬이 필요합니다.', 'Requires O(N²) distance storage and sorting.'],
    limitation: [
      '유한 표본과 스케일 구간의 추정이며 몇 천 점 이하를 권장하는 기존 구현입니다.',
      'A finite-sample scaling estimate; the legacy implementation advises at most a few thousand points.'
    ]
  }),
  analysis({
    id: 'analysis:multifractal',
    name: ['다중 프랙탈 스펙트럼', 'Multifractal spectrum'],
    module: 'src/chaos/multifractal.ts',
    exports: ['generalizedDimensions'],
    stage: 19,
    description: [
      '상자별 점유 확률로 일반화 차원 스펙트럼을 추정합니다.',
      'Estimate generalized dimensions from box occupancy probabilities.'
    ],
    inputs: [['point-cloud', '동일 차원의 점 10개 이상.', 'At least ten points of a common dimension.']],
    parameters: [
      'GeneralizedDimensionOptions의 qs와 boxSizes 등 스케일 설정.',
      'Scale settings such as qs and boxSizes in GeneralizedDimensionOptions.'
    ],
    output: [
      'generalized-dimensions',
      'q별 일반화 차원과 스케일 적합 결과.',
      'Generalized dimensions by q and scaling-fit results.'
    ],
    cost: [
      '점 수, 차원, 상자 스케일 수와 q 수에 따라 증가합니다.',
      'Increases with point count, dimension, box scales and q values.'
    ],
    limitation: [
      '상자 크기와 유한 표본의 영향을 받는 추정값입니다.',
      'Estimates depend on box sizes and finite sampling.'
    ]
  }),
  analysis({
    id: 'analysis:topological-entropy',
    name: ['위상 엔트로피', 'Topological entropy'],
    module: 'src/chaos/topologicalEntropy.ts',
    exports: ['topologicalEntropy1D'],
    stage: 19,
    description: [
      '1차원 맵의 구간 덮개 전이 행렬로 엔트로피를 추정합니다.',
      'Estimate entropy from interval-covering transitions of a one-dimensional map.'
    ],
    inputs: [['map-function', '유한 구간 위의 스칼라 map(x).', 'Scalar map(x) on a finite interval.']],
    parameters: [
      'domain, boxes, samplesPerBox와 스펙트럼 반복 허용치.',
      'domain, boxes, samplesPerBox and spectral iteration tolerance.'
    ],
    output: [
      'entropy-estimate',
      '전이 행렬의 스펙트럼 기반 엔트로피와 수렴 정보.',
      'Transition-spectrum entropy estimate and convergence information.'
    ],
    cost: ['구간별 맵 표본 평가와 전이 행렬 반복 연산.', 'Per-box map sampling and transition-matrix iterations.'],
    limitation: [
      '1차원 맵 전용이며 표본으로 구성한 덮개가 엄밀한 엔트로피 인증은 아닙니다.',
      'For one-dimensional maps; sampled coverings do not constitute rigorous entropy certification.'
    ]
  }),
  analysis({
    id: 'analysis:transfer-operator',
    name: ['전이 연산자 스펙트럼', 'Transfer operator spectrum'],
    module: 'src/chaos/transferOperator.ts',
    exports: ['transferOperatorSpectrum', 'ulamTransitionMatrix1D'],
    stage: 19,
    description: [
      '주어진 Ulam 전이 행렬의 고유값과 혼합 진단을 계산합니다.',
      'Compute eigenvalues and mixing diagnostics for a supplied Ulam transition matrix.'
    ],
    inputs: [
      ['matrix', 'boxes×boxes 행 우선 전이 확률 행렬.', 'Row-major boxes-by-boxes transition-probability matrix.']
    ],
    parameters: [
      'transferOperatorSpectrum(transition, boxes); 1D 맵 행렬 구성은 ulamTransitionMatrix1D의 별도 규약.',
      'transferOperatorSpectrum(transition, boxes); 1D map construction uses the separate ulamTransitionMatrix1D contract.'
    ],
    output: ['transfer-spectrum', '고유값, 스펙트럼 간격과 혼합률.', 'Eigenvalues, spectral gap and mixing rate.'],
    cost: [
      '상자 수에 따른 조밀 비대칭 고유값 분해 비용.',
      'Dense nonsymmetric eigensolver cost in the number of boxes.'
    ],
    limitation: [
      '혼합률 해석은 적절한 확률 전이 행렬 가정에 의존하며 임의 행렬에서 보장되지 않습니다.',
      'Mixing interpretation depends on an appropriate stochastic transition matrix and is not guaranteed for arbitrary matrices.'
    ]
  }),
  analysis({
    id: 'analysis:clv',
    name: ['공변 리아푸노프 벡터', 'Covariant Lyapunov vectors'],
    module: 'src/chaos/clv.ts',
    exports: ['covariantLyapunovVectors'],
    stage: 19,
    description: [
      '순방향 QR과 역방향 재귀로 공변 접선 방향을 복원합니다.',
      'Recover covariant tangent directions by forward QR and backward recursion.'
    ],
    inputs: [initialState, rhs],
    scope: ode,
    parameters: [
      'count, ClvSettings와 선택적 Jacobian; 수렴 워밍업과 기록 간격.',
      'count, ClvSettings and optional Jacobian; convergence warmup and recording interval.'
    ],
    output: [
      'clv-report',
      'CLV 방향, 지수와 시간별 접선 기록.',
      'CLV directions, exponents and tangent records over time.'
    ],
    cost: [
      '접선 프레임 적분과 저장된 QR 기록의 메모리가 필요합니다.',
      'Requires tangent-frame integration and memory for stored QR records.'
    ],
    limitation: [
      '충분한 순·역방향 수렴 구간과 기존 작업 예산을 만족해야 합니다.',
      'Requires sufficient forward/backward convergence windows and compliance with legacy work budgets.'
    ]
  }),
  analysis({
    id: 'analysis:ftle',
    name: ['유한 시간 리아푸노프', 'Finite-time Lyapunov exponent'],
    module: 'src/chaos/ftle.ts',
    exports: ['finiteTimeLyapunov', 'finiteTimeLyapunovReport'],
    stage: 19,
    description: [
      '연속 흐름의 상태 전이 행렬 최대 특이값으로 FTLE를 계산합니다.',
      'Compute FTLE from the largest singular value of a continuous-flow state transition matrix.'
    ],
    inputs: [initialState, rhs],
    scope: ode,
    parameters: ['totalTime, FtleOptions와 선택적 Jacobian.', 'totalTime, FtleOptions and optional Jacobian.'],
    output: ['ftle-value', '스칼라 FTLE와 선택적 품질 보고서.', 'Scalar FTLE and an optional quality report.'],
    cost: [
      '상태 차원의 제곱 크기인 변분 계를 적분합니다.',
      'Integrates a variational system quadratic in the state dimension.'
    ],
    limitation: [
      '한 초기 상태의 결과이며 격자장은 호출자의 반복 평가가 필요합니다.',
      'Returns one initial-state result; fields require repeated evaluations by the caller.'
    ]
  }),
  analysis({
    id: 'analysis:lcs-ridge',
    name: ['FTLE 능선 후보', 'FTLE ridge candidates'],
    module: 'src/chaos/ftleRidge.ts',
    exports: ['extractFtleRidges'],
    stage: 19,
    description: [
      '직사각형 FTLE 격자에서 임계값 기반 능선 후보를 찾습니다.',
      'Find threshold-based ridge candidates on a rectangular FTLE grid.'
    ],
    inputs: [['ftle-grid', 'width×height FTLE 값의 행 우선 격자.', 'Row-major width-by-height grid of FTLE values.']],
    parameters: [
      'width, height와 FtleRidgeOptions의 percentile, margin.',
      'width, height and FtleRidgeOptions percentile and margin.'
    ],
    output: [
      'ridge-candidates',
      '임계값, 격자 능선 표식 및 후보 셀 수·비율.',
      'Threshold, grid ridge mask and candidate-cell count/fraction.'
    ],
    cost: [
      '격자 검색과 유한 값의 임계 백분위 정렬.',
      'Grid scanning and finite-value sorting for the percentile threshold.'
    ],
    limitation: [
      '기하학적 후보 추출이며 물질 수송 장벽으로서의 LCS 인증은 아닙니다.',
      'Geometric candidate extraction is not certification of an LCS material transport barrier.'
    ]
  }),
  analysis({
    id: 'analysis:basin',
    name: ['흡인 영역 엔트로피', 'Basin entropy'],
    module: 'src/chaos/basin.ts',
    exports: ['basinEntropy'],
    stage: 19,
    description: [
      '분류된 격자의 상자별 혼합도로 흡인 영역 엔트로피를 계산합니다.',
      'Compute basin entropy from label mixing within grid boxes.'
    ],
    inputs: [
      ['basin-grid', 'labels, width, height를 포함한 LabelGrid.', 'LabelGrid containing labels, width and height.']
    ],
    parameters: ['basinEntropy(grid, boxSide)의 공간 상자 크기.', 'Spatial box size in basinEntropy(grid, boxSide).'],
    output: [
      'basin-entropy',
      '전체·경계 엔트로피와 표본 통계.',
      'Overall and boundary entropy with sampling statistics.'
    ],
    cost: ['격자 셀 수에 비례합니다.', 'Linear in grid cells.'],
    limitation: [
      '기존 격자 라벨을 분석하며 새 흡인 영역 궤도를 생성하는 함수는 아닙니다.',
      'Analyzes existing grid labels; this entry point does not generate basin trajectories.'
    ]
  }),
  analysis({
    id: 'analysis:wada',
    name: ['Wada 해상도 수렴', 'Wada resolution convergence'],
    module: 'src/chaos/wadaConvergence.ts',
    exports: ['wadaResolutionConvergence', 'wadaConvergenceFromGrids'],
    stage: 19,
    description: [
      '이중 진자 반전 영역을 여러 해상도로 계산해 Wada 후보의 안정성을 비교합니다.',
      'Compare Wada-candidate stability across double-pendulum flip-basin resolutions.'
    ],
    inputs: [['parameters', '이중 진자의 PendulumParameters.', 'Double-pendulum PendulumParameters.']],
    scope: { systemIds: ['system:double'], evolutions: ['ode'] },
    parameters: [
      'WadaConvergenceOptions의 resolutions, radius, threshold, dt, maxTime과 각도 range.',
      'WadaConvergenceOptions resolutions, radius, threshold, dt, maxTime and angle range.'
    ],
    output: [
      'wada-convergence',
      '해상도별 후보 비율, 격자 해시와 수렴 판정.',
      'Candidate fractions, grid hashes and convergence verdict by resolution.'
    ],
    cost: [
      '각 해상도의 모든 셀을 적분하므로 해상도 제곱과 관측 시간에 비례합니다.',
      'Integrates every cell at each resolution; scales with squared resolution and horizon.'
    ],
    limitation: [
      '기본 실행은 이중 진자 반전 영역 전용이며 안정적 후보도 Wada 성질의 엄밀한 증명은 아닙니다.',
      'The primary runner is specific to double-pendulum flip basins; stable candidates are not rigorous proof of the Wada property.'
    ]
  })
];

/** Runtime checks actual source data; source-bound native API contracts remain intact. */
export const geometryAnalyses: readonly AnalysisDefinition[] = discoveredGeometryAnalyses.map((definition) => ({
  ...definition,
  tags: [
    ...definition.tags,
    'product-advanced-diagnostics-v1',
    ...(definition.id === 'analysis:basin' ? ['uncertainty', 'boundary-scaling', '불확실성', '경계'] : [])
  ],
  computation: { ...definition.computation, location: 'worker', cancellable: true }
}));
