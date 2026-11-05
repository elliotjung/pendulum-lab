import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '8.8',
  summary: [
    '같은 native 기록에서 DMD와 HAVOK를 학습하고 선형 근사·지연 좌표·관측 forcing의 의미를 비교합니다.',
    'Train DMD and HAVOK on the same native record and compare linear approximation, delay coordinates and observed forcing.'
  ],
  objectives: [
    [
      'snapshot 회귀와 지연 Hankel 분해의 차이를 설명한다.',
      'Explain the difference between snapshot regression and delay-Hankel decomposition.'
    ],
    [
      '학습 basis를 고정한 미래 평가와 관측 forcing의 전제를 구별한다.',
      'Distinguish frozen-basis future evaluation from its observed-forcing assumption.'
    ]
  ],
  assumptions: [
    '실제 공용 이중진자 기록은 균일 SI 시간축입니다. DMD는 theta1,omega1 투영을, HAVOK은 theta1 한 관측량의 지연 창을 씁니다. basis와 전처리는 과거 훈련 자료로만 정합니다. HAVOK의 validation forcing은 미래 관측에서 주어진 값이며 완전한 autonomous 예측이 아닙니다.',
    'The shared double-pendulum record has a uniform SI time axis. DMD uses the theta1/omega1 projection; HAVOK uses delays of theta1 alone. Basis and preprocessing are fitted only on past training data. HAVOK validation forcing is supplied by held-out observations, rather than autonomously forecast.'
  ],
  concepts: [
    {
      id: 'snapshot-operator',
      title: ['DMD의 유한 관측 연산자', 'A finite observable operator in DMD'],
      body: [
        '한 시각 상태를 다음 시각 상태에 가장 잘 보내는 선형 행렬을 회귀합니다. 이산 multiplier λ는 무차원이고 μ=log(λ)/dt는 성장률과 각주파수의 연속시간 표현입니다. 실제 operator와 이 두 spectrum을 표시하며 공간 mode 고유벡터는 native 결과에 없어 만들어내지 않습니다. 고유값은 선택 관측·간격·구간에 의존하는 유한 근사이며 무한차원 Koopman 연산자의 전체 spectrum과 같지 않습니다. 숨은 둘째 링크 좌표 때문에 같은 첫 링크 투영도 다른 미래를 가질 수 있습니다.',
        'Regress a linear matrix mapping snapshots to their successors. Discrete multipliers are dimensionless and log(lambda)/dt gives continuous growth and angular frequency. The actual operator and both spectra are displayed; spatial eigenvectors are not fabricated because the native result does not provide them. Its eigenvalues depend on observables, sampling and interval; they are not the full spectrum of the infinite-dimensional Koopman operator. Hidden second-link coordinates can give the same first-link projection different futures.'
      ]
    },
    {
      id: 'delay-forcing',
      title: ['HAVOK의 지연 좌표와 외력', 'HAVOK delay coordinates and forcing'],
      body: [
        '단일 관측의 지연 Hankel 행렬을 훈련 구간에서 분해하고 retained 좌표를 선형 상태와 마지막 forcing 좌표로 나눕니다. validation에서는 훈련 basis에 투영할 뿐 다시 적합하지 않습니다. 지연 창과 rank의 변화가 잔차를 바꾸어도 물리 외력이 발견되었다는 뜻은 아닙니다.',
        'Decompose a scalar delay-Hankel matrix on the training interval and split retained coordinates into linear state and a final forcing coordinate. Validation projects onto the frozen training basis without refitting. Changing delay window and rank changes residuals but does not identify an external physical force.'
      ]
    }
  ],
  equations: [
    {
      id: 'snapshot-map',
      title: ['한 단계 선형 근사', 'A one-step linear approximation'],
      expression: 'xnext = a * x + b * v',
      explanation: [
        'DMD 행렬의 한 행을 나타낸 식입니다. 각도 x와 각속도 v를 함께 쓰면 a는 무차원이고 b는 초의 차원을 가져 다음 각도 xnext와 단위가 맞습니다.',
        'This is one row of a DMD matrix. Combining angle x and angular velocity v requires dimensionless a and b with time dimension so the result has the units of the next angle xnext.'
      ],
      symbols: [
        ['xnext', 'rad', '다음 기록 각도', 'next recorded angle'],
        ['x', 'rad', '현재 각도', 'current angle'],
        ['v', 'rad/s', '현재 각속도', 'current angular velocity'],
        ['a', '1', '각도 열 계수', 'angle-column coefficient'],
        ['b', 's', '각속도 열 계수', 'angular-velocity-column coefficient']
      ]
    },
    {
      id: 'forced-linear',
      title: ['지연 좌표의 선형·forcing 분해', 'Linear-plus-forcing delay dynamics'],
      expression: 'vdot = A * v + B * u',
      explanation: [
        '정규화한 지연 좌표 v와 관측 forcing u가 모두 무차원이면 A와 B는 초의 역수입니다. 여기에 쓰는 u는 실제 외력 측정값이라는 주장이 아닙니다.',
        'For dimensionless normalized delay coordinates v and observed forcing u, A and B have inverse-time units. Here u is not claimed to be a measured external physical force.'
      ],
      symbols: [
        ['vdot', 's^-1', '지연 좌표 변화율', 'delay-coordinate derivative'],
        ['A', 's^-1', 'retained 선형 계수', 'retained linear coefficient'],
        ['v', '1', 'retained 지연 좌표', 'retained delay coordinate'],
        ['B', 's^-1', 'forcing 결합 계수', 'forcing coupling coefficient'],
        ['u', '1', '마지막 관측 지연 좌표', 'last observed delay coordinate']
      ]
    }
  ],
  prediction: [
    'HAVOK의 rank를 높이거나 지연 창을 바꾸면 동일 원 기록에서도 적합 잔차와 forcing 좌표 해석이 같을지 예측하세요.',
    'Predict whether changing HAVOK rank or delay window preserves fit residuals and forcing-coordinate interpretation on the same original record.'
  ],
  action: [
    '기본 DMD·HAVOK를 계산하고 실제 λ·μ spectrum, retained σ와 basis, core A/B, 관측 forcing 곡선을 읽으세요. rank 또는 지연 창을 바꾸어 같은 표와 고정된 train/validation 계보를 비교하세요.',
    'Compute DMD and HAVOK and inspect actual lambda/mu spectra, retained singular values/basis, core A/B and the observed-forcing curve. Change rank or delay window and compare these views and frozen train/validation lineage.'
  ],
  expected: [
    '같은 원 run에서 학습한 DMD 이산·연속 spectrum과 HAVOK core spectrum·basis·forcing이 실제 native 값으로 표시됩니다. 기본 retained rank2에서 core spectrum은 1개이고 관측 forcing은 전체 제한된 held-out window를 보여 줍니다. rank3이면 core 모드가 2개입니다.',
    'The displayed DMD discrete/continuous spectra and HAVOK core spectrum, basis and forcing retain actual native values. Default retained rank2 has one core mode and observed forcing over every bounded held-out window; rank3 has two core modes.'
  ],
  explanation: [
    '관측량과 embedding의 선택이 유한 선형 표현을 바꿉니다. forcing을 알고 한 평가와 forcing까지 예측한 자유 rollout은 다른 검증 문제입니다.',
    'Observable and embedding choices alter finite linear representations. Evaluation with known forcing differs from forecasting the forcing itself in autonomous rollout.'
  ],
  next: [
    '단일 진폭 기록에만 맞춘 spectrum을 일반화하지 말고, 다른 초기조건과 sampling 간격에서 basis·mode의 견고성을 비교하세요.',
    'Do not generalize a spectrum fitted on one record; compare basis and mode robustness across new initial conditions and sample intervals.'
  ],
  glossary: [
    ['관측 forcing 좌표', 'Observed forcing coordinate'],
    [
      '지연 분해에서 retained 선형 상태를 보완하도록 따로 둔 관측 좌표이며 외부 물리력과 같다고 가정하지 않습니다.',
      'An observed coordinate retained to complement the linear delay state, not assumed to be an external physical force.'
    ]
  ],
  sources: [
    {
      path: 'src/product/adapters/analysis/data-driven/learning.ts',
      locator: ['native DMD와 같은 저장 모델 재평가', 'Native DMD training and reevaluation of the same saved model']
    },
    {
      path: 'src/product/adapters/analysis/data-driven/learning-havok.ts',
      locator: [
        '훈련 Hankel basis 고정과 held-out forcing 진단',
        'Frozen training Hankel basis and held-out observed-forcing diagnostics'
      ]
    }
  ],
  external: {
    title: 'Chaos as an Intermittently Forced Linear System',
    authors: 'S. L. Brunton et al.',
    url: 'https://arxiv.org/abs/1608.05306',
    locator: [
      '저자 논문의 지연 좌표·선형 상태와 낮은 에너지 forcing 좌표',
      'Author paper: delay coordinates, leading linear state and low-energy forcing coordinates'
    ]
  },
  checks: [
    {
      prompt: ['HAVOK의 forcing 좌표는 반드시?', 'Must the HAVOK forcing coordinate be an external physical force?'],
      correct: [
        '아니며 관측 분해의 좌표로 해석한다.',
        'No; it is interpreted as a coordinate of the observation decomposition.'
      ],
      incorrect: ['실제로 측정한 외부 힘과 동일하다.', 'It is identical to a measured external force.'],
      explanation: [
        '분해 좌표의 통계적 역할을 외부 물리 원인으로 자동 바꾸면 안 됩니다.',
        'A statistical role in a decomposition should not automatically be relabeled an external physical cause.'
      ]
    },
    {
      prompt: ['미래 관측으로 forcing을 주면?', 'What if future observations supply the forcing?'],
      correct: [
        '그 조건에 대한 평가이며 완전 자유 예측은 아니다.',
        'It is conditional evaluation, not fully autonomous prediction.'
      ],
      incorrect: [
        '관측 없이 모든 미래를 예측한 것이다.',
        'All future values have been predicted without observations.'
      ],
      explanation: [
        '평가에 사용한 정보의 범위가 예측 주장에 포함되어야 합니다.',
        'Prediction claims must disclose the information supplied during evaluation.'
      ]
    }
  ]
});
