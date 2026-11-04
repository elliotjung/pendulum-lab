import { authorChaosLesson } from '../../../src/product/learn/authoring-course-five';

export default authorChaosLesson({
  id: '5.8',
  title: ['0–1 test와 관측량 의존성', 'The 0–1 test and observable dependence'],
  question: [
    '한 각도만 측정해 카오스를 판별할 수 있을까요? 같은 run의 각도·각속도와 sampling stride에 따른 K 통계를 비교합니다.',
    'Can one measured angle distinguish chaos? Compare K statistics across angle, angular velocity and sampling stride from the same run.'
  ],
  prerequisites: [
    '균일한 유한 스칼라 기록을 사용합니다. ODE 접선 없이 실행하지만 관측량·기록 길이·sampling과 시험 주파수 seed는 여전히 분석 정의의 일부입니다.',
    'Use a finite uniform scalar record. ODE tangents are not required, but observable, record length, sampling and trial-frequency seed still define the analysis.'
  ],
  objectives: [
    [
      '관측량에서 시험 주파수별 누적 확산 좌표를 만드는 의미를 설명합니다.',
      'Explain trial-frequency accumulation and diffusion coordinates.'
    ],
    [
      '과표본화·잡음·짧은 기록에서 K의 오해를 구별합니다.',
      'Recognize misleading K values from oversampling, noise and short records.'
    ]
  ],
  concepts: [
    {
      title: ['한 관측량에서 확산 통계로', 'From an observable to diffusion statistics'],
      body: [
        '관측값에 시험각 c의 cos와 sin 가중치를 곱해 누적 좌표 p, q를 만듭니다. 여러 지연에서 이 좌표의 평균제곱변위를 측정하고 지연 증가와 연결합니다. 확산의 원인은 결정론적 혼돈뿐 아니라 잡음일 수 있습니다.',
        'Weight observations by cos and sin at a trial angle c and accumulate coordinates p and q. Compare their mean-square displacement across lags with lag growth. Diffusion can arise from noise as well as deterministic chaos.'
      ]
    },
    {
      title: ['여러 시험 주파수와 seed', 'Trial frequencies and seed'],
      body: [
        '특정 c의 공명에 민감한 결과를 줄이려고 여러 c에서 K를 구한 뒤 중앙값을 사용합니다. 공용 분석의 seed는 이 주파수 선택을 재현합니다. Bootstrap SE와 CI는 시험 주파수 표본의 변동이며 관측오차·모델오차 전체의 신뢰구간이 아닙니다.',
        'Compute K at multiple c values and aggregate by the median to reduce sensitivity to individual resonances. A seed reproduces the trial frequencies. Bootstrap SE and CI describe variation among those trials rather than all observational or model uncertainty.'
      ]
    },
    {
      title: ['과표본화는 더 좋은 자료인가', 'Is denser sampling always better?'],
      body: [
        '연속계에서 너무 작은 기록 간격은 유한 길이의 0–1 검사를 왜곡할 수 있습니다. Stride를 늘리면 유효 간격은 커지지만 표본 수는 줄어듭니다. 각도와 각속도는 같은 상태의 다른 관측이므로 짧은 기록의 K가 서로 다를 수 있습니다.',
        'Oversampling continuous dynamics can distort a finite-record 0–1 test. Increasing stride enlarges the effective interval but reduces sample count. Angle and angular velocity observe the same state differently and can yield different short-record K values.'
      ]
    },
    {
      title: ['실패 예제와 다음 탐구', 'Failure example and next inquiry'],
      body: [
        '상수 또는 거의 상수인 기록, 20개 미만 표본, 불균일 시각은 유효한 검사를 뒷받침하지 못합니다. K가 1에 가까워도 잡음과 혼돈을 구별하지 못합니다. 5.9에서는 수치오차의 증폭과 관측 통계의 불확실성을 별도로 다룹니다.',
        'Constant or near-constant signals, fewer than 20 samples and nonuniform times cannot support a useful test. K near 1 does not separate noise from chaos. In 5.9, distinguish numerical-error growth from uncertainty in observed statistics.'
      ]
    }
  ],
  equations: [
    {
      title: ['1. Stride 뒤의 실제 간격', '1. Effective interval after stride'],
      expression: 'effectiveInterval = recordedInterval*stride',
      explanation: [
        'Stride는 기록 표본을 몇 개마다 사용하는지 정합니다. 실제 적분 step을 바꾸는 설정과 다릅니다.',
        'Stride selects every indicated recorded sample rather than changing the integration step.'
      ],
      symbols: [
        ['effectiveInterval', 's', '분석 표본 간격', 'Analysis sampling interval'],
        ['recordedInterval', 's', '기록 표본 간격', 'Recorded sampling interval'],
        ['stride', '1', '선택 간격', 'Selection stride']
      ]
    },
    {
      title: ['2. 사용하는 최대 지연', '2. Maximum used lag'],
      expression: 'lagCount = sampleCount*lagFraction-fractionalPart',
      explanation: [
        '표본 수와 지연 비율의 곱에서 소수 부분 fractionalPart를 빼면 정수 내림한 최대 지연 수가 됩니다. 소수 부분은 0 이상 1 미만입니다. 기록이 너무 짧아 최소 두 지연을 만들 수 없으면 거부합니다.',
        'Subtract the fractional part of sample count times lag fraction to obtain its integer floor, the maximum lag count. The fractional part lies in [0,1). Records that cannot provide at least two lags are rejected.'
      ],
      symbols: [
        ['lagCount', '1', '최대 지연 수', 'Maximum lag count'],
        ['sampleCount', '1', '선택 뒤 표본 수', 'Selected sample count'],
        ['lagFraction', '1', '지연 비율', 'Lag fraction'],
        [
          'fractionalPart',
          '1',
          '표본 수와 지연 비율 곱의 소수 부분',
          'Fractional part of sample count times lag fraction'
        ]
      ]
    }
  ],
  term: ['관측량 의존성', 'Observable dependence'],
  definition: [
    '같은 상태를 다른 스칼라로 측정할 때 유한 자료의 진단이 달라지는 현상입니다.',
    'Variation of a finite-data diagnostic when the same state is measured through different scalar observables.'
  ],
  checks: [
    {
      prompt: ['K가 1에 가까우면 잡음을 배제하나요?', 'Does K near 1 rule out noise?'],
      correct: ['잡음에서도 클 수 있습니다.', 'Noise can also produce large K.'],
      wrong: ['결정론적 카오스만 가능합니다.', 'Only deterministic chaos is possible.'],
      explanation: [
        '0–1 통계 하나로 잡음과 카오스를 확정적으로 구별하지 않습니다.',
        'The 0–1 statistic alone cannot conclusively separate noise and chaos.'
      ]
    },
    {
      prompt: [
        '기록 간격을 무조건 줄이면 더 정확한가요?',
        'Does a smaller recording interval always improve the test?'
      ],
      correct: ['과표본화와 표본 길이를 함께 확인합니다.', 'Check oversampling together with record length.'],
      wrong: ['항상 정확해집니다.', 'It always improves accuracy.'],
      explanation: [
        '유한 길이의 연속계 검사에는 과표본화 문제가 있습니다.',
        'Finite-record continuous-time tests can suffer from oversampling.'
      ]
    }
  ],
  task: {
    prediction: [
      '같은 run의 theta1과 omega1의 K가 같을까요?',
      'Will theta1 and omega1 yield identical K on the same run?'
    ],
    action: [
      '기본 결과와 다른 관측량의 비교를 읽고 stride를 1에서 2로 바꿉니다. K·유효 표본 수·시험 seed를 함께 기록하세요.',
      'Inspect current and alternate-observable results, then change stride from 1 to 2. Record K, effective sample count and trial seed.'
    ],
    expected: [
      '같은 입력·seed의 K는 1e-12 이내에서 재현되고 각 K는 -1부터 1 범위입니다. 관측량·stride를 바꾼 값의 일치나 카오스 분류는 보장하지 않습니다.',
      'Identical input and seed reproduce K within 1e-12; K lies between -1 and 1. Agreement or a chaos classification after changing observable or stride is not guaranteed.'
    ],
    explanation: [
      '견고성은 설정 변경으로 확인할 비교 대상이며 기본 가정이 아닙니다.',
      'Test robustness through controlled changes rather than assuming it.'
    ]
  },
  source: {
    title: ['On the Implementation of the 0–1 Test for Chaos', 'On the Implementation of the 0–1 Test for Chaos'],
    authors: 'Georg A. Gottwald, Ian Melbourne',
    url: 'https://arxiv.org/abs/0906.1418',
    locator: [
      '상관형 K 계산, 중앙값 선택, 6절 Continuous time systems의 과표본화 문제를 대조했습니다.',
      'Checked correlation-based K, median aggregation and oversampling in section 6, Continuous time systems.'
    ]
  }
});
