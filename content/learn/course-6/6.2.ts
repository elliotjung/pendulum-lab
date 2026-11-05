import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '6.2',
  summary: [
    '두 주기 뒤 돌아온다고 해서 반드시 주기2 궤도일까요? 실제 Newton 잔차와 원시 주기 중복 제거를 관찰합니다.',
    'Does returning after two periods imply a primitive period-two orbit? Inspect actual Newton residuals and primitive-cycle deduplication.'
  ],
  objectives: [
    [
      'shooting 잔차를 반환 맵의 고정점 방정식으로 유도합니다.',
      'Derive a shooting residual from the return-map fixed-point equation.'
    ],
    ['수렴과 원시 주기 판정을 구별합니다.', 'Distinguish numerical convergence from primitive-period classification.']
  ],
  assumptions: [
    '매끈한 sine 구동 단일 진자, 고정 구동 위상 단면입니다. theta·omega의 혼합 infinity norm 잔차는 하나의 SI 물리량이 아닙니다. 반환 맵은 native RK4를 사용합니다.',
    'Use a smooth sine-driven pendulum at a fixed forcing phase. The theta–omega infinity-norm residual mixes units and is not one SI quantity. The return map uses native RK4.'
  ],
  concepts: [
    {
      id: 'shooting',
      title: ['궤도 문제를 근 찾기로', 'An orbit problem as root finding'],
      body: [
        '초기 상태를 한 주기 적분한 결과에서 초기 상태를 빼면 shooting 잔차가 됩니다. 이를 초기 상태로 미분하면 반환 맵 Jacobian에서 항등행렬을 뺀 행렬입니다. Newton은 그 선형계를 풀어 초기 추정을 보정하며 실제 반환 상태의 잔차를 다시 확인합니다.',
        'Subtract the initial state from its one-period image to form the shooting residual. Its derivative is the return-map Jacobian minus identity. Newton solves that linear system, corrects the initial guess and rechecks the actual returned-state residual.'
      ]
    },
    {
      id: 'primitive',
      title: ['수치 실패와 중복 주기의 구별', 'Numerical failure and duplicate periods'],
      body: [
        '주기1 해는 두 주기와 네 주기 뒤에도 돌아옵니다. 따라서 P^2(x)=x의 작은 잔차만으로 원시 주기2를 주장할 수 없습니다. 공용 periodic orbit database는 같은 cycle과 더 짧은 주기를 검사합니다. 반복 수가 부족하거나 Jacobian이 특이하면 마지막 잔차와 미수렴 상태를 남깁니다.',
        'A period-one solution also returns after two or four periods. A small P^2(x)−x residual therefore does not establish primitive period two. The shared orbit database checks repeated cycles and lower periods. Iteration limits or singular Jacobians retain nonconvergence and the final residual.'
      ]
    }
  ],
  equations: [
    {
      id: 'residual',
      title: ['1. 각도 성분 반환 잔차', '1. Angular return residual'],
      expression: 'angleResidual = returnedTheta-theta',
      explanation: [
        '선택한 반환 횟수 뒤의 각도에서 초기 각도를 뺍니다. 회전 궤도의2pi 동치가 아닌 절대 각도 반환 조건입니다.',
        'Subtract the initial angle from the selected return image. This uses absolute-angle return, without identifying rotational states modulo2pi.'
      ],
      symbols: [
        ['angleResidual', 'rad', '각도 성분 잔차', 'Angular residual'],
        ['returnedTheta', 'rad', '반환된 각도', 'Returned angle'],
        ['theta', 'rad', '초기 각도', 'Initial angle']
      ]
    },
    {
      id: 'step',
      title: ['2. 한 성분의 Newton 보정', '2. Scalar Newton correction'],
      expression: 'newTheta = theta-angleResidual/residualDerivative',
      explanation: [
        '결합 문제는 행렬 선형계를 풀지만 한 성분에서는 잔차를 무차원 도함수로 나누어 보정하는 구조입니다.',
        'The coupled problem solves a matrix system; in a scalar illustration, divide the residual by its dimensionless derivative.'
      ],
      symbols: [
        ['newTheta', 'rad', '수정된 초기 각도', 'Corrected initial angle'],
        ['theta', 'rad', '현재 추정 각도', 'Current guess'],
        ['angleResidual', 'rad', '각도 잔차', 'Angular residual'],
        ['residualDerivative', '1', '각도 잔차의 각도 도함수', 'Angular residual derivative']
      ]
    }
  ],
  checks: [
    {
      prompt: ['P^2의 작은 잔차만으로 주기2인가요?', 'Does a small P^2 residual prove period two?'],
      correct: ['더 짧은 주기를 배제해야 합니다.', 'Lower periods must be excluded.'],
      incorrect: ['네, 요청한 주기가 곧 원시 주기입니다.', 'Yes, the requested period is always primitive.'],
      explanation: [
        'P의 고정점도 P^2의 고정점이므로 중복 검사가 필요합니다.',
        'A fixed point of P is also fixed under P^2, requiring deduplication.'
      ]
    },
    {
      prompt: ['Newton 반복 한도에서 멈추면?', 'What if the Newton iteration limit is reached?'],
      correct: ['실제 잔차와 미수렴 상태를 읽습니다.', 'Inspect the actual residual and nonconvergence status.'],
      incorrect: [
        '마지막 추정을 검증된 궤도로 자동 승인합니다.',
        'Automatically accept the final guess as a verified orbit.'
      ],
      explanation: [
        '작은 보정과 작은 반환 잔차는 같은 조건이 아닙니다.',
        'A small update is not the same as a small return residual.'
      ]
    }
  ],
  prediction: [
    '기본 약한 구동에서 요청 주기를1에서2로 바꾸면 새로운 궤도가 반드시 하나 더 생길까요?',
    'Will changing the requested period from one to two necessarily produce an additional orbit at weak forcing?'
  ],
  action: [
    '기본 period2로 실행해 반환된 원시 주기와 잔차 이력을 읽고 iterations를1로 줄여 같은 초기 추정의 실패를 비교합니다.',
    'Run with period2, read the returned primitive period and residual history, then reduce iterations to1 and compare the same guess.'
  ],
  expected: [
    '기본 주기2 탐색은 주기1 중복을 식별할 수 있습니다. 반복 수가 작으면 잔차가 허용치를 넘을 수 있으며 그 결과는 미수렴으로 남습니다.',
    'The default period-two search can identify a period-one duplicate. A small iteration budget can leave residuals above tolerance, retained as nonconvergence.'
  ],
  explanation: [
    'shooting은 해를 찾는 국소 계산입니다. 존재·유일성·원시 주기·안정성은 각각 별도로 검사해야 합니다.',
    'Shooting is a local root computation. Existence, uniqueness, primitive period and stability require separate checks.'
  ],
  next: [
    '검증된 궤도의 잔차가 충분히 작아진 다음6.3에서 모노드로미와 Floquet 승수를 해석합니다.',
    'Once a verified orbit has a sufficiently small residual, interpret monodromy and Floquet multipliers in6.3.'
  ],
  glossary: [
    ['원시 주기', 'Primitive period'],
    [
      '같은 궤도가 반복되기 위한 가장 작은 양의 반환 횟수입니다.',
      'The smallest positive number of returns needed for an orbit to repeat.'
    ]
  ],
  sources: [
    {
      path: 'src/product/adapters/analysis/stability/native-common.ts',
      locator: [
        'shootMap의 실제 잔차 재평가·단계별 Newton log를 확인합니다.',
        'Inspect shootMap returned-state residual checks and stepwise Newton logs.'
      ]
    },
    {
      path: 'src/chaos/periodicOrbitDatabase.ts',
      locator: [
        'buildPeriodicOrbitDatabase의 원시 주기와 cycle 중복 검사를 대조합니다.',
        'Check primitive-period reduction and cycle deduplication in buildPeriodicOrbitDatabase.'
      ]
    }
  ],
  external: {
    title: 'AUTO-07p: Continuation and bifurcation software for ordinary differential equations',
    authors: 'Eusebius J. Doedel and Bart E. Oldeman',
    url: 'https://github.com/auto-07p/auto-07p',
    locator: [
      '공식 프로젝트의 주기해 continuation과 boundary-value problem 정의를 참고합니다.',
      'Refer to the official project documentation for periodic-solution continuation and boundary-value formulations.'
    ]
  }
});
