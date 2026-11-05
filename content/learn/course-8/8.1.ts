import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '8.1',
  summary: [
    '입력 하나만 바꾼 두 실제 run을 만들고, 같은 시간의 출력 차이와 수치 오차를 구별합니다.',
    'Build two native runs differing in one input and distinguish endpoint differences from numerical error.'
  ],
  objectives: [
    ['대조군과 비교군의 동일·변경 입력을 명시한다.', 'Identify the fixed and changed inputs in a paired comparison.'],
    [
      '원 run에서 endpoint 차이 artifact까지 계보를 추적한다.',
      'Trace both original runs into their endpoint difference artifact.'
    ]
  ],
  assumptions: [
    '질점 이중진자, 두 각도는 아래 수직선 기준 rad, 각속도는 rad/s입니다. 질량·길이·중력·RK4 step과 관찰 기간을 고정하고 첫 각도만 바꿉니다. 같은 기간의 차이는 인과성 또는 참해 오차를 자동 인증하지 않습니다.',
    'The point-mass double pendulum uses angles from downward vertical in rad and angular velocities in rad/s. Masses, lengths, gravity, RK4 step and duration remain fixed while the first angle changes. A matched-time difference does not certify causality or exact-solution error.'
  ],
  concepts: [
    {
      id: 'paired-design',
      title: ['왜 한 입력만 바꾸는가', 'Why change one input?'],
      body: [
        '두 run의 입력을 복사한 뒤 theta1만 교체하면 관찰 차이를 여러 변경에 나누어 설명할 필요가 줄어듭니다. native builder는 비교군 입력과 원본 입력 ID를 각각 남깁니다. paired의 start는 대조군을 재설정하지 않으며 원래 값이 대조군입니다.',
        'Copying the baseline and replacing theta1 makes the change interpretable without several simultaneous interventions. The native builder retains separate child inputs and the original input ID. A paired axis start does not overwrite the baseline: the existing input is the control.'
      ]
    },
    {
      id: 'difference-limit',
      title: ['차이의 의미와 실패 조건', 'Meaning and limits of a difference'],
      body: [
        '같은 종료 시각에서 비교군−대조군을 계산합니다. 초기 차이 0이면 같은 결정론적 입력이므로 endpoint 차이는 0입니다. 비영 차이는 조건 변화의 유한시간 응답이며 불확실성·절단오차의 추정치가 아닙니다. 상호작용을 알기 위해서는 여러 입력의 factorial 설계가 필요합니다.',
        'Subtract control from comparison at the same endpoint. Zero perturbation gives identical deterministic inputs and a zero difference. A nonzero value describes finite-time response to the changed condition, rather than uncertainty or truncation error. Interactions require a design varying multiple inputs.'
      ]
    }
  ],
  equations: [
    {
      id: 'change',
      title: ['입력 차이를 정의', 'Define the input intervention'],
      expression: 'qB = qA + dq',
      explanation: [
        '같은 기준 각도 qA에 지정한 dq를 더해 비교군 qB를 만듭니다. 세 값은 모두 rad입니다.',
        'Add the specified angle intervention dq to baseline qA to obtain comparison qB. All three are in rad.'
      ],
      symbols: [
        ['qA', 'rad', '대조군 첫 각도', 'control first angle'],
        ['qB', 'rad', '비교군 첫 각도', 'comparison first angle'],
        ['dq', 'rad', '지정 입력 차이', 'specified input intervention']
      ]
    },
    {
      id: 'difference',
      title: ['일치한 시각의 출력 차이', 'Matched-time output difference'],
      expression: 'dY = yB - yA',
      explanation: [
        '같은 종료 시각의 첫 각도 yB에서 yA를 뺍니다. 차이의 단위는 원 관측량의 rad를 유지합니다.',
        'Subtract the control endpoint yA from comparison endpoint yB at the same final time. The difference retains the observable unit rad.'
      ],
      symbols: [
        ['dY', 'rad', 'endpoint 차이', 'endpoint difference'],
        ['yA', 'rad', '대조군 끝 각도', 'control endpoint'],
        ['yB', 'rad', '비교군 끝 각도', 'comparison endpoint']
      ]
    }
  ],
  prediction: [
    '첫 각도 차이를 0으로 두면 두 실제 run의 마지막 각도가 어떻게 달라질지 먼저 예측하세요.',
    'Predict the endpoint difference when the initial first-angle intervention is set to zero.'
  ],
  action: [
    '기본 차이로 실행한 뒤 차이를 0으로 바꾸어 다시 계산하고 run 입력과 paired 차이를 비교하세요.',
    'Run the default intervention, then set it to zero and compare child inputs and paired endpoint differences.'
  ],
  expected: [
    '차이가 0일 때 paired-difference는 정확히 0이고 완료 run은 항상 2개입니다. 기본 비영 차이에는 유한한 응답이 나타납니다.',
    'A zero intervention gives exactly zero paired-difference and two completed runs. The default nonzero intervention produces a finite response.'
  ],
  explanation: [
    '동일한 공용 엔진·입력·기간의 결정론적 반복은 같은 결과를 내며, 비영 입력 차이는 별도 비교군으로 계산됩니다.',
    'Deterministic repetition with the same shared engine, input and duration returns the same result; a nonzero intervention is calculated as a separate child run.'
  ],
  next: [
    '다음에는 두 입력을 함께 바꾸어 상호작용을 조사하고 step을 줄여 관찰 차이가 수치 설정에 견고한지 확인하세요.',
    'Next vary two inputs to investigate interactions, then reduce the step independently to check robustness to numerical settings.'
  ],
  glossary: [
    ['대조군', 'Control run'],
    [
      '명시한 비교에서 기준으로 고정하는 원래 실험입니다.',
      'The original experiment held as the baseline for a specified comparison.'
    ]
  ],
  sources: [
    {
      path: 'src/product/lab/experiments/builders.ts',
      locator: [
        'buildBatch의 paired 원본 보존과 child 입력',
        'buildBatch paired source preservation and child experiment construction'
      ]
    },
    {
      path: 'src/product/lab/experiments/aggregate.ts',
      locator: [
        'aggregateBatch의 pairedDifference 계산',
        'aggregateBatch pairedDifference construction at the final recorded endpoint'
      ]
    }
  ],
  external: {
    title: 'NIST/SEMATECH e-Handbook: One Variable at a Time',
    authors: 'NIST/SEMATECH',
    url: 'https://www.itl.nist.gov/div898/handbook/pri/section2/pri212.htm',
    locator: [
      '5.2.1.2의 상호작용과 OFAT 한계',
      'Section 5.2.1.2: interactions and limitations of one-factor-at-a-time designs'
    ]
  },
  checks: [
    {
      prompt: ['paired 차이가 비영이면 무엇을 말할 수 있나요?', 'What does a nonzero paired difference establish?'],
      correct: [
        '지정 조건과 유한 기간에서 두 출력이 다르다.',
        'The two outputs differ for the specified finite experiment.'
      ],
      incorrect: [
        '정확한 수치 오차와 전역 인과성을 증명했다.',
        'Exact numerical error and global causality have been proved.'
      ],
      explanation: [
        '입력 통제는 해석을 돕지만 참해 비교나 통계적 인과 실험을 대체하지 않습니다.',
        'Controlled inputs aid interpretation but do not replace exact-reference comparison or a statistical causal experiment.'
      ]
    },
    {
      prompt: [
        '입력 차이가 0이면 이 결정론적 비교는?',
        'What happens with a zero intervention in this deterministic comparison?'
      ],
      correct: ['두 입력과 endpoint가 같다.', 'Both inputs and endpoints agree.'],
      incorrect: [
        'seed 이름 때문에 반드시 다른 물리 궤적이 생긴다.',
        'The seed label necessarily generates different physical trajectories.'
      ],
      explanation: [
        '결정론적 진자에서 사용하지 않는 설계 seed는 운동방정식을 무작위화하지 않습니다.',
        'An unused design seed does not randomize the deterministic pendulum equations.'
      ]
    }
  ]
});
