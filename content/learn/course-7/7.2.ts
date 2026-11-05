import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '7.2',
  summary: [
    '같은 진자들을 고리로 연결하면 그래프의 모드가 실제 운동을 어떻게 바꿀까요? 균일 고리의 native spectrum과 비선형 첫 모드 응답을 비교합니다.',
    'How does a ring graph change the motion of identical pendulums? Compare its native spectrum with the nonlinear response of the first mode.'
  ],
  objectives: [
    [
      '모형의 가정에서 핵심 관계를 유도하고 실제 결과와 비교합니다.',
      'Derive the central relation from the model assumptions and compare it with actual results.'
    ],
    [
      '관찰값과 그 수치적·과학적 한계를 함께 설명합니다.',
      'Explain the measured quantities together with their numerical and scientific limits.'
    ]
  ],
  assumptions: [
    '질량 1 kg·길이 1 m의 8개 진자, g=9.81 m/s², 무감쇠·최근접 대칭 비틀림 결합입니다. 각도는 rad이고 시간은 s입니다. 선형화는 작은 각도에서만 유효합니다.',
    'Eight identical 1 kg, 1 m pendulums have g=9.81 m/s², no damping and symmetric nearest-neighbor torsional coupling. Angles are radians and time is seconds. Linearization requires small angles.'
  ],
  concepts: [
    {
      id: 'derivation',
      title: ['모형에서 관계식으로', 'From the model to the relation'],
      body: [
        'sin θ≈θ로 놓으면 중력 복원과 그래프 Laplacian이 강성행렬을 만듭니다. 균일 고리에서는 Fourier 파수 q=2πk/N이 고유벡터를 주고 고유값은 고유각주파수의 제곱입니다. 결합 0에서는 모든 링크의 고유주파수가 같습니다.',
        'Replacing sin theta by theta combines gravitational stiffness with the graph Laplacian. Fourier wave numbers q=2 pi k/N diagonalize a uniform ring, and eigenvalues are squared angular frequencies. With zero coupling all links have the same natural frequency.'
      ]
    },
    {
      id: 'interpretation',
      title: ['실제 계산의 해석', 'Interpreting the actual calculation'],
      body: [
        '공간 첫 모드로 초기화한 실제 RK4 궤적의 첫 링크를 선형 예측과 겹칩니다. 진폭을 키우면 선형화가 놓친 중력 비선형성 때문에 위상 오차가 누적됩니다. 표의 spectrum은 선형 예측이며 비선형 궤적에서 재추정한 값이 아닙니다.',
        'Overlay the first link of an actual RK4 trajectory initialized in the first spatial mode with its linear prediction. Larger amplitudes accumulate phase error through gravitational nonlinearity. The tabulated spectrum is a linear prediction, not a fit to the nonlinear orbit.'
      ]
    },
    {
      id: 'limits',
      title: ['실패 조건과 유한 관찰의 한계', 'Failure conditions and finite-observation limits'],
      body: [
        '이 닫힌 분산식은 균일 최근접 고리에만 적용됩니다. 비균일 질량·길이·그래프에서는 일반화 고유문제가 필요합니다. 큰 진폭에서 모드 정체성과 주파수 불변을 가정하면 실패합니다.',
        'The closed dispersion relation applies only to a uniform nearest-neighbor ring. Nonuniform masses, lengths or graphs require a generalized eigenproblem. Assuming unchanged modes and frequencies at large amplitude fails.'
      ]
    }
  ],
  equations: [
    {
      id: 'relation-1',
      title: ['1. 핵심 관계', '1. Central relation'],
      expression: 'omegaSq = onsite+2*rate*(1-cos(q))',
      explanation: [
        '그래프 고유값이 중력의 g/l에 결합률 항을 더합니다. rate는 비틀림 결합을 관성으로 나눈 s⁻² 값입니다.',
        'The graph eigenvalue adds a coupling contribution to g/l. Rate is torsional stiffness divided by inertia, with units s^-2.'
      ],
      symbols: [
        ['omegaSq', 's^-2', '고유각주파수 제곱', 'Squared angular frequency'],
        ['onsite', 's^-2', 'g/l', 'Gravity stiffness per inertia'],
        ['rate', 's^-2', '결합/관성', 'Coupling per inertia'],
        ['q', '1', '무차원 파수', 'Dimensionless wave number']
      ]
    },
    {
      id: 'relation-2',
      title: ['2. 핵심 관계', '2. Central relation'],
      expression: 'theta = amplitude*cos(omega*time)',
      explanation: [
        '단일 선형 정상모드를 정지 상태에서 놓으면 각도는 코사인 응답입니다. omega*time는 무차원입니다.',
        'A single linear mode released from rest has a cosine response; omega times time is dimensionless.'
      ],
      symbols: [
        ['theta', 'rad', '링크 각도', 'Link angle'],
        ['amplitude', 'rad', '초기 진폭', 'Initial amplitude'],
        ['omega', 's^-1', '모드 각주파수', 'Mode angular frequency'],
        ['time', 's', '시간', 'Time']
      ]
    }
  ],
  checks: [
    {
      prompt: ['결합이 0일 때 선형 spectrum은 어떻게 되나요?', 'What happens to the linear spectrum at zero coupling?'],
      correct: ['모든 모드의 ω²가 g/l=9.81 s⁻²가 됩니다.', 'Every squared mode frequency becomes g/l=9.81 s^-2.'],
      incorrect: ['모든 고유주파수가 0이 됩니다.', 'Every natural frequency becomes zero.'],
      explanation: [
        '작은 각도 극한과 비선형 응답을 같은 native 엔진에서 비교해 근사의 유효 범위를 드러냅니다.',
        'The same native engine compares the small-angle limit with nonlinear response and exposes the approximation range.'
      ]
    },
    {
      prompt: ['7.2의 결과를 보편적인 증명으로 읽어도 될까요?', 'Does the result of 7.2 establish a universal proof?'],
      correct: [
        '아래의 가정·표본·시간 범위 안에서만 해석합니다.',
        'Interpret it within the stated assumptions, sampling and observation interval.'
      ],
      incorrect: [
        '한 번 계산하면 모든 매개변수에서 성립합니다.',
        'One run establishes the conclusion for every parameter.'
      ],
      explanation: [
        '이 닫힌 분산식은 균일 최근접 고리에만 적용됩니다. 비균일 질량·길이·그래프에서는 일반화 고유문제가 필요합니다. 큰 진폭에서 모드 정체성과 주파수 불변을 가정하면 실패합니다.',
        'The closed dispersion relation applies only to a uniform nearest-neighbor ring. Nonuniform masses, lengths or graphs require a generalized eigenproblem. Assuming unchanged modes and frequencies at large amplitude fails.'
      ]
    }
  ],
  prediction: [
    '진폭을 0.1에서 0.4 rad로 키우면 선형 예측과의 오차가 커질지 예상하세요.',
    'Predict how increasing amplitude from 0.1 to 0.4 rad changes error against the linear prediction.'
  ],
  action: [
    '진폭과 결합을 각각 한 번씩 바꾸고 실제 궤적·선형 곡선·최대 오차를 비교하세요.',
    'Vary amplitude and coupling separately and compare the actual trace, linear curve and maximum error.'
  ],
  expected: [
    '결합0·진폭0.01 rad에서는 최대 선형 오차가2e-6 rad보다 작고 모든 ω²가9.81 s⁻²입니다.',
    'At zero coupling and amplitude0.01 rad the maximum linear error is below2e-6 rad and every squared frequency is9.81 s^-2.'
  ],
  explanation: [
    '작은 각도 극한과 비선형 응답을 같은 native 엔진에서 비교해 근사의 유효 범위를 드러냅니다.',
    'The same native engine compares the small-angle limit with nonlinear response and exposes the approximation range.'
  ],
  next: [
    '기준 설정을 Lab으로 전달하고 한 변수씩 바꾸어 수렴과 해석의 범위를 확인하세요.',
    'Transfer the baseline to Lab and vary one parameter at a time to test convergence and the scope of interpretation.'
  ],
  glossary: [
    ['그래프 모드', 'Graph mode'],
    [
      '선형화한 결합계의 공간 고유벡터와 그 고유주파수입니다.',
      'A spatial eigenvector and natural frequency of a linearized coupled system.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/pendulumNetwork.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/physics/pendulumNetwork.ts.'
      ]
    },
    {
      path: 'src/product/adapters/physics/network-schema.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/product/adapters/physics/network-schema.ts.'
      ]
    }
  ],
  recommendedUnits: [
    {
      courseId: 'course-2',
      unitId: '2.8'
    },
    {
      courseId: 'course-3',
      unitId: '3.2'
    }
  ]
});
