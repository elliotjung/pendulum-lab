import { authorChaosLesson } from '../../../src/product/learn/authoring-course-five';

export default authorChaosLesson({
  id: '5.7',
  title: ['SALI와 FLI의 빠른 혼돈 판별', 'Rapid chaos detection with SALI and FLI'],
  question: [
    '모든 지수를 오래 계산하지 않고 불규칙 영역의 후보를 찾을 수 있을까요? 같은 초기조건 grid에서 두 접선의 정렬과 한 접선의 성장을 비교합니다.',
    'Can candidate irregular regions be found without a long full-spectrum computation? Compare two-vector alignment and tangent growth on the same initial-condition grid.'
  ],
  prerequisites: [
    '매끄러운 이중진자의 원래 초기조건과 공용 RK4 변분 적분을 사용합니다. 접선의 seed, 관찰 기간, 기록 간격을 고정하고 각도·각속도의 혼합 단위를 유지합니다.',
    'Use original initial states and the shared RK4 variational integrator for a smooth double pendulum. Fix tangent seed, duration and recording interval while retaining mixed angle–velocity units.'
  ],
  objectives: [
    [
      '두 정규화 접선의 합·차로 SALI를 해석합니다.',
      'Interpret SALI from the sum and difference of normalized tangents.'
    ],
    [
      'FLI와 SALI의 유한시간 오판 가능성과 계산 비용을 비교합니다.',
      'Compare finite-time misclassification and computational cost for FLI and SALI.'
    ]
  ],
  concepts: [
    {
      title: ['정렬과 성장은 다른 질문', 'Alignment and growth ask different questions'],
      body: [
        'SALI는 두 정규화 접선이 같은 방향 또는 반대 방향으로 정렬하는지를 측정합니다. FLI는 접선 크기의 빠른 성장을 관찰합니다. 두 지표를 같은 수치축이나 하나의 공통 문턱으로 직접 비교하지 않고 각각의 시간 변화와 초기조건 의존성을 읽습니다.',
        'SALI measures whether two normalized tangents align in the same or opposite directions. FLI measures rapid tangent growth. Read their histories and initial-state dependence instead of comparing them on one numerical axis or threshold.'
      ]
    },
    {
      title: ['SALI가 작아지는 이유', 'Why SALI can become small'],
      body: [
        '여러 접선이 가장 빠른 불안정 방향을 향하면 정규화 후 서로 나란해져 합 또는 차의 길이가 작아집니다. 규칙적인 흐름의 동작은 궤도와 자유도에 따라 다릅니다. 근접한 지수와 sticky 궤도에서는 정렬이 늦어 짧은 기간의 기준으로 잘못 분류할 수 있습니다.',
        'Tangents can approach the fastest unstable direction and become parallel after normalization, shrinking their sum or difference. Regular behavior depends on orbit and dimension. Nearly equal exponents and sticky motion can delay alignment and defeat short-run thresholds.'
      ]
    },
    {
      title: ['작은 격자의 역할', 'Role of a small grid'],
      body: [
        '첫 각도 세 값과 둘째 각도 세 값으로 만든 9개 초기조건에서 같은 기간의 SALI와 FLI를 계산합니다. 각도와 기간을 제한적으로 바꾸며 큰 basin 지도를 대신한다고 주장하지 않습니다. 적은 초기조건에서도 두 지표의 순위나 수렴 속도는 다를 수 있습니다.',
        'Evaluate SALI and FLI at nine initial states formed from three values of each angle over the same duration. This bounded grid does not replace a large basin map. Even a small set can show different rankings or convergence speeds.'
      ]
    },
    {
      title: ['실패 예제와 다음 탐구', 'Failure example and next inquiry'],
      body: [
        '짧은 기간의 큰 SALI는 장기 카오스를 배제하지 못합니다. 작은 SALI도 모델·기간·접선 조건과 함께 확인해야 합니다. 원래 native 시계열은 첫 step 뒤의 값을 t=0으로 표시하므로 실제 경과시간은 dt를 더한 값입니다. 5.8에서는 접선이 없는 관측량 기반 검사를 봅니다.',
        'A large short-time SALI does not exclude eventual chaos; a small value still requires model, duration and tangent checks. The native history labels its first post-step value t=0, so add dt for actual elapsed time. In 5.8, consider an observable-based test without tangents.'
      ]
    }
  ],
  equations: [
    {
      title: ['1. 정규화 접선의 정렬', '1. Alignment of normalized tangents'],
      expression: 'sali = (plusNorm+minusNorm-abs(plusNorm-minusNorm))/2',
      explanation: [
        '두 단위 접선의 합·차의 Euclidean 길이를 각각 plusNorm과 minusNorm이라 합니다. 작은 값을 고르는 연산은 두 값의 합에서 차의 절댓값을 빼고 2로 나눈 식과 같습니다. 같은 방향과 반대 방향 정렬을 모두 감지합니다.',
        'Let plusNorm and minusNorm be Euclidean lengths of the sum and difference of two unit tangents. Their minimum equals half their sum minus their absolute difference. This detects parallel and antiparallel alignment.'
      ],
      symbols: [
        ['sali', '1', '정렬 지표', 'Alignment index'],
        ['plusNorm', '1', '정규화 접선 합의 길이', 'Norm of tangent sum'],
        ['minusNorm', '1', '정규화 접선 차의 길이', 'Norm of tangent difference']
      ]
    },
    {
      title: ['2. 같은 기간을 비교하기', '2. Compare equal durations'],
      expression: 'physicalTime = nativeTime+step',
      explanation: [
        '기존 SALI·FLI 시계열의 t=0 규약을 보존합니다. 첫 측정은 한 step 뒤이므로 실제 경과시간을 해석할 때 step을 더합니다.',
        'Preserve the native SALI/FLI t=0 convention. Its first observation occurs after one step, so add step when interpreting elapsed time.'
      ],
      symbols: [
        ['physicalTime', 's', '실제 경과시간', 'Physical elapsed time'],
        ['nativeTime', 's', '원래 기록의 시간 표기', 'Native time label'],
        ['step', 's', '적분 시간 간격', 'Integration step']
      ]
    }
  ],
  term: ['sticky 궤도', 'Sticky orbit'],
  definition: [
    '혼돈 궤도가 규칙 영역 주변에 오래 머물러 짧은 관찰에서는 규칙적으로 보일 수 있는 경우입니다.',
    'A chaotic orbit can linger near a regular region and appear regular during a short observation.'
  ],
  checks: [
    {
      prompt: [
        '짧은 run에서 SALI가 크면 장기 카오스를 배제할 수 있나요?',
        'Does a large SALI in a short run exclude long-term chaos?'
      ],
      correct: ['배제할 수 없습니다.', 'It cannot exclude it.'],
      wrong: ['완전히 배제됩니다.', 'It rules it out completely.'],
      explanation: [
        'Sticky 영역과 느린 정렬은 유한시간 판정의 모호성을 만듭니다.',
        'Sticky motion and slow alignment create finite-time ambiguity.'
      ]
    },
    {
      prompt: ['FLI와 SALI에 같은 숫자 문턱을 써도 될까요?', 'Should FLI and SALI use the same numerical threshold?'],
      correct: [
        '정규화와 정의가 달라 각각 해석합니다.',
        'Interpret them separately because their definitions and normalizations differ.'
      ],
      wrong: ['항상 같은 문턱을 씁니다.', 'Always use the same threshold.'],
      explanation: ['정렬과 성장은 서로 다른 측정입니다.', 'Alignment and growth are distinct measurements.']
    }
  ],
  task: {
    prediction: [
      '9개 초기조건에서 두 지표의 순위가 같을까요?',
      'Will both indicators rank the nine initial states identically?'
    ],
    action: [
      '기본 run과 9점 격자를 읽고 duration만 늘립니다. 각 점의 최종 SALI와 FLI를 같은 seed·측정 기간과 함께 기록하세요.',
      'Inspect the default histories and nine-point grid, then increase only duration. Record final SALI and FLI together with seed and duration.'
    ],
    expected: [
      '9개 점 모두에서 유한한 지표가 나와야 하며 SALI는 0부터 sqrt(2) 범위입니다. 짧은 기본 기간에 카오스 분류를 강제하지 않습니다.',
      'All nine points must return finite indicators, with SALI between 0 and sqrt(2). No chaos classification is forced for the short default duration.'
    ],
    explanation: [
      '격자는 지표의 민감도를 탐색하며 수학적 카오스 증명이나 전체 영역 인증이 아닙니다.',
      'The grid explores diagnostic sensitivity; it does not prove chaos or certify an entire region.'
    ]
  },
  source: {
    title: [
      'Detecting order and chaos in Hamiltonian systems by the SALI method',
      'Detecting order and chaos in Hamiltonian systems by the SALI method'
    ],
    authors: 'Ch. Skokos, Ch. Antonopoulos, T. C. Bountis, M. N. Vrahatis',
    url: 'https://arxiv.org/abs/nlin/0404058',
    locator: [
      '정규화 접선의 정렬, 가장 큰 두 지수의 차이에 따른 SALI 감쇠, 보존계의 초기조건 탐색을 대조했습니다. 유한시간 제품 판정의 추가 한계를 명시합니다.',
      'Checked normalized-tangent alignment, SALI decay from the difference of leading exponents and initial-condition exploration in conservative systems. Additional finite-time product limits are explicit.'
    ]
  }
});
