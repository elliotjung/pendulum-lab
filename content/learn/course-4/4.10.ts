import { nonlinearLesson } from '../../../src/product/experiments/nonlinear-focus-authoring';
export default nonlinearLesson({
  id: '4.10',
  summary: [
    '현재와 한 주기 전 상태의 차이로 궤도를 제어할 수 있을까요? 실제 지연 이력을 사용하는 Pyragas run에서 gain·delay 후보와 비침습 조건을 조사합니다.',
    'Can the difference between present and one-period-old state control an orbit? Explore gain/delay candidates and noninvasiveness using actual Pyragas delay histories.'
  ],
  objectives: [
    [
      '지연 피드백이 주기 궤도에서 사라지는 조건을 유도합니다.',
      'Derive when delayed feedback vanishes on a periodic orbit.'
    ],
    [
      '작은 피드백·작은 주기 결함과 불안정 주기궤도 안정화의 증거를 구별합니다.',
      'Distinguish low feedback or low periodicity defect from evidence of unstable-orbit stabilization.'
    ]
  ],
  assumptions: [
    '평면 단진자의 θ=0은 아래쪽입니다. 구동은 A cosΩt이고 u=K[θ(t−τ)−θ(t)]는 각가속도 입력입니다. t<0의 θ=θ₀,ω=0 상수 이력이 초기조건의 일부입니다. native method-of-steps RK4와 선형 이력 보간을 쓰며 τ≥dt, 유한 이력 예산을 지킵니다.',
    'Downward equilibrium is θ=0. A cosine drive acts with delayed angular-acceleration feedback K[θ(t−τ)−θ(t)]. Constant prehistory θ=θ₀,ω=0 is part of the initial condition. Native method-of-steps RK4 and linear interpolation require τ≥dt and bounded history storage.'
  ],
  concepts: [
    {
      id: 'history',
      title: ['1. 상태 한 점 대신 이력 구간을 주기', '1. Supply a history segment'],
      body: [
        '같은 θ(0),ω(0)라도 과거 θ(t−τ)가 다르면 가속도가 달라집니다. 따라서 지연 계의 재현에는 현재 상태와 이력·τ·시간 원점이 필요합니다. 이 단원은 상수 이력으로 다시 시작하며 완료된 delay tape에서 계속 적분한다고 주장하지 않습니다.',
        'Identical present angle and rate can yield different accelerations under different histories. Reproduction therefore requires history, delay and time origin. This lesson restarts with constant history rather than claiming continuation from a completed delay tape.'
      ]
    },
    {
      id: 'noninvasive',
      title: ['2. 비침습 조건과 안정화는 다른 질문', '2. Noninvasiveness differs from stabilization'],
      body: [
        '정확한 목표 궤도가 주기 T를 가지고 τ=T이면 θ(t−τ)=θ(t)여서 피드백은 0입니다. 그러나 정지 평형도 이 조건을 만족하고 K=0이면 어떤 궤적에서도 입력은 0입니다. 작은 입력만으로 원하는 불안정 주기궤도를 찾거나 안정화했다고 판정할 수 없습니다.',
        'On an exact target orbit of period T, τ=T makes delayed and current angle equal, so feedback vanishes. A stationary equilibrium also satisfies this, and K=0 gives zero input on any trajectory. Low input alone neither identifies nor certifies stabilization of a desired unstable periodic orbit.'
      ]
    },
    {
      id: 'candidates',
      title: ['3. gain·delay 후보를 보수적으로 비교하기', '3. Compare gain/delay candidates conservatively'],
      body: [
        '3×3 실제 지연 run 격자에서 후반부 주기 일치 결함 RMS와 피드백 RMS를 함께 봅니다. 강제 주기 2π/Ω와 τ를 비교하되 transient가 남을 수 있습니다. 이 격자는 후보 탐색이며 UPO shooting이나 Floquet 안정성 증명을 하지 않습니다. 후보를 발견하면 더 긴 run·이력/간격 수렴·교란 응답으로 추가 검증해야 합니다.',
        'A 3×3 grid of actual delayed runs reports tail periodicity-defect and feedback RMS. Compare τ with forcing period 2π/Ω while allowing residual transients. This is candidate exploration, without UPO shooting or Floquet certification; candidates need longer runs, history/step refinement and perturbation checks.'
      ]
    }
  ],
  equations: [
    {
      id: 'delay',
      title: ['native 지연 피드백 방정식', 'Native delayed-feedback equation'],
      expression: 'thetaDDot=-(g/l)*sin(theta)-c*omega+A*cos(Omega*t)+K*(thetaDelay-theta); delayedTime=t-tau',
      explanation: [
        '중력·감쇠·주기 구동에 과거 각도와 현재 각도의 차이를 gain으로 곱해 더합니다. 지연 상태는 승인된 과거 이력에서 보간합니다.',
        'Add gain times past-minus-current angle to gravity, damping and drive; obtain the delayed angle by interpolating accepted history.'
      ],
      symbols: [
        ['theta', 'rad', '현재 아래쪽 기준 각도', 'Current angle from downward vertical'],
        ['thetaDDot', 'rad/s^2', '각가속도', 'Angular acceleration'],
        ['thetaDelay', 'rad', '지연된 각도', 'Delayed angle'],
        ['omega', 'rad/s', '현재 각속도', 'Current angular rate'],
        ['g', 'm/s^2', '중력', 'Gravity'],
        ['l', 'm', '길이', 'Length'],
        ['c', 's^-1', '감쇠율', 'Damping rate'],
        ['A', 'rad/s^2', '구동 진폭', 'Drive amplitude'],
        ['Omega', 'rad/s', '구동 각주파수', 'Drive angular frequency'],
        ['t', 's', '시간', 'Time'],
        ['K', 's^-2', '피드백 gain', 'Feedback gain'],
        ['tau', 's', '지연', 'Delay'],
        ['delayedTime', 's', '지연 각도를 평가하는 과거 시각', 'Past time at which the delayed angle is evaluated']
      ]
    },
    {
      id: 'periodic-match',
      title: ['주기 일치와 비침습 입력', 'Period matching and noninvasive input'],
      expression: 'u=K*(thetaDelay-theta); D=sqrt(meanSquaredDefect); periodRatio=tau/T',
      explanation: [
        '주기와 지연이 같으면 정확한 목표 궤도의 입력은 사라집니다. D는 표본에서 계산한 주기 일치 결함이며 안정성 지수가 아닙니다.',
        'Matching delay to period makes feedback vanish on an exact target orbit. D is a sampled periodicity defect, not a stability exponent.'
      ],
      symbols: [
        ['theta', 'rad', '목표 궤도의 각도', 'Target-orbit angle'],
        [
          'thetaDelay',
          'rad',
          '현재 시각에서 지연된 목표 궤도의 각도',
          'Delayed target-orbit angle at the current time'
        ],
        ['K', 's^-2', '피드백 gain', 'Feedback gain'],
        ['T', 's', '목표 주기', 'Target period'],
        ['tau', 's', '지연', 'Delay'],
        ['u', 'rad/s^2', '제어 입력', 'Control input'],
        ['D', 'rad', '주기 일치 결함 RMS', 'Periodicity-defect RMS'],
        [
          'meanSquaredDefect',
          '1',
          '각도 차이 제곱의 표본 평균 (rad², rad 무차원 규약)',
          'Sample mean squared angle difference (radian-squared, radians dimensionless)'
        ],
        ['periodRatio', '1', '지연과 목표 주기의 비', 'Ratio of delay to target period']
      ]
    }
  ],
  checks: [
    {
      prompt: [
        '피드백 RMS가 0이면 원하는 UPO가 안정화되었나요?',
        'Does zero feedback RMS prove stabilization of the desired UPO?'
      ],
      correct: [
        '아닙니다. K=0이나 정지 평형도 같은 값을 만듭니다.',
        'No. K=0 or an equilibrium can give the same value.'
      ],
      incorrect: ['네. 비침습 입력이면 항상 성공입니다.', 'Yes. Noninvasive input always means success.'],
      explanation: [
        '목표 궤도 식별과 교란 안정성은 별도의 검증입니다.',
        'Target identification and perturbation stability require separate evidence.'
      ]
    },
    {
      prompt: [
        '현재 θ,ω만 같으면 지연 궤적도 같나요?',
        'Do identical present θ and ω guarantee identical delayed trajectories?'
      ],
      correct: ['아닙니다. 과거 이력과 τ도 같아야 합니다.', 'No. History and delay must also match.'],
      incorrect: ['네. 지연은 표시용 설정입니다.', 'Yes. Delay is only a display setting.'],
      explanation: ['RHS가 과거 θ(t−τ)를 직접 사용합니다.', 'The RHS directly uses past θ(t−τ).']
    }
  ],
  prediction: [
    'τ를 강제 주기 2π/Ω와 다르게 바꾸면 주기 결함과 입력 RMS가 함께 감소할까요?',
    'If τ differs from forcing period 2π/Ω, must periodicity defect and input RMS decrease together?'
  ],
  action: [
    '기본 3×3 gain–delay 격자를 실행하고 가장 작은 주기 결함과 실제 피드백 RMS를 따로 읽으세요. gain을 0으로 바꾼 결과와 비교하고 delay·amplitude를 하나씩 바꿔 후보의 민감도를 설명하세요.',
    'Run the 3×3 gain/delay grid and read periodicity defect separately from actual feedback RMS. Compare with gain zero, then vary delay and amplitude individually to explain sensitivity.'
  ],
  expected: [
    '기본 강제 주기는 6.283185307 s(1e-8 s 허용)이며 아홉 실제 후보가 나옵니다. 기본 후반부 피드백 RMS는 약 0.04121 rad/s²(5e-4 허용)로 0이 아닙니다. 별도 θ=0,A=0의 상수 이력 fixture에서는 상태·입력이 정확히 0입니다.',
    'Baseline forcing period is 6.283185307 s within 1e-8, with nine actual candidates. Baseline tail feedback RMS is about 0.04121 rad/s² within 5e-4, not zero. An independent θ=0,A=0 constant-history fixture has exactly zero state and feedback.'
  ],
  explanation: [
    '기본 결과는 불안정 주기궤도 안정화의 완료 증거가 아닙니다. 수치가 허용하는 결론만 쓰고 부족한 궤도·안정성 검증을 명시해야 합니다.',
    'The baseline does not certify stabilization of an unstable periodic orbit. State only conclusions supported by the numbers and identify missing orbit/stability checks.'
  ],
  next: [
    '비선형 응답의 모양만으로 카오스를 판정하지 않았습니다. 과정 5에서 sampling·신뢰도·실패 예제를 가진 진단을 비교하세요.',
    'Response shape alone has not established chaos. In course 5 compare diagnostics with explicit sampling assumptions, confidence limits and failure examples.'
  ],
  glossary: [
    ['비침습 피드백', 'Noninvasive feedback'],
    [
      '목표 궤도 위에서 입력이 사라지는 제어 구조이며, 그 자체가 안정화 성공을 뜻하지 않습니다.',
      'A control structure whose input vanishes on the target orbit; this alone does not establish successful stabilization.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/pyragasDde.ts',
      locator: [
        'pyragasFeedback,rhsPyragasPendulum와 method-of-steps·dt refinement 계약을 대조했습니다. Pyragas1992 DOI 전문은 접근하지 못했으므로 읽었다고 표시하지 않습니다.',
        'Checked pyragasFeedback, rhsPyragasPendulum and method-of-steps/refinement contracts. The Pyragas1992 DOI full text was inaccessible and is not claimed as reviewed.'
      ]
    },
    {
      path: 'src/product/adapters/physics/nonlinear.ts',
      locator: [
        'accepted delay tape·상수 이력·선형 보간과 restart 경계를 대조했습니다.',
        'Checked accepted delay tape, constant history, linear interpolation and restart boundaries.'
      ]
    }
  ]
});
