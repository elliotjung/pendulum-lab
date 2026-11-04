import { nonlinearLesson } from '../../../src/product/experiments/nonlinear-focus-authoring';
export default nonlinearLesson({
  id: '4.4',
  summary: [
    '빠르게 흔드는 지지대가 위쪽 진자를 지탱할 수 있을까요? 정확한 가진 방정식의 궤적과 평균화 퍼텐셜의 국소 곡률을 대조합니다.',
    'Can a rapidly shaken pivot support an inverted pendulum? Compare exact driven trajectories with local curvature of the averaged potential.'
  ],
  objectives: [
    [
      '지지대 가속도가 중력 복원 항을 바꾸는 과정을 유도합니다.',
      'Derive how pivot acceleration changes the gravitational restoring term.'
    ],
    [
      '빠른 미세 운동·느린 평균·에너지 진단을 구별합니다.',
      'Separate rapid micromotion, slow averages and energy diagnostics.'
    ]
  ],
  assumptions: [
    '고정 길이 l, 질량 1인 강체 진자와 수직 지지대 yₚ=a cosΩt입니다. θ=0은 아래쪽, 역평형은 π입니다. a는 m, Ω는 rad/s이며 고주파 평균화는 a/l이 작고 Ω가 느린 고유주파수보다 클 때의 근사입니다.',
    'Use a unit-mass rigid pendulum of fixed length l with vertical pivot yₚ=a cosΩt. Downward equilibrium is θ=0 and inverted equilibrium is π. a is metres and Ω is rad/s; averaging assumes small a/l and drive much faster than slow motion.'
  ],
  concepts: [
    {
      id: 'accelerating-pivot',
      title: ['1. 가속하는 기준점에서 식 세우기', '1. Form the equation with an accelerating pivot'],
      body: [
        '지지대 가속도는 -aΩ² cosΩt입니다. 따라서 유효 중력 항에 g−aΩ² cosΩt가 들어가며, 직접 가진은 θ̈=−(g−aΩ²cosφ)sinθ/l−cθ̇입니다. 위상 φ를 상태에 넣어 φ̇=Ω로 적분하므로 초기 위상을 재현할 수 있습니다.',
        'Pivot acceleration is -aΩ² cosΩt, giving restoring coefficient g−aΩ² cosφ. Advancing φ as a state with φ̇=Ω preserves the initial phase and reproduces direct forcing.'
      ]
    },
    {
      id: 'averaging',
      title: ['2. 빠른 운동을 제거한 느린 퍼텐셜', '2. Average out the rapid motion'],
      body: [
        '작은 빠른 각도 성분의 평균 효과는 sin²θ에 비례하는 추가 항을 만듭니다. native Φeff를 두 번 미분하면 π에서 a²Ω²/(2l²)−g/l입니다. 이것이 양수이면 평균화된 느린 계에서는 위쪽이 국소 최소가 됩니다.',
        'Averaging the small rapid angular component adds a term proportional to sin²θ. Differentiating native Φeff twice gives curvature a²Ω²/(2l²)−g/l at π; positive curvature makes the inverted point a local minimum of the averaged slow system.'
      ]
    },
    {
      id: 'validity',
      title: ['3. 고주파 평균화의 한계와 직접 궤적', '3. High-frequency averaging limits and direct trajectories'],
      body: [
        '화면은 정확한 가진과 같은 초기조건에서 가진을 끈 run을 실행합니다. Φeff의 단위는 가속도 퍼텐셜 s⁻²이며 bob의 J 에너지와 다릅니다. 고주파 근사가 장시간 균일하게 정확하다는 보장은 없으며 빠른 가진을 충분히 분해하지 못한 dt는 거짓 안정화를 만들 수 있습니다.',
        'The experiment runs exact forcing and a no-drive companion from the same initial state. Φeff has acceleration-potential units s⁻², distinct from bob energy. Averaging need not remain uniformly accurate for long times, and unresolved forcing can produce spurious numerical stabilization.'
      ]
    }
  ],
  equations: [
    {
      id: 'exact',
      title: ['직접 가진의 원 방정식', 'Exact driven equation'],
      expression: 'thetaDDot=-(g-a*Omega^2*cos(phi))*sin(theta)/l-c*thetaDot; phiDot=Omega',
      explanation: [
        '중력에서 지지대 가속도 크기 aΩ² cosφ를 뺀 값을 길이로 나눈 뒤 sinθ에 곱하고 감쇠를 더합니다.',
        'Subtract the periodic pivot-acceleration term from gravity, divide by length, multiply by minus sine, then add damping.'
      ],
      symbols: [
        ['theta', 'rad', '아래쪽 기준 각도', 'Angle from downward vertical'],
        ['thetaDDot', 'rad/s^2', '각가속도', 'Angular acceleration'],
        ['thetaDot', 'rad/s', '각속도', 'Angular velocity'],
        ['g', 'm/s^2', '중력', 'Gravity'],
        ['a', 'm', '지지대 진폭', 'Pivot amplitude'],
        ['Omega', 'rad/s', '빠른 각주파수', 'Rapid angular frequency'],
        ['phi', 'rad', '가진 위상', 'Drive phase'],
        ['phiDot', 'rad/s', '위상 변화율', 'Phase rate'],
        ['l', 'm', '길이', 'Length'],
        ['c', 's^-1', '감쇠율', 'Damping rate']
      ]
    },
    {
      id: 'effective',
      title: ['평균화 퍼텐셜과 역평형 조건', 'Averaged potential and inverted criterion'],
      expression: 'Phi=-(g/l)*cos(theta)+(a^2*Omega^2/(4*l^2))*sin(theta)^2; uprightCurvature=a^2*Omega^2/(2*l^2)-g/l',
      explanation: [
        '느린 각도에 대한 퍼텐셜은 중력 항과 빠른 가진의 평균 sin² 항의 합입니다. π에서 곡률이 양수여야 국소 최소입니다.',
        'The slow potential combines gravity with an averaged sine-squared term; positive curvature at π is required for a local minimum.'
      ],
      symbols: [
        ['Phi', 's^-2', '평균 가속도 퍼텐셜', 'Averaged acceleration potential'],
        ['uprightCurvature', 's^-2', '역평형의 각도 곡률', 'Angular curvature at the inverted equilibrium'],
        ['g', 'm/s^2', '중력', 'Gravity'],
        ['l', 'm', '길이', 'Length'],
        ['theta', 'rad', '느린 각도', 'Slow angle'],
        ['a', 'm', '가진 진폭', 'Drive amplitude'],
        ['Omega', 'rad/s', '가진 각주파수', 'Drive angular frequency']
      ]
    }
  ],
  checks: [
    {
      prompt: ['Φeff는 가진 중 보존되는 bob 에너지인가요?', 'Is Φeff the conserved bob energy during forcing?'],
      correct: [
        '아닙니다. 느린 계의 가속도 퍼텐셜입니다.',
        'No. It is an acceleration potential for averaged slow motion.'
      ],
      incorrect: [
        '네. 에너지 감소만 보면 안정성을 알 수 있습니다.',
        'Yes. Falling energy alone establishes stability.'
      ],
      explanation: [
        '정확한 가진은 지지대와 에너지를 교환하며 Φeff의 단위도 에너지와 다릅니다.',
        'Exact forcing exchanges energy with the pivot and Φeff has different units.'
      ]
    },
    {
      prompt: [
        'a²Ω²>2gl이면 모든 주파수와 초기조건에서 안정한가요?',
        'Does a²Ω²>2gl guarantee stability for every frequency and initial condition?'
      ],
      correct: [
        '아닙니다. 평균화·작은 교란·국소 조건입니다.',
        'No. It is an averaged, local small-perturbation criterion.'
      ],
      incorrect: ['네. 이 부등식 하나가 전역 보증입니다.', 'Yes. The inequality is a global guarantee.'],
      explanation: [
        '고주파와 작은 지지대 진폭의 유효 범위 밖에서는 직접 궤적을 별도로 검증해야 합니다.',
        'Outside the averaging regime direct trajectories require independent verification.'
      ]
    }
  ],
  prediction: [
    'a=0.2 m,Ω=30 rad/s의 역평형과 a=0의 응답은 어떻게 다를까요?',
    'How will inverted responses differ for a=0.2 m, Ω=30 rad/s and for a=0?'
  ],
  action: [
    '기본 실험에서 평균화 곡률과 두 직접 궤적을 비교하세요. 진폭·주파수를 하나씩 줄여 경계 근처를 찾고 step을 반으로 줄여 관찰을 재확인하세요.',
    'Compare averaged curvature and both direct trajectories. Reduce amplitude or frequency separately toward the boundary, then halve step to recheck.'
  ],
  expected: [
    '기본 곡률은 8.19 s⁻²(허용 오차 1e-10)입니다. 4 s 동안 가진 run의 최대 |θ−π|는 0.2 rad 미만, 가진을 끈 run은 1 rad보다 큽니다.',
    'Baseline curvature is 8.19 s⁻² within 1e-10. Over 4 s, driven maximum |θ−π| stays below 0.2 rad; without drive it exceeds 1 rad.'
  ],
  explanation: [
    '기본 사례는 평균화된 국소 안정화와 일치하는 유한시간 증거입니다. 정확한 경계·무한시간 안정성이나 모든 초기조건의 끌림을 인증하지 않습니다.',
    'The baseline provides finite-time evidence consistent with averaged local stabilization, not exact boundaries or global infinite-time attraction.'
  ],
  next: [
    '4.5에서는 지지대를 흔드는 대신 상태 오차에 따른 피드백 힘을 씁니다.',
    'In 4.5 replace rapid pivot motion with feedback based on state error.'
  ],
  glossary: [
    ['동적 안정화', 'Dynamic stabilization'],
    [
      '시간 의존 가진이 평균적인 느린 운동의 국소 안정성을 바꾸는 현상입니다.',
      'A change in local slow-motion stability produced by time-dependent driving.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/kapitza.ts',
      locator: [
        'rhsKapitza,kapitzaEffectivePotential와 역평형 곡률·단위의 주석을 대조했습니다.',
        'Checked rhsKapitza, kapitzaEffectivePotential and inverted-curvature/unit conventions.'
      ]
    }
  ],
  external: {
    title: 'The Kapitza equation for the inverted pendulum (2019)',
    authors: 'Robert Ernald Grundy',
    url: 'https://research-portal.st-andrews.ac.uk/en/publications/the-kapitza-equation-for-the-inverted-pendulum/',
    locator: [
      '기관 원문 초록에서 평균화 방정식의 장시간 비균일 유효 범위 경고를 확인했습니다. 전문 검토를 주장하지 않습니다.',
      'Checked the institutional abstract warning about nonuniform long-time accuracy of averaging; no full-text review is claimed.'
    ]
  }
});
