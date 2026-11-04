import { nonlinearLesson } from '../../../src/product/experiments/nonlinear-focus-authoring';
export default nonlinearLesson({
  id: '4.5',
  summary: [
    '위쪽 평형 근처의 진자를 작은 피드백으로 붙잡을 수 있을까요? 단순 역진자와 카트폴에서 개방·폐루프를 실제로 비교합니다.',
    'Can small feedback hold a pendulum near its upright equilibrium? Compare open and closed loops for both an inverted pendulum and a cart-pole.'
  ],
  objectives: [
    [
      '역평형의 선형화와 피드백 gain의 역할을 유도합니다.',
      'Derive the upright linearization and the role of feedback gains.'
    ],
    [
      '국소 안정화·포화·swing-up의 차이를 실제 상태와 힘에서 확인합니다.',
      'Use actual state and force to distinguish local stabilization, saturation and swing-up.'
    ]
  ],
  assumptions: [
    '두 모형 모두 θ=0이 위쪽입니다. 단순 역진자는 각가속도 입력, 카트폴은 수평 힘 N을 사용합니다. 카트폴 상태는 x(m),θ(rad),v(m/s),ω(rad/s)입니다. 작은 초기 각도와 기존 S13 상태 피드백을 쓰며 제어기 설계를 최적화하거나 swing-up하지 않습니다.',
    'Both models use θ=0 upright. The simple inverted pendulum takes angular acceleration; the cart-pole takes horizontal force in newtons. Cart-pole state is x,θ,v,ω in SI units. Use small initial angles and the existing S13 feedback, without gain optimization or swing-up.'
  ],
  concepts: [
    {
      id: 'linearization',
      title: ['1. 불안정 평형을 선형화하기', '1. Linearize the unstable equilibrium'],
      body: [
        '위쪽에서 sinθ≈θ를 쓰면 단순 역진자는 θ̈=(g/l)θ−cθ̇+u입니다. 기준 0의 PD 입력 u=−kpθ−kdθ̇를 넣으면 복원 계수 kp−g/l와 감쇠 c+kd가 생깁니다. 양의 두 계수는 포화 없는 연속 선형계의 국소 안정 조건입니다.',
        'Near upright, the simple model has θ̈=(g/l)θ−cθ̇+u. PD feedback creates restoring coefficient kp−g/l and damping c+kd; positive coefficients stabilize the unsaturated continuous linearization.'
      ]
    },
    {
      id: 'cartpole',
      title: ['2. 카트와 pole의 상태를 함께 쓰기', '2. Use both cart and pole state'],
      body: [
        '카트폴은 힘이 카트 가속도를 바꾸고 그 가속도가 pole에 작용하므로 θ만의 PD와 다릅니다. 기존 입력 u=kpθ+kdω+kx(x−xref)+kvv를 그대로 사용하고 gain 배율을 통제합니다. 부호는 native plant convention에 속하므로 다른 책의 좌표식을 그대로 붙이지 않습니다.',
        'Cart acceleration couples force into pole motion, so cart-pole feedback differs from simple angular PD. Use the existing state-feedback signs and a controlled gain multiplier; signs belong to the native plant convention and should not be copied from another coordinate convention.'
      ]
    },
    {
      id: 'failure',
      title: ['3. 포화와 국소 영역을 확인하기', '3. Check saturation and locality'],
      body: [
        '계산된 u는 출력 한계에서 잘립니다. 유효한 gain 숫자가 모든 초기조건에서 안정화를 보장하지 않으며 제어 중 각오차가 π/2를 넘으면 native 안전 중지가 작동합니다. 기존 카트폴 가속도식의 4/3 관성과 bob 에너지 진단의 질점 근사는 서로 다르므로 에너지로 제어 성능을 인증하지 않습니다.',
        'Computed control is clipped to the output limit. Finite gains do not guarantee stabilization from every state; native safety stops a controlled trajectory beyond π/2 angular error. The cart-pole acceleration uses 4/3 inertia while the bob-energy diagnostic uses a point-mass approximation, so energy does not certify control performance.'
      ]
    }
  ],
  equations: [
    {
      id: 'inverted',
      title: ['단순 역진자 폐루프', 'Simple inverted-pendulum closed loop'],
      expression: 'thetaDDot+(c+kd)*thetaDot+(kp-g/l)*theta=0',
      explanation: [
        '포화가 없는 작은 각도에서 PD 입력을 대입하면 감쇠와 유효 복원 항을 갖는 2차 선형 방정식이 됩니다.',
        'Substituting unsaturated PD feedback into the small-angle model gives a second-order linear system with effective damping and restoration.'
      ],
      symbols: [
        ['theta', 'rad', '위쪽 기준 각오차', 'Angular error from upright'],
        ['thetaDot', 'rad/s', '각속도', 'Angular rate'],
        ['thetaDDot', 'rad/s^2', '각가속도', 'Angular acceleration'],
        ['c', 's^-1', 'plant 감쇠', 'Plant damping'],
        ['kd', 's^-1', '미분 gain', 'Derivative gain'],
        ['kp', 's^-2', '비례 gain', 'Proportional gain'],
        ['g', 'm/s^2', '중력', 'Gravity'],
        ['l', 'm', '길이', 'Length']
      ]
    },
    {
      id: 'cart-control',
      title: ['native 카트폴 입력과 포화', 'Native cart-pole control and saturation'],
      expression: 'uraw=kp*theta+kd*omega+kx*(x-xref)+kv*v; abs(u)<=Umax',
      explanation: [
        'pole 각도·각속도와 카트 위치·속도에 각각 gain을 곱해 힘을 더하고 ±Umax에서 포화합니다.',
        'Weighted pole angle/rate and cart position/velocity form a force clipped to ±Umax.'
      ],
      symbols: [
        ['uraw', 'N', '포화 전 힘', 'Force before saturation'],
        ['u', 'N', '실제 제어 힘', 'Applied control force'],
        ['kp', 'N/rad', '각도 gain', 'Angle gain'],
        ['kd', 'N*s/rad', '각속도 gain', 'Angular-rate gain'],
        ['kx', 'N/m', '위치 gain', 'Position gain'],
        ['kv', 'N*s/m', '속도 gain', 'Velocity gain'],
        ['theta', 'rad', 'pole 각도', 'Pole angle'],
        ['omega', 'rad/s', 'pole 각속도', 'Pole angular rate'],
        ['x', 'm', '카트 위치', 'Cart position'],
        ['xref', 'm', '목표 위치', 'Reference position'],
        ['v', 'm/s', '카트 속도', 'Cart velocity'],
        ['Umax', 'N', '출력 크기 한계', 'Output magnitude limit']
      ]
    }
  ],
  checks: [
    {
      prompt: [
        '기본 gain으로 작은 각도에서 수렴하면 swing-up도 보장되나요?',
        'Does small-angle convergence guarantee swing-up?'
      ],
      correct: [
        '아닙니다. 국소 안정화와 큰 영역 제어는 다릅니다.',
        'No. Local stabilization differs from large-region control.'
      ],
      incorrect: ['네. 모든 초기조건에서 같은 결과입니다.', 'Yes. Every initial condition behaves identically.'],
      explanation: [
        '선형화와 출력 포화가 적용 범위를 제한합니다.',
        'Linearization and output saturation limit the valid region.'
      ]
    },
    {
      prompt: [
        '카트폴과 단순 역진자의 maxOutput은 같은 단위인가요?',
        'Do cart-pole and simple inverted maxOutput share units?'
      ],
      correct: ['아닙니다. 각각 N과 rad/s²입니다.', 'No. They are N and rad/s² respectively.'],
      incorrect: ['둘 다 gain이므로 무차원입니다.', 'Both are dimensionless gains.'],
      explanation: [
        '입력은 힘 또는 각가속도이며 gain과도 구별해야 합니다.',
        'Inputs are force or angular acceleration, distinct from the gains.'
      ]
    }
  ],
  prediction: [
    '기본 gain 배율을 0으로 만들거나 힘 한계를 작게 하면 어떤 응답이 예상되나요?',
    'What response do you expect with zero gain or a very small force limit?'
  ],
  action: [
    '기본 개방·폐루프 비교에서 최종 각도와 실제 포화 힘을 읽으세요. gain 배율과 maxOutput을 하나씩 낮추고 안전 중지가 나오면 그 원인과 마지막 유효 상태를 확인하세요.',
    'Compare final angles and applied force for default loops. Reduce gain scale and force limit separately; if safety stops the run, inspect the cause and last valid state.'
  ],
  expected: [
    '기본 5 s에서 카트폴 최종 각도 크기는 0.012 rad 미만, 단순 역진자는 1e-5 rad 미만입니다. 개방루프 카트폴의 최종 각도 크기는 0.1 rad보다 큽니다.',
    'At 5 s the baseline closed cart-pole angle is below 0.012 rad and the simple inverted angle below 1e-5 rad. Open-loop cart-pole final angle magnitude exceeds 0.1 rad.'
  ],
  explanation: [
    '같은 초기조건에서 피드백 유무를 통제해야 효과를 비교할 수 있습니다. 낮은 최종 각도 하나로 모든 상태의 수렴을 주장하지 않습니다.',
    'Control the initial state when comparing feedback. A small final angle alone does not prove convergence of every state.'
  ],
  next: [
    '4.6에서 제어 입력 없이 보존 결합이 만드는 정상모드와 beat를 살펴보세요.',
    'In 4.6 explore normal modes and beats from conservative coupling without control input.'
  ],
  glossary: [
    ['국소 안정화', 'Local stabilization'],
    [
      '평형 주변의 제한된 초기조건 영역에서 교란을 줄이는 제어입니다.',
      'Control that reduces perturbations within a restricted neighborhood of equilibrium.'
    ]
  ],
  sources: [
    {
      path: 'src/product/adapters/physics/driven.ts',
      locator: [
        'controller 신호의 부호·포화·안전 중지와 native plant 호출을 대조했습니다.',
        'Checked controller signs, saturation, safety stops and native plant calls.'
      ]
    },
    {
      path: 'src/physics/expandedModels-factory.ts',
      locator: [
        'invertedRhs와 cartpole native 가속도의 좌표 및 관성 계수를 대조했습니다.',
        'Checked coordinate and inertia conventions in invertedRhs and native cart-pole acceleration.'
      ]
    }
  ],
  external: {
    title: 'Underactuated Robotics — Acrobots, Cart-Poles, and Quadrotors',
    authors: 'Russ Tedrake',
    url: 'https://underactuated.mit.edu/acrobot.html',
    locator: [
      'Balancing·Linearizing 절의 국소 선형화 설명을 확인했습니다. 자료의 아래쪽 0과 제품의 위쪽 0, 질점과 4/3 관성 차이를 구분합니다.',
      'Checked local-linearization discussion in Balancing/Linearizing; distinguish its downward-zero point-mass model from the product upright-zero 4/3-inertia model.'
    ]
  }
});
