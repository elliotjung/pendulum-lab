import { authorChaosLesson } from '../../../src/product/learn/authoring-course-five';

export default authorChaosLesson({
  id: '5.5',
  title: ['최대 Lyapunov 지수', 'The maximal Lyapunov exponent'],
  question: [
    '가까운 상태의 차이가 늘었다면 지수적 불안정일까요? 같은 모델에서 기간과 접선 재규격화 간격을 바꾸어 유한시간 첫 지수를 비교합니다.',
    'Does growing separation imply exponential instability? Compare a finite-time leading exponent while varying duration and tangent renormalization interval.'
  ],
  prerequisites: [
    '매끄러운 이중진자의 native 벡터장과 원 초기조건을 사용합니다. 작은 유한 교란 대신 공용 변분·QR 알고리즘의 count=1을 실행하며 모든 좌표의 원 단위를 유지합니다.',
    'Use the smooth native double-pendulum field and original initial state. The shared variational/QR algorithm runs with count=1, rather than a finite perturbed trajectory, retaining original coordinate units.'
  ],
  objectives: [
    [
      '유한시간 접선 성장률과 점근 지수를 구별합니다.',
      'Distinguish finite-time tangent growth from asymptotic exponents.'
    ],
    [
      '기간·재규격화·좌표 척도에 대한 민감도와 실패 예제를 설명합니다.',
      'Explain sensitivity to duration, renormalization and coordinate scaling.'
    ]
  ],
  concepts: [
    {
      title: ['접선의 의미', 'Meaning of a tangent'],
      body: [
        '미소 교란은 원 궤적 위에서 Jacobian을 따라 선형화됩니다. 미소 접선과 두 유한 궤적의 거리는 포화되기 전에도 같지 않을 수 있습니다. 지수는 전체 상태에 대한 성장률이므로 theta1만의 커진 진폭과 동일한 양이 아닙니다.',
        'An infinitesimal perturbation follows the Jacobian along the reference trajectory. Tangents and the distance between finite trajectories can differ even before saturation. An exponent measures growth in full state, rather than an increase in theta1 amplitude.'
      ]
    },
    {
      title: ['로그 성장과 재규격화', 'Logarithmic growth and renormalization'],
      body: [
        '교란의 크기를 제한하기 위해 일정 step마다 길이를 다시 정규화하고 늘어난 배율의 로그를 누적합니다. 누적 로그를 실제 측정 기간으로 나누면 유한시간 추정입니다. 재규격화가 너무 드물면 overflow나 방향 정보의 손실이 생길 수 있습니다.',
        'Renormalize every fixed number of steps to bound tangent length and accumulate logarithmic stretch factors. Dividing by actual measurement time yields a finite-time estimate. Infrequent renormalization can introduce overflow or loss of directional information.'
      ]
    },
    {
      title: ['기간과 불확실성', 'Duration and uncertainty'],
      body: [
        '짧은 규칙 궤적도 유한시간 지수가 양수일 수 있습니다. 기본 계산은 원 초기조건에서 독립 실행하며 같은 seed를 사용합니다. 공용 SE와 block SE는 수치적 dt 오차·Jacobian 오차나 모델 오류 전체를 포함하지 않으므로 작은 SE를 정확성 인증으로 쓰지 않습니다.',
        'A regular orbit can have a positive short-time estimate. Runs restart independently from the original state with the same seed. Native SE and block SE do not encompass all step-size, Jacobian or model errors; small SE does not certify accuracy.'
      ]
    },
    {
      title: ['실패 예제와 다음 탐구', 'Failure example and next inquiry'],
      body: [
        '짧은 관측에서 양수라는 이유만으로 카오스를 확정하지 않습니다. 이 실험은 사용자가 고른 fitting window에서 회귀하는 방식이 아니며 기간 비교를 제공합니다. 접촉·지연·확률계에 같은 ODE 접선식을 적용하지 않습니다. 5.6에서 첫 지수뿐 아니라 전체 부피 성장을 봅니다.',
        'A positive short-time value alone does not establish chaos. This experiment compares observation durations rather than fitting a user-selected regression window. The same ODE tangent model is not applied to contact, delay or stochastic systems. In 5.6, inspect full-volume growth.'
      ]
    }
  ],
  equations: [
    {
      title: ['1. 한 구간의 로그 성장률', '1. Logarithmic growth in an interval'],
      expression: 'localRate = log(stretch)/interval',
      explanation: [
        'stretch는 무차원 교란 길이 배율이고 interval은 실제 재규격화 사이의 초입니다. 로그이므로 다른 구간의 배율을 곱하는 대신 로그를 더합니다.',
        'Stretch is a dimensionless length ratio and interval is seconds between renormalizations. Logarithms turn products of interval stretch factors into sums.'
      ],
      symbols: [
        ['localRate', 's^-1', '구간 성장률', 'Interval growth rate'],
        ['stretch', '1', '접선 길이 배율', 'Tangent-length ratio'],
        ['interval', 's', '구간 기간', 'Interval duration']
      ]
    },
    {
      title: ['2. 전체 유한시간 추정', '2. Finite-time estimate'],
      expression: 'finiteExponent = accumulatedLog/duration',
      explanation: [
        '측정 구간의 로그 배율 합을 측정 초로 나눕니다. duration을 늘려도 값이 단조롭게 변하거나 0으로 정확히 맞아야 하는 것은 아닙니다.',
        'Divide accumulated log stretch by measurement time. Increasing duration need not change the estimate monotonically or make it exactly zero.'
      ],
      symbols: [
        ['finiteExponent', 's^-1', '유한시간 지수', 'Finite-time exponent'],
        ['accumulatedLog', '1', '누적 로그 배율', 'Accumulated log stretch'],
        ['duration', 's', '실제 측정 기간', 'Actual measurement duration']
      ]
    }
  ],
  term: ['유한시간 지수', 'Finite-time exponent'],
  definition: [
    '정해진 기간에서 측정한 미소 접선의 평균 로그 성장률입니다.',
    'Average logarithmic tangent growth measured over a specified finite interval.'
  ],
  checks: [
    {
      prompt: ['짧은 run의 첫 지수가 양수이면?', 'What does a positive leading exponent in a short run establish?'],
      correct: ['수렴과 다른 진단을 더 확인해야 합니다.', 'Convergence and other diagnostics still need checking.'],
      wrong: ['점근 카오스가 증명됩니다.', 'Asymptotic chaos is proved.'],
      explanation: [
        '유한시간 성장과 점근 지수의 부호는 다를 수 있습니다.',
        'Finite-time growth can differ from the sign of an asymptotic exponent.'
      ]
    },
    {
      prompt: ['SE가 작으면 적분 오차도 작나요?', 'Does small SE guarantee small integration error?'],
      correct: ['SE는 모든 체계 오차를 포함하지 않습니다.', 'SE does not include every systematic error.'],
      wrong: ['항상 그렇습니다.', 'Always.'],
      explanation: [
        'step·Jacobian·모델 오차는 별도의 수렴 검사가 필요합니다.',
        'Step-size, Jacobian and model errors require separate convergence checks.'
      ]
    }
  ],
  task: {
    prediction: [
      '재규격화 간격을 절반으로 줄이면 첫 지수는 어떻게 바뀔까요?',
      'How will halving the renormalization interval change the leading exponent?'
    ],
    action: [
      '기본 결과와 자동으로 계산한 절반 기간·절반 간격 표를 비교합니다. duration과 theta1을 한 번에 하나씩 변경합니다.',
      'Compare the default result with the automatically computed half-duration and half-interval results. Vary duration and theta1 one at a time.'
    ],
    expected: [
      '같은 기간·seed에서 반복 결과는 1e-10 s^-1 이내로 재현됩니다. 다른 기간의 차이는 유한시간 민감도이며 양수·음수 판정을 강제로 맞추지 않습니다.',
      'Repeated duration and seed reproduce estimates within 1e-10 s^-1. Differences across duration show finite-time sensitivity; signs are not forced to match.'
    ],
    explanation: [
      '분류 문턱보다 먼저 측정 규칙과 수렴을 비교합니다.',
      'Compare measurement rules and convergence before applying a classification threshold.'
    ]
  },
  source: {
    title: [
      'The Lyapunov Characteristic Exponents and their computation',
      'The Lyapunov Characteristic Exponents and their computation'
    ],
    authors: 'Charalampos Skokos',
    url: 'https://arxiv.org/abs/0811.0882',
    locator: [
      '최대 지수의 정의·변분 방정식·표준 재규격화법과 QR 계산을 대조했습니다. 제품의 짧은 기간은 점근 수렴 인증이 아닙니다.',
      'Checked maximal-exponent definitions, variational equations, standard renormalization and QR computation. The bounded product run does not certify asymptotic convergence.'
    ]
  }
});
