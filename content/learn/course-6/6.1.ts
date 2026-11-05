import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '6.1',
  summary: [
    '아래·위 평형에서 같은 작은 각도 교란을 주면 왜 다른 반응이 나올까요? 실제 RHS의 Jacobian과 비선형 응답을 비교합니다.',
    'Why does the same small angular perturbation behave differently at the lower and upper equilibria? Compare the actual RHS Jacobian with nonlinear responses.'
  ],
  objectives: [
    [
      '연속시간 고유값과 반환 맵 승수의 안정성 조건을 구별합니다.',
      'Distinguish continuous-time eigenvalues from return-map multipliers.'
    ],
    [
      '평형의 선형 예측을 공용 엔진의 교란 응답으로 확인합니다.',
      'Check equilibrium linearization against shared-engine perturbation responses.'
    ]
  ],
  assumptions: [
    '구동 진폭0인 단일 질점 진자입니다. theta는 아래 수직 기준 rad, omega는 rad/s, 감쇠율은 s^-1입니다. 초기 각도는 선택 평형에 작은 교란을 더합니다.',
    'Use an unforced point-mass pendulum. Theta is measured from downward vertical in rad, omega in rad/s, and damping in s^-1. Add a small perturbation to the selected equilibrium.'
  ],
  concepts: [
    {
      id: 'linearize',
      title: ['평형에서 접선 방정식으로', 'From equilibrium to tangent dynamics'],
      body: [
        '운동방정식의 RHS를 평형에서 Taylor 전개하면 상수항은0이고 첫 항은 Jacobian과 교란 벡터의 곱입니다. 공용 numericalJacobian으로 실제 엔진을 미분하므로 다른 교육용 운동식을 적분하지 않습니다. 아래 평형의 복원 기울기와 위 평형의 반발 기울기는 부호가 반대입니다.',
        'Taylor expansion of the RHS at equilibrium has zero constant term and a Jacobian times perturbation at first order. Differentiate the actual engine using numericalJacobian. Restoring and repelling slopes have opposite signs at the two equilibria.'
      ]
    },
    {
      id: 'limits',
      title: ['국소 판정과 실패 조건', 'Local classification and failure conditions'],
      body: [
        '고유값의 음의 실수부는 국소 수축, 양의 실수부는 국소 불안정을 뜻합니다. 실수부0의 경계는 비선형 항을 더 조사해야 합니다. 위 평형에서 자란 교란이 크게 움직이면 작은 교란 가정이 깨지므로 선형 성장률을 끝까지 외삽하지 않습니다.',
        'Negative real parts imply local contraction; a positive real part gives instability. Zero-real-part cases require nonlinear analysis. Once an upper-equilibrium perturbation grows large, extrapolating linear growth violates the small-perturbation assumption.'
      ]
    }
  ],
  equations: [
    {
      id: 'frequency',
      title: ['1. 복원 척도', '1. Restoring scale'],
      expression: 'naturalFrequencySquared = g/length',
      explanation: [
        '아래 평형에서 sin(theta)의 일차항을 취하면 복원 계수는 g/length이며 단위는 s^-2입니다.',
        'The linear term of sin(theta) gives the lower-equilibrium restoring coefficient g/length in s^-2.'
      ],
      symbols: [
        ['naturalFrequencySquared', 's^-2', '고유 각주파수 제곱', 'Natural angular frequency squared'],
        ['g', 'm/s^2', '중력 가속도', 'Gravity'],
        ['length', 'm', '길이', 'Length']
      ]
    },
    {
      id: 'trace',
      title: ['2. 선형 감쇠의 trace', '2. Trace of the damped linearization'],
      expression: 'eigenSum = -damping',
      explanation: [
        '물리2차원 Jacobian의 trace는 감쇠율의 음수입니다. 고유값 합도 같지만 양의 고유값 하나를 배제하지는 않습니다.',
        'The physical two-dimensional Jacobian trace equals minus damping. The eigenvalue sum has that value, which alone does not exclude one positive eigenvalue.'
      ],
      symbols: [
        ['eigenSum', 's^-1', '연속 고유값의 합', 'Sum of continuous eigenvalues'],
        ['damping', 's^-1', '감쇠율', 'Damping rate']
      ]
    }
  ],
  checks: [
    {
      prompt: [
        '위 평형에서 고유값 하나가 양수이면?',
        'What does one positive eigenvalue at the upper equilibrium imply?'
      ],
      correct: ['충분히 작은 어떤 교란은 처음에 성장합니다.', 'Some sufficiently small perturbations initially grow.'],
      incorrect: [
        '모든 교란은 반드시 선형식대로 영원히 성장합니다.',
        'Every perturbation must follow the linear growth forever.'
      ],
      explanation: [
        '국소 불안정은 초기 선형 범위의 판정이며 큰 운동은 비선형입니다.',
        'Local instability concerns the initial linear regime; large motion is nonlinear.'
      ]
    },
    {
      prompt: ['연속 고유값과 맵 승수의 단위는?', 'How do eigenvalue and map-multiplier units differ?'],
      correct: [
        '연속 고유값은 s^-1, 맵 승수는 무차원입니다.',
        'Continuous eigenvalues have s^-1; map multipliers are dimensionless.'
      ],
      incorrect: ['둘 다 항상 rad입니다.', 'Both are always in radians.'],
      explanation: [
        '시간 성장률과 한 번 반환에서의 비율을 구별합니다.',
        'A time growth rate differs from a ratio over one return.'
      ]
    }
  ],
  prediction: [
    '같은 감쇠에서 아래 평형을 위 평형으로 바꾸면 첫 교란의 방향과 크기는 어떻게 달라질까요?',
    'With fixed damping, how will the perturbation change when switching from the lower to upper equilibrium?'
  ],
  action: [
    '아래 평형의 고유값과 실제 각도차 곡선을 기록한 뒤 equilibrium을1로 바꾸고 같은 교란을 실행합니다.',
    'Record the lower-equilibrium eigenvalues and angle-deviation curve, then set equilibrium to1 and repeat with the same perturbation.'
  ],
  expected: [
    '기본 아래 평형은 고유값 실수부가−0.25 s^-1이고 진동하며 감쇠합니다. 위 평형은 양의 실수 고유값이 생겨 초기 교란이 자랍니다.',
    'The default lower equilibrium has eigenvalue real part−0.25 s^-1 and damped oscillations. The upper equilibrium has a positive real eigenvalue and initial perturbation growth.'
  ],
  explanation: [
    '같은 감쇠에서도 중력 복원 기울기의 부호가 달라집니다. 위 평형의 비선형 장기 궤적은 국소 지수식과 구별하세요.',
    'The gravitational slope changes sign despite equal damping. Distinguish the nonlinear upper-equilibrium trajectory from its local exponential approximation.'
  ],
  next: [
    '평형은 자율계의 특별한 해입니다.6.2에서는 구동 한 주기 뒤 되돌아오는 점을 찾아 같은 국소 사고를 주기궤도로 확장합니다.',
    'Equilibria are special autonomous solutions. In6.2, extend local reasoning to periodic orbits by finding points that return after one forcing period.'
  ],
  glossary: [
    ['쌍곡 평형', 'Hyperbolic equilibrium'],
    [
      '모든 연속시간 고유값의 실수부가0이 아닌 평형입니다.',
      'An equilibrium whose continuous-time eigenvalues all have nonzero real parts.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/variational.ts',
      locator: [
        'numericalJacobian의 중앙차분과 스케일 규약을 대조합니다.',
        'Check numericalJacobian central differences and variable scaling.'
      ]
    },
    {
      path: 'src/physics/driven.ts',
      locator: [
        'rhsDriven의 중력·감쇠 항과 아래 수직 기준을 대조합니다.',
        'Check rhsDriven gravitational and damping terms and the downward-angle convention.'
      ]
    }
  ],
  external: {
    title: 'Saddle-node bifurcation',
    authors: 'Yuri A. Kuznetsov',
    url: 'https://www.scholarpedia.org/article/Saddle-node',
    locator: [
      '정의와 선형화의 영 고유값 조건을 대조합니다.',
      'Compare equilibrium linearization and the zero-eigenvalue boundary in the Definition section.'
    ]
  }
});
