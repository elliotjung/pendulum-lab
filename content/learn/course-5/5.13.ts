import { authorChaosLesson } from '../../../src/product/learn/authoring-course-five';

export default authorChaosLesson({
  id: '5.13',
  title: ['multifractal spectrum과 국소 스케일링', 'Multifractal spectra and local scaling'],
  question: [
    '같은 기하라도 자주 방문하는 곳과 드물게 방문하는 곳이 같을까요? q 범위와 사용 표본을 바꾸며 Dq·tau·alpha·f의 유한 척도 추정을 비교합니다.',
    'Do frequently and rarely visited regions carry the same information? Vary q range and sample count to compare finite-scale Dq, tau, alpha and f estimates.'
  ],
  prerequisites: [
    '지연 점군을 여러 크기의 상자로 분할해 점유 확률을 측정합니다. 빈 상자는 제외하고 같은 물리 기록에서 처음 maxSamples개를 사용합니다.',
    'Partition delay points into boxes of several sizes and estimate occupancy probabilities. Empty boxes are excluded; use the first maxSamples points from the same physical record.'
  ],
  objectives: [
    [
      'q가 큰 점유 확률과 작은 점유 확률에 주는 가중을 설명합니다.',
      'Explain how q weights large and small occupancy probabilities.'
    ],
    [
      '유한 q·상자 척도·표본 편향과 Legendre 추정의 한계를 검사합니다.',
      'Inspect finite q, box scales, sampling bias and limits of the Legendre estimate.'
    ]
  ],
  concepts: [
    {
      title: ['모양과 측도의 구별', 'Geometry versus measure'],
      body: [
        '같은 지지집합 위에서도 방문 확률은 균등하지 않을 수 있습니다. 상자 확률 p를 q제곱해 더하면 큰 q는 자주 방문한 상자를 강조하고 음의 q는 작은 확률에 민감해집니다. 유한 표본의 드문 방문은 불안정하므로 음의 q에서 특히 주의합니다.',
        'Even on one supporting geometry, visitation probabilities can be unequal. Summing p to the power q emphasizes frequently visited boxes at large q and small probabilities at negative q. Rare visits in finite data are unstable, especially for negative q.'
      ]
    },
    {
      title: ['척도 회귀에서 Dq로', 'From scale regression to Dq'],
      body: [
        '여러 상자 크기를 사용해 분할함수의 로그 기울기 tau를 구하고 q-1로 나누어 Dq를 얻습니다. q=1에서는 이 비가 0/0이므로 공용 함수의 정보차원 극한 처리를 씁니다. 상자 몇 개에서 높은 R²가 나와도 점근 척도 법칙이 증명되지는 않습니다.',
        'Estimate the log-slope tau of the partition function across box sizes, then divide by q-1 to obtain Dq. At q=1 the quotient is 0/0, so the native information-dimension limit is used. High R² over a few boxes does not prove asymptotic scaling.'
      ]
    },
    {
      title: ['Legendre 그림의 의미', 'Meaning of the Legendre picture'],
      body: [
        'tau의 q 미분으로 alpha를 추정하고 q*alpha-tau로 f를 그립니다. 제품은 유한 q 격자의 차분과 Legendre 추정이며 모든 특이점 집합의 차원을 직접 측정하지 않습니다. 비오목 spectrum이나 조건이 맞지 않는 측도에 일반적인 동등성을 주장하지 않습니다.',
        'Estimate alpha from the q-derivative of tau and plot f=q*alpha-tau. The product uses finite-grid differentiation and a Legendre estimate rather than directly measuring every singularity set. It does not claim universal equivalence for nonconcave spectra or unsupported measures.'
      ]
    },
    {
      title: ['실패 예제와 다음 탐구', 'Failure example and next inquiry'],
      body: [
        '빈 상자를 제외한 음의 q는 관찰되지 않은 영역의 확률을 복원하지 못합니다. 절반 표본에서 spectrum 폭이 변하면 혼돈이 바뀌었다고 해석하지 않습니다. 짧은 보존 진자의 점유 통계는 점근 attractor 인증이 아니며 다음 과정의 안정성·분기 연구와 함께 해석합니다.',
        'Negative q with empty boxes omitted cannot recover probabilities in unseen regions. A changing spectrum width after halving data does not indicate changed chaos. Short conservative-pendulum occupancy is not an asymptotic-attractor certificate; combine it with later stability and bifurcation studies.'
      ]
    }
  ],
  equations: [
    {
      title: ['1. tau와 일반화차원', '1. tau and generalized dimension'],
      expression: 'tau = (q-1)*generalizedDimension',
      explanation: [
        '유한 척도 회귀의 관계를 정리한 식입니다. q=1에서는 별도의 정보차원 극한을 사용하며 단순 나눗셈을 실행하지 않습니다.',
        'This rearranges the finite-scale relation. Use a separate information-dimension limit at q=1 rather than direct division.'
      ],
      symbols: [
        ['tau', '1', '분할함수 척도 지수', 'Partition-function scaling exponent'],
        ['q', '1', '확률 가중 차수', 'Probability-moment order'],
        ['generalizedDimension', '1', '일반화차원 Dq', 'Generalized dimension Dq']
      ]
    },
    {
      title: ['2. Legendre 추정', '2. Legendre estimate'],
      expression: 'spectrum = q*alpha-tau',
      explanation: [
        'Alpha는 tau의 q에 대한 기울기이고 spectrum은 f(alpha) 추정입니다. 무차원량 사이의 관계이며 유한 q 격자의 차분오차가 남습니다.',
        'Alpha is the q-slope of tau; spectrum is the f(alpha) estimate. All quantities are dimensionless and finite-q differentiation errors remain.'
      ],
      symbols: [
        ['spectrum', '1', 'f(alpha) 추정', 'Estimated f(alpha)'],
        ['q', '1', '차수', 'Moment order'],
        ['alpha', '1', '국소 척도 지수 후보', 'Candidate local scaling exponent'],
        ['tau', '1', '분할함수 지수', 'Partition-function exponent']
      ]
    }
  ],
  term: ['점유 확률', 'Occupancy probability'],
  definition: [
    '관찰한 점 중 한 상자에 들어간 분율로 추정한 확률이며 관찰되지 않은 영역의 정확한 측도가 아닙니다.',
    'Probability estimated by the fraction of observed points in a box rather than an exact measure of unseen regions.'
  ],
  checks: [
    {
      prompt: [
        '음의 q에서 빈 상자를 제외하면 희소 영역이 복원되나요?',
        'Does omitting empty boxes at negative q recover sparse unseen regions?'
      ],
      correct: ['관찰되지 않은 확률은 알 수 없습니다.', 'Unobserved probabilities remain unknown.'],
      wrong: ['희귀 사건의 참확률을 얻습니다.', 'It yields true rare-event probabilities.'],
      explanation: [
        '빈 상자 제외는 계산 규칙이며 누락된 측정의 복원이 아닙니다.',
        'Omitting empty boxes is a computational convention, not recovered measurements.'
      ]
    },
    {
      prompt: [
        '절반 표본에서 폭이 커지면 카오스가 증가했나요?',
        'Does a wider spectrum from half the data mean increased chaos?'
      ],
      correct: ['유한 표본 편향을 먼저 확인합니다.', 'First inspect finite-sample bias.'],
      wrong: ['항상 카오스 강도 증가입니다.', 'It always means stronger chaos.'],
      explanation: [
        '동역학은 같고 점유 확률의 추정만 변했습니다.',
        'Dynamics stayed fixed while occupancy estimation changed.'
      ]
    }
  ],
  task: {
    prediction: [
      'maxSamples를 절반으로 하면 Dq와 f의 폭은 그대로일까요?',
      'Will Dq and the width of f remain unchanged after halving maxSamples?'
    ],
    action: [
      '현재 표본과 자동 절반 표본의 Dq·R²·Legendre 그림을 읽습니다. qMin을 0에서 -1로 바꾸어 희소 점유의 민감도를 설명하세요.',
      'Inspect Dq, R² and Legendre plots for current and half samples. Change qMin from 0 to -1 and explain sensitivity to sparse occupancy.'
    ],
    expected: [
      '표의 모든 추정은 유한해야 합니다. 독립 균등 선분 fixture에서는 q=0,2의 Dq가 1의 0.1 이내여야 하며 물리 run에는 같은 값을 강제하지 않습니다.',
      'All displayed estimates must be finite. An independent uniform-segment fixture should yield Dq within 0.1 of 1 at q=0,2; the physical run is not forced to those values.'
    ],
    explanation: [
      '검증 가능한 기하 benchmark와 단일 물리 기록의 추정을 구분합니다.',
      'Distinguish a known-geometry benchmark from estimates on one physical record.'
    ]
  },
  source: {
    title: [
      'Fractal measures and their singularities: The characterization of strange sets',
      'Fractal measures and their singularities: The characterization of strange sets'
    ],
    authors: 'Thomas C. Halsey, Mogens H. Jensen, Leo P. Kadanoff, Itamar Procaccia, Boris I. Shraiman',
    url: 'https://www.nbi.dk/~mhjensen/papers/PRA33.pdf',
    locator: [
      '저자 공개 PDF의 식 (1.9)~(1.11), (2.2)에서 측도·특이성·국소 스케일링과 tau=(q−1)Dq를 대조했습니다. 제품의 유한 q Legendre 차분은 별도 수치근사입니다.',
      'Checked measures, singularities, local scaling and tau=(q−1)Dq against equations (1.9)–(1.11) and (2.2) in the author-hosted PDF. The product finite-q Legendre difference is a separate numerical approximation.'
    ]
  }
});
