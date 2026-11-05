import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '6.6',
  summary: [
    '매개변수가 되돌아가는 fold에서 추적을 계속하려면 무엇을 바꿔야 할까요? 정확한 대수 기준 문제로 실제 arclength를 실행합니다.',
    'How can tracking continue when a parameter turns at a fold? Run actual arclength continuation on an exact algebraic benchmark.'
  ],
  objectives: [
    [
      '정칙 branch 접선과 추가 arclength 제약의 역할을 설명합니다.',
      'Explain regular branch tangents and the added arclength constraint.'
    ],
    [
      'fold 통과의 수치 증거를 물리 안정성 주장과 구별합니다.',
      'Distinguish numerical fold passage from claims of physical stability.'
    ]
  ],
  assumptions: [
    '독립 무차원 대수 기준 G=x^2−lambda=0입니다. 현재 구동 진자의 branch가 아닙니다. 시작 해는 x=1,lambda=1이고 정확한 fold 원점에서 시작하지 않습니다.',
    'Use the independent dimensionless algebraic benchmark G=x^2−lambda=0. This is not the current driven-pendulum branch. Start at x=1,lambda=1, away from the singular fold origin.'
  ],
  concepts: [
    {
      id: 'geometry',
      title: ['매개변수 그래프의 실패', 'Failure of a parameter graph'],
      body: [
        'lambda=x^2는 x를 따라서는 매끈하지만 x를 lambda의 한 함수로 놓으면 원점에서 두 가지가 합쳐집니다. 상태 도함수2x가0이 되므로 고정 lambda Newton이 특이해집니다. 해와 매개변수의 접선 방향으로 예측하면 이 투영의 특이점을 피해 갈 수 있습니다.',
        'The curve lambda=x^2 is smooth in x, but its two branches merge at the origin when viewed as x(lambda). The state derivative2x vanishes, making fixed-parameter Newton singular. Prediction in the joint state–parameter tangent avoids that projection singularity.'
      ]
    },
    {
      id: 'constraint',
      title: ['추가 제약과 보정', 'Added constraint and correction'],
      body: [
        'arclength는 새 점의 원래 잔차와 예측 접선에 대한 추가 제약을 함께 풉니다. fold를 지난 뒤 lambda 접선의 부호가 바뀌는지, x가 다른 부호 가지로 가는지, 실제 잔차가 작은지 확인합니다. ds가 너무 크면 보정 실패나 fold 위치 오차가 생깁니다.',
        'Arclength solves the original residual plus a constraint relative to the predicted tangent. Verify a parameter-tangent sign change, motion to the opposite x branch and small actual residuals. Large ds can cause correction failures or a poorly localized fold.'
      ]
    }
  ],
  equations: [
    {
      id: 'fold',
      title: ['1. fold의 해 곡선', '1. Fold solution curve'],
      expression: 'lambda = x^2',
      explanation: [
        'x와 lambda는 정규형의 무차원 좌표입니다. 양의 lambda에 두 해가 있고0에서 합쳐집니다.',
        'Both x and lambda are dimensionless normal-form coordinates. Positive lambda has two solutions merging at zero.'
      ],
      symbols: [
        ['lambda', '1', '정규형 매개변수', 'Normal-form parameter'],
        ['x', '1', '정규형 상태', 'Normal-form state']
      ]
    },
    {
      id: 'tangent',
      title: ['2. 곡선 접선', '2. Curve tangent'],
      expression: 'tangentLambda = 2*x*tangentX',
      explanation: [
        'G=0을 곡선 길이에 따라 미분하면 얻습니다. 원점에서 매개변수 접선은0이지만 상태 접선은0일 필요가 없습니다.',
        'Differentiate G=0 along the curve. At the origin the parameter tangent vanishes while the state tangent need not.'
      ],
      symbols: [
        ['tangentLambda', '1', '매개변수 접선 성분', 'Parameter tangent'],
        ['x', '1', '현재 상태', 'Current state'],
        ['tangentX', '1', '상태 접선 성분', 'State tangent']
      ]
    }
  ],
  checks: [
    {
      prompt: ['fold에서 lambda 접선이0이면 곡선이 끝나나요?', 'Does zero parameter tangent at a fold end the curve?'],
      correct: ['아닙니다. 상태 방향으로 계속될 수 있습니다.', 'No. The curve can continue in the state direction.'],
      incorrect: [
        '반드시 모든 해가 사라져 곡선이 끝납니다.',
        'All solutions necessarily disappear and the curve ends.'
      ],
      explanation: [
        '투영의 특이성과 전체 해 곡선의 정칙성을 구별합니다.',
        'A singular projection differs from a singular full solution curve.'
      ]
    },
    {
      prompt: ['이 기준 문제의 stable 표시는 물리 안정성인가요?', 'Does this benchmark establish physical stability?'],
      correct: [
        '해의 기하만 추적하며 물리 안정성을 주장하지 않습니다.',
        'It tracks solution geometry without physical stability claims.'
      ],
      incorrect: [
        '모든 실제 진자의 fold 안정성을 인증합니다.',
        'It certifies fold stability for every physical pendulum.'
      ],
      explanation: [
        '대수 잔차에는 별도 시간 동역학이 주어지지 않았습니다.',
        'An algebraic residual alone does not define time dynamics.'
      ]
    }
  ],
  prediction: [
    '음의 매개변수 방향으로 출발해 충분히 추적하면 lambda와 x는 각각 어떤 부호 변화를 보일까요?',
    'When starting toward decreasing parameter and tracking far enough, how should lambda and x change sign?'
  ],
  action: [
    '기본 arclength36단계를 실행하고 x의 부호와 tangentLambda를 확인합니다. ds를 줄여 fold의 최소 lambda와 잔차를 비교합니다.',
    'Run the default36 arclength steps and inspect x and tangentLambda. Reduce ds and compare the minimum lambda and residuals.'
  ],
  expected: [
    '충분한 곡선 길이를 진행하면 x가 양수에서 음수로 넘어가고 lambda는0 근처에서 감소 뒤 증가합니다. 모든 검증점은 x^2≈lambda를 만족합니다.',
    'After sufficient arclength, x crosses from positive to negative while lambda decreases toward zero then increases. Verified points satisfy x^2≈lambda.'
  ],
  explanation: [
    '단계 수와 ds의 곱이 너무 작으면 fold에 아직 도달하지 않을 수 있습니다. 통과 여부와 보정 수렴을 따로 읽습니다.',
    'If step count times ds is too small, the trace may not reach the fold. Distinguish passage from correction convergence.'
  ],
  next: [
    '6.7에서는 단일 곡선의 접힘을 넘어 대칭 해에서 다른 해 가지로 전환하는 seed를 검사합니다.',
    'In6.7, go beyond turning on one curve and test seeds that leave a symmetric solution for different branches.'
  ],
  glossary: [
    ['Pseudo-arclength', 'Pseudo-arclength'],
    [
      '상태와 매개변수의 접선 좌표를 써서 해 branch를 추적하는 국소 길이 조건입니다.',
      'A local length condition that tracks a solution branch in joint state–parameter tangent coordinates.'
    ]
  ],
  sources: [
    {
      path: 'src/product/adapters/analysis/stability/native-benchmarks.ts',
      locator: [
        'fold-normal-form과 continueArclength 잔차·실패·접선 기록을 확인합니다.',
        'Inspect fold-normal-form execution and continueArclength residual, failure and tangent records.'
      ]
    },
    {
      path: 'src/chaos/arclength.ts',
      locator: [
        '공용 predictor-corrector와 추가 접선 제약을 대조합니다.',
        'Check the shared predictor-corrector and additional tangent constraint.'
      ]
    }
  ],
  external: {
    title: 'Saddle-node bifurcation',
    authors: 'Yuri A. Kuznetsov',
    url: 'https://www.scholarpedia.org/article/Saddle-node',
    locator: [
      '정규형과 두 평형의 합류를 설명한 One-dimensional Case를 대조합니다.',
      'Compare the normal form and collision of two equilibria under One-dimensional Case.'
    ]
  }
});
