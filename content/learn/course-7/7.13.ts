import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '7.13',
  summary: [
    '동일한 킥이 양자 상태와 고전 궤적을 어떻게 다르게 퍼뜨릴까요? 실제 QKR 기대값·norm·동일 유한격자 Floquet spectrum을 비교합니다.',
    'How do the same kicks spread a quantum state and a classical trajectory differently? Compare actual QKR momentum expectation, norm and Floquet spectrum on the same finite grid.'
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
    '정규화 ℏ,8개 FFT momentum 상태,초기 m=0의 단위 norm 파동함수입니다. 한 번의 반복은native 자유전파+킥 주기이고 고전 대조군은θ₀=1,p₀=0 단일 궤적입니다.',
    'A normalized effective hbar and8 FFT momentum states begin in a unit-norm m=0 wavefunction. Each iteration is the native free-propagation/kick period. The classical comparison is one orbit with theta0=1,p0=0.'
  ],
  concepts: [
    {
      id: 'derivation',
      title: ['모형에서 관계식으로', 'From the model to the relation'],
      body: [
        '단위 Floquet 연산자의 고유값은 exp(iφ)로 표현되고 준에너지는−ℏφ/T입니다. 확률은복소 계수 제곱합이며 native 진화는자동 재정규화를 하지 않습니다. QKR 표의 spectrum은파동함수와 동일한N=8 연산자에서 계산합니다.',
        'A unitary Floquet eigenvalue is exp(i phase) with quasienergy minus hbar times phase divided by period. Probability sums squared complex coefficients; native evolution never automatically renormalizes. The QKR spectrum uses the same N=8 operator as the wavefunction.'
      ]
    },
    {
      id: 'interpretation',
      title: ['실제 계산의 해석', 'Interpreting the actual calculation'],
      body: [
        '양자 ⟨p²⟩와 고전 단일 궤적p²를 같은 반복 축에서 비교하고 최종 momentum 확률을 읽습니다. 별도의4×4 unitary 연산자 예제로 unitarity defect와 위상→준에너지 변환을 확인하되 QKR의 연산자와 혼동하지 않습니다.',
        'Compare quantum mean-square momentum with classical single-orbit momentum squared by iteration and inspect final momentum probabilities. A separate4x4 unitary example checks unitarity defect and phase-to-quasienergy conversion without being confused with the QKR operator.'
      ]
    },
    {
      id: 'limits',
      title: ['실패 조건과 유한 관찰의 한계', 'Failure conditions and finite-observation limits'],
      body: [
        'N=8은 매우 작은 주기 momentum 격자이며 경계 aliasing과 유한 크기 포화가 있습니다. 양자 기대값과 단일 고전 궤적은통계적으로 동등한 대조군이 아닙니다. 관찰된 포화를 동역학적 국소화의 증거로 단정하지 않습니다.',
        'N=8 is a very small periodic momentum grid with boundary aliasing and finite-size saturation. A quantum expectation and one classical orbit are not statistically equivalent controls. Observed saturation does not establish dynamical localization.'
      ]
    }
  ],
  equations: [
    {
      id: 'relation-1',
      title: ['1. 핵심 관계', '1. Central relation'],
      expression: 'norm = probabilitySum',
      explanation: [
        '각 FFT momentum 계수의 실수·허수 제곱을 더한 전체 확률입니다. 자동 보정 없이1과의 편차를 표시합니다.',
        'Sum squared real and imaginary coefficients over FFT momentum states; deviation from one is displayed without automatic correction.'
      ],
      symbols: [
        ['norm', '1', '전체 확률 norm', 'Total probability norm'],
        ['probabilitySum', '1', 'momentum 확률 합', 'Momentum probability sum']
      ]
    },
    {
      id: 'relation-2',
      title: ['2. 핵심 관계', '2. Central relation'],
      expression: 'quasiEnergy = -hbar*phase/period',
      explanation: [
        'U 고유값 exp(iφ)의 principal phase를준에너지로 변환합니다. 여기서 ℏ·주기·에너지는모두 정규화 값이며 branch는주기적입니다.',
        'Convert the principal phase of an eigenvalue exp(i phase) into quasienergy. Hbar, period and energy are normalized here, with a periodic quasienergy branch.'
      ],
      symbols: [
        ['quasiEnergy', '1', '정규화 준에너지', 'Normalized quasienergy'],
        ['hbar', '1', '정규화 유효 ℏ', 'Normalized effective hbar'],
        ['phase', 'rad', '고유값 위상', 'Eigenvalue phase'],
        ['period', '1', '정규화 Floquet 주기', 'Normalized Floquet period']
      ]
    }
  ],
  checks: [
    {
      prompt: [
        '작은 격자의 ⟨p²⟩ 포화는 국소화의 충분한 증거인가요?',
        'Is mean-square-momentum saturation on a small grid sufficient evidence for localization?'
      ],
      correct: [
        '격자 경계·크기·시간·고전 ensemble 비교가 필요합니다.',
        'Grid boundaries, size, time and a classical ensemble comparison remain necessary.'
      ],
      incorrect: ['그래프가평평하면 엄밀히 국소화되었습니다.', 'A flat curve proves localization.'],
      explanation: [
        '확률 보존·연산자 unitarity·유한격자 수송을분리하면 양자 수치 결과의 의미와 한계를 명확히 읽을 수 있습니다.',
        'Separating probability conservation, operator unitarity and finite-grid transport clarifies the meaning and limits of quantum numerical results.'
      ]
    },
    {
      prompt: [
        '7.13의 결과를 보편적인 증명으로 읽어도 될까요?',
        'Does the result of 7.13 establish a universal proof?'
      ],
      correct: [
        '아래의 가정·표본·시간 범위 안에서만 해석합니다.',
        'Interpret it within the stated assumptions, sampling and observation interval.'
      ],
      incorrect: [
        '한 번 계산하면 모든 매개변수에서 성립합니다.',
        'One run establishes the conclusion for every parameter.'
      ],
      explanation: [
        'N=8은 매우 작은 주기 momentum 격자이며 경계 aliasing과 유한 크기 포화가 있습니다. 양자 기대값과 단일 고전 궤적은통계적으로 동등한 대조군이 아닙니다. 관찰된 포화를 동역학적 국소화의 증거로 단정하지 않습니다.',
        'N=8 is a very small periodic momentum grid with boundary aliasing and finite-size saturation. A quantum expectation and one classical orbit are not statistically equivalent controls. Observed saturation does not establish dynamical localization.'
      ]
    }
  ],
  prediction: [
    '킥을0으로 만들면 m=0 상태의 momentum 확률이 어떻게 바뀔지 예상하세요.',
    'Predict how momentum probabilities evolve from m=0 when the kick is zero.'
  ],
  action: [
    'K=0과5를비교하고 ℏ를바꾸어 norm·확률·준에너지 차이를 설명하세요.',
    'Compare K=0 and5, then vary hbar and explain norm, probability and quasienergy changes.'
  ],
  expected: [
    '기본 run의 최대 norm 오차는2e-13보다 작고 K=0의종료 ⟨p²⟩는1e-20보다 작습니다.',
    'Default maximum norm error is below2e-13 and final mean-square momentum at K=0 is below1e-20.'
  ],
  explanation: [
    '확률 보존·연산자 unitarity·유한격자 수송을분리하면 양자 수치 결과의 의미와 한계를 명확히 읽을 수 있습니다.',
    'Separating probability conservation, operator unitarity and finite-grid transport clarifies the meaning and limits of quantum numerical results.'
  ],
  next: [
    '기준 설정을 Lab으로 전달하고 한 변수씩 바꾸어 수렴과 해석의 범위를 확인하세요.',
    'Transfer the baseline to Lab and vary one parameter at a time to test convergence and the scope of interpretation.'
  ],
  glossary: [
    ['Floquet 준에너지', 'Floquet quasienergy'],
    [
      '한 주기 연산자의 고유값 위상에서 얻는 주기적 에너지 표지입니다.',
      'A periodic energy label obtained from an eigenphase of the one-period operator.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/quantumKickedRotor.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/physics/quantumKickedRotor.ts.'
      ]
    },
    {
      path: 'src/research/qkrFloquet.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/research/qkrFloquet.ts.'
      ]
    },
    {
      path: 'src/research/unitaryFloquet.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/research/unitaryFloquet.ts.'
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
  ],
  external: {
    title: 'Scaling behavior of localization in quantum chaos',
    authors: 'G. Casati, I. Guarneri, F. Izrailev, R. Scharf',
    url: 'https://doi.org/10.1103/PhysRevLett.64.5',
    locator: [
      '원 논문의 유한 torus 양자 국소화·스케일링 맥락을 확인하며 이 작은 격자의 포화와 구별합니다.',
      'The primary abstract supplies finite-torus localization and scaling context, distinguished from saturation on this small grid.'
    ]
  }
});
