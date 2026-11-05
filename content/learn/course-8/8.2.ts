import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '8.2',
  summary: [
    '같은 구간을 grid·log·Latin hypercube·ensemble로 표본화하고 실제 계산 비용과 endpoint 분산을 비교합니다.',
    'Sample one interval with grid, log, Latin hypercube and ensemble designs, comparing native run cost and endpoint spread.'
  ],
  objectives: [
    [
      '격자·층화·무작위 설계가 표본을 배치하는 방식을 구별한다.',
      'Distinguish how grid, stratified and random designs place samples.'
    ],
    [
      '동일 seed의 설계 재현성과 유한 표본의 한계를 평가한다.',
      'Assess seeded design repeatability and finite-sample limits.'
    ]
  ],
  assumptions: [
    '이중진자 첫 초기각의 양의 구간 0.1..1 rad를 탐색합니다. 나머지 물성·적분 설정은 고정합니다. log 설계는 양수만 허용하며 ensemble은 입력의 독립 균등표본입니다. seed만 바꾼 결정론적 진자는 새 물리 잡음을 만들지 않습니다.',
    'The first initial angle is sampled on the positive interval 0.1..1 rad, with all other physical and integration settings fixed. Log designs require positive bounds; the ensemble uses independent uniform input samples. Changing a seed alone does not add physical noise to a deterministic pendulum.'
  ],
  concepts: [
    {
      id: 'placement',
      title: ['구간을 배치하는 네 방법', 'Four ways to place samples'],
      body: [
        '선형 격자는 양 끝을 포함한 등간격이고 log는 로그좌표에서 등간격입니다. LHS는 각 축의 같은 확률 구간을 한 번씩 방문하며 seed가 층 순서와 내부 위치를 정합니다. ensemble은 같은 구간에서 독립적으로 뽑으므로 일부 구간이 비어 있을 수 있습니다.',
        'A linear grid includes both endpoints at equal increments; a log grid is equally spaced in logarithmic coordinates. LHS visits every equal-probability stratum once per axis, with seeded permutations and interior positions. Independent ensemble draws can leave some strata empty.'
      ]
    },
    {
      id: 'cost-spread',
      title: ['실행 수와 유한 표본 분산의 해석', 'Interpreting cost and finite-sample spread'],
      body: [
        '같은 초기조건·기간마다 실제 공용 엔진 run을 수행합니다. 표준편차는 성공한 endpoint들의 n−1 표본 값이며 표준오차나 95% 신뢰구간이 아닙니다. 작은 LHS나 grid는 희귀 사건과 다변수 상호작용을 모두 포착하지 못합니다.',
        'Each assigned input runs the real shared engine for the same duration. Reported spread is the n−1 sample standard deviation of successful endpoints, rather than a standard error or 95% confidence interval. Small LHS and grid designs cannot capture every rare event or multivariable interaction.'
      ]
    }
  ],
  equations: [
    {
      id: 'grid',
      title: ['선형 격자의 좌표', 'Linear grid coordinate'],
      expression: 'q = a + u * (b - a)',
      explanation: [
        '무차원 위치 u를 0..1로 두고 rad 구간 a..b에 옮깁니다. 격자는 양 끝을 포함하고 LHS와 ensemble은 내부 u를 다르게 선택합니다.',
        'Map dimensionless u in 0..1 into the angle interval a..b in rad. Grids include endpoints; LHS and ensemble select interior u differently.'
      ],
      symbols: [
        ['q', 'rad', '표본 각도', 'sample angle'],
        ['a', 'rad', '하한 각도', 'lower angle'],
        ['b', 'rad', '상한 각도', 'upper angle'],
        ['u', '1', '정규화 위치', 'normalized location']
      ]
    },
    {
      id: 'cost',
      title: ['한 축 실험의 총 단계', 'Total steps for a one-axis design'],
      expression: 'C = N * T / h',
      explanation: [
        '각 run에 같은 기간 T와 step h가 있고 N개 run이면 총 단계 수는 대략 N T/h입니다. 상태 차원과 적분기별 rhs 비용은 별도로 곱해야 합니다.',
        'With N runs, common duration T and step h, total integration steps are approximately N T/h. State dimension and integrator-specific RHS cost must be counted separately.'
      ],
      symbols: [
        ['C', '1', '총 적분 단계', 'total integration steps'],
        ['N', '1', 'run 개수', 'run count'],
        ['T', 's', 'run 기간', 'run duration'],
        ['h', 's', '적분 간격', 'integration interval']
      ]
    }
  ],
  prediction: [
    '설계 seed를 바꾸면 선형·log 격자와 LHS·ensemble 중 어떤 입력 좌표가 바뀔지 예측하세요.',
    'Predict which assigned coordinates change when the design seed changes: linear/log grids or LHS/ensemble.'
  ],
  action: [
    '기본 run 수로 네 설계를 계산하고 seed 번호를 한 번 바꾼 뒤 각 설계의 첫 각도 목록을 비교하세요.',
    'Calculate all four designs at the default run count, change the seed number once, and compare the assigned first-angle lists.'
  ],
  expected: [
    '기본 설정에서 각 설계는 6개 native run을 완료합니다. 동일 seed는 LHS·ensemble 좌표와 결과를 정확히 재현하고 grid 좌표는 seed와 무관합니다.',
    'Each default design completes six native runs. The same seed exactly repeats LHS/ensemble assignments and results; grid coordinates do not depend on seed.'
  ],
  explanation: [
    'seed는 실험 설계를 재현하며 모델이 확률계가 아니면 물리 법칙을 바꾸지 않습니다. 설계별 endpoint 분산 차이는 표본 배치 차이도 반영합니다.',
    'A seed reproduces the experimental design and does not change the physics of a deterministic model. Differences in endpoint spread also reflect different sample placement.'
  ],
  next: [
    '두 입력으로 확장하면 Cartesian grid의 실행 수가 곱으로 증가합니다. coverage·희귀 사건·수렴 검사를 추가해 설계를 선택하세요.',
    'With two inputs a Cartesian grid grows multiplicatively. Choose designs using coverage, rare-event and convergence checks.'
  ],
  glossary: [
    ['Latin hypercube', 'Latin hypercube'],
    [
      '각 입력 축을 같은 확률의 층으로 나누고 각 층을 한 번 방문하는 설계입니다.',
      'A design visiting every equal-probability stratum once on each input axis.'
    ]
  ],
  sources: [
    {
      path: 'src/product/lab/experiments/builders.ts',
      locator: [
        'buildBatch의 grid/log/lhs/ensemble 설계와 비용 제한',
        'buildBatch grid/log/lhs/ensemble assignments, seed handling and bounded cost'
      ]
    },
    {
      path: 'src/product/lab/experiments/aggregate.ts',
      locator: [
        '성공 run endpoint와 n−1 표준편차',
        'Successful endpoint aggregation and n-minus-one sample standard deviation'
      ]
    }
  ],
  external: {
    title:
      'A Comparison of Three Methods for Selecting Values of Input Variables in the Analysis of Output from a Computer Code',
    authors: 'M. D. McKay, R. J. Beckman, W. J. Conover',
    url: 'https://www.stat.cmu.edu/technometrics/70-79/VOL-21-02/v2102239.pdf',
    locator: [
      '1979 논문 239–245쪽의 Latin hypercube 표본 설계',
      'Technometrics 21(2), pages239–245: Latin hypercube sampling design'
    ]
  },
  checks: [
    {
      prompt: ['LHS의 작은 표본이 보장하는 것은?', 'What does a small LHS design ensure?'],
      correct: ['각 축의 각 층을 한 번 방문한다.', 'Each stratum is visited once on each input axis.'],
      incorrect: ['모든 다변수 결합과 희귀 사건을 찾는다.', 'Every joint configuration and rare event is found.'],
      explanation: [
        '축별 층화는 전체 다차원 격자의 전수 방문과 다릅니다.',
        'Per-axis stratification is different from exhaustively visiting a multidimensional grid.'
      ]
    },
    {
      prompt: ['표시한 endpoint 표준편차는?', 'What is the displayed endpoint standard deviation?'],
      correct: ['계산한 run 사이의 표본 산포다.', 'Sample spread across the calculated runs.'],
      incorrect: ['자동으로 95% 신뢰구간이다.', 'Automatically a 95% confidence interval.'],
      explanation: [
        'n−1 표준편차는 독립 표본·분포 가정과 추정량 정의 없이는 신뢰구간이 아닙니다.',
        'An n−1 standard deviation is not a confidence interval without a defined estimator and suitable sampling assumptions.'
      ]
    }
  ]
});
