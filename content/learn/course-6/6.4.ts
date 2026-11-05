import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '6.4',
  summary: [
    'Melnikov 함수의 영점은 실제 다양체 그림과 어떻게 연결될까요? 해석식·수치 분리선 적분·실제 stroboscopic 추적을 함께 비교합니다.',
    'How do Melnikov zeros relate to manifold geometry? Compare the analytic expression, separatrix quadrature and actual stroboscopic manifold samples.'
  ],
  objectives: [
    [
      '약섭동 분리선 거리의 영점 조건과 물리적 한계를 설명합니다.',
      'Explain weak-perturbation splitting zeros and their physical limits.'
    ],
    [
      '실제 saddle의 안정·불안정 추적과 해석 예측을 구별해 비교합니다.',
      'Compare actual saddle manifold tracing with analytic predictions.'
    ]
  ],
  assumptions: [
    '약한 감쇠·sine 구동 단일 진자입니다. Melnikov 시간·거리식은 고유 각주파수로 무차원화합니다. 실제 다양체는 같은 구동 위상에서 native RK4와 역시간 RK4로 표본화합니다.',
    'Use weak damping and sinusoidal forcing. Melnikov time and splitting expressions are nondimensionalized by natural angular frequency. Actual manifolds are sampled at the same drive phase using native forward and inverse-time RK4.'
  ],
  concepts: [
    {
      id: 'first-order',
      title: ['분리선 위 일차 근사', 'First-order separatrix approximation'],
      body: [
        '무섭동 진자의 stable·unstable 분리선은 일치합니다. 감쇠의 에너지 손실과 주기 외력의 일을 이 궤도에서 적분한 것이 일차 Melnikov 거리입니다. 부호가 바뀌는 단순 영점은 충분히 작은 섭동에서 횡단 교차를 예측하지만 강한 외력의 attractor 혼돈을 인증하지 않습니다.',
        'Unperturbed stable and unstable separatrices coincide. Integrating damping loss and forcing work along that orbit gives first-order splitting. Simple sign-changing zeros predict transverse intersections for sufficiently small perturbations; they do not certify a chaotic attractor at strong forcing.'
      ]
    },
    {
      id: 'manifolds',
      title: ['실제 saddle 추적과 실패 조건', 'Actual saddle tracing and failures'],
      body: [
        '별도 Newton으로 주기 saddle을 찾고 실제 반환 맵의 안정·불안정 고유벡터에 작은 선분을 놓습니다. 불안정 선분은 정시간, 안정 선분은 역시간으로 추적합니다. 표본 사이 선분 교차는 곡률·seed·반환수의 영향을 받는 후보이며 saddle 미수렴이나 비쌍곡 조건에서는 계산을 거부합니다.',
        'Find the periodic saddle by Newton and seed small segments along eigenvectors of its actual return map. Trace unstable segments forward and stable segments backward. Segment crossings remain sampling-dependent candidates; nonconverged or nonhyperbolic saddles are rejected.'
      ]
    }
  ],
  equations: [
    {
      id: 'scale',
      title: ['1. 무차원 감쇠', '1. Dimensionless damping'],
      expression: 'delta = damping/naturalFrequency',
      explanation: [
        '물리 감쇠율을 고유 각주파수로 나누어 약섭동 크기를 비교합니다.',
        'Divide the physical damping rate by natural angular frequency to compare perturbation size.'
      ],
      symbols: [
        ['delta', '1', '무차원 감쇠', 'Dimensionless damping'],
        ['damping', 's^-1', '물리 감쇠율', 'Physical damping'],
        ['naturalFrequency', 's^-1', '고유 각주파수', 'Natural angular frequency']
      ]
    },
    {
      id: 'threshold',
      title: ['2. 단순 영점의 임계 척도', '2. Threshold for simple zeros'],
      expression: 'criticalAmplitude = 4*damping*naturalFrequency*hyperbolicFactor/pi',
      explanation: [
        '감쇠 상수항과 주기 항 진폭의 equality에서 구합니다. hyperbolicFactor는 cosh(pi*Omega/2)이며 이 임계값과 같은 경우 단순 영점 조건은 충족되지 않습니다.',
        'Equate the damping offset and oscillatory amplitude. hyperbolicFactor is cosh(pi*Omega/2); equality at the threshold does not supply a simple zero.'
      ],
      symbols: [
        ['criticalAmplitude', 'rad/s^2', '임계 구동 각가속도', 'Critical forcing acceleration'],
        ['damping', 's^-1', '감쇠율', 'Damping'],
        ['naturalFrequency', 's^-1', '고유 각주파수', 'Natural angular frequency'],
        ['hyperbolicFactor', '1', '주파수에 따른 cosh 인자', 'Frequency-dependent cosh factor'],
        ['pi', '1', '원주율', 'Pi']
      ]
    }
  ],
  checks: [
    {
      prompt: ['수치 분리선 적분의 일치는 무엇을 검사하나요?', 'What does agreement with separatrix quadrature check?'],
      correct: [
        '일차 Melnikov 해석식의 수치 일관성입니다.',
        'Numerical consistency of the first-order Melnikov formula.'
      ],
      incorrect: [
        '유한 외력의 정확한 다양체가 모든 곳에서 일치함입니다.',
        'Exact finite-forcing manifolds agree everywhere.'
      ],
      explanation: [
        '같은 무섭동 분리선 적분을 검사하는 것이며 실제 비선형 다양체와는 다릅니다.',
        'It checks integration along the same unperturbed separatrix, separate from actual nonlinear manifolds.'
      ]
    },
    {
      prompt: ['표본 교차 후보가0이면?', 'What does zero sampled crossing candidates mean?'],
      correct: ['현재 유한 추적에서 찾지 못했음을 뜻합니다.', 'None were found in this finite trace.'],
      incorrect: ['교차가 존재하지 않는다는 증명입니다.', 'It proves intersections do not exist.'],
      explanation: [
        'seed와 곡률·해상도 때문에 실제 교차를 놓칠 수 있습니다.',
        'Finite seeding, curvature and resolution can miss real intersections.'
      ]
    }
  ],
  prediction: [
    '감쇠를 고정하고 외력 진폭을 줄이면 Melnikov 부호 변화와 실제 추적 교차 후보는 같은 시점에 사라질까요?',
    'At fixed damping, must Melnikov sign changes and sampled manifold crossings disappear at exactly the same forcing amplitude?'
  ],
  action: [
    '해석식·quadrature 차와 실제 saddle 추적을 실행합니다. amplitude를 낮추고 manifoldTurns를 늘려 예측과 유한 표본 후보를 대조합니다.',
    'Run analytic/quadrature and actual saddle tracing. Lower amplitude and increase manifoldTurns to compare predictions with finite-sample crossing candidates.'
  ],
  expected: [
    '해석식과 수치 분리선 적분은 작은 오차로 일치합니다. 실제 교차 후보는 약섭동 오차·seed·반환수에 의존하므로 임계값의 엄밀한 등식을 주장하지 않습니다.',
    'Analytic splitting and numerical separatrix integration agree closely. Actual crossing candidates depend on perturbation error, seeds and return count, without claiming exact threshold equality.'
  ],
  explanation: [
    '근사 이론 검증과 실제 다양체의 수치 기하는 다른 증거입니다. 동시 표시해 모델 오차와 추적 해상도를 구별합니다.',
    'Approximation checks and actual manifold geometry provide different evidence. Displaying both distinguishes model error from tracing resolution.'
  ],
  next: [
    '6.5에서는 검증된 한 궤도에서 이웃 매개변수의 해로 이동해 구조를 추적합니다.',
    'In6.5, follow structure by moving from a verified orbit to neighboring parameter values.'
  ],
  glossary: [
    ['횡단 교차', 'Transverse intersection'],
    [
      '두 다양체가 접선 방향을 공유하지 않고 만나는 교차입니다.',
      'An intersection at which the two manifolds have different tangent directions.'
    ]
  ],
  sources: [
    {
      path: 'src/chaos/melnikov.ts',
      locator: [
        'melnikovFunction·Numeric·CriticalAmplitude의 무차원화와 약섭동 전제를 대조합니다.',
        'Check nondimensionalization and weak-perturbation assumptions in the analytic, numerical and threshold functions.'
      ]
    },
    {
      path: 'src/chaos/branchSwitching.ts',
      locator: [
        'realEigenvector2x2의 방향 계산과 공용 RK4 추적을 사용합니다.',
        'Use realEigenvector2x2 directions with the preserved RK4 tracing kernel.'
      ]
    }
  ],
  external: {
    title: "Melnikov's method and Arnold diffusion for perturbations of integrable Hamiltonian systems",
    authors: 'Philip J. Holmes and Jerrold E. Marsden',
    url: 'https://authors.library.caltech.edu/records/env77-v5540',
    locator: [
      '저자 저장소의1982 논문과 횡단 교차의 섭동적 전제를 참고합니다.',
      'Consult the author-repository1982 paper and perturbative conditions for transverse intersections.'
    ]
  }
});
