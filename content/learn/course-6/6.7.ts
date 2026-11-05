import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '6.7',
  summary: [
    '대칭 해의 Newton을 반복하면 왜 새 가지로 가지 않을까요? 공용 branch-switch 기준에서 양·음 seed와 분리 잔차를 확인합니다.',
    'Why does Newton on a symmetric solution fail to reveal new branches? Inspect signed seeds and separation residuals in the shared branch-switch benchmark.'
  ],
  objectives: [
    [
      '대칭 가지에서 이탈하는 seed와 원 가지 재수렴을 구별합니다.',
      'Distinguish off-branch seeds from convergence back to the symmetric branch.'
    ],
    [
      '대칭 깨짐 정규형의 두 가지와 안정성을 해석합니다.',
      'Interpret the paired branches and stability of a symmetry-breaking normal form.'
    ]
  ],
  assumptions: [
    '독립 무차원 pitchfork 잔차 G=x*(lambda−x^2)입니다. 공용 native Newton은 x→x+G 맵의 고정점을 구합니다. 이 맵 안정성은 물리 구동 진자의 안정성과 다릅니다.',
    'Use the independent dimensionless pitchfork residual G=x*(lambda−x^2). Shared Newton solves fixed points of x→x+G. Stability of this benchmark map differs from stability of the physical pendulum.'
  ],
  concepts: [
    {
      id: 'symmetry',
      title: ['대칭과 이탈 방향', 'Symmetry and departure directions'],
      body: [
        'G는 x의 부호를 바꾸면 부호가 바뀌므로 비영 해는 양·음 쌍입니다. x=0에서만 시작하면 그 가지에 머무르기 쉽습니다. 공용 도구는 ±epsilon으로 시작하고 잔차뿐 아니라 비영 분리와 seed 부호를 검사합니다.',
        'Odd symmetry of G makes nonzero solutions occur in signed pairs. Starting at zero tends to remain on the symmetric branch. The shared tool starts at±epsilon and verifies residual, nonzero separation and branch sign.'
      ]
    },
    {
      id: 'failure',
      title: ['수렴해도 전환 실패일 수 있음', 'Convergence can still fail to switch'],
      body: [
        'Newton이 x=0으로 돌아오면 원래 방정식은 만족하지만 새 가지를 찾은 것은 아닙니다. seed가 너무 작거나 반복이 부족하면 이런 실패가 생깁니다. 안정성은 명시한 기준 맵의 도함수로 판정하며 모든 물리계의 pitchfork를 자동 분류하지 않습니다.',
        'Returning to zero satisfies the equation but fails to find a new branch. Tiny seeds or insufficient iterations can cause this failure. Stability is evaluated from the explicitly defined benchmark map derivative, without automatically classifying pitchforks in arbitrary physical systems.'
      ]
    }
  ],
  equations: [
    {
      id: 'branches',
      title: ['1. 비영 가지의 조건', '1. Nonzero branch condition'],
      expression: 'x^2 = lambda',
      explanation: [
        'x가0이 아닌 경우 G=0을 x로 나누어 얻습니다. 따라서 양의 lambda에서±sqrt(lambda)가 가능합니다.',
        'For nonzero x, divide G=0 by x. Positive lambda therefore admits±sqrt(lambda).'
      ],
      symbols: [
        ['x', '1', '정규형 상태', 'Normal-form state'],
        ['lambda', '1', '정규형 매개변수', 'Normal-form parameter']
      ]
    },
    {
      id: 'map',
      title: ['2. 기준 맵의 승수', '2. Benchmark-map multiplier'],
      expression: 'multiplier = 1+lambda-3*x^2',
      explanation: [
        'x+G를 x로 미분합니다. 연속 RHS 고유값이 아니라 한 번 반복의 무차원 승수입니다.',
        'Differentiate x+G with respect to x. This is a dimensionless iteration multiplier, not an ODE eigenvalue.'
      ],
      symbols: [
        ['multiplier', '1', '맵의 선형 승수', 'Map multiplier'],
        ['lambda', '1', '매개변수', 'Parameter'],
        ['x', '1', '해 상태', 'Solution state']
      ]
    }
  ],
  checks: [
    {
      prompt: ['잔차0이고 x=0이면 새 가지인가요?', 'Does zero residual at x=0 establish switching?'],
      correct: ['아닙니다. 원 가지와 분리를 확인해야 합니다.', 'No. Check separation from the reference branch.'],
      incorrect: ['잔차만0이면 항상 새 가지입니다.', 'Zero residual always means a new branch.'],
      explanation: ['원 가지도 원래 방정식의 해입니다.', 'The reference branch also satisfies the original equation.']
    },
    {
      prompt: ['두 비영 가지의 대칭 관계는?', 'How are the nonzero branches related?'],
      correct: ['같은 lambda에서 x의 부호가 반대입니다.', 'They have opposite state signs at the same lambda.'],
      incorrect: ['두 가지는 항상 서로 다른 lambda만 가집니다.', 'They always occur at different parameter values.'],
      explanation: ['잔차의 홀수 대칭이±쌍을 만듭니다.', 'Odd residual symmetry produces signed pairs.']
    }
  ],
  prediction: [
    'seed epsilon을 작게 줄이면 잔차 수렴과 원 가지로부터 분리가 항상 동시에 좋아질까요?',
    'Will shrinking seed epsilon always improve residual convergence and separation from the reference branch together?'
  ],
  action: [
    '기본 ±epsilon 가지를 실행해 state0·잔차·stable을 읽고 epsilon만 바꾸어 원 가지로의 재수렴 여부를 비교합니다.',
    'Run the signed seed branches, inspect state0, residual and stability, then change only epsilon and check for returns to the reference branch.'
  ],
  expected: [
    '검증된 비영 해는 x^2≈lambda이고 양·음 쌍입니다. 미분 승수는1−2lambda이며 기본 구간에서 절댓값이1보다 작습니다.',
    'Verified nonzero solutions satisfy x^2≈lambda in signed pairs. Their map multiplier is1−2lambda, with modulus below one over the default range.'
  ],
  explanation: [
    '새 가지의 분리와 원래 방정식 잔차를 둘 다 요구하면 단순 재수렴을 성공으로 오해하지 않습니다.',
    'Requiring both branch separation and the original residual prevents interpreting simple reconvergence as successful switching.'
  ],
  next: [
    '6.8에서는 실제 구동 진자의−1 승수 방향에서 주기2 가지를 시작하고 후속 반환값을 추적합니다.',
    'In6.8, seed a real driven-pendulum period-two branch along the−1 multiplier direction and follow subsequent returns.'
  ],
  glossary: [
    ['가지 전환', 'Branch switching'],
    [
      '검증된 분기 근처에서 원 branch를 떠나는 seed를 사용해 다른 해 branch를 찾는 절차입니다.',
      'Using an off-branch seed near a verified bifurcation to locate a different solution branch.'
    ]
  ],
  sources: [
    {
      path: 'src/product/adapters/analysis/stability/native-benchmarks.ts',
      locator: [
        'pitchfork-normal-form의±seed와 비영 해 분리·실패 조건을 대조합니다.',
        'Check signed seeds, off-branch separation and failure conditions in pitchfork-normal-form.'
      ]
    },
    {
      path: 'src/chaos/branchSwitching.ts',
      locator: [
        '고유벡터 seed와 원 가지 재수렴 거부의 공용 구현을 대조합니다.',
        'Compare native eigenvector seeding and rejection of returns to the reference branch.'
      ]
    }
  ],
  external: {
    title: 'Elements of Applied Bifurcation Theory',
    authors: 'Yuri A. Kuznetsov',
    url: 'https://www.ma.imperial.ac.uk/~dturaev/kuznetsov.pdf',
    locator: [
      '국소 분기와 대칭 해 가지를 설명한3장·4장의 정규형을 참고합니다.',
      'Consult the local bifurcation and symmetric-branch normal forms in Chapters3 and4.'
    ]
  }
});
