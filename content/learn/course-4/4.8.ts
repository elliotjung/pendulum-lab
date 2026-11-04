import { nonlinearLesson } from '../../../src/product/experiments/nonlinear-focus-authoring';
export default nonlinearLesson({
  id: '4.8',
  summary: [
    '외력이 없는데 작은 진동이 커져 일정한 진폭으로 접근할 수 있을까요? Van der Pol의 상태 의존 감쇠를 안쪽·바깥쪽 초기조건에서 비교합니다.',
    'Can a small oscillation grow toward a finite amplitude without forcing? Compare state-dependent Van der Pol damping from inner and outer initial conditions.'
  ],
  objectives: [
    [
      '에너지 변화율에서 작은 진폭 주입과 큰 진폭 소산을 유도합니다.',
      'Derive small-amplitude injection and large-amplitude dissipation from energy rate.'
    ],
    [
      'μ=0의 중립 궤도와 μ>0의 유한시간 한계주기 접근을 구별합니다.',
      'Distinguish neutral orbits at μ=0 from finite-time cycle attraction at μ>0.'
    ]
  ],
  assumptions: [
    '정규화 ẍ−μ(1−x²)ẋ+x=0과 μ≥0입니다. x,v,t는 무차원 규약이며 SI 위치·속도가 아닙니다. 외력은 없고 μ가 커지면 서로 다른 빠름·느림 척도가 나타납니다. 실제 계산은 기존 Van der Pol RHS와 RK4 adapter를 사용합니다.',
    'Use the normalized Van der Pol equation with μ≥0. Position, velocity and time follow dimensionless conventions rather than SI units. There is no external drive; larger μ creates distinct fast and slow scales. Actual computation reuses the native RHS and RK4 adapter.'
  ],
  concepts: [
    {
      id: 'nonlinear-damping',
      title: ['1. 감쇠 부호가 상태에 따라 바뀌기', '1. Let the damping sign depend on state'],
      body: [
        '방정식을 ẍ=μ(1−x²)v−x로 쓰면 |x|<1에서 속도와 같은 방향의 항이 에너지를 넣고 |x|>1에서는 반대 방향으로 소산합니다. 따라서 감쇠라는 이름만 보고 모든 순간의 에너지가 감소한다고 생각하면 안 됩니다.',
        'Writing acceleration as μ(1−x²)v−x shows injection for |x|<1 and dissipation for |x|>1. The word damping does not imply decreasing energy at every instant.'
      ]
    },
    {
      id: 'cycle',
      title: ['2. 주기당 주입과 소산의 균형', '2. Balance injection and loss over a cycle'],
      body: [
        '조화 핵 에너지 E=(x²+v²)/2를 미분하면 μ(1−x²)v²입니다. 닫힌 주기에서는 평균 변화가 0이지만 순간 변화는 0이 아닙니다. 안쪽과 바깥쪽 궤적이 같은 폐곡선 근처로 접근하는지 실제 위상 그림으로 확인합니다.',
        'The harmonic-core energy rate is μ(1−x²)v². A closed cycle has zero cycle-average change, not zero instantaneous change. Inspect actual inner and outer trajectories for approach toward a common closed curve.'
      ]
    },
    {
      id: 'relaxation',
      title: ['3. 이완 진동의 수치 강성과 해석 한계', '3. Relaxation stiffness and interpretation limits'],
      body: [
        'μ가 커지면 느린 이동과 빠른 전환이 번갈아 나타납니다. 그림이 매끄러워 보여도 빠른 전환을 건너뛰면 잘못된 진폭·위상이 생깁니다. dt·μ≤0.1은 native 입력 제한이며 정확도 보증이 아니므로 더 작은 dt를 비교해야 합니다. μ=0이면 모든 초기 에너지의 조화 궤도가 남아 하나의 attracting cycle은 없습니다.',
        'Large μ alternates slow drift with fast transitions. Missing a fast transition can distort amplitude and phase despite a smooth display. The native dt·μ≤0.1 limit is not an accuracy guarantee; refine dt. At μ=0 a continuum of harmonic orbits remains instead of one attracting cycle.'
      ]
    }
  ],
  equations: [
    {
      id: 'vdp',
      title: ['정규화 자기여기 발진기', 'Normalized self-excited oscillator'],
      expression: 'xDot=v; vDot=mu*(1-x^2)*v-x',
      explanation: [
        '변위의 도함수는 속도이고 속도의 도함수는 상태 의존 감쇠와 선형 복원의 합입니다.',
        'Displacement derivative is velocity; acceleration combines state-dependent damping with linear restoration.'
      ],
      symbols: [
        ['x', '1', '정규화 변위', 'Normalized displacement'],
        ['v', '1', '정규화 속도', 'Normalized velocity'],
        ['xDot', '1', '정규화 변위 변화율', 'Normalized displacement rate'],
        ['vDot', '1', '정규화 가속도', 'Normalized acceleration'],
        ['mu', '1', '비선형 감쇠 세기', 'Nonlinear damping strength']
      ]
    },
    {
      id: 'energy',
      title: ['조화 핵 에너지의 수지', 'Harmonic-core energy balance'],
      expression: 'E=(x^2+v^2)/2; energyRate=mu*(1-x^2)*v^2',
      explanation: [
        '에너지의 미분에서 선형 복원 교환이 소거되어 비선형 감쇠 항만 남습니다. 이 E는 보존 에너지가 아닌 진단입니다.',
        'Linear restoring exchange cancels when differentiating the energy, leaving the nonlinear damping term; E is a diagnostic rather than a conserved quantity.'
      ],
      symbols: [
        ['E', '1', '정규화 조화 핵 에너지', 'Normalized harmonic-core energy'],
        ['x', '1', '변위', 'Displacement'],
        ['v', '1', '속도', 'Velocity'],
        ['mu', '1', '감쇠 세기', 'Damping strength'],
        ['energyRate', '1', '정규화 조화 핵 에너지의 시간 변화율', 'Normalized harmonic-core energy rate']
      ]
    }
  ],
  checks: [
    {
      prompt: ['|x|<1,μ>0,v≠0에서 조화 핵 에너지는?', 'What happens to harmonic-core energy for |x|<1, μ>0, v≠0?'],
      correct: ['증가합니다.', 'It increases.'],
      incorrect: ['감쇠이므로 반드시 감소합니다.', 'It must fall because the term is called damping.'],
      explanation: ['μ(1−x²)v²가 양수입니다.', 'μ(1−x²)v² is positive.']
    },
    {
      prompt: ['μ=0에서 모든 초기조건이 진폭 2에 모이나요?', 'Do all starts converge to amplitude 2 at μ=0?'],
      correct: [
        '아닙니다. 초기 에너지에 따른 조화 궤도를 유지합니다.',
        'No. They keep harmonic orbits set by initial energy.'
      ],
      incorrect: ['네. limit cycle은 μ와 무관합니다.', 'Yes. The limit cycle is independent of μ.'],
      explanation: ['μ=0에서는 에너지 주입·소산이 모두 사라집니다.', 'At μ=0 both injection and loss vanish.']
    }
  ],
  prediction: [
    'μ=0,1,5의 두 초기조건은 같은 형태로 접근할까요?',
    'Will μ=0,1,5 produce the same approach from two initial conditions?'
  ],
  action: [
    '안쪽 x=0.2와 바깥쪽 x=3의 위상 궤적을 비교하세요. μ를 0과 5로 바꿔 조화 극한과 느림·빠름 구조를 설명하고 관찰 시간을 줄인 경우도 비교하세요.',
    'Compare inner x=0.2 and outer x=3 phase trajectories. Use μ=0 and 5 to explain the harmonic limit and slow/fast structure; also shorten the observation window.'
  ],
  expected: [
    '기본 μ=1의 20 정규화 시간에서 두 후반부 최대 |x|는 모두 1.95–2.1이고 서로 차이는 0.02 미만입니다. μ=0의 독립 정확해 fixture는 x(t)=x₀cos t와 1e-8 이내에서 일치합니다.',
    'For μ=1 over 20 normalized time units, both tail maxima lie between 1.95 and 2.1 with difference below 0.02. At μ=0 an independent exact-solution fixture matches x(t)=x₀cos t within 1e-8.'
  ],
  explanation: [
    '같은 유한시간 폐곡선 접근은 자기여기 진동의 증거이지만 수학적인 전역 존재·유일성 증명은 아닙니다.',
    'Finite-time approach to a common curve evidences self-excited oscillation but does not prove global existence or uniqueness.'
  ],
  next: [
    '4.9에서는 매끄러운 감쇠 대신 정지·미끄럼 마찰의 전환을 관찰하세요.',
    'In 4.9 replace smooth damping with transitions between static and sliding friction.'
  ],
  glossary: [
    ['한계주기', 'Limit cycle'],
    [
      '주변 궤적과 구별되는 고립된 주기 궤도이며, attracting 여부는 별도의 안정성 성질입니다.',
      'An isolated periodic orbit; attraction is a separate stability property.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/vanDerPol.ts',
      locator: [
        'rhsVanDerPol와 energyVanDerPol에서 정규화·감쇠 부호·조화 극한을 대조했습니다.',
        'Checked normalization, damping sign and harmonic limit in rhsVanDerPol and energyVanDerPol.'
      ]
    }
  ]
});
