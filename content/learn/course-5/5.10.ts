import { authorChaosLesson } from '../../../src/product/learn/authoring-course-five';

export default authorChaosLesson({
  id: '5.10',
  title: ['recurrence plot과 RQA', 'Recurrence plots and RQA'],
  question: [
    '궤적이 다시 가까워지는 패턴은 어떻게 수치화할까요? 같은 기록의 목표 재귀율을 바꾸며 실제 epsilon·재귀 행렬·DET·LAM을 비교합니다.',
    'How can returns to nearby states be quantified? Vary target recurrence rate on the same record and compare actual epsilon, the recurrence matrix, DET and LAM.'
  ],
  prerequisites: [
    '균일한 theta1 기록을 지연 embedding합니다. 좌표를 자동으로 정규화하지 않으며 시간적으로 가까운 점과 선 길이 기준을 명시합니다. 조밀 행렬의 비용은 점 수의 제곱으로 늘어납니다.',
    'Delay-embed a uniform theta1 record without automatic normalization. Specify temporal neighbors and line-length criteria. Dense-matrix cost grows quadratically with point count.'
  ],
  objectives: [
    [
      'epsilon으로 정의된 재귀와 목표 재귀율에 따른 epsilon 선택을 구별합니다.',
      'Distinguish recurrence at a given epsilon from selecting epsilon through a target recurrence rate.'
    ],
    [
      '재귀 선 통계와 block 변동이 보장하지 않는 것을 설명합니다.',
      'Explain limitations of line statistics and block variability.'
    ]
  ],
  concepts: [
    {
      title: ['가까움의 정의가 먼저', 'Define proximity first'],
      body: [
        '재구성한 두 상태의 거리가 epsilon 이하면 재귀로 기록합니다. 이 실험은 사용자가 고른 목표 재귀율로 epsilon을 결정하고 실제 epsilon을 보존합니다. 거리 동률과 표본 길이 때문에 실제 재귀율은 목표와 정확히 같지 않을 수 있습니다.',
        'A pair recurs when its reconstructed-state distance is at most epsilon. Here a target recurrence rate selects epsilon and the actual threshold is preserved. Tied distances and finite samples can make achieved recurrence differ from target.'
      ]
    },
    {
      title: ['대각선과 수직선', 'Diagonal and vertical structures'],
      body: [
        '대각선 구조는 일정 시간 동안 비슷한 방향으로 진화한 구간을, 수직선은 한 영역에 머문 구간을 나타낼 수 있습니다. DET는 최소 대각선 길이 이상의 재귀점 비율이고 LAM은 최소 수직선 길이에 대한 비율입니다. 이름 determinism이 결정론의 증명은 아닙니다.',
        'Diagonal structures can reflect segments evolving similarly; vertical structures can reflect residence near a region. DET and LAM count recurrent points in lines exceeding their respective minima. The name determinism does not prove deterministic dynamics.'
      ]
    },
    {
      title: ['Theiler 창과 block 변동', 'Theiler window and block variability'],
      body: [
        'Native RQA에서 재귀율은 자기쌍을 제외한 전체 쌍의 비율입니다. Theiler 창은 DET 등의 대각선 통계에만 적용되며 LAM의 수직선 통계에는 같은 창을 적용하지 않습니다. 연속 block마다 epsilon을 다시 선택한 표준오차는 구간 사이의 변동이며 독립 측정의 신뢰구간이 아닙니다.',
        'Native RQA measures recurrence rate over all off-diagonal pairs. The Theiler window applies to diagonal statistics such as DET, while LAM vertical statistics do not use that same window. Block standard errors reselect epsilon in each contiguous segment and describe variation across segments, not independent-observation confidence.'
      ]
    },
    {
      title: ['실패 예제와 다음 탐구', 'Failure example and next inquiry'],
      body: [
        'Epsilon을 크게 하면 거의 모든 점이 연결되어 높은 DET가 자명해질 수 있습니다. 상수 신호·과도하게 큰 지연·짧은 block은 거부합니다. 5.11에서는 같은 행렬을 그래프로 읽되 자기연결과 Theiler 이웃을 명시적으로 제외합니다.',
        'A very large epsilon can connect almost all points and make high DET trivial. Constant signals, excessive delays and short blocks are rejected. In 5.11, read the matrix as a graph while explicitly removing self and Theiler-neighbor links.'
      ]
    }
  ],
  equations: [
    {
      title: ['1. 평가 대상 재귀쌍의 비율', '1. Fraction of recurrent pairs'],
      expression: 'recurrenceRate = recurrentPairs/eligiblePairs',
      explanation: [
        '분자와 분모에 동일한 쌍 규칙을 적용합니다. Native 재귀율은 자기쌍을 제외하며 Theiler 창을 추가로 제외한 그래프 밀도와 구분합니다.',
        'Apply the same pair convention to numerator and denominator. Native recurrence rate excludes self-pairs and differs from graph density that also removes Theiler neighbors.'
      ],
      symbols: [
        ['recurrenceRate', '1', '실제 재귀율', 'Actual recurrence rate'],
        ['recurrentPairs', '1', '재귀쌍 수', 'Recurrent pair count'],
        ['eligiblePairs', '1', '평가한 쌍 수', 'Evaluated pair count']
      ]
    },
    {
      title: ['2. 대각선 점 비율', '2. Fraction in diagonal lines'],
      expression: 'determinism = diagonalPoints/recurrentPoints',
      explanation: [
        '최소 길이 조건을 만족하는 대각선의 점 수를 Theiler 창 밖에서 평가한 전체 대각선 재귀점 수로 나눕니다. DET가 높다는 것과 카오스·결정론이 증명되었다는 것은 다릅니다.',
        'Divide points in qualifying diagonal lines by all diagonal recurrence points evaluated outside the Theiler window. High DET does not prove chaos or deterministic generation.'
      ],
      symbols: [
        ['determinism', '1', 'DET 비율', 'DET fraction'],
        ['diagonalPoints', '1', '최소 길이 이상 대각선의 점 수', 'Points in qualifying diagonals'],
        [
          'recurrentPoints',
          '1',
          '창 밖의 평가 대상 대각선 재귀점 수',
          'Applicable diagonal recurrent-point count outside the window'
        ]
      ]
    }
  ],
  term: ['목표 재귀율', 'Target recurrence rate'],
  definition: [
    'Epsilon 선택을 돕는 거리 분포의 목표 분율이며 실제 달성률과 구분합니다.',
    'A target fraction of the distance distribution used to select epsilon, distinct from the achieved rate.'
  ],
  checks: [
    {
      prompt: ['DET가 높으면 결정론이 증명되나요?', 'Does high DET prove determinism?'],
      correct: ['Threshold·sampling·잡음을 함께 확인합니다.', 'Threshold, sampling and noise still need checking.'],
      wrong: ['이름 그대로 자동 증명입니다.', 'The name implies automatic proof.'],
      explanation: [
        'RQA의 구조 통계는 생성 모델의 존재 증명이 아닙니다.',
        'An RQA structure statistic is not a proof of the generating model.'
      ]
    },
    {
      prompt: ['Block SE는 독립 표본 CI인가요?', 'Is block SE an independent-sample confidence interval?'],
      correct: ['연속 block 변동의 요약입니다.', 'It summarizes variation across contiguous blocks.'],
      wrong: ['모든 불확실성을 포함합니다.', 'It captures all uncertainty.'],
      explanation: [
        '시간 의존성과 체계오차는 별도로 확인합니다.',
        'Temporal dependence and systematic errors remain separate.'
      ]
    }
  ],
  task: {
    prediction: [
      '목표 재귀율을 0.1에서 0.15로 늘리면 epsilon은 어떻게 될까요?',
      'How should epsilon change when target recurrence rises from 0.1 to 0.15?'
    ],
    action: [
      '기본 결과와 자동 1.5배 목표율 비교표를 읽고 실제 epsilon·DET·LAM의 변화를 설명하세요.',
      'Read the default and automatic 1.5-times-target tables and explain changes in epsilon, DET and LAM.'
    ],
    expected: [
      '동일한 점군에서는 큰 목표율의 epsilon이 1e-12 rad 허용차 안에서 작아지지 않아야 합니다. DET·LAM의 단조 증가를 요구하지 않습니다.',
      'On the same points, a larger target rate should not decrease epsilon beyond a 1e-12 rad tolerance. DET and LAM need not increase monotonically.'
    ],
    explanation: [
      '가까움의 문턱 변경과 동역학의 변화를 분리합니다.',
      'Separate changed proximity criteria from changed dynamics.'
    ]
  },
  source: {
    title: [
      'Recurrence Plots for the Analysis of Complex Systems',
      'Recurrence Plots for the Analysis of Complex Systems'
    ],
    authors: 'Norbert Marwan, M. Carmen Romano, Marco Thiel, Jürgen Kurths',
    url: 'https://arxiv.org/abs/2501.13933',
    locator: [
      '2007 리뷰의 재귀 정의·threshold 선택·RQA 선 통계와 함정을 저자 공개본에서 대조했습니다. Native Theiler 창·block 처리 규약은 보존된 소스와 별도로 대조합니다.',
      'Checked recurrence definitions, threshold selection, RQA line statistics and pitfalls in the author-posted version of the 2007 review. Native Theiler-window and block conventions are checked separately against preserved source.'
    ]
  }
});
