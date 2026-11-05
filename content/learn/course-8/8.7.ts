import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '8.7',
  summary: [
    '실제 이중진자 투영 시계열에 SINDy를 적용하고 희소 항·threshold·숨은 좌표의 한계를 평가합니다.',
    'Apply SINDy to a projected native double-pendulum series and assess sparse terms, threshold and omitted-state limitations.'
  ],
  objectives: [
    [
      '미분 자료와 후보 library의 희소 회귀 관계를 유도한다.',
      'Derive the sparse-regression relationship between derivative data and a candidate library.'
    ],
    [
      '회수한 식의 좌표·단위·검증 구간 의존성을 설명한다.',
      'Explain dependence of identified equations on coordinates, units and validation intervals.'
    ]
  ],
  assumptions: [
    '공용 RK4의 theta1(rad),omega1(rad/s)를 관측하고 시간순 70%를 훈련에 씁니다. theta2와 omega2는 관측에서 빠져 일반적으로 이 두 좌표만의 닫힌 방정식이 아닙니다. native SINDy 회귀는 근사 미분과 유한 library를 사용하며 물리 법칙 발견을 자동 인증하지 않습니다.',
    'The shared RK4 generates theta1(rad) and omega1(rad/s), with the first70% used for training. Omitted theta2 and omega2 make this pair generally nonclosed. Native SINDy uses approximate derivatives and a finite library; identification does not automatically certify a physical law.'
  ],
  concepts: [
    {
      id: 'library-regression',
      title: ['함수 library와 희소화', 'A function library and sparsification'],
      body: [
        '관측 상태의 상수·선형·다항 후보값을 열로 모아 미분 관측에 회귀합니다. native threshold는 작은 계수를 제거한 뒤 다시 적합합니다. 각 library 열의 단위가 다르므로 같은 숫자 threshold의 의미는 좌표 단위와 스케일에 의존하며 보편적인 중요도 문턱이 아닙니다.',
        'Assemble constant, linear and polynomial candidate values into library columns and regress observed derivatives on them. Native thresholding removes small coefficients and refits. Different library columns have different units; one numerical threshold depends on coordinate units and scaling rather than expressing universal importance.'
      ]
    },
    {
      id: 'closure-leakage',
      title: ['닫힌 상태와 미래 구간 검증', 'State closure and future-interval validation'],
      body: [
        '미래 validation 자료로 library나 전처리를 미리 맞추면 성능이 과장됩니다. 공용 S23 경로는 훈련 구간으로만 전처리를 고정하고 같은 모델을 재평가합니다. 이중진자 투영의 숨은 자유도 때문에 작은 잔차의 경험적 식도 다른 초기조건에서 실패할 수 있습니다.',
        'Fitting the library or preprocessing using future validation data exaggerates performance. The shared S23 path freezes preprocessing on training data and reevaluates the same model. Hidden degrees of freedom can make a low-residual empirical equation fail at other initial conditions.'
      ]
    }
  ],
  equations: [
    {
      id: 'sparse-fit',
      title: ['선형·이차 후보로 미분을 적합', 'Fit derivatives using linear and quadratic candidates'],
      expression: 'vfit = c1 * q + c2 * q^2',
      explanation: [
        '후보 q와 q제곱을 관측 미분 vfit에 적합하는 한 방정식의 예입니다. q가 rad이면 계수 c1,c2의 SI 시간 차원은 초의 역수입니다. 실제 도구는 선택 library의 여러 항을 함께 회귀합니다.',
        'This illustrates one equation fitted from q and q-squared candidates. For q in radians, c1 and c2 have inverse-time SI dimensions. The actual tool regresses the full selected library.'
      ],
      symbols: [
        ['vfit', 'rad/s', '적합한 각도 미분', 'fitted angle derivative'],
        ['c1', 's^-1', '선형 후보 계수', 'linear candidate coefficient'],
        ['c2', 's^-1', '이차 후보 계수', 'quadratic candidate coefficient'],
        ['q', 'rad', '관측 각도', 'observed angle']
      ]
    },
    {
      id: 'finite-difference',
      title: ['균일 시각의 중앙 미분 근사', 'Centered derivative approximation on a uniform grid'],
      expression: 'dq = (qp - qm) / (2 * h)',
      explanation: [
        '앞·뒤 각도 qp,qm의 차이를 두 시간 간격으로 나누는 미분 근사의 구조입니다. 작은 h는 절단오차를 줄이지만 측정 잡음의 차분 증폭을 없애지 않습니다.',
        'The centered difference divides neighboring angle values qp and qm by two time steps. Smaller h reduces truncation error but does not remove noise amplification by differencing.'
      ],
      symbols: [
        ['dq', 'rad/s', '근사 각도 미분', 'approximated angular derivative'],
        ['qp', 'rad', '다음 각도', 'next angle'],
        ['qm', 'rad', '이전 각도', 'previous angle'],
        ['h', 's', '균일 시간 간격', 'uniform time step']
      ]
    }
  ],
  prediction: [
    '희소 threshold를 높이면 실제 회수되는 활성 항 목록과 미래 validation 오차가 어떻게 바뀔지 예측하세요.',
    'Predict how increasing the sparsity threshold may change the identified active-term list and future validation error.'
  ],
  action: [
    '기본 SINDy를 계산해 활성 항·계수와 train/validation 계보를 읽고 threshold를 바꾸어 다시 비교하세요.',
    'Compute default SINDy, read active terms, coefficients and train/validation lineage, then repeat with a changed threshold.'
  ],
  expected: [
    '실제 native library 항과 계수가 표에 나타나며 훈련 결과와 재평가 parent ID가 연결됩니다. 유한 diagnostics가 있어도 숨은 두 좌표의 운동방정식 복원을 주장하지 않습니다.',
    'The table shows actual native library terms and coefficients with training and reevaluation parent IDs. Finite diagnostics do not imply recovery of equations for the two hidden coordinates.'
  ],
  explanation: [
    '희소 회귀는 주어진 자료와 library에서 간단한 근사를 찾습니다. 물리적 닫힘·올바른 좌표·미래 예측 검증은 별도 조건입니다.',
    'Sparse regression finds a compact approximation within the supplied data and library. Physical closure, appropriate coordinates and future prediction checks are separate conditions.'
  ],
  next: [
    '전체 상태를 관측한 자료와 비교하고 미분 잡음·library·훈련 길이 변화에 대한 활성 항의 견고성을 조사하세요.',
    'Compare fully observed state data and test active-term robustness to derivative noise, library choices and training duration.'
  ],
  glossary: [
    ['희소 library 회귀', 'Sparse library regression'],
    [
      '후보 함수 중 적은 항으로 관측 미분을 설명하도록 계수를 구하는 방법입니다.',
      'A method fitting observed derivatives using relatively few terms from a candidate function library.'
    ]
  ],
  sources: [
    {
      path: 'src/product/adapters/analysis/data-driven/learning.ts',
      locator: [
        'SINDy 훈련·validation·같은 모델 재평가 경로',
        'SINDy training, held-out diagnostics and frozen-model reevaluation path'
      ]
    },
    {
      path: 'src/research/sindy.ts',
      locator: [
        'buildFeatureLibrary와 원래 희소 회귀 구현',
        'buildFeatureLibrary and preserved sparse-regression implementation'
      ]
    }
  ],
  external: {
    title: 'Discovering governing equations from data by sparse identification of nonlinear dynamical systems',
    authors: 'S. L. Brunton, J. L. Proctor, J. N. Kutz',
    url: 'https://doi.org/10.1073/pnas.1517384113',
    locator: [
      'PNAS113,3932–3937의 candidate library·희소 회귀·좌표 의존성',
      'PNAS113,3932–3937: candidate libraries, sparse regression and coordinate dependence'
    ]
  },
  checks: [
    {
      prompt: ['투영한 두 좌표에서 찾은 식은?', 'What is an equation identified from two projected coordinates?'],
      correct: [
        '숨은 상태 영향을 포함할 수 있는 제한된 경험 모델이다.',
        'A limited empirical model potentially affected by hidden state.'
      ],
      incorrect: [
        '항상 완전한 이중진자 지배방정식이다.',
        'Always the complete governing equation of the double pendulum.'
      ],
      explanation: [
        '닫힌 Markov 상태와 관측 투영은 같지 않습니다.',
        'A closed Markov state and an observation projection are not equivalent.'
      ]
    },
    {
      prompt: ['threshold 수치의 의미는?', 'What determines the meaning of a numerical threshold?'],
      correct: ['선택 좌표·단위·library 스케일에 의존한다.', 'It depends on coordinates, units and library scaling.'],
      incorrect: [
        '단위와 무관한 보편적 항 중요도다.',
        'It is a universal unit-independent measure of term importance.'
      ],
      explanation: [
        '서로 다른 단위의 library 계수는 숫자 크기만으로 직접 비교할 수 없습니다.',
        'Coefficients of library terms with different units cannot be compared solely by numerical magnitude.'
      ]
    }
  ]
});
