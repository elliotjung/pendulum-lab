import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '6.11',
  summary: [
    '색깔이 바뀌는2매개변수 지도는 곧 여차원2 분기점일까요? 실제 물리 지도와 정확한 독립 cusp 곡선을 나란히 비교합니다.',
    'Does a color boundary in a two-parameter map identify a codimension-two bifurcation? Compare an actual physical map with exact independent cusp curves.'
  ],
  objectives: [
    [
      '유한시간 상태 지도와 분기곡선 continuation의 차이를 설명합니다.',
      'Distinguish finite-time regime maps from continuation of bifurcation curves.'
    ],
    [
      'cusp 정규형의 두 fold 곡선과 만남 조건을 유도합니다.',
      'Derive the two fold curves and meeting conditions of a cusp normal form.'
    ]
  ],
  assumptions: [
    '실제 구동 진자는 A·damping 평면의 짧은 Lyapunov 부호 지도입니다. 별도 무차원 cusp G=a+b*x−x^3의 해석 곡선은 교육용 대수 기준이며 물리계에 이식하지 않습니다.',
    'The actual driven pendulum supplies a finite-time Lyapunov-sign map in A–damping space. Separate dimensionless cusp curves for G=a+b*x−x^3 are an analytic algebraic benchmark, without identifying them with the physical model.'
  ],
  concepts: [
    {
      id: 'physical',
      title: ['지도에서 얻는 것과 부족한 것', 'What the physical map supplies and omits'],
      body: [
        '공용 codimTwoDiagram은 각 셀에서 초기조건을 정해 유한시간 최대 지수를 구합니다. 구동 위상 중립 방향 때문에 안정 주기 운동도0 부근일 수 있습니다. 경계는 해상도·관찰기간에 의존하며 실제 두 분기곡선의 교차를 인증하려면 각 곡선의 continuation과 임계조건이 필요합니다.',
        'Shared codimTwoDiagram estimates a finite-time maximal exponent at each cell. Stable periodic motion can be near zero because of the neutral forcing phase. Boundaries depend on grid and duration; certifying a meeting of physical bifurcation curves requires continuation and critical conditions for each curve.'
      ]
    },
    {
      id: 'cusp',
      title: ['독립 정규형에서 두 fold가 만나는 곳', 'Two folds meeting in an independent normal form'],
      body: [
        'cusp 기준에서는 G=0과 상태 도함수 Gx=0을 함께 풀어 두 fold 곡선을 정확히 얻습니다. b>0에서 x=±sqrt(b/3)이고 a=∓2*b^(3/2)/(3sqrt3)입니다. 두 곡선은 원점에서 만나 Gxx도0이 됩니다. 이 정규형은 출처가 있는 별도 대수 기하이며 실제 진자의 정상형 계수를 계산했다고 표시하지 않습니다.',
        'For the cusp benchmark, solve G=0 and Gx=0 together to obtain exact fold curves. For positive b, x=±sqrt(b/3) and a=∓2*b^(3/2)/(3sqrt3). They meet at the origin, where Gxx also vanishes. This separately sourced algebraic geometry does not claim computed normal-form coefficients for the physical pendulum.'
      ]
    }
  ],
  equations: [
    {
      id: 'fold',
      title: ['1. fold 상태 조건', '1. Fold-state condition'],
      expression: 'b = 3*x^2',
      explanation: [
        'G=a+b*x−x^3를 상태로 미분해0으로 놓습니다. 모든 정규형 좌표는 무차원입니다.',
        'Differentiate G=a+b*x−x^3 in state and set the derivative to zero. All normal-form coordinates are dimensionless.'
      ],
      symbols: [
        ['b', '1', '두번째 정규형 매개변수', 'Second normal-form parameter'],
        ['x', '1', '정규형 상태', 'Normal-form state']
      ]
    },
    {
      id: 'curve',
      title: ['2. fold의 매개변수 곡선', '2. Fold parameter curve'],
      expression: 'a = -2*x^3',
      explanation: [
        'b=3x^2를 G=0에 대입합니다. 양·음 x가 두 fold이며 원점에서 합류합니다.',
        'Substitute b=3x^2 into G=0. Positive and negative x give two folds that meet at the origin.'
      ],
      symbols: [
        ['a', '1', '첫 정규형 매개변수', 'First normal-form parameter'],
        ['x', '1', 'fold 상태', 'Fold state']
      ]
    }
  ],
  checks: [
    {
      prompt: ['Lyapunov 색 경계만으로 cusp인가요?', 'Does a Lyapunov color boundary establish a cusp?'],
      correct: [
        '아닙니다. 해 branch와 퇴화 조건 검사가 더 필요합니다.',
        'No. Solution branches and degeneracy conditions need checks.'
      ],
      incorrect: ['모든2매개변수 색 경계는 cusp입니다.', 'Every two-parameter color boundary is a cusp.'],
      explanation: [
        '유한시간 동역학 분류와 국소 branch 특이점은 다릅니다.',
        'Finite-time regime classification differs from a local branch singularity.'
      ]
    },
    {
      prompt: ['독립 cusp에서 fold를 찾는 조건은?', 'What conditions locate folds in the independent cusp?'],
      correct: ['G=0과 Gx=0을 함께 만족해야 합니다.', 'Both G=0 and Gx=0 must hold.'],
      incorrect: ['G의 부호만 바뀌면 충분합니다.', 'A sign change of G alone is sufficient.'],
      explanation: [
        '평형 조건과 상태 Jacobian의 특이 조건이 함께 필요합니다.',
        'The equilibrium and singular-state-Jacobian conditions are both required.'
      ]
    }
  ],
  prediction: [
    '물리 지도 resolution을 늘리면 독립 cusp의 원점과 fold 곡선도 같이 변해야 할까요?',
    'Should increasing the physical-map resolution move the independent cusp origin and fold curves?'
  ],
  action: [
    '실제 A·damping 지도와 cusp 잔차 표를 실행합니다. resolution만 바꾸어 물리 경계의 변화와 해석 곡선의 불변성을 비교합니다.',
    'Run the actual A–damping map and cusp residual table. Change only resolution and compare physical-boundary changes against unchanged analytic curves.'
  ],
  expected: [
    '물리 지도 표본 수는 resolution의 제곱입니다. 독립 cusp 두 fold는 원점에서 만나며 G와 Gx 잔차는 반올림 오차 수준입니다.',
    'Physical cell count is resolution squared. The independent cusp folds meet at the origin with G and Gx residuals at roundoff scale.'
  ],
  explanation: [
    '두 그림은 계산의 목적과 대상이 다릅니다. 물리계에 cusp가 있다고 단정하려면 현재 실험에 없는 추가 continuation 증거가 필요합니다.',
    'The two displays have different targets. Claiming a cusp in the physical system requires additional continuation evidence beyond this experiment.'
  ],
  next: [
    '6.12에서는 국소 branch 대신 초기조건 영역의 경계와 해상도 의존 불확실성을 조사합니다.',
    'In6.12, move from local branches to initial-condition region boundaries and resolution-dependent uncertainty.'
  ],
  glossary: [
    ['여차원2 기준점', 'Codimension-two organizing point'],
    [
      '두 독립 매개변수 조건이 필요한 국소 분기 구조의 기준점입니다. 색 지도만으로 식별하지 않습니다.',
      'A local bifurcation structure requiring two independent parameter conditions, not identified from a color map alone.'
    ]
  ],
  sources: [
    {
      path: 'src/chaos/codimTwo.ts',
      locator: [
        '물리 지도의 유한시간 지수·중립 방향·추가 continuation 전제를 확인합니다.',
        'Check finite-time exponents, neutral-direction limits and the need for additional continuation.'
      ]
    },
    {
      path: 'src/product/adapters/analysis/stability/native-current.ts',
      locator: [
        '실패 셀과 실제 물리 매개변수·위상을 보존한 지도 경로를 확인합니다.',
        'Inspect map execution preserving failed cells, actual physical parameters and phase.'
      ]
    }
  ],
  external: {
    title: 'Cusp bifurcation',
    authors: 'Yuri A. Kuznetsov',
    url: 'https://www.scholarpedia.org/article/Cusp_bifurcation',
    locator: [
      'One-dimensional Case의 G=a+b*x−x^3와 두 saddle-node 곡선을 대조합니다.',
      'Compare G=a+b*x−x^3 and its two saddle-node curves under One-dimensional Case.'
    ]
  }
});
