import { nonlinearLesson } from '../../../src/product/experiments/nonlinear-focus-authoring';
export default nonlinearLesson({
  id: '4.1',
  summary: [
    '에너지가 줄어드는 계에서 무엇이 수축할까요? 감쇠 토크로 에너지 수지를 유도하고 canonical 미소 위상 부피와 좌표 투영을 구별합니다.',
    'What contracts in a dissipative system? Derive the energy balance from damping torque and distinguish canonical infinitesimal volume from coordinate projections.'
  ],
  objectives: [
    [
      '힌지 감쇠의 일률과 실제 에너지 감소를 같은 run에서 비교합니다.',
      'Compare hinge dissipation power with actual energy loss in one run.'
    ],
    [
      '상태 의존 질량행렬이 위상 부피 수축률에 미치는 영향을 설명합니다.',
      'Explain the role of the state-dependent mass matrix in phase-volume contraction.'
    ]
  ],
  assumptions: [
    '평면 이중진자, 질점 두 개, 강체·무질량 막대, 중력, 각 힌지의 토크 -γω를 가정합니다. θ는 아래 수직 기준 절대각(rad), ω는 rad/s, γ는 kg·m²/s입니다. 구동·충돌은 없고 매끄러운 양정치 질량행렬 영역만 다룹니다.',
    'Use a planar double pendulum with point masses, rigid massless rods, gravity and hinge torques -γω. θ is an absolute angle from downward vertical in radians, ω is rad/s, and γ is kg·m²/s. There is no drive or impact; the mass matrix is smooth and positive definite.'
  ],
  concepts: [
    {
      id: 'power',
      title: ['1. 운동방정식에 속도를 곱하기', '1. Multiply the equations by velocity'],
      body: [
        'M(q)q̈+C(q,q̇)q̇+∇V=Q에서 보존 항을 합치면 dE/dt=q̇·Q입니다. Qᵢ=-γωᵢ를 대입하면 각 힌지가 하는 일은 음수 또는 0입니다. θ가 일시적으로 커져도 전체 에너지가 증가했다는 뜻은 아닙니다.',
        'Combining conservative terms in the manipulator equation gives dE/dt=q̇·Q. With Qᵢ=-γωᵢ, each hinge contributes nonpositive power. A temporarily growing angle does not imply rising total energy.'
      ]
    },
    {
      id: 'canonical',
      title: ['2. 운동량 좌표에서 수축률 찾기', '2. Find contraction in momentum coordinates'],
      body: [
        'p=M(q)ω로 바꾸면 Hamiltonian 흐름 자체의 canonical 발산은 0입니다. 감쇠 항은 ṗ에 -γM⁻¹p를 더하므로 운동량 미분의 trace는 -γ tr(M⁻¹)입니다. 따라서 같은 γ라도 자세에 따라 수축률이 다릅니다. 단순히 -2γ라고 쓰면 단위와 질량행렬을 빠뜨립니다.',
        'Under p=M(q)ω the Hamiltonian flow has zero canonical divergence. Damping adds -γM⁻¹p to ṗ, whose momentum derivative has trace -γ tr(M⁻¹). Thus equal γ can yield different contraction rates at different configurations; -2γ omits inertia and units.'
      ]
    },
    {
      id: 'interpretation',
      title: ['3. 투영의 한계와 수치 잔차', '3. Projection limits and numerical residuals'],
      body: [
        '한 링크의 θ–p 그림은 4차원 궤적의 2차원 투영이므로 둘러싼 넓이를 전체 부피로 읽지 않습니다. 화면의 부피 비율은 실제 궤적을 따라 발산을 적분한 선형화된 미소 부피입니다. 에너지 감소와 감쇠 일의 차이는 격자 적분 잔차이며 간격을 줄여 확인합니다.',
        'The θ–p plot is a two-dimensional projection of a four-dimensional trajectory; its enclosed area is not the full volume. The displayed volume ratio integrates divergence along the actual trajectory for an infinitesimal linearized volume. The energy/work mismatch is a grid-integration residual that should shrink with step refinement.'
      ]
    }
  ],
  equations: [
    {
      id: 'energy-balance',
      title: ['힌지 감쇠의 에너지 수지', 'Energy balance for hinge damping'],
      expression: 'P=gamma*(omega1^2+omega2^2); energyRate=-P; deltaEnergy=-dissipated',
      explanation: [
        '에너지 변화율은 두 각속도 제곱에 감쇠 계수를 곱한 음수입니다. 양의 소산 일률 P를 시간 적분하면 잃은 에너지가 됩니다.',
        'Energy changes at minus the damping coefficient times the sum of squared angular rates. Integrating positive dissipation power P gives the energy lost.'
      ],
      symbols: [
        ['energyRate', 'W', '전체 역학에너지 변화율', 'Total mechanical-energy rate'],
        ['deltaEnergy', 'J', '관찰 구간의 에너지 변화', 'Energy change over the observation interval'],
        ['dissipated', 'J', '소산 일률의 시간 적분', 'Time integral of dissipation power'],
        ['gamma', 'kg*m^2/s', '각 힌지의 점성 토크 계수', 'Viscous hinge-torque coefficient'],
        ['omega1', 'rad/s', '첫 각속도', 'First angular rate'],
        ['omega2', 'rad/s', '둘째 각속도', 'Second angular rate'],
        ['P', 'W', '양의 소산 일률', 'Positive dissipation power']
      ]
    },
    {
      id: 'volume',
      title: ['canonical 미소 위상 부피', 'Canonical infinitesimal phase volume'],
      expression:
        'p1=M11*omega1+M12*omega2; p2=M12*omega1+M22*omega2; divF=-gamma*(M11+M22)/(M11*M22-M12^2); volumeRatio=exp(integratedDivergence)',
      explanation: [
        '각운동량은 질량행렬 곱하기 각속도입니다. canonical 부피의 로그 변화율은 질량행렬 역행렬의 trace에 감쇠 계수를 곱한 음수입니다.',
        'Angular momentum is the mass matrix times angular velocity. The logarithmic canonical-volume rate is minus damping times the trace of the inverse mass matrix.'
      ],
      symbols: [
        ['p1', 'kg*m^2/s', '첫 일반화 각운동량', 'First generalized angular momentum'],
        ['p2', 'kg*m^2/s', '둘째 일반화 각운동량', 'Second generalized angular momentum'],
        ['M11', 'kg*m^2', '관성행렬의 첫 대각 원소', 'First diagonal inertia entry'],
        ['M12', 'kg*m^2', '관성행렬의 비대각 원소', 'Off-diagonal inertia entry'],
        ['M22', 'kg*m^2', '관성행렬의 둘째 대각 원소', 'Second diagonal inertia entry'],
        ['omega1', 'rad/s', '첫 각속도', 'First angular rate'],
        ['omega2', 'rad/s', '둘째 각속도', 'Second angular rate'],
        ['gamma', 'kg*m^2/s', '감쇠 토크 계수', 'Damping torque coefficient'],
        ['divF', 's^-1', 'canonical 흐름 발산', 'Canonical-flow divergence'],
        ['volumeRatio', '1', '초기 부피로 정규화한 미소 부피', 'Infinitesimal volume normalized to its initial value'],
        ['integratedDivergence', '1', '발산의 관찰 시간 적분', 'Observation-time integral of divergence']
      ]
    }
  ],
  checks: [
    {
      prompt: [
        'γ>0인데 한 링크의 각도가 커지면 에너지 수지가 틀렸나요?',
        'Does a growing link angle with γ>0 invalidate energy balance?'
      ],
      correct: [
        '아닙니다. 링크 사이 교환과 운동·위치에너지 변환을 함께 봅니다.',
        'No. Account for interlink exchange and kinetic/potential conversion.'
      ],
      incorrect: [
        '그렇습니다. 감쇠는 모든 각도를 매 순간 줄여야 합니다.',
        'Yes. Damping must reduce every angle at every instant.'
      ],
      explanation: [
        '소산 조건은 전체 에너지 변화율에 대한 조건입니다. 좌표 하나의 단조 감소를 요구하지 않습니다.',
        'Dissipation constrains total-energy rate, not monotonic decay of every coordinate.'
      ]
    },
    {
      prompt: ['γ=0에서 canonical 미소 부피 비율은?', 'What is the canonical infinitesimal volume ratio at γ=0?'],
      correct: ['1입니다.', 'It is 1.'],
      incorrect: [
        '상태 의존 질량행렬 때문에 반드시 줄어듭니다.',
        'It must decrease because the mass matrix depends on state.'
      ],
      explanation: [
        '보존 Hamiltonian 흐름의 canonical 발산은 0이며 q,ω 좌표의 투영 넓이와 다릅니다.',
        'Hamiltonian canonical divergence is zero, regardless of projected q,ω areas.'
      ]
    }
  ],
  prediction: [
    'γ를 0으로 바꾸면 에너지 변화와 부피 비율은 어떻게 될까요?',
    'How will energy change and volume ratio respond when γ is set to zero?'
  ],
  action: [
    '기본값으로 실행해 에너지 감소·소산 적분·수지 잔차를 읽으세요. γ=0과 0.4를 비교하고 dt를 반으로 줄여 잔차를 다시 확인하세요.',
    'Run the baseline and read energy loss, integrated dissipation and balance residual. Compare γ=0 and 0.4, then halve dt and recheck the residual.'
  ],
  expected: [
    '기본 6 s run의 소산 에너지는 약 1.9401 J, 부피 비율은 약 0.03132입니다. 수지 잔차는 2e-5 J 미만입니다. γ=0이면 부피 비율은 1이고 에너지 변화는 1e-6 J 미만이어야 합니다.',
    'The baseline 6 s run dissipates about 1.9401 J with volume ratio about 0.03132. Balance residual is below 2e-5 J. At γ=0 the ratio is 1 and energy change stays below 1e-6 J.'
  ],
  explanation: [
    '감쇠 일은 물리적인 에너지 손실이고 수지 잔차는 수치 오차입니다. 두 값을 분리해야 감쇠를 적분기 오류로 오해하지 않습니다.',
    'Damping work is physical loss; balance residual is numerical error. Keeping them separate prevents confusing dissipation with integration failure.'
  ],
  next: [
    '외부에서 에너지를 넣으면 단조 감소가 사라집니다. 4.2에서 주기 구동과 공명의 위상 지연을 비교하세요.',
    'External energy injection removes monotonic decay. In 4.2 compare periodic forcing, resonance and phase lag.'
  ],
  glossary: [
    ['canonical 위상 부피', 'Canonical phase volume'],
    [
      '일반화좌표와 그에 켤레인 운동량으로 정의한 부피 요소입니다.',
      'A volume element defined by generalized coordinates and their conjugate momenta.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/double.ts',
      locator: [
        'rhsDouble의 -γω 토크와 energyDouble를 대조했습니다.',
        'Checked -γω torques in rhsDouble and energyDouble.'
      ]
    },
    {
      path: 'src/physics/canonical.ts',
      locator: [
        'doubleMassMatrix와 omegaToMomentum의 좌표·관성 정의를 대조했습니다.',
        'Checked coordinate and inertia definitions in doubleMassMatrix and omegaToMomentum.'
      ]
    }
  ]
});
