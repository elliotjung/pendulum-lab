import { authorChaosLesson } from '../../../src/product/learn/authoring-course-five';

export default authorChaosLesson({
  id: '5.12',
  title: ['correlation dimension과 scaling 영역', 'Correlation dimension and scaling regions'],
  question: [
    'Log-log 그림의 직선 하나로 차원을 알 수 있을까요? Embedding 차원·사용 표본·상관합 적합 대역을 바꾸며 D2의 plateau 후보를 검사합니다.',
    'Can one straight log-log segment determine dimension? Vary embedding, used samples and the fitted correlation-sum band to inspect candidate D2 plateaus.'
  ],
  prerequisites: [
    '균일한 theta1의 지연 점군과 Theiler 제외 쌍을 사용합니다. 거리 norm·원래 단위·정상성·표본 길이를 고정하고 C(r)가 0인 구간은 log 그림에서 제외합니다.',
    'Use delay points from uniform theta1 with Theiler-excluded pairs. Specify metric, original units, stationarity and record length; omit C(r)=0 from logarithmic plots.'
  ],
  objectives: [
    [
      '상관합과 log-log 기울기의 차원 추정 관계를 설명합니다.',
      'Explain correlation sums and dimension estimation from log-log slopes.'
    ],
    [
      '표본 부족·시간상관·적합 fallback·R²의 오해를 검사합니다.',
      'Inspect undersampling, temporal correlation, fallback fitting and misinterpretation of R².'
    ]
  ],
  concepts: [
    {
      title: ['가까운 쌍의 분율', 'Fraction of nearby pairs'],
      body: [
        '반경 r보다 가까운 상태 쌍의 분율을 C(r)로 정의합니다. 상관차원은 작은 r 한계의 스케일링 지수이지만 유한 자료에서는 너무 작은 반경에 쌍이 거의 없습니다. 표본 수를 고정한 채 무조건 더 작은 r로 가면 정확해지는 것은 아닙니다.',
        'C(r) is the fraction of state pairs closer than r. Correlation dimension is a small-radius scaling exponent, but finite data contain few close pairs at very small r. Shrinking r at fixed sample count does not automatically improve accuracy.'
      ]
    },
    {
      title: ['기울기와 포화의 확인', 'Check slope and saturation'],
      body: [
        'Log C를 log r에 대해 적합해 기울기를 구하고 embedding을 늘려 비슷한 영역에서 안정되는지 봅니다. 유사한 값 두 개는 포화의 충분조건이 아닙니다. 비정상성·잡음·시간상관이 겉보기 기울기를 만들 수 있습니다.',
        'Fit log C against log r and inspect stability over comparable ranges as embedding increases. Two similar estimates do not establish saturation. Nonstationarity, noise and temporal correlation can create apparent slopes.'
      ]
    },
    {
      title: ['실제 적합 범위를 보존', 'Preserve the actual fit range'],
      body: [
        '공용 함수는 지정한 상관합 하한·상한을 고르지만 그 대역의 점이 3개 미만이면 반경 격자의 중간 1/3을 사용합니다. 따라서 요청 대역뿐 아니라 실제 fitRange와 쌍 수를 확인해야 합니다. R²는 회귀 적합도이지 통계적 신뢰도나 plateau 인증이 아닙니다.',
        'The native routine selects the requested correlation-sum band but falls back to the middle third of radii if fewer than three points qualify. Inspect actual fitRange and pair count. R² measures fit quality rather than statistical confidence or a certified plateau.'
      ]
    },
    {
      title: ['실패 예제와 다음 탐구', 'Failure example and next inquiry'],
      body: [
        '상수 관측·지나치게 큰 Theiler 창·높은 embedding·짧은 자료는 평가할 쌍을 없앨 수 있습니다. 잠깐 관찰한 보존 진자의 점군은 점근 attractor 표본이 아닙니다. 5.13에서는 각 지역의 다른 점유 확률을 추가로 봅니다.',
        'Constant observations, oversized Theiler windows and high embedding with short records can remove usable pairs. A short conservative-pendulum cloud is not automatically sampled from an asymptotic attractor. In 5.13, inspect unequal local occupancy probabilities.'
      ]
    }
  ],
  equations: [
    {
      title: ['1. 상관합', '1. Correlation sum'],
      expression: 'correlationSum = closePairs/eligiblePairs',
      explanation: [
        '같은 거리 척도와 Theiler 규칙으로 평가한 가까운 쌍의 분율입니다. 자기쌍은 포함하지 않습니다.',
        'The fraction of close pairs evaluated with the same metric and Theiler convention, excluding self-pairs.'
      ],
      symbols: [
        ['correlationSum', '1', '상관합', 'Correlation sum'],
        ['closePairs', '1', '반경 안의 쌍 수', 'Pair count inside radius'],
        ['eligiblePairs', '1', '유효 쌍 수', 'Eligible pair count']
      ]
    },
    {
      title: ['2. 유한 척도 기울기', '2. Finite-scale slope'],
      expression: 'localDimension = log(c2/c1)/log(r2/r1)',
      explanation: [
        '양수인 상관합 두 개와 서로 다른 양수 반경의 비를 사용해 로그를 무차원으로 만듭니다. 단일 두 점 기울기가 점근차원인 것은 아닙니다.',
        'Use ratios of positive correlation sums and distinct positive radii so logarithms are dimensionless. A two-point slope alone is not an asymptotic dimension.'
      ],
      symbols: [
        ['localDimension', '1', '유한 척도 기울기', 'Finite-scale slope'],
        ['c2', '1', '큰 반경의 상관합', 'Larger-radius correlation sum'],
        ['c1', '1', '작은 반경의 상관합', 'Smaller-radius correlation sum'],
        ['r2', 'rad', '큰 거리 반경', 'Larger radius'],
        ['r1', 'rad', '작은 거리 반경', 'Smaller radius']
      ]
    }
  ],
  term: ['scaling plateau', 'Scaling plateau'],
  definition: [
    '유효 반경 범위와 embedding 증가에서 기울기가 안정적인 영역의 후보입니다. 여러 수렴 검사를 거쳐야 합니다.',
    'A candidate region of stable slopes across useful radii and embedding refinements, requiring multiple convergence checks.'
  ],
  checks: [
    {
      prompt: ['R²가 0.99이면 차원이 인증되나요?', 'Does R²=0.99 certify the dimension?'],
      correct: [
        '회귀 적합도일 뿐 plateau 검사가 더 필요합니다.',
        'It only measures regression fit; plateau checks remain.'
      ],
      wrong: ['통계적으로 확정됩니다.', 'It is statistically proved.'],
      explanation: [
        '잘못된 구간도 높은 R²를 줄 수 있습니다.',
        'An inappropriate fitting range can still yield high R².'
      ]
    },
    {
      prompt: ['반경을 작게 할수록 언제나 좋은가요?', 'Are smaller radii always better?'],
      correct: ['유한 표본에서 가까운 쌍이 부족해집니다.', 'Finite data can lack enough close pairs.'],
      wrong: ['항상 참차원에 가까워집니다.', 'They always approach the true dimension.'],
      explanation: [
        'r의 극한과 표본 수의 극한을 혼동하지 않습니다.',
        'Do not confuse the radius limit with the sample-size limit.'
      ]
    }
  ],
  task: {
    prediction: [
      'Embedding을 2에서 3으로 늘리면 D2와 실제 적합 범위는 어떻게 변할까요?',
      'How will D2 and the actual fit range change from embedding 2 to 3?'
    ],
    action: [
      '기본값과 자동 차원 +1 비교를 읽고 maxSamples와 적합 상관합 대역을 한 번에 하나씩 변경합니다.',
      'Inspect default and automatic dimension +1 comparisons, then vary maxSamples and the fitted correlation-sum band one at a time.'
    ],
    expected: [
      '기본 결과의 기울기는 유한해야 합니다. 독립 원형 점군 benchmark에서는 D2가 1의 0.15 이내여야 하며 진자 점군에 같은 정답을 강제하지 않습니다.',
      'The default slope must be finite. An independent circular-point-cloud benchmark should yield D2 within 0.15 of 1; the pendulum cloud is not forced to share that answer.'
    ],
    explanation: [
      '알려진 기하의 검증과 임의 궤적의 차원 추정을 분리합니다.',
      'Separate validation on known geometry from dimension estimates of arbitrary trajectories.'
    ]
  },
  source: {
    title: ['Grassberger–Procaccia algorithm', 'Grassberger–Procaccia algorithm'],
    authors: 'Peter Grassberger',
    url: 'https://www.scholarpedia.org/article/Grassberger-Procaccia_algorithm',
    locator: [
      '저자 해설의 식 (1)~(3), 유한 N에서 r→0 외삽의 ill-posed 성질, 정상성·시간상관·잡음 논의를 대조했습니다.',
      'Checked the author equations (1)–(3), ill-posed small-radius extrapolation at finite N, stationarity, temporal correlations and noise.'
    ]
  }
});
