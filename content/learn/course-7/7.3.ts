import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '7.3',
  summary: [
    '두 시계가 같은 속도로 움직이려면 위상 차가0이어야 할까요? Huygens 위상 축약에서 주파수 차와 양·음의 결합에 따른 잠금을 관찰합니다.',
    'Must two clocks have zero phase difference to run together? Explore detuning and positive or negative coupling in the Huygens phase reduction.'
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
    '두 위상만 가진 약결합 축약 모형입니다. 고유각주파수는1과1+detuning rad/s, 위상 지연0, 초기 위상 차0.8 rad입니다. 진폭·탈진기·지지대 반동은 없습니다.',
    'This weak-coupling reduction has two phases only, natural angular frequencies1 and1+detuning rad/s, zero phase lag and initial phase difference0.8 rad. Amplitudes, escapements and support recoil are absent.'
  ],
  concepts: [
    {
      id: 'derivation',
      title: ['모형에서 관계식으로', 'From the model to the relation'],
      body: [
        '둘째 위상 방정식에서 첫째를 빼면 Δω와 두 결합항의 차가 남습니다. 양의 K에서 정상 위상 차는 sin Δ=Δω/(2K)를 만족하며 우변의 절댓값이1을 넘으면 이 잠금 해가 없습니다.',
        'Subtracting the first phase equation from the second leaves detuning and the difference of two coupling terms. For positive K a stationary phase difference obeys sin delta=detuning/(2K); no such locked solution exists when the ratio exceeds one in magnitude.'
      ]
    },
    {
      id: 'interpretation',
      title: ['실제 계산의 해석', 'Interpreting the actual calculation'],
      body: [
        '실제 두 위상의 차를 시간에 따라 표시하고 native 잠금 예측과 비교합니다. K<0에서는 π 부근의 역위상 후보를 탐색하지만 양의 K용 native 해석식을 그대로 사용하지 않습니다. 주파수 동기화와 순간 위상 정렬은 다른 관측입니다.',
        'Track the actual phase difference and compare it with the native locking prediction. Negative K explores candidates near anti-phase, without applying the positive-K formula. Frequency synchronization differs from instantaneous phase alignment.'
      ]
    },
    {
      id: 'limits',
      title: ['실패 조건과 유한 관찰의 한계', 'Failure conditions and finite-observation limits'],
      body: [
        '실제 Huygens 시계에는 지지대 운동과 탈진기 에너지 공급이 있습니다. 이 축약 실험은 그 기계적 원인을 재현하지 않습니다. 임계 결합 근처의 느린 수렴을 비잠금으로 단정하지 말고 관찰 기간을 늘립니다.',
        'Real Huygens clocks involve support motion and energy injection by escapements. This reduction does not reproduce that mechanical cause. Near threshold, slow convergence can resemble drift; increase observation time before deciding.'
      ]
    }
  ],
  equations: [
    {
      id: 'relation-1',
      title: ['1. 핵심 관계', '1. Central relation'],
      expression: 'deltaRate = detuning-2*coupling*sin(delta)',
      explanation: [
        '위상 차의 변화율은 고유각주파수 차에서 두 결합의 복원 효과를 뺀 것입니다.',
        'The phase-difference rate is natural angular-frequency detuning minus the restoring effect of the two coupling terms.'
      ],
      symbols: [
        ['deltaRate', 'rad/s', '위상 차 변화율', 'Phase-difference rate'],
        ['detuning', 'rad/s', '고유각주파수 차', 'Natural angular-frequency difference'],
        ['coupling', 's^-1', '위상 결합 K', 'Phase coupling K'],
        ['delta', 'rad', '위상 차', 'Phase difference']
      ]
    },
    {
      id: 'relation-2',
      title: ['2. 핵심 관계', '2. Central relation'],
      expression: 'lockRatio = detuning/(2*coupling)',
      explanation: [
        '양의 K 잠금이 존재하려면 이 무차원 비의 절댓값이1 이하여야 합니다. K=0에서는 나누지 않습니다.',
        'Positive-K locking requires the magnitude of this dimensionless ratio to be at most one. It is not evaluated by division at K=0.'
      ],
      symbols: [
        ['lockRatio', '1', '잠금 비', 'Locking ratio'],
        ['detuning', 'rad/s', '고유각주파수 차', 'Detuning'],
        ['coupling', 's^-1', '위상 결합', 'Phase coupling']
      ]
    }
  ],
  checks: [
    {
      prompt: ['주파수 동기화는 항상 Δ=0을 의미하나요?', 'Does frequency synchronization always imply delta=0?'],
      correct: [
        '주파수 차를 보상하는 유한한 위상 차가 가능합니다.',
        'A finite phase difference can compensate detuning.'
      ],
      incorrect: ['동기화되면 모든 위상이 항상0입니다.', 'All synchronized phases must always be zero.'],
      explanation: [
        '결합은 위상 차에 복원 작용을 하지만 detuning은 지속적인 drift를 만듭니다.',
        'Coupling restores the phase difference while detuning produces persistent drift.'
      ]
    },
    {
      prompt: ['7.3의 결과를 보편적인 증명으로 읽어도 될까요?', 'Does the result of 7.3 establish a universal proof?'],
      correct: [
        '아래의 가정·표본·시간 범위 안에서만 해석합니다.',
        'Interpret it within the stated assumptions, sampling and observation interval.'
      ],
      incorrect: [
        '한 번 계산하면 모든 매개변수에서 성립합니다.',
        'One run establishes the conclusion for every parameter.'
      ],
      explanation: [
        '실제 Huygens 시계에는 지지대 운동과 탈진기 에너지 공급이 있습니다. 이 축약 실험은 그 기계적 원인을 재현하지 않습니다. 임계 결합 근처의 느린 수렴을 비잠금으로 단정하지 말고 관찰 기간을 늘립니다.',
        'Real Huygens clocks involve support motion and energy injection by escapements. This reduction does not reproduce that mechanical cause. Near threshold, slow convergence can resemble drift; increase observation time before deciding.'
      ]
    }
  ],
  prediction: [
    'K를0.5에서0으로 바꾸면 위상 차의 잠금이 어떻게 달라질지 예상하세요.',
    'Predict how changing K from0.5 to0 changes phase-difference locking.'
  ],
  action: [
    'K=0.5,0,-0.5를 차례로 실행하고 native 예측과 종료 위상 차를 비교하세요.',
    'Run K=0.5,0,-0.5 and compare the native prediction with the final phase difference.'
  ],
  expected: [
    '기본 설정에서 종료 위상 차는asin(0.2)와0.001 rad 이내이며 K=0에는 양의 결합 잠금 해가 표시되지 않습니다.',
    'At defaults the final phase difference is within0.001 rad of asin(0.2), while K=0 reports no positive-coupling locked solution.'
  ],
  explanation: [
    '결합은 위상 차에 복원 작용을 하지만 detuning은 지속적인 drift를 만듭니다.',
    'Coupling restores the phase difference while detuning produces persistent drift.'
  ],
  next: [
    '기준 설정을 Lab으로 전달하고 한 변수씩 바꾸어 수렴과 해석의 범위를 확인하세요.',
    'Transfer the baseline to Lab and vary one parameter at a time to test convergence and the scope of interpretation.'
  ],
  glossary: [
    ['위상 잠금', 'Phase locking'],
    [
      '두 위상의 차가 일정해져 평균 각주파수가 같아지는 상태입니다.',
      'A state with constant phase difference and equal mean angular frequencies.'
    ]
  ],
  sources: [
    {
      path: 'src/physics/kuramoto.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/physics/kuramoto.ts.'
      ]
    },
    {
      path: 'src/product/adapters/physics/network.ts',
      locator: [
        '아래 함수와 타입의 실제 식·초기화·경계·단위·실패 조건을 대조했습니다.',
        'Checked the preserved native equations, initialization, boundaries, unit conventions and failure conditions in src/product/adapters/physics/network.ts.'
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
    title: 'Huygens’ clocks',
    authors: 'M. Bennett, M. F. Schatz, H. Rockwood, K. Wiesenfeld',
    url: 'https://doi.org/10.1098/rspa.2001.0888',
    locator: [
      '시계의 물리적 결합과 위상 축약의 적용 범위를 구분합니다.',
      'The physical clock experiment supplies context; native phase-reduction equations and their limitations are checked separately.'
    ]
  }
});
